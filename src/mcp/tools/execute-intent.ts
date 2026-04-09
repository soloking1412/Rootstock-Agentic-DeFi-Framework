import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isAddress, isHex, parseTransaction, recoverTransactionAddress, type TransactionSerialized } from 'viem';
import { publicClient } from '../../config/index.js';
import type { SessionService } from '../../session/service.js';
import type { PolicyEngine } from '../../policy/engine.js';

const InputSchema = z.object({
  sessionId: z.string().uuid('Must be a valid UUID session ID'),
  signedTransaction: z
    .string()
    .refine(isHex, { message: 'Must be hex-encoded (0x-prefixed)' }),
  assertTargetContract: z
    .string()
    .refine(isAddress, { message: 'Invalid contract address' })
    .optional(),
  assertValueWei: z.string().regex(/^\d+$/).optional(),
  dryRun: z.boolean().default(false),
});

export const executeIntentDefinition: Tool = {
  name: 'execute_intent',
  description:
    'Broadcast a signed transaction through session key validation and the policy engine. The transaction is decoded to extract the real target address and value — these cannot be overridden by the caller. Set dryRun:true to validate without broadcasting.',
  inputSchema: {
    type: 'object',
    required: ['sessionId', 'signedTransaction'],
    properties: {
      sessionId: {
        type: 'string',
        description: 'Active session key UUID authorizing this action',
      },
      signedTransaction: {
        type: 'string',
        description: 'RLP-encoded signed transaction as a 0x-prefixed hex string',
      },
      assertTargetContract: {
        type: 'string',
        description:
          'Optional: assert the decoded transaction target matches this address. Request is rejected if they differ.',
      },
      assertValueWei: {
        type: 'string',
        description:
          'Optional: assert the decoded transaction value (in wei) matches this string. Request is rejected if they differ.',
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

function deny(text: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text', text }], isError: true };
}

export function createExecuteIntentHandler(deps: ExecuteIntentDeps) {
  return async function executeIntentHandler(
    rawArgs: unknown
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }> {
    const parsed = InputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return deny(`Invalid input: ${parsed.error.message}`);
    }

    const { sessionId, signedTransaction, assertTargetContract, assertValueWei, dryRun } =
      parsed.data;

    let decoded: ReturnType<typeof parseTransaction>;
    try {
      decoded = parseTransaction(signedTransaction as `0x${string}`);
    } catch {
      return deny('Invalid signedTransaction: failed to decode RLP');
    }

    if (!decoded.to) {
      return deny('Contract deployment transactions are not permitted');
    }

    const decodedTo = decoded.to;
    const decodedValue = decoded.value ?? 0n;
    const decodedCalldata: `0x${string}` =
      (decoded.data as `0x${string}` | undefined) ?? '0x';

    if (assertTargetContract !== undefined) {
      if (assertTargetContract.toLowerCase() !== decodedTo.toLowerCase()) {
        return deny(
          `Assertion failed: declared target ${assertTargetContract} does not match decoded tx target ${decodedTo}`
        );
      }
    }
    if (assertValueWei !== undefined) {
      if (BigInt(assertValueWei) !== decodedValue) {
        return deny(
          `Assertion failed: declared valueWei ${assertValueWei} does not match decoded tx value ${decodedValue.toString()}`
        );
      }
    }

    const sessionResult = deps.sessionService.validate(sessionId, {
      targetContract: decodedTo,
      valueWei: decodedValue,
      ...(decodedCalldata.length >= 10
        ? { functionSelector: decodedCalldata.slice(0, 10) as `0x${string}` }
        : {}),
    });

    if (!sessionResult.valid) {
      return deny(`Session validation failed: ${sessionResult.reason}`);
    }

    const session = sessionResult.session!;

    const policyResult = deps.policyEngine.evaluate({
      sessionId,
      from: session.ownerAddress,
      to: decodedTo,
      calldata: decodedCalldata,
      valueWei: decodedValue,
      sessionMaxSpendWei: session.permissions.maxSpendWei,
      sessionSpentWei: session.spentWei,
    });

    if (policyResult.decision === 'deny') {
      return deny(`Blocked by policy rule "${policyResult.rule}": ${policyResult.reason}`);
    }

    if (!dryRun) {
      deps.sessionService.reserveSpend(sessionId, decodedValue);
    }

    let signer: `0x${string}`;
    try {
      signer = await recoverTransactionAddress({
        serializedTransaction: signedTransaction as TransactionSerialized,
      });
    } catch {
      if (!dryRun) {
        deps.sessionService.rollbackSpend(sessionId, decodedValue);
      }
      return deny('Could not recover signer from signed transaction');
    }

    if (signer.toLowerCase() !== session.ownerAddress.toLowerCase()) {
      if (!dryRun) {
        deps.sessionService.rollbackSpend(sessionId, decodedValue);
      }
      return deny(
        `Signer mismatch: transaction signed by ${signer} but session owner is ${session.ownerAddress}`
      );
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
                decodedTo,
                decodedValue: decodedValue.toString(),
                policyDecision: policyResult.decision,
                policyRule: policyResult.rule,
                remainingSpendWei: (
                  session.permissions.maxSpendWei -
                  session.spentWei -
                  decodedValue
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

      const fresh = deps.sessionService.get(sessionId);
      const remainingSpendWei = fresh !== undefined
        ? (fresh.permissions.maxSpendWei - fresh.spentWei).toString()
        : 'unknown';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'broadcast',
                txHash,
                sessionId,
                remainingSpendWei,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      deps.sessionService.rollbackSpend(sessionId, decodedValue);
      const message = err instanceof Error ? err.message : String(err);
      return deny(`Broadcast failed: ${message}`);
    }
  };
}
