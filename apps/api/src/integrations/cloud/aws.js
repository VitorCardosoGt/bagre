// AWS provider implementation
//
// Usa @aws-sdk/client-ec2 (v3 modular) para queries read-only.
// Auth pattern: credenciais vêm como JSON string com:
//   { accessKeyId, secretAccessKey, sessionToken? }    OR
//   { roleArn, externalId? }  // futuro: STS AssumeRole pattern
//
// Implementação inicial cobre apenas access key. AssumeRole cross-account vem em fase futura.

import { EC2Client, DescribeSubnetsCommand, DescribeNetworkInterfacesCommand, DescribeAddressesCommand } from '@aws-sdk/client-ec2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export const name = 'aws';

/** Parse credentials JSON and validate shape. */
function parseCredentials(credsJson) {
  let creds;
  try {
    creds = JSON.parse(credsJson);
  } catch (e) {
    throw new Error('AWS credentials: invalid JSON');
  }
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error('AWS credentials: missing accessKeyId or secretAccessKey');
  }
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  };
}

function ec2Client(credsJson, region) {
  const credentials = parseCredentials(credsJson);
  return new EC2Client({ region, credentials });
}

/** Light call to confirm credentials work. */
export async function validateCredentials(credsJson) {
  const credentials = parseCredentials(credsJson);
  // STS GetCallerIdentity é region-agnostic e barato
  const sts = new STSClient({ region: 'us-east-1', credentials });
  const out = await sts.send(new GetCallerIdentityCommand({}));
  return { account: out.Account, arn: out.Arn, userId: out.UserId };
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
  const client = ec2Client(credsJson, region);
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
  const client = ec2Client(credsJson, region);
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
