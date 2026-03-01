import type { Chain } from 'viem';

export const rootstockMainnet: Chain = {
  id: 30,
  name: 'Rootstock Mainnet',
  nativeCurrency: {
    name: 'Smart Bitcoin',
    symbol: 'RBTC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://public-node.rsk.co'],
      webSocket: ['wss://public-node.rsk.co/websocket'],
    },
    public: {
      http: ['https://public-node.rsk.co'],
      webSocket: ['wss://public-node.rsk.co/websocket'],
    },
  },
  blockExplorers: {
    default: {
      name: 'RSK Explorer',
      url: 'https://explorer.rsk.co',
    },
  },
};

export const rootstockTestnet: Chain = {
  id: 31,
  name: 'Rootstock Testnet',
  nativeCurrency: {
    name: 'Test Smart Bitcoin',
    symbol: 'tRBTC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://public-node.testnet.rsk.co'],
      webSocket: ['wss://public-node.testnet.rsk.co/websocket'],
    },
    public: {
      http: ['https://public-node.testnet.rsk.co'],
      webSocket: ['wss://public-node.testnet.rsk.co/websocket'],
    },
  },
  blockExplorers: {
    default: {
      name: 'RSK Testnet Explorer',
      url: 'https://explorer.testnet.rsk.co',
    },
  },
  testnet: true,
};

export type SupportedNetwork = 'mainnet' | 'testnet';

export const chains: Record<SupportedNetwork, Chain> = {
  mainnet: rootstockMainnet,
  testnet: rootstockTestnet,
};
