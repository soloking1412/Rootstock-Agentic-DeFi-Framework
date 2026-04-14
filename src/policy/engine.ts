import { evaluateRules } from './rules.js';
import type { TransactionContext, PolicyRuleResult } from './rules.js';
import { config } from '../config/index.js';

export interface PolicyEngineOptions {
  additionalWhitelist?: string[];
}

export class PolicyEngine {
  private readonly whitelist: string[];

  constructor(options: PolicyEngineOptions = {}) {
    this.whitelist = [
      ...config.policy.contractWhitelist,
      ...(options.additionalWhitelist ?? []),
    ].map((a) => a.toLowerCase());
  }

  evaluate(
    tx: Omit<TransactionContext, 'allowedContracts'>,
    sessionContracts?: string[]
  ): PolicyRuleResult {
    const effective =
      sessionContracts !== undefined && sessionContracts.length > 0
        ? sessionContracts.map((a) => a.toLowerCase())
        : this.whitelist;
    return evaluateRules({ ...tx, allowedContracts: effective });
  }

  isAllowed(
    tx: Omit<TransactionContext, 'allowedContracts'>,
    sessionContracts?: string[]
  ): boolean {
    return this.evaluate(tx, sessionContracts).decision === 'allow';
  }

  getWhitelist(): readonly string[] {
    return this.whitelist;
  }
}
