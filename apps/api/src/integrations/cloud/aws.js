// AWS provider implementation
//
// Usa @aws-sdk/client-ec2 (v3 modular) para queries read-only.
//
// Auth modes (credentials JSON shape):
//   A) Access key:     { mode: "ACCESS_KEY", accessKeyId, secretAccessKey, sessionToken? }
//   B) Assume role:    { mode: "ASSUME_ROLE", roleArn, externalId?, sessionName? }
//      → Bagre uses its own default credential chain (env vars / EC2 instance role
//        / shared config) to call STS:AssumeRole. No long-lived secret stored
//        for this CloudAccount.
//
// Backward-compat: payloads without `mode` but with accessKeyId default to mode A.
//
// IAM policy mínima (anexar ao IAM User do modo A ou ao IAM Role do modo B):
//   ec2:DescribeSubnets
//   ec2:DescribeNetworkInterfaces
//   ec2:DescribeAddresses
//   sts:GetCallerIdentity

import { EC2Client, DescribeSubnetsCommand, DescribeNetworkInterfacesCommand, DescribeAddressesCommand } from '@aws-sdk/client-ec2';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';

export const name = 'aws';

const ROLE_SESSION_DURATION_S = 3600; // 1h — refreshed per sync run

/** Parse credentials JSON and infer auth mode. */
function parseCredentials(credsJson) {
  let creds;
  try {
    creds = JSON.parse(credsJson);
  } catch (e) {
    throw new Error('AWS credentials: invalid JSON');
  }
  const mode = creds.mode || (creds.roleArn ? 'ASSUME_ROLE' : 'ACCESS_KEY');
  if (mode === 'ACCESS_KEY') {
    if (!creds.accessKeyId || !creds.secretAccessKey) {
      throw new Error('AWS credentials (ACCESS_KEY mode): missing accessKeyId or secretAccessKey');
    }
    return {
      mode,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    };
  }
  if (mode === 'ASSUME_ROLE') {
    if (!creds.roleArn) {
      throw new Error('AWS credentials (ASSUME_ROLE mode): missing roleArn');
    }
    return {
      mode,
      roleArn: creds.roleArn,
      externalId: creds.externalId,
      sessionName: creds.sessionName || 'bagre-ipam-sync',
    };
  }
  throw new Error(`AWS credentials: unknown mode "${mode}"`);
}

/** Returns a credential provider object for the AWS SDK based on auth mode. */
async function resolveAwsCredentials(parsed, region) {
  if (parsed.mode === 'ACCESS_KEY') {
    return {
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      sessionToken: parsed.sessionToken,
    };
  }
  // ASSUME_ROLE: STS client uses Bagre's default credential chain (env, IMDS, shared config).
  const sts = new STSClient({ region });
  const out = await sts.send(new AssumeRoleCommand({
    RoleArn: parsed.roleArn,
    RoleSessionName: parsed.sessionName,
    DurationSeconds: ROLE_SESSION_DURATION_S,
    ExternalId: parsed.externalId,
  }));
  if (!out.Credentials) {
    throw new Error('AWS AssumeRole: empty credentials in response');
  }
  return {
    accessKeyId: out.Credentials.AccessKeyId,
    secretAccessKey: out.Credentials.SecretAccessKey,
    sessionToken: out.Credentials.SessionToken,
  };
}

async function ec2Client(credsJson, region) {
  const parsed = parseCredentials(credsJson);
  const credentials = await resolveAwsCredentials(parsed, region);
  return new EC2Client({ region, credentials });
}

/** Light call to confirm credentials work end-to-end (including AssumeRole if applicable). */
export async function validateCredentials(credsJson) {
  const parsed = parseCredentials(credsJson);
  const credentials = await resolveAwsCredentials(parsed, 'us-east-1');
  const sts = new STSClient({ region: 'us-east-1', credentials });
  const out = await sts.send(new GetCallerIdentityCommand({}));
  return { account: out.Account, arn: out.Arn, userId: out.UserId, mode: parsed.mode };
}

/** Extract a tag named "Name", fallback to id. */
function nameFromTags(tags, fallbackId) {
  const t = (tags || []).find((tag) => tag.Key === 'Name');
  return t?.Value || fallbackId;
}

/** Convert AWS tags array to plain object. */
function tagsToObject(tags) {
  const out = {};
  for (const t of tags || []) {
    if (t.Key) out[t.Key] = t.Value || '';
  }
  return out;
}

/**
 * List VPC subnets in a region.
 * @returns {Promise<NormalizedSubnet[]>}
 */
export async function listSubnets(credsJson, region) {
  const client = await ec2Client(credsJson, region);
  const out = [];
  let nextToken;
  do {
    const resp = await client.send(new DescribeSubnetsCommand({ NextToken: nextToken }));
    for (const s of resp.Subnets || []) {
      out.push({
        cloudResourceId: s.SubnetId,
        name: nameFromTags(s.Tags, s.SubnetId),
        cidr: s.CidrBlock,
        region,
        metadata: {
          vpcId: s.VpcId,
          availabilityZone: s.AvailabilityZone,
          availableIpAddressCount: s.AvailableIpAddressCount,
          state: s.State,
          tags: tagsToObject(s.Tags),
          ipv6CidrBlocks: (s.Ipv6CidrBlockAssociationSet || []).map((b) => b.Ipv6CidrBlock),
        },
      });
    }
    nextToken = resp.NextToken;
  } while (nextToken);
  return out;
}

/**
 * List ENIs (each ENI = one or more IPs) + Elastic IPs in a region.
 * @returns {Promise<NormalizedIp[]>}
 */
export async function listIps(credsJson, region) {
  const client = await ec2Client(credsJson, region);
  const out = [];

  // 1. ENIs (todas as interfaces; private + public se associado)
  let nextToken;
  do {
    const resp = await client.send(new DescribeNetworkInterfacesCommand({ NextToken: nextToken }));
    for (const eni of resp.NetworkInterfaces || []) {
      const hostname = nameFromTags(eni.TagSet, eni.NetworkInterfaceId);
      const subnetCloudId = eni.SubnetId;

      // Primary private IP
      if (eni.PrivateIpAddress) {
        out.push({
          cloudResourceId: eni.NetworkInterfaceId,
          address: eni.PrivateIpAddress,
          subnetCloudId,
          hostname,
          kind: 'PRIVATE',
          metadata: {
            eniId: eni.NetworkInterfaceId,
            attachmentInstanceId: eni.Attachment?.InstanceId || null,
            status: eni.Status,
            interfaceType: eni.InterfaceType,
            description: eni.Description,
            tags: tagsToObject(eni.TagSet),
          },
        });
      }

      // Secondary private IPs
      for (const sec of eni.PrivateIpAddresses || []) {
        if (sec.PrivateIpAddress && sec.PrivateIpAddress !== eni.PrivateIpAddress) {
          out.push({
            cloudResourceId: `${eni.NetworkInterfaceId}/secondary`,
            address: sec.PrivateIpAddress,
            subnetCloudId,
            hostname,
            kind: 'PRIVATE',
            metadata: { eniId: eni.NetworkInterfaceId, secondary: true },
          });
        }
        // Public IP associado pelo NAT (1:1 mapping com private)
        if (sec.Association?.PublicIp) {
          out.push({
            cloudResourceId: `${eni.NetworkInterfaceId}/public`,
            address: sec.Association.PublicIp,
            subnetCloudId: null, // public IPs não pertencem a subnet do mesmo modo
            hostname,
            kind: 'PUBLIC',
            metadata: {
              eniId: eni.NetworkInterfaceId,
              associationId: sec.Association.AssociationId,
              allocationId: sec.Association.AllocationId,
              autoAssigned: !sec.Association.AllocationId, // sem allocation = ephemeral
            },
          });
        }
      }
    }
    nextToken = resp.NextToken;
  } while (nextToken);

  // 2. Elastic IPs (mesmo os NÃO-associados — críticos pro FinOps angle, #22)
  const eipResp = await client.send(new DescribeAddressesCommand({}));
  for (const eip of eipResp.Addresses || []) {
    out.push({
      cloudResourceId: eip.AllocationId || eip.PublicIp,
      address: eip.PublicIp,
      subnetCloudId: null,
      hostname: nameFromTags(eip.Tags, eip.PublicIp),
      kind: 'PUBLIC',
      metadata: {
        allocationId: eip.AllocationId,
        associationId: eip.AssociationId,
        domain: eip.Domain,
        instanceId: eip.InstanceId,
        networkInterfaceId: eip.NetworkInterfaceId,
        associated: !!eip.AssociationId,
        tags: tagsToObject(eip.Tags),
      },
    });
  }

  return out;
}
