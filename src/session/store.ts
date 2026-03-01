import type { SessionId, SessionKey } from './types.js';

interface StoreEntry {
  session: SessionKey;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export class SessionStore {
  private readonly sessions = new Map<SessionId, StoreEntry>();

  set(session: SessionKey): void {
    const existing = this.sessions.get(session.id);
    if (existing) {
      clearTimeout(existing.timeoutHandle);
    }

    const ttlMs = session.expiresAt - Date.now();
    if (ttlMs <= 0) return;

    const handle = setTimeout(() => {
      this.sessions.delete(session.id);
    }, ttlMs);

    handle.unref();

    this.sessions.set(session.id, { session, timeoutHandle: handle });
  }

  get(id: SessionId): SessionKey | undefined {
    return this.sessions.get(id)?.session;
  }

  update(id: SessionId, patch: Partial<SessionKey>): SessionKey | undefined {
    const entry = this.sessions.get(id);
    if (!entry) return undefined;
    const updated: SessionKey = { ...entry.session, ...patch };
    this.sessions.set(id, { ...entry, session: updated });
    return updated;
  }

  delete(id: SessionId): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    clearTimeout(entry.timeoutHandle);
    this.sessions.delete(id);
    return true;
  }

  listByOwner(ownerAddress: string): SessionKey[] {
    const lower = ownerAddress.toLowerCase();
    return Array.from(this.sessions.values())
      .map((e) => e.session)
      .filter((s) => s.ownerAddress.toLowerCase() === lower);
  }

  listByAgent(agentId: string): SessionKey[] {
    return Array.from(this.sessions.values())
      .map((e) => e.session)
      .filter((s) => s.agentId === agentId);
  }

  size(): number {
    return this.sessions.size;
  }

  clear(): void {
    for (const entry of this.sessions.values()) {
      clearTimeout(entry.timeoutHandle);
    }
    this.sessions.clear();
  }
}
