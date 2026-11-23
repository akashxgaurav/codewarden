import assert from "node:assert/strict";
import test from "node:test";
import { activity, activityScope } from "../src/services/activity.service.js";

test("activity events can be published, listed and filtered", () => {
  const event = activity.publish({
    level: "info",
    category: "analysis",
    message: "Investigation started",
    ownerUid: "user-1",
    workspaceId: "ws-1",
    active: true,
  });
  const listed = activity.list({ ownerUid: "user-1", workspaceId: "ws-1" }, 10);
  assert.ok(listed.some((item) => item.id === event.id));
  assert.ok(listed.every((item) => item.ownerUid === "user-1"));
  assert.equal(listed.find((item) => item.id === event.id)?.active, true);
});

test("activity listeners receive matching events only", () => {
  const received: string[] = [];
  const unsubscribe = activity.subscribe({ workspaceId: "ws-listener" }, (event) => received.push(event.message));
  activity.publish({ level: "info", category: "system", message: "one", workspaceId: "ws-listener" });
  activity.publish({ level: "info", category: "system", message: "two", workspaceId: "ws-other" });
  unsubscribe();
  activity.publish({ level: "info", category: "system", message: "three", workspaceId: "ws-listener" });
  assert.deepEqual(received, ["one"]);
});

test("github webhook activity is not exposed to clients", () => {
  const received: string[] = [];
  const unsubscribe = activity.subscribe({}, (event) => received.push(event.message));
  const webhookEvent = activity.publish({
    level: "info",
    category: "github-webhook",
    message: "GitHub App installation created for acme",
  });
  unsubscribe();

  assert.equal(activity.list({}, 100).some((item) => item.id === webhookEvent.id), false);
  assert.equal(received.includes(webhookEvent.message), false);
});

test("activity scope stamps shared context", () => {
  const scope = activityScope({ category: "github", ownerUid: "user-2", workspaceId: "ws-2", jobId: "job-2" });
  const event = scope.success("Connected", { installationId: 42 });
  assert.equal(event.ownerUid, "user-2");
  assert.equal(event.jobId, "job-2");
  assert.deepEqual(event.details, { installationId: 42 });
});
