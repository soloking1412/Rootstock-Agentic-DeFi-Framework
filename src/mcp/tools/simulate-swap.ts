import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress } from 'viem';
import { SimulationEngine } from '../../simulation/engine.js';
import { publicClient } from '../../config/index.js';

const InputSchema = z.object({
  tokenIn: z.string().refine(isAddress, { message: 'Invalid tokenIn address' }),
  tokenOut: z
    .string()
    .refine(isAddress, { message: 'Invalid tokenOut address' }),
  amountIn: z
    .string()
    .regex(/^\d+$/, 'Must be a non-negative integer string (wei)'),
  slippageBps: z.number().int().min(0).max(10000).default(50),
  from: z.string().refine(isAddress, { message: 'Invalid from address' }),
});

export const simulateSwapDefinition: Tool = {
  name: 'simulate_swap',
  description:
    'Simulate a token swap on Rootstock without broadcasting. Returns estimated output, price impact, and gas cost. Checks on-chain balances to verify the swap is feasible before the agent proceeds.',
  inputSchema: {
    type: 'object',
    required: ['tokenIn', 'tokenOut', 'amountIn', 'from'],
    properties: {
      tokenIn: {
        type: 'string',
        description: 'ERC-20 contract address of the input token',
      },
      tokenOut: {
        type: 'string',
        description: 'ERC-20 contract address of the output token',
      },
      amountIn: {
        type: 'string',
        description: 'Amount of tokenIn in wei (smallest denomination)',
      },
      slippageBps: {
        type: 'number',
        description:
          'Maximum acceptable slippage in basis points (1 bps = 0.01%). Default 50.',
      },
      from: {
        type: 'string',
        description: 'Wallet address initiating the swap',
      },
    },
  },
};

export async function simulateSwapHandler(
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

  const { tokenIn, tokenOut, amountIn, slippageBps, from } = parsed.data;
  const engine = new SimulationEngine(publicClient);

  try {
    const result = await engine.simulateSwap({
      tokenIn: tokenIn as `0x${string}`,
      tokenOut: tokenOut as `0x${string}`,
      amountIn: BigInt(amountIn),
      slippageBps,
      from: from as `0x${string}`,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Simulation failed: ${message}` }],
    };
  }
}
