import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress } from 'viem';
import type { SessionService } from '../../session/service.js';

const InputSchema = z.object({
  ownerAddress: z
    .string()
    .refine(isAddress, { message: 'Invalid owner address' }),
  agentId: z.string().min(1, 'agentId is required'),
  ttlSeconds: z.number().int().min(1).max(86400),
  maxSpendWei: z.string().regex(/^\d+$/, 'Must be a non-negative integer string (wei)'),
  allowedContracts: z
    .array(z.string().refine(isAddress, { message: 'Invalid contract address' }))
    .optional(),
  allowedFunctionSelectors: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{8}$/, 'Must be a 4-byte hex selector'))
    .optional(),
});

export const createSessionDefinition: Tool = {
  name: 'create_session',
  description:
    'Create a session key that authorizes this agent to execute transactions on behalf of ownerAddress within the declared spend limits. Sessions are scoped to this MCP server instance and expire after ttlSeconds. The actual TTL and spend ceiling are capped by server-side limits.',
  inputSchema: {
    type: 'object',
    required: ['ownerAddress', 'agentId', 'ttlSeconds', 'maxSpendWei'],
    properties: {
      ownerAddress: {
        type: 'string',
        description: 'Wallet address that owns this session',
      },
      agentId: {
        type: 'string',
        description: 'Identifier for the agent using this session',
      },
      ttlSeconds: {
        type: 'number',
        description: 'Session lifetime in seconds (capped at server maximum)',
      },
      maxSpendWei: {
        type: 'string',
        description: 'Maximum cumulative RBTC spend in wei (capped at server maximum)',
      },
      allowedContracts: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional contract address allowlist. If empty, the global policy whitelist applies.',
      },
      allowedFunctionSelectors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 4-byte function selector allowlist (0x-prefixed)',
      },
    },
  },
};

export interface CreateSessionDeps {
  sessionService: SessionService;
}

export function createCreateSessionHandler(deps: CreateSessionDeps) {
  return function createSessionHandler(
    rawArgs: unknown
  ): { content: Array<{ type: 'text'; text: string }> } {
    const parsed = InputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
      };
    }

    const {
      ownerAddress,
      agentId,
      ttlSeconds,
      maxSpendWei,
      allowedContracts,
      allowedFunctionSelectors,
    } = parsed.data;

    try {
      const session = deps.sessionService.create({
        ownerAddress: ownerAddress as `0x${string}`,
        agentId,
        ttlSeconds,
        maxSpendWei: BigInt(maxSpendWei),
        ...(allowedContracts !== undefined
          ? { allowedContracts: allowedContracts as `0x${string}`[] }
          : {}),
        ...(allowedFunctionSelectors !== undefined
          ? { allowedFunctionSelectors: allowedFunctionSelectors as `0x${string}`[] }
          : {}),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId: session.id,
                ownerAddress: session.ownerAddress,
                agentId: session.agentId,
                expiresAt: session.expiresAt,
                maxSpendWei: session.permissions.maxSpendWei.toString(),
                allowedContracts: session.permissions.allowedContracts,
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
        content: [{ type: 'text', text: `Session creation failed: ${message}` }],
      };
    }
  };
}
