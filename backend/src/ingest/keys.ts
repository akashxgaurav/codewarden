import crypto from "node:crypto";

export function deriveIngestKey(secret: string, workspaceId: string, ownerUid: string): string {
  if (!secret || !workspaceId || !ownerUid) return "";
  return crypto.createHmac("sha256", secret).update(`${workspaceId}:${ownerUid}`).digest("hex");
}

export function verifyIngestKey(secret: string, workspaceId: string, ownerUid: string, key: unknown): boolean {
  const expected = deriveIngestKey(secret, workspaceId, ownerUid);
  if (!expected || typeof key !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
