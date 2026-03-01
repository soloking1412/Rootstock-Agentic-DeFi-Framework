import { parseEther } from 'viem';
import { config, publicClient } from './config/index.js';
import { SessionService } from './session/service.js';
import { PolicyEngine } from './policy/engine.js';
import { BlockchainWatcher } from './monitor/watcher.js';
import { MoCClient } from './protocols/moc/client.js';
import { startStdioServer } from './mcp/server.js';

async function main(): Promise<void> {
  const sessionService = new SessionService({
    maxTtlSeconds: config.session.defaultTtlSeconds,
    globalMaxSpendWei: parseEther(config.session.maxSpendRbtc.toString()),
  });

  const policyEngine = new PolicyEngine();

  const watcher = new BlockchainWatcher({
    publicClient,
    ...(config.wsUrl !== undefined ? { wsUrl: config.wsUrl } : {}),
    pollingIntervalMs: 30_000,
    reconnectDelayMs: 2000,
    maxReconnectAttempts: 5,
    priceChangeThresholdPercent: 1.0,
  });

  const mocClient = new MoCClient(publicClient, config.network);
  const priceInterval = setInterval(async () => {
    try {
      const price = await mocClient.getBitcoinPrice();
      watcher.notifyPriceChange(price, 'RBTC');
    } catch {}
  }, 60_000);

  if (priceInterval.unref) {
    priceInterval.unref();
  }

  watcher.on('block:new', (ctx) => {
    process.stderr.write(`[monitor] ${ctx.summary}\n`);
  });

  watcher.on('price:change', (ctx) => {
    process.stderr.write(`[monitor] ${ctx.summary}\n`);
  });

  watcher.on('error', (err) => {
    process.stderr.write(`[monitor] error: ${err.message}\n`);
  });

  watcher.start();

  const shutdown = (signal: string): void => {
    process.stderr.write(`[server] ${signal} — shutting down\n`);
    clearInterval(priceInterval);
    watcher.stop();
    sessionService.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.stderr.write(
    `[server] Rootstock Agentic DeFi — network: ${config.network}, rpc: ${config.rpcUrl}\n`
  );

  await startStdioServer({ sessionService, policyEngine });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[server] fatal: ${message}\n`);
  process.exit(1);
});
