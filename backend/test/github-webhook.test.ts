import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.GITHUB_APP_WEBHOOK_SECRET = "test-webhook-secret";

test("webhook signature verification rejects tampered payloads", async () => {
  const { verifyWebhook } = await import("../src/services/github-app.service.js");
  const body = Buffer.from(JSON.stringify({ action: "created" }));
  const signature = `sha256=${crypto.createHmac("sha256", "test-webhook-secret").update(body).digest("hex")}`;
  assert.equal(verifyWebhook(body, signature), true);
  assert.equal(verifyWebhook(body, "sha256=deadbeef"), false);
  assert.equal(verifyWebhook(body, undefined), false);
});
