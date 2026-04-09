import { randomUUID } from 'node:crypto';
import type {
  SessionId,
  SessionKey,
  CreateSessionParams,
  SessionValidationResult,
} from './types.js';
import { SessionStore } from './store.js';

export interface SessionServiceOptions {
  maxTtlSeconds: number;
  globalMaxSpendWei: bigint;
  maxSessions?: number;
}

export class SessionService {
  private readonly store: SessionStore;
  private readonly maxTtlSeconds: number;
  private readonly globalMaxSpendWei: bigint;
  private readonly maxSessions: number;

  constructor(options: SessionServiceOptions) {
    this.store = new SessionStore();
    this.maxTtlSeconds = options.maxTtlSeconds;
    this.globalMaxSpendWei = options.globalMaxSpendWei;
    this.maxSessions = options.maxSessions ?? 1000;
  }

  create(params: CreateSessionParams): SessionKey {
    if (this.store.size() >= this.maxSessions) {
      throw new Error(`Session limit reached (max: ${this.maxSessions})`);
    }

    const ttl = Math.min(params.ttlSeconds, this.maxTtlSeconds);
    const maxSpend =
      params.maxSpendWei > this.globalMaxSpendWei
        ? this.globalMaxSpendWei
        : params.maxSpendWei;

    const session: SessionKey = {
      id: randomUUID(),
      ownerAddress: params.ownerAddress,
      agentId: params.agentId,
      permissions: {
        allowedContracts: params.allowedContracts ?? [],
        maxSpendWei: maxSpend,
        allowedFunctionSelectors: params.allowedFunctionSelectors ?? [],
      },
      spentWei: 0n,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl * 1000,
      transactionCount: 0,
    };

    this.store.set(session);
    return session;
  }

  validate(
    sessionId: SessionId,
    context: {
      targetContract?: `0x${string}`;
      valueWei?: bigint;
      functionSelector?: `0x${string}`;
    }
  ): SessionValidationResult {
    const session = this.store.get(sessionId);
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (session.revokedAt !== undefined) {
      return { valid: false, reason: 'Session revoked' };
    }

    if (Date.now() >= session.expiresAt) {
      return { valid: false, reason: 'Session expired' };
    }

    if (context.targetContract !== undefined) {
      if (session.permissions.allowedContracts.length === 0) {
        return { valid: false, reason: 'Session has no allowed contracts' };
      }
      const allowed = session.permissions.allowedContracts.map((a) =>
        a.toLowerCase()
      );
      if (!allowed.includes(context.targetContract.toLowerCase())) {
        return {
          valid: false,
          reason: `Contract ${context.targetContract} not in session whitelist`,
        };
      }
    }

    if (
      context.functionSelector !== undefined &&
      session.permissions.allowedFunctionSelectors.length > 0
    ) {
      if (
        !session.permissions.allowedFunctionSelectors.includes(
          context.functionSelector
        )
      ) {
        return {
          valid: false,
          reason: `Function selector ${context.functionSelector} not permitted`,
        };
      }
    }

    if (context.valueWei !== undefined) {
      const projected = session.spentWei + context.valueWei;
      if (projected > session.permissions.maxSpendWei) {
        return {
          valid: false,
          reason: `Spend limit exceeded: ${projected.toString()} > ${session.permissions.maxSpendWei.toString()}`,
        };
      }
    }

    return { valid: true, session };
  }

  reserveSpend(sessionId: SessionId, amountWei: bigint): void {
    const session = this.store.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    this.store.update(sessionId, {
      spentWei: session.spentWei + amountWei,
      transactionCount: session.transactionCount + 1,
    });
  }

  rollbackSpend(sessionId: SessionId, amountWei: bigint): void {
    const session = this.store.get(sessionId);
    if (!session) return;
    const restored = session.spentWei > amountWei ? session.spentWei - amountWei : 0n;
    this.store.update(sessionId, {
      spentWei: restored,
      transactionCount: session.transactionCount > 0 ? session.transactionCount - 1 : 0,
    });
  }

  revoke(sessionId: SessionId): boolean {
    const session = this.store.get(sessionId);
    if (!session) return false;
    this.store.update(sessionId, { revokedAt: Date.now() });
    return true;
  }

  get(sessionId: SessionId): SessionKey | undefined {
    return this.store.get(sessionId);
  }

  listByOwner(ownerAddress: string): SessionKey[] {
    return this.store.listByOwner(ownerAddress);
  }

  listByAgent(agentId: string): SessionKey[] {
    return this.store.listByAgent(agentId);
  }

  stats(): { activeSessions: number } {
    return { activeSessions: this.store.size() };
  }

  destroy(): void {
    this.store.clear();
  }
}
