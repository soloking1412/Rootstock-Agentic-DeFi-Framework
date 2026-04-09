import { describe, it, expect, beforeEach } from 'vitest';
import { SessionService } from '../session/service.js';

const OWNER = '0x1234567890123456789012345678901234567890' as const;
const AGENT = 'test-agent';
const RBTC = 10n ** 18n;

function makeService(opts: { maxTtlSeconds?: number; globalMaxSpendWei?: bigint; maxSessions?: number } = {}) {
  return new SessionService({
    maxTtlSeconds: opts.maxTtlSeconds ?? 3600,
    globalMaxSpendWei: opts.globalMaxSpendWei ?? (1n * RBTC),
    ...(opts.maxSessions !== undefined ? { maxSessions: opts.maxSessions } : {}),
  });
}

describe('SessionService.create()', () => {
  it('caps TTL at maxTtlSeconds', () => {
    const svc = makeService({ maxTtlSeconds: 60 });
    const session = svc.create({
      ownerAddress: OWNER,
      agentId: AGENT,
      ttlSeconds: 9999,
      maxSpendWei: RBTC / 100n,
    });
    const actualTtl = (session.expiresAt - session.createdAt) / 1000;
    expect(actualTtl).toBeLessThanOrEqual(60);
  });

  it('caps spend at globalMaxSpendWei', () => {
    const svc = makeService({ globalMaxSpendWei: RBTC / 10n });
    const session = svc.create({
      ownerAddress: OWNER,
      agentId: AGENT,
      ttlSeconds: 60,
      maxSpendWei: 100n * RBTC,
    });
    expect(session.permissions.maxSpendWei).toBe(RBTC / 10n);
  });

  it('throws when maxSessions limit is reached', () => {
    const svc = makeService({ maxSessions: 2 });
    svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: 1n });
    svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: 1n });
    expect(() =>
      svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: 1n })
    ).toThrow('Session limit reached');
  });
});

describe('SessionService.validate()', () => {
  let svc: SessionService;

  beforeEach(() => {
    svc = makeService();
  });

  it('returns invalid for unknown session', () => {
    const result = svc.validate('00000000-0000-0000-0000-000000000000', {});
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('returns invalid for revoked session', () => {
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC });
    svc.revoke(session.id);
    const result = svc.validate(session.id, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/revoked/i);
  });

  it('returns invalid when spend would exceed cap', () => {
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC / 10n });
    const result = svc.validate(session.id, { valueWei: RBTC });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/spend limit/i);
  });

  it('returns valid for a good session', () => {
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC });
    const result = svc.validate(session.id, { valueWei: RBTC / 100n });
    expect(result.valid).toBe(true);
    expect(result.session).toBeDefined();
  });
});

describe('SessionService.reserveSpend() / rollbackSpend()', () => {
  it('optimistic reserve and successful commit', () => {
    const svc = makeService();
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC });
    svc.reserveSpend(session.id, RBTC / 10n);
    const after = svc.get(session.id)!;
    expect(after.spentWei).toBe(RBTC / 10n);
    expect(after.transactionCount).toBe(1);
  });

  it('rollback restores spend', () => {
    const svc = makeService();
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC });
    svc.reserveSpend(session.id, RBTC / 10n);
    svc.rollbackSpend(session.id, RBTC / 10n);
    const after = svc.get(session.id)!;
    expect(after.spentWei).toBe(0n);
    expect(after.transactionCount).toBe(0);
  });

  it('rollback does not go below zero', () => {
    const svc = makeService();
    const session = svc.create({ ownerAddress: OWNER, agentId: AGENT, ttlSeconds: 60, maxSpendWei: RBTC });
    svc.rollbackSpend(session.id, RBTC);
    const after = svc.get(session.id)!;
    expect(after.spentWei).toBe(0n);
  });
});

