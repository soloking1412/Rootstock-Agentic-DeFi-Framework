import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  RSK_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),
  RSK_MAINNET_RPC_URL: z.string().url().default('https://public-node.rsk.co'),
  RSK_TESTNET_RPC_URL: z
    .string()
    .url()
    .default('https://public-node.testnet.rsk.co'),
  RSK_MAINNET_WS_URL: z.string().default(''),
  RSK_TESTNET_WS_URL: z.string().default(''),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  MCP_HTTP_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  SESSION_DEFAULT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  SESSION_MAX_SPEND_RBTC: z.coerce.number().positive().default(0.01),
  POLICY_CONTRACT_WHITELIST: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    ),
  AUDIT_LOG_DESTINATION: z.enum(['console', 'file']).default('console'),
  AUDIT_LOG_FILE_PATH: z.string().default('./audit.log'),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const env = parseEnv();
