export class DedupeStore {
  private readonly seenMap = new Map<string, number>();

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 600_000;
    this.maxEntries = options.maxEntries ?? 5000;
  }

  private readonly ttlMs: number;
  private readonly maxEntries: number;

  seen(workspaceId: string, fingerprint: string): boolean {
    const key = `${workspaceId}:${fingerprint}`;
    const at = this.seenMap.get(key);
    if (!at) return false;
    if (Date.now() - at > this.ttlMs) {
      this.seenMap.delete(key);
      return false;
    }
    return true;
  }

  remember(workspaceId: string, fingerprint: string): void {
    this.prune();
    this.seenMap.set(`${workspaceId}:${fingerprint}`, Date.now());
  }

  prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, at] of this.seenMap) {
      if (at < cutoff) this.seenMap.delete(key);
    }
    while (this.seenMap.size > this.maxEntries) {
      const oldest = this.seenMap.keys().next().value;
      if (!oldest) break;
      this.seenMap.delete(oldest);
    }
  }
}
