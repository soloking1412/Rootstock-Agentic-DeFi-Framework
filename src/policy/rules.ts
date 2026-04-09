import { writeAuditEntry } from './audit.js';
import type { PolicyDecision } from './audit.js';

export interface TransactionContext {
  sessionId?: string;
  from: `0x${string}`;
  to: `0x${string}`;
  calldata: `0x${string}`;
  valueWei: bigint;
  allowedContracts: string[];
  sessionMaxSpendWei?: bigint;
  sessionSpentWei?: bigint;
}

export interface PolicyRuleResult {
  decision: PolicyDecision;
  rule: string;
  reason: string;
}

type PolicyRule = (ctx: TransactionContext) => PolicyRuleResult | null;

const blockZeroAddress: PolicyRule = (ctx) => {
  if (ctx.to === '0x0000000000000000000000000000000000000000') {
    return {
      decision: 'deny',
      rule: 'block_zero_address',
      reason: 'Transaction targets the zero address',
    };
  }
  return null;
};

const blockExcessiveValue: PolicyRule = (ctx) => {
  const MAX_VALUE_WEI = 10n * 10n ** 18n;
  if (ctx.valueWei > MAX_VALUE_WEI) {
    return {
      decision: 'deny',
      rule: 'excessive_value',
      reason: `Transaction value ${ctx.valueWei.toString()} wei exceeds hard ceiling of 10 RBTC`,
    };
  }
  return null;
};

const enforceSpendLimit: PolicyRule = (ctx) => {
  if (ctx.sessionMaxSpendWei === undefined) return null;
  const spent = ctx.sessionSpentWei ?? 0n;
  if (spent + ctx.valueWei > ctx.sessionMaxSpendWei) {
    return {
      decision: 'deny',
      rule: 'spend_limit',
      reason: `Transaction would exceed session spend limit: ${(spent + ctx.valueWei).toString()} > ${ctx.sessionMaxSpendWei.toString()}`,
    };
  }
  return null;
};

const enforceContractWhitelist: PolicyRule = (ctx) => {
  if (ctx.allowedContracts.length === 0) return null;
  if (!ctx.allowedContracts.includes(ctx.to.toLowerCase())) {
    return {
      decision: 'deny',
      rule: 'contract_whitelist',
      reason: `Target contract ${ctx.to} is not in the whitelist`,
    };
  }
  return null;
};

export const POLICY_RULES: PolicyRule[] = [
  blockZeroAddress,
  blockExcessiveValue,
  enforceSpendLimit,
  enforceContractWhitelist,
];

export function evaluateRules(ctx: TransactionContext): PolicyRuleResult {
  for (const rule of POLICY_RULES) {
    const result = rule(ctx);
    if (result !== null) {
      writeAuditEntry({
        timestamp: new Date().toISOString(),
        decision: result.decision,
        rule: result.rule,
        ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
        targetContract: ctx.to,
        valueWei: ctx.valueWei.toString(),
        reason: result.reason,
      });
      return result;
    }
  }

  const allow: PolicyRuleResult = {
    decision: 'allow',
    rule: 'default_allow',
    reason: 'All policy rules passed',
  };

  writeAuditEntry({
    timestamp: new Date().toISOString(),
    decision: 'allow',
    rule: 'default_allow',
    ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
    targetContract: ctx.to,
    valueWei: ctx.valueWei.toString(),
    reason: allow.reason,
  });

  return allow;
}
