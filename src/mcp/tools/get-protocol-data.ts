import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { mocClient, tropykusClient } from '../../protocols/clients.js';

const InputSchema = z.object({
  protocol: z.enum(['moc', 'tropykus', 'all']).default('all'),
});

export const getProtocolDataDefinition: Tool = {
  name: 'get_protocol_data',
  description:
    'Fetch real-time on-chain data from Money on Chain (MOC) and/or Tropykus lending protocol on Rootstock. Returns current Bitcoin price, coverage ratios, BPRO/DOC rates, and Tropykus market supply/borrow APYs.',
  inputSchema: {
    type: 'object',
    properties: {
      protocol: {
        type: 'string',
        enum: ['moc', 'tropykus', 'all'],
        description: 'Which protocol to query. Defaults to "all".',
      },
    },
  },
};

export async function getProtocolDataHandler(
  rawArgs: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const parsed = InputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
    };
  }

  const { protocol } = parsed.data;
  const results: Record<string, unknown> = {};

  try {
    if (protocol === 'all') {
      const [mocData, markets] = await Promise.all([
        mocClient.getProtocolData(),
        tropykusClient.getAllMarkets(),
      ]);
      results['moc'] = mocData;
      results['tropykus'] = { markets, fetchedAt: Date.now() };
    } else if (protocol === 'moc') {
      results['moc'] = await mocClient.getProtocolData();
    } else {
      results['tropykus'] = {
        markets: await tropykusClient.getAllMarkets(),
        fetchedAt: Date.now(),
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Protocol data fetch failed: ${message}` }],
    };
  }
}
