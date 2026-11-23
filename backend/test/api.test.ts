import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/api/app.js";

test("health and activity endpoints respond", async () => {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listening address");

  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(health.status, 200);
    const payload = (await health.json()) as { service: string; version: number };
    assert.equal(payload.service, "codewarden-api");
    assert.equal(payload.version, 2);

    const activity = await fetch(`http://127.0.0.1:${address.port}/api/activity`);
    assert.equal(activity.status, 200);
    const activityPayload = (await activity.json()) as { ok: boolean; events: unknown[] };
    assert.equal(activityPayload.ok, true);
    assert.ok(Array.isArray(activityPayload.events));

    const missing = await fetch(`http://127.0.0.1:${address.port}/api/nope`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
