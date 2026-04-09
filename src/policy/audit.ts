import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config/index.js';

export type PolicyDecision = 'allow' | 'deny';

export interface AuditEntry {
  timestamp: string;
  decision: PolicyDecision;
  rule: string;
  sessionId?: string;
  targetContract?: string;
  functionSelector?: string;
  valueWei?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export function writeAuditEntry(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + '\n';

  if (config.audit.destination === 'file') {
    try {
      appendFileSync(resolve(config.audit.filePath), line, 'utf8');
    } catch {
      process.stderr.write(
        `[audit] write failed for ${config.audit.filePath}\n`
      );
      process.stderr.write(`[audit] ${line}`);
    }
  } else {
    process.stderr.write(`[audit] ${line}`);
  }
}
