export type SessionId = string;

export interface SessionPermissions {
  allowedContracts: `0x${string}`[];
  maxSpendWei: bigint;
  allowedFunctionSelectors: `0x${string}`[];
}

export interface SessionKey {
  id: SessionId;
  ownerAddress: `0x${string}`;
  agentId: string;
  permissions: SessionPermissions;
  spentWei: bigint;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  transactionCount: number;
}

export interface CreateSessionParams {
  ownerAddress: `0x${string}`;
  agentId: string;
  ttlSeconds: number;
  maxSpendWei: bigint;
  allowedContracts?: `0x${string}`[];
  allowedFunctionSelectors?: `0x${string}`[];
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  session?: SessionKey;
}
