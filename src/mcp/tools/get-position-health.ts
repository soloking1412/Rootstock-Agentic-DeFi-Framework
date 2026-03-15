import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress } from 'viem';
import { tropykusClient } from '../../protocols/clients.js';

const InputSchema = z.object({
  account: z.string().refine(isAddress, { message: 'Invalid Ethereum address' }),
});

export const getPositionHealthDefinition: Tool = {
  name: 'get_position_health',
  description:
    'Check the health of a Tropykus lending/borrowing position on Rootstock. Returns liquidity, shortfall, health factor, and per-market supply/borrow balances. Use this to determine if a position is at risk of liquidation.',
  inputSchema: {
    type: 'object',
    required: ['account'],
    properties: {
      account: {
        type: 'string',
        description: 'Wallet address to check position health for',
      },
    },
  },
};

export async function getPositionHealthHandler(
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

  try {
    const health = await tropykusClient.getPositionHealth(
      parsed.data.account as `0x${string}`
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: `Position health check failed: ${message}` },
      ],
    };
  }
}
