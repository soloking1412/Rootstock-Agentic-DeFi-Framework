import type { PublicClient } from 'viem';

export type MonitorEventType =
  | 'block:new'
  | 'price:change'
  | 'position:health'
  | 'monitor:connected'
  | 'monitor:disconnected'
  | 'monitor:error';

export interface NewBlockEvent {
  type: 'block:new';
  blockNumber: bigint;
  timestamp: number;
  gasUsed: bigint;
  baseFeePerGas?: bigint;
}

export interface PriceChangeEvent {
  type: 'price:change';
  asset: string;
  previousPriceUsd: string;
  currentPriceUsd: string;
  changePercent: string;
  direction: 'up' | 'down';
  timestamp: number;
}

export interface PositionHealthEvent {
  type: 'position:health';
  account: string;
  healthFactor: string;
  isLiquidatable: boolean;
  shortfall: string;
  timestamp: number;
}

export interface MonitorStatusEvent {
  type: 'monitor:connected' | 'monitor:disconnected' | 'monitor:error';
  message: string;
  timestamp: number;
}

export type MonitorEvent =
  | NewBlockEvent
  | PriceChangeEvent
  | PositionHealthEvent
  | MonitorStatusEvent;

export interface MonitorContext {
  event: MonitorEvent;
  summary: string;
}

export interface AgentSubscription {
  id: string;
  agentId: string;
  eventTypes: MonitorEventType[];
  callback: (ctx: MonitorContext) => void;
}

export interface WatcherOptions {
  publicClient: PublicClient;
  wsUrl?: string;
  pollingIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  priceChangeThresholdPercent?: number;
}
