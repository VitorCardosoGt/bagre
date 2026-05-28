// Cloud provider interface — contrato comum entre AWS, Azure, GCP
//
// Cada provider exporta um objeto que implementa essa interface.
// O sync engine carrega o provider correto a partir de CloudAccount.provider
// e chama os métodos abaixo, agnóstico ao SDK específico.
//
// Convenções:
// - Funções são async e retornam dados normalizados (ver shapes abaixo)
// - Erros devem propagar com new Error(msg). O sync engine captura e registra
//   em CloudSyncRun.error
// - credentials já vem decifrado (string JSON) — provider parse e usa
// - region: string. Para Azure, ignorar (subscription cobre todas as regions)

/**
 * @typedef {Object} CloudProvider
 *
 * @property {string} name — "aws" | "azure" | "gcp"
 *
 * @property {(credentials: string) => Promise<void>} validateCredentials
 *   Faz uma chamada leve (ex: GetCallerIdentity / List subscriptions) para
 *   confirmar que as credenciais são válidas. Throw em caso de auth fail.
 *
 * @property {(credentials: string, region: string) => Promise<NormalizedSubnet[]>} listSubnets
 *   Lista todas as subnets (VPC subnets / VNet subnets / VPC subnetworks) no scope.
 *
 * @property {(credentials: string, region: string) => Promise<NormalizedIp[]>} listIps
 *   Lista todos os IPs alocados (ENIs / NICs / instance NICs / Elastic/Public IPs).
 */

/**
 * @typedef {Object} NormalizedSubnet
 * @property {string} cloudResourceId — id nativo do provider (subnet-xxx, /subnets/foo, etc)
 * @property {string} name
 * @property {string} cidr — CIDR v4 ou v6
 * @property {string} region
 * @property {Record<string, any>} metadata — payload provider-específico (vpc_id, tags, etc)
 */

/**
 * @typedef {Object} NormalizedIp
 * @property {string} cloudResourceId — id do ENI/NIC/forwardingRule/etc
 * @property {string} address — IPv4 ou IPv6
 * @property {string|null} subnetCloudId — id da subnet em que está, se aplicável
 * @property {string|null} hostname — derived from tag/Name/instance hostname
 * @property {"PRIVATE"|"PUBLIC"} kind
 * @property {Record<string, any>} metadata
 */

import * as aws from './aws.js';
import * as azure from './azure.js';
import * as gcp from './gcp.js';

const providers = {
  AWS: aws,
  AZURE: azure,
  GCP: gcp,
};

export function getProvider(providerName) {
  const p = providers[providerName];
  if (!p) {
    throw new Error(`Cloud provider not implemented: ${providerName}`);
  }
  return p;
}

export function listImplementedProviders() {
  return Object.keys(providers);
}
