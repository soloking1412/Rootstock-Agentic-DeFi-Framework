import type {
  NewBlockEvent,
  PriceChangeEvent,
  MonitorContext,
} from './types.js';

export function formatBlockContext(event: NewBlockEvent): MonitorContext {
  return {
    event,
    summary: `New block #${event.blockNumber.toString()} at ${new Date(event.timestamp).toISOString()}`,
  };
}

export function formatPriceChangeContext(
  event: PriceChangeEvent
): MonitorContext {
  const dir = event.direction === 'up' ? 'rose' : 'fell';
  return {
    event,
    summary: `ALERT: ${event.asset} price ${dir} ${event.changePercent}% — now $${event.currentPriceUsd} (was $${event.previousPriceUsd})`,
  };
}

export function computePriceChangePercent(
  previous: bigint,
  current: bigint,
  thresholdPercent: number
): {
  changePercent: string;
  direction: 'up' | 'down';
  significant: boolean;
} {
  if (previous === 0n) {
    return { changePercent: '0', direction: 'up', significant: false };
  }
  const diff = current > previous ? current - previous : previous - current;
  const direction: 'up' | 'down' = current >= previous ? 'up' : 'down';
  const pct = Number((diff * 1_000_000n) / previous) / 10_000;
  return {
    changePercent: pct.toFixed(4),
    direction,
    significant: pct >= thresholdPercent,
  };
}
