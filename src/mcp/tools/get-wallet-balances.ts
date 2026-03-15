import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress, formatEther, formatUnits } from 'viem';
import { publicClient } from '../../config/index.js';

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// symbol and decimals are immutable — cache them to avoid repeated RPC calls.
const tokenMetadataCache = new Map<string, { symbol: string; decimals: number }>();

const InputSchema = z.object({
  address: z.string().refine(isAddress, { message: 'Invalid wallet address' }),
  tokenAddresses: z
    .array(
      z.string().refine(isAddress, { message: 'Invalid token contract address' })
    )
    .max(20, 'Maximum 20 tokens per call')
    .default([]),
});

export const getWalletBalancesDefinition: Tool = {
  name: 'get_wallet_balances',
  description:
    'Get native RBTC balance and ERC-20 token balances for a wallet address on Rootstock. Accepts up to 20 token contract addresses per call.',
  inputSchema: {
    type: 'object',
    required: ['address'],
    properties: {
      address: {
        type: 'string',
        description: 'Wallet address to query',
      },
      tokenAddresses: {
        type: 'array',
        items: { type: 'string' },
        description:
          'ERC-20 token contract addresses to check balances for (max 20)',
      },
    },
  },
};

export async function getWalletBalancesHandler(
  rawArgs: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const parsed = InputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      content: [
        { type: 'text', text: `Invalid input: ${parsed.error.message}` },
      ],
    };
  }

  const { address, tokenAddresses } = parsed.data;
  const account = address as `0x${string}`;

  try {
    const nativeBalance = await publicClient.getBalance({ address: account });

    const tokenResults = await Promise.allSettled(
      tokenAddresses.map(async (tokenAddress) => {
        const addr = tokenAddress as `0x${string}`;
        const cacheKey = addr.toLowerCase();

        let meta = tokenMetadataCache.get(cacheKey);
        if (meta === undefined) {
          const [symbol, decimals] = await Promise.all([
            publicClient.readContract({
              address: addr,
              abi: ERC20_ABI,
              functionName: 'symbol',
            }),
            publicClient.readContract({
              address: addr,
              abi: ERC20_ABI,
              functionName: 'decimals',
            }),
          ]);
          meta = { symbol, decimals };
          tokenMetadataCache.set(cacheKey, meta);
        }

        const balance = await publicClient.readContract({
          address: addr,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account],
        });

        return {
          token: addr,
          symbol: meta.symbol,
          decimals: meta.decimals,
          rawBalance: balance.toString(),
          formattedBalance: formatUnits(balance, meta.decimals),
        };
      })
    );

    const tokens = tokenResults.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      const addr = tokenAddresses[i];
      return {
        token: addr ?? 'unknown',
        error:
          result.reason instanceof Error
            ? result.reason.message
            : 'Failed to fetch',
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              address,
              nativeRbtc: {
                rawBalance: nativeBalance.toString(),
                formattedBalance: formatEther(nativeBalance),
                symbol: 'RBTC',
              },
              tokens,
              fetchedAt: Date.now(),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Balance fetch failed: ${message}` }],
    };
  }
}
