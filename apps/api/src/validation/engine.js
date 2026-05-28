// Validation engine — roda regras configuradas em ValidationRule contra um
// "subnet candidate" (criação ou update) e retorna violações.
//
// Cada regra é uma função async (prisma, candidate, rule, context) que
// retorna `null` (OK) ou `{ code, message, details? }` (violação).
//
// Severity:
//   - 'error' bloqueia a operação (HTTP 422)
//   - 'warning' só registra; operação prossegue
//
// Built-in rules (este arquivo). Custom plugins via apps/api/plugins/validation/*.js
// podem ser carregados em iteração futura.

import { parseIpv4Cidr } from '../cidr.js';

function overlaps(a, b) {
  return a.network <= b.broadcast && b.network <= a.broadcast;
}

function matchesScope(rule, candidate, context) {
  if (!rule.scope) return true; // global
  if (rule.scope.startsWith('site:')) {
    const siteId = Number(rule.scope.slice(5));
    return Number(candidate.siteId) === siteId;
  }
  if (rule.scope.startsWith('provider:')) {
    const provider = rule.scope.slice(9);
    return context.providerSource === `cloud:${provider.toLowerCase()}`;
  }
  return true;
}

// ============ Built-in rules ============

/** no-overlap: subnet não pode sobrepor outra cadastrada no mesmo site (ou globalmente). */
async function noOverlap(prisma, candidate, rule) {
  if (!candidate.cidr) return null; // sem cidr não dá pra checar
  const cInfo = parseIpv4Cidr(candidate.cidr);
  if (!cInfo) return null; // IPv6 ou inválido — não suportado nesta v1
  const cfg = rule.config || {};
  const scopeFilter = cfg.scope === 'global' ? {} : { siteId: candidate.siteId };
  const existing = await prisma.subnet.findMany({
    where: {
      ...scopeFilter,
      cidr: { not: null },
      // se update, exclui a própria subnet
      ...(candidate.id ? { id: { not: candidate.id } } : {}),
    },
    select: { id: true, name: true, cidr: true },
  });
  for (const s of existing) {
    const sInfo = parseIpv4Cidr(s.cidr);
    if (!sInfo) continue;
    if (overlaps(cInfo, sInfo)) {
      return {
        code: 'OVERLAP',
        message: `Subnet ${candidate.cidr} se sobrepõe a ${s.name} (${s.cidr})`,
        details: { conflictsWith: { id: s.id, name: s.name, cidr: s.cidr } },
      };
    }
  }
  return null;
}

/** within-master: subnet precisa estar contida em pelo menos um MasterRange. */
async function withinMaster(prisma, candidate, rule) {
  if (!candidate.cidr) return null;
  const cInfo = parseIpv4Cidr(candidate.cidr);
  if (!cInfo) return null;
  const masters = await prisma.masterRange.findMany({ select: { cidr: true, description: true } });
  if (masters.length === 0) {
    // Nenhum master cadastrado — regra não aplicável (operador ainda não configurou)
    return null;
  }
  const allowedCategories = rule.config?.allowedCategories;
  for (const m of masters) {
    if (allowedCategories && m.category && !allowedCategories.includes(m.category)) continue;
    const mInfo = parseIpv4Cidr(m.cidr);
    if (!mInfo) continue;
    // m contains c?
    if (mInfo.network <= cInfo.network && cInfo.broadcast <= mInfo.broadcast) {
      return null; // está dentro de pelo menos um master — OK
    }
  }
  return {
    code: 'OUTSIDE_MASTER',
    message: `Subnet ${candidate.cidr} não está dentro de nenhum master range cadastrado`,
    details: { mastersCount: masters.length },
  };
}

/** size-range: prefix length dentro de [minPrefix, maxPrefix]. */
async function sizeRange(prisma, candidate, rule) {
  if (!candidate.cidr) return null;
  const cInfo = parseIpv4Cidr(candidate.cidr);
  if (!cInfo) return null;
  const min = rule.config?.minPrefix ?? 0;
  const max = rule.config?.maxPrefix ?? 32;
  if (cInfo.prefix < min || cInfo.prefix > max) {
    return {
      code: 'SIZE_OUT_OF_RANGE',
      message: `Prefix /${cInfo.prefix} fora do permitido (/${min} a /${max})`,
      details: { minPrefix: min, maxPrefix: max, actual: cInfo.prefix },
    };
  }
  return null;
}

/** name-pattern: nome bate regex configurada. */
async function namePattern(prisma, candidate, rule) {
  const pattern = rule.config?.pattern;
  if (!pattern) return null;
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return {
      code: 'BAD_PATTERN',
      message: `Regra ${rule.name}: regex inválida (${pattern})`,
      details: { pattern },
    };
  }
  if (!re.test(candidate.name || '')) {
    return {
      code: 'NAME_PATTERN',
      message: `Nome "${candidate.name}" não bate com padrão ${pattern}`,
      details: { pattern },
    };
  }
  return null;
}

const BUILT_IN_RULES = {
  'no-overlap': noOverlap,
  'within-master': withinMaster,
  'size-range': sizeRange,
  'name-pattern': namePattern,
};

/**
 * Executa todas as regras enabled aplicáveis ao candidate e retorna violations.
 * @returns {Promise<{errors: object[], warnings: object[]}>}
 */
export async function validateSubnet(prisma, candidate, context = {}) {
  const rules = await prisma.validationRule.findMany({
    where: { enabled: true },
    orderBy: { id: 'asc' },
  });
  const errors = [];
  const warnings = [];
  for (const rule of rules) {
    const fn = BUILT_IN_RULES[rule.ruleType];
    if (!fn) continue;
    if (!matchesScope(rule, candidate, context)) continue;
    try {
      const v = await fn(prisma, candidate, rule);
      if (v) {
        const entry = { rule: rule.name, ruleType: rule.ruleType, ...v };
        if (rule.severity === 'warning') warnings.push(entry);
        else errors.push(entry);
      }
    } catch (err) {
      errors.push({
        rule: rule.name,
        ruleType: rule.ruleType,
        code: 'RULE_ERROR',
        message: `Regra ${rule.name} falhou: ${err.message}`,
      });
    }
  }
  return { errors, warnings };
}

export const SUPPORTED_RULE_TYPES = Object.keys(BUILT_IN_RULES);
