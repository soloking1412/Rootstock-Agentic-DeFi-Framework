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
    tx: Omit<TransactionContext, 'allowedContracts'>
  ): PolicyRuleResult {
    return evaluateRules({ ...tx, allowedContracts: this.whitelist });
  }

  isAllowed(tx: Omit<TransactionContext, 'allowedContracts'>): boolean {
    return this.evaluate(tx).decision === 'allow';
  }

  getWhitelist(): readonly string[] {
    return this.whitelist;
  }
}
