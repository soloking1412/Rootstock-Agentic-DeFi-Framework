import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { PublicClient } from 'viem';
import type {
  MonitorEventType,
  WatcherOptions,
  AgentSubscription,
  MonitorContext,
  NewBlockEvent,
} from './types.js';
import {
  formatBlockContext,
  formatPriceChangeContext,
  computePriceChangePercent,
} from './handlers.js';

type WatcherEventMap = {
  [K in MonitorEventType]: [MonitorContext];
} & {
  error: [Error];
};

type UnwatchFn = () => void;

export class BlockchainWatcher extends EventEmitter<WatcherEventMap> {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unwatchBlocks: UnwatchFn | null = null;
  private readonly subscriptions = new Map<string, AgentSubscription>();
  private lastKnownPrice: bigint = 0n;
  private running = false;
  private mode: 'ws' | 'polling' | 'idle' = 'idle';

  private readonly pollingClient: PublicClient;
  private readonly wsUrl: string | undefined;
  private readonly pollingIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly priceChangeThresholdPercent: number;

  constructor(options: WatcherOptions) {
    super();
    this.pollingClient = options.publicClient;
    this.wsUrl = options.wsUrl;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 30_000;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.priceChangeThresholdPercent = options.priceChangeThresholdPercent ?? 1.0;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.wsUrl ? this.connectWs() : this.startPolling();
  }

  stop(): void {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close(1000, 'Shutdown');
    this.ws = null;

    this.unwatchBlocks?.();
    this.unwatchBlocks = null;

    this.mode = 'idle';
  }

  subscribe(sub: AgentSubscription): void {
    this.subscriptions.set(sub.id, sub);
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  notifyPriceChange(currentPriceWei: bigint, asset: string): void {
    const { changePercent, direction, significant } = computePriceChangePercent(
      this.lastKnownPrice,
      currentPriceWei,
      this.priceChangeThresholdPercent
    );

    if (!significant) return;

    const previous = this.lastKnownPrice;
    this.lastKnownPrice = currentPriceWei;

    const PRECISION = 10n ** 18n;
    const fmt = (v: bigint): string => (Number(v) / Number(PRECISION)).toFixed(2);

    this.dispatch(
      'price:change',
      formatPriceChangeContext({
        type: 'price:change',
        asset,
        previousPriceUsd: fmt(previous),
        currentPriceUsd: fmt(currentPriceWei),
        changePercent,
        direction,
        timestamp: Date.now(),
      })
    );
  }

  private startPolling(): void {
    this.mode = 'polling';

    this.dispatch('monitor:connected', {
      event: {
        type: 'monitor:connected',
        message: `Block polling started (interval: ${this.pollingIntervalMs}ms)`,
        timestamp: Date.now(),
      },
      summary: 'Monitor connected via HTTP block polling',
    });

    this.unwatchBlocks = this.pollingClient.watchBlocks({
      pollingInterval: this.pollingIntervalMs,
      onBlock: (block) => {
        const event: NewBlockEvent = {
          type: 'block:new',
          blockNumber: block.number ?? 0n,
          timestamp: Number(block.timestamp) * 1000,
          gasUsed: block.gasUsed,
          ...(block.baseFeePerGas != null ? { baseFeePerGas: block.baseFeePerGas } : {}),
        };
        this.dispatch('block:new', formatBlockContext(event));
      },
      onError: (err) => {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      },
    });
  }

  private connectWs(): void {
    if (!this.wsUrl) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => this.onWsOpen());
      this.ws.on('message', (raw) => this.onWsMessage(raw));
      this.ws.on('close', (code, reason) => this.onWsClose(code, reason));
      this.ws.on('error', () => this.onWsError());

      this.ws.on('unexpected-response', (_req, res) => {
        process.stderr.write(
          `[monitor] WebSocket rejected (HTTP ${res.statusCode ?? '?'}) — falling back to polling\n`
        );
        this.ws = null;
        this.startPolling();
      });
    } catch {
      this.startPolling();
    }
  }

  private onWsOpen(): void {
    this.reconnectAttempts = 0;
    this.mode = 'ws';

    this.dispatch('monitor:connected', {
      event: {
        type: 'monitor:connected',
        message: `WebSocket connected to ${this.wsUrl}`,
        timestamp: Date.now(),
      },
      summary: 'Monitor connected via WebSocket',
    });

    this.ws?.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: ['newHeads'],
        id: 1,
      })
    );
  }

  private onWsMessage(raw: WebSocket.RawData): void {
    try {
      const data = JSON.parse(raw.toString()) as Record<string, unknown>;
      this.handleWsJsonRpc(data);
    } catch {}
  }

  private handleWsJsonRpc(data: Record<string, unknown>): void {
    if (data['method'] !== 'eth_subscription') return;

    const params = data['params'] as Record<string, unknown> | undefined;
    if (!params) return;

    const result = params['result'] as Record<string, unknown> | undefined;
    if (!result || !('number' in result)) return;

    const blockNumber = BigInt(result['number'] as string);
    const timestamp = parseInt(result['timestamp'] as string, 16) * 1000;
    const gasUsed = BigInt((result['gasUsed'] as string | undefined) ?? '0x0');
    const baseFeePerGas = result['baseFeePerGas']
      ? BigInt(result['baseFeePerGas'] as string)
      : undefined;

    const event: NewBlockEvent = {
      type: 'block:new',
      blockNumber,
      timestamp,
      gasUsed,
      ...(baseFeePerGas !== undefined ? { baseFeePerGas } : {}),
    };

    this.dispatch('block:new', formatBlockContext(event));
  }

  private onWsClose(code: number, reason: Buffer): void {
    if (!this.running) return;

    this.dispatch('monitor:disconnected', {
      event: {
        type: 'monitor:disconnected',
        message: `WebSocket closed: ${code} ${reason.toString()}`,
        timestamp: Date.now(),
      },
      summary: 'Monitor WebSocket disconnected',
    });

    this.scheduleWsReconnect();
  }

  private onWsError(): void {
    this.scheduleWsReconnect();
  }

  private scheduleWsReconnect(): void {
    if (!this.running) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      process.stderr.write(
        `[monitor] WebSocket unavailable after ${this.maxReconnectAttempts} attempts — falling back to polling\n`
      );
      this.startPolling();
      return;
    }

    const base = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    const jitter = base * 0.2 * (Math.random() - 0.5);
    const delay = Math.min(base + jitter, 30_000);

    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.connectWs(), delay);
  }

  private dispatch(eventType: MonitorEventType, ctx: MonitorContext): void {
    this.emit(eventType, ctx);

    for (const sub of this.subscriptions.values()) {
      if (sub.eventTypes.includes(eventType)) {
        try {
          sub.callback(ctx);
        } catch {}
      }
    }
  }
}
