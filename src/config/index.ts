import { createPublicClient, http } from 'viem';
import { env } from './env.js';
import { chains } from './chains.js';
import type { Chain } from 'viem';

export type { Env } from './env.js';
export { env } from './env.js';
export { chains, rootstockMainnet, rootstockTestnet } from './chains.js';
export type { SupportedNetwork } from './chains.js';

export interface AppConfig {
  network: 'mainnet' | 'testnet';
  chain: Chain;
  rpcUrl: string;
  wsUrl: string | undefined;
  session: {
    defaultTtlSeconds: number;
    maxSpendRbtc: number;
  };
  policy: {
    contractWhitelist: string[];
  };
  audit: {
    destination: 'console' | 'file';
    filePath: string;
  };
}

// Known protocol contract addresses on RSK mainnet
const PROTOCOL_CONTRACTS = [
  '0x2820f6d4d199b8d8838a4b26f9917754b86a0c1f', // MoC main
  '0x7f6057ac55e63a2f58d5b5a5df3b0de0b8bedefc', // MoCState mainnet
  '0x0adb40132cb0ffcef6ed81c26a1881e214100555', // MoCState testnet
  '0xc03ac60ebbc01a1f4e9b5bb989f359e5d8348919', // MoCExchange
  '0x962308fef8edfadd705384840e7701f8f39ed0c0', // Tropykus Comptroller
  '0x0aeadb9d4c6a80462a47e87e76e487fa8b9a37d7', // kRBTC
  '0x544eb90e766b405134b3b3f62b6b4c23fcd5fda2', // kDOC
  '0x405062731d8656af5950ef952be9fa110878036b', // kBPRO
  '0xddf3ce45fcf080df61ee61dac5ddefef7ed4f46c', // kUSDRIF
];

function buildConfig(): AppConfig {
  const network = env.RSK_NETWORK;
  const chain = chains[network];
  const rpcUrl =
    network === 'mainnet' ? env.RSK_MAINNET_RPC_URL : env.RSK_TESTNET_RPC_URL;
  const rawWsUrl =
    network === 'mainnet' ? env.RSK_MAINNET_WS_URL : env.RSK_TESTNET_WS_URL;
  const wsUrl = rawWsUrl.length > 0 ? rawWsUrl : undefined;

  const whitelist = [
    ...PROTOCOL_CONTRACTS,
    ...env.POLICY_CONTRACT_WHITELIST,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    network,
    chain,
    rpcUrl,
    wsUrl,
    session: {
      defaultTtlSeconds: env.SESSION_DEFAULT_TTL_SECONDS,
      maxSpendRbtc: env.SESSION_MAX_SPEND_RBTC,
    },
    policy: {
      contractWhitelist: whitelist,
    },
    audit: {
      destination: env.AUDIT_LOG_DESTINATION,
      filePath: env.AUDIT_LOG_FILE_PATH,
    },
  };
}

export const config = buildConfig();

export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl),
});
