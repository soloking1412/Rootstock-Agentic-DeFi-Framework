import { describe, it, expect } from 'vitest';
import { evaluateRules } from '../policy/rules.js';
import type { TransactionContext } from '../policy/rules.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const SOME_ADDRESS = '0x1234567890123456789012345678901234567890' as const;
const OTHER_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01' as const;
const RBTC = 10n ** 18n;

function ctx(overrides: Partial<TransactionContext> = {}): TransactionContext {
  return {
    from: SOME_ADDRESS,
    to: SOME_ADDRESS,
    calldata: '0x',
    valueWei: 0n,
    allowedContracts: [],
    ...overrides,
  };
}

describe('block_zero_address', () => {
  it('denies transaction to zero address', () => {
    const result = evaluateRules(ctx({ to: ZERO_ADDRESS }));
    expect(result.decision).toBe('deny');
    expect(result.rule).toBe('block_zero_address');
  });

  it('allows transaction to a normal address', () => {
    const result = evaluateRules(ctx({ to: SOME_ADDRESS }));
    expect(result.decision).toBe('allow');
  });
});

describe('block_selfdestruct', () => {
  it('denies calldata starting with 0xff', () => {
    const result = evaluateRules(ctx({ calldata: '0xff1234' }));
    expect(result.decision).toBe('deny');
    expect(result.rule).toBe('block_selfdestruct');
  });

  it('allows calldata not starting with 0xff', () => {
    const result = evaluateRules(ctx({ calldata: '0xa9059cbb' }));
    expect(result.decision).toBe('allow');
  });

  it('allows empty calldata', () => {
    const result = evaluateRules(ctx({ calldata: '0x' }));
    expect(result.decision).toBe('allow');
  });
});

describe('excessive_value', () => {
  it('denies value over 10 RBTC', () => {
    const result = evaluateRules(ctx({ valueWei: 11n * RBTC }));
    expect(result.decision).toBe('deny');
    expect(result.rule).toBe('excessive_value');
  });

  it('allows value exactly at 10 RBTC', () => {
    const result = evaluateRules(ctx({ valueWei: 10n * RBTC }));
    expect(result.decision).toBe('allow');
  });

  it('allows value under 10 RBTC', () => {
    const result = evaluateRules(ctx({ valueWei: 1n * RBTC }));
    expect(result.decision).toBe('allow');
  });
});

describe('spend_limit', () => {
  it('denies when cumulative spend would exceed cap', () => {
    const result = evaluateRules(
      ctx({
        valueWei: 6n * RBTC,
        sessionMaxSpendWei: 10n * RBTC,
        sessionSpentWei: 5n * RBTC,
      })
    );
    expect(result.decision).toBe('deny');
    expect(result.rule).toBe('spend_limit');
  });

  it('allows when spend is within cap', () => {
    const result = evaluateRules(
      ctx({
        valueWei: 4n * RBTC,
        sessionMaxSpendWei: 10n * RBTC,
        sessionSpentWei: 5n * RBTC,
      })
    );
    expect(result.decision).toBe('allow');
  });

  it('skips check when sessionMaxSpendWei is undefined', () => {
    const result = evaluateRules(ctx({ valueWei: 100n * RBTC }));
    // Would exceed excessive_value but not spend_limit
    expect(result.rule).toBe('excessive_value');
  });
});

describe('contract_whitelist', () => {
  it('denies target not in non-empty whitelist', () => {
    const result = evaluateRules(
      ctx({ to: OTHER_ADDRESS, allowedContracts: [SOME_ADDRESS] })
    );
    expect(result.decision).toBe('deny');
    expect(result.rule).toBe('contract_whitelist');
  });

  it('allows target in whitelist', () => {
    const result = evaluateRules(
      ctx({ to: SOME_ADDRESS, allowedContracts: [SOME_ADDRESS] })
    );
    expect(result.decision).toBe('allow');
  });

  it('allows any target when whitelist is empty', () => {
    const result = evaluateRules(
      ctx({ to: OTHER_ADDRESS, allowedContracts: [] })
    );
    expect(result.decision).toBe('allow');
  });

  it('is case-insensitive', () => {
    const result = evaluateRules(
      ctx({
        to: SOME_ADDRESS.toUpperCase() as `0x${string}`,
        allowedContracts: [SOME_ADDRESS.toLowerCase() as `0x${string}`],
      })
    );
    expect(result.decision).toBe('allow');
  });
});
