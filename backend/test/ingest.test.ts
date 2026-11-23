import assert from "node:assert/strict";
import test from "node:test";
import { buildErrorReports, detectSeverity, fingerprint, isErrorEvent, mergeEvents } from "../src/ingest/cloudwatch.js";
import { deriveIngestKey, verifyIngestKey } from "../src/ingest/keys.js";
import { DedupeStore } from "../src/ingest/dedupe.js";

test("ingest key is bound to the workspace, owner and secret", () => {
  const key = deriveIngestKey("secret", "ws-1", "user-1");
  assert.ok(key.length === 64);
  assert.equal(verifyIngestKey("secret", "ws-1", "user-1", key), true);
  assert.equal(verifyIngestKey("other", "ws-1", "user-1", key), false);
  assert.equal(verifyIngestKey("secret", "ws-2", "user-1", key), false);
  assert.equal(verifyIngestKey("secret", "ws-1", "user-2", key), false);
});

test("severity is read from structured and plain logs", () => {
  assert.equal(detectSeverity('{"level":"fatal","message":"boom"}'), "CRITICAL");
  assert.equal(detectSeverity("ERROR something failed"), "HIGH");
  assert.equal(detectSeverity("Warning: slow query"), "MEDIUM");
  assert.equal(detectSeverity("just a line"), "UNKNOWN");
});

test("stack traces are grouped into one error report", () => {
  const events = mergeEvents(
    [
      { timestamp: 1, message: "Error: cannot read foo" },
      { timestamp: 2, message: "    at handler (/app/index.js:10:3)" },
      { timestamp: 3, message: "ordinary line" },
    ],
    [],
  );
  const reports = buildErrorReports(events);
  assert.equal(reports.length, 1);
  assert.match(reports[0].message, /at handler/);
  assert.equal(isErrorEvent("ordinary line"), false);
});

test("fingerprints ignore volatile numbers and hex ids", () => {
  const a = fingerprint({ raw: "Error at 0xabc123 after 42 ms" });
  const b = fingerprint({ raw: "Error at 0xdef456 after 7 ms" });
  assert.equal(a, b);
});

test("dedupe store remembers and expires fingerprints", () => {
  const store = new DedupeStore(10);
  assert.equal(store.seen("ws", "fp"), false);
  store.remember("ws", "fp");
  assert.equal(store.seen("ws", "fp"), true);
});
