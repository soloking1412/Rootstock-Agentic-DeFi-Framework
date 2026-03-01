import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress, isHex } from 'viem';
import { publicClient } from '../../config/index.js';
import type { SessionService } from '../../session/service.js';
import type { PolicyEngine } from '../../policy/engine.js';

const InputSchema = z.object({
  sessionId: z.string().uuid('Must be a valid UUID session ID'),
  signedTransaction: z
    .string()
    .refine(isHex, { message: 'Must be hex-encoded (0x-prefixed)' }),
  targetContract: z
    .string()
    .refine(isAddress, { message: 'Invalid contract address' }),
  valueWei: z.string().regex(/^\d+$/).default('0'),
  functionSelector: z
    .string()
    .regex(/^0x[0-9a-fA-F]{8}$/)
    .optional(),
  dryRun: z.boolean().default(false),
});

export const executeIntentDefinition: Tool = {
  name: 'execute_intent',
  description:
    'Broadcast a signed transaction through session key validation and the policy engine. Pre-signed by the session owner. All policy rules run before any broadcast.',
  inputSchema: {
    type: 'object',
    required: ['sessionId', 'signedTransaction', 'targetContract'],
    properties: {
      sessionId: {
        type: 'string',
        description: 'Active session key UUID authorizing this action',
      },
      signedTransaction: {
        type: 'string',
        description: 'RLP-encoded signed transaction as a 0x-prefixed hex string',
      },
      targetContract: {
        type: 'string',
        description: 'Contract address being called — used for policy whitelist check',
      },
      valueWei: {
        type: 'string',
        description: 'RBTC value attached in wei. Default "0".',
      },
      functionSelector: {
        type: 'string',
        description: '4-byte function selector (0x-prefixed) for session permission checks',
      },
      dryRun: {
        type: 'boolean',
        description: 'Validate through all checks without broadcasting. Default false.',
      },
    },
  },
};

export interface ExecuteIntentDeps {
  sessionService: SessionService;
  policyEngine: PolicyEngine;
}

export function createExecuteIntentHandler(deps: ExecuteIntentDeps) {
  return async function executeIntentHandler(
    rawArgs: unknown
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const parsed = InputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
      };
    }

    const { sessionId, signedTransaction, targetContract, valueWei, functionSelector, dryRun } =
      parsed.data;

    const valueWeiNum = BigInt(valueWei);

    const sessionResult = deps.sessionService.validate(sessionId, {
      targetContract: targetContract as `0x${string}`,
      valueWei: valueWeiNum,
      ...(functionSelector !== undefined
        ? { functionSelector: functionSelector as `0x${string}` }
        : {}),
    });

    if (!sessionResult.valid) {
      return {
        content: [{ type: 'text', text: `Session validation failed: ${sessionResult.reason}` }],
      };
    }

    const session = sessionResult.session!;

    const policyResult = deps.policyEngine.evaluate({
      sessionId,
      from: session.ownerAddress,
      to: targetContract as `0x${string}`,
      calldata: signedTransaction as `0x${string}`,
      valueWei: valueWeiNum,
      sessionMaxSpendWei: session.permissions.maxSpendWei,
      sessionSpentWei: session.spentWei,
    });

    if (policyResult.decision === 'deny') {
      return {
        content: [
          {
            type: 'text',
            text: `Blocked by policy rule "${policyResult.rule}": ${policyResult.reason}`,
          },
        ],
      };
    }

    if (dryRun) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'dry_run_passed',
                sessionId,
                policyDecision: policyResult.decision,
                policyRule: policyResult.rule,
                remainingSpendWei: (
                  session.permissions.maxSpendWei -
                  session.spentWei -
                  valueWeiNum
                ).toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    try {
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTransaction as `0x${string}`,
      });

      deps.sessionService.recordSpend(sessionId, valueWeiNum);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'broadcast',
                txHash,
                sessionId,
                remainingSpendWei: (
                  session.permissions.maxSpendWei -
                  session.spentWei -
                  valueWeiNum
                ).toString(),
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
        content: [{ type: 'text', text: `Broadcast failed: ${message}` }],
      };
    }
  };
}
