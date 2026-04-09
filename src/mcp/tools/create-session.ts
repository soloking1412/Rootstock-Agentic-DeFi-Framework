import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress, isHex, hashMessage, recoverAddress } from 'viem';
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
    .min(1, 'At least one allowed contract is required'),
  allowedFunctionSelectors: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{8}$/, 'Must be a 4-byte hex selector'))
    .optional(),
  ownerSignature: z
    .string()
    .refine(isHex, { message: 'ownerSignature must be a 0x-prefixed hex string' }),
});

export const createSessionDefinition: Tool = {
  name: 'create_session',
  description:
    'Create a session key that authorizes this agent to execute transactions on behalf of ownerAddress within the declared spend limits. Sessions are scoped to this MCP server instance and expire after ttlSeconds. The actual TTL and spend ceiling are capped by server-side limits. ownerSignature must be an EIP-191 personal_sign of the canonical message: "create_session:<ownerAddress>:<agentId>:<ttlSeconds>:<maxSpendWei>".',
  inputSchema: {
    type: 'object',
    required: ['ownerAddress', 'agentId', 'ttlSeconds', 'maxSpendWei', 'allowedContracts', 'ownerSignature'],
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
        description: 'Contract address allowlist (at least one required)',
      },
      allowedFunctionSelectors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 4-byte function selector allowlist (0x-prefixed)',
      },
      ownerSignature: {
        type: 'string',
        description:
          'EIP-191 personal_sign signature of "create_session:<ownerAddress>:<agentId>:<ttlSeconds>:<maxSpendWei>"',
      },
    },
  },
};

export interface CreateSessionDeps {
  sessionService: SessionService;
}

export function createCreateSessionHandler(deps: CreateSessionDeps) {
  return async function createSessionHandler(
    rawArgs: unknown
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
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
      ownerSignature,
    } = parsed.data;

    const message = `create_session:${ownerAddress.toLowerCase()}:${agentId}:${ttlSeconds}:${maxSpendWei}`;

    let recovered: `0x${string}`;
    try {
      recovered = await recoverAddress({
        hash: hashMessage(message),
        signature: ownerSignature as `0x${string}`,
      });
    } catch {
      return {
        content: [{ type: 'text', text: 'Signature verification failed: could not recover address' }],
      };
    }

    if (recovered.toLowerCase() !== ownerAddress.toLowerCase()) {
      return {
        content: [{ type: 'text', text: `Signature mismatch: recovered ${recovered}, expected ${ownerAddress}` }],
      };
    }

    try {
      const session = deps.sessionService.create({
        ownerAddress: ownerAddress as `0x${string}`,
        agentId,
        ttlSeconds,
        maxSpendWei: BigInt(maxSpendWei),
        allowedContracts: allowedContracts as `0x${string}`[],
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
      const errMessage = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Session creation failed: ${errMessage}` }],
      };
    }
  };
}
