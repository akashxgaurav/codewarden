/**
 * The forwarder that runs inside the customer account.
 *
 * CloudFormation embeds this source with the inline ZipFile option, which
 * limits it to 4096 characters.
 */
export const LAMBDA_SOURCE = `const { gunzipSync } = require("node:zlib");
const { CloudWatchLogsClient, FilterLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");

const logs = new CloudWatchLogsClient({});
const API_URL = process.env.CODEWARDEN_API_URL;
const CONTEXT_LINES = Number(process.env.CODEWARDEN_CONTEXT_LINES || 0);

function decode(event) {
  const data = event && event.awslogs && event.awslogs.data;
  return data ? JSON.parse(gunzipSync(Buffer.from(data, "base64")).toString("utf8")) : null;
}

async function getContext(payload) {
  if (!CONTEXT_LINES || !payload.logEvents.length) return [];

  const timestamps = payload.logEvents.map((e) => e.timestamp);
  const startTime = Math.min(...timestamps) - 300000;
  const endTime = Math.max(...timestamps) + 300000;
  const matchedIds = new Set(payload.logEvents.map((e) => e.id).filter(Boolean));
  const all = [];
  let nextToken;
  let pageCount = 0;

  do {
    const result = await logs.send(new FilterLogEventsCommand({
      logGroupName: payload.logGroup,
      logStreamNames: [payload.logStream],
      startTime,
      endTime,
      limit: 10000,
      nextToken
    }));
    all.push(...(result.events || []));
    if (!result.nextToken || result.nextToken === nextToken) break;
    nextToken = result.nextToken;
    pageCount += 1;
  } while (pageCount < 5);

  all.sort((a, b) => a.timestamp - b.timestamp);
  const selected = new Map();
  const beforeCount = Math.floor(CONTEXT_LINES / 2);
  const afterCount = CONTEXT_LINES - beforeCount;

  for (const target of payload.logEvents) {
    let index = all.findIndex((e) => e.eventId && e.eventId === target.id);
    if (index < 0) index = all.findIndex((e) => e.timestamp === target.timestamp && e.message === target.message);
    if (index < 0) continue;

    const from = Math.max(0, index - beforeCount);
    const to = Math.min(all.length, index + 1 + afterCount);
    for (const item of all.slice(from, to)) {
      if (matchedIds.has(item.eventId)) continue;
      const id = item.eventId || item.timestamp + ":" + item.message;
      selected.set(id, { id: item.eventId, timestamp: item.timestamp, message: item.message });
    }
  }

  return Array.from(selected.values()).sort((a, b) => a.timestamp - b.timestamp);
}

exports.handler = async (event) => {
  const payload = decode(event);
  if (!payload || payload.messageType === "CONTROL_MESSAGE") return { forwarded: 0 };
  if (payload.messageType !== "DATA_MESSAGE" || !Array.isArray(payload.logEvents)) {
    throw new Error("Unsupported CloudWatch Logs subscription payload");
  }
  if (!payload.logEvents.length) return { forwarded: 0 };

  let context = [];
  try {
    context = await getContext(payload);
  } catch (error) {
    console.error("Could not read CloudWatch context:", error.message);
  }
  const batch = {
    logGroup: payload.logGroup,
    logStream: payload.logStream,
    events: payload.logEvents.map((e) => ({ id: e.id, timestamp: e.timestamp, message: e.message })),
    context
  };
  const url = API_URL.replace(/\\/+$/, "").replace(/\\/api\\/ingest\\/cloudwatch$/, "") + "/api/ingest/cloudwatch";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-codewarden-workspace": process.env.CODEWARDEN_WORKSPACE_ID,
      "x-codewarden-owner": process.env.CODEWARDEN_OWNER_UID,
      "x-codewarden-ingest-key": process.env.CODEWARDEN_INGEST_KEY
    },
    body: JSON.stringify({ batches: [batch] }),
    signal: AbortSignal.timeout(15000)
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error("Codewarden API returned " + response.status + ": " + responseText.slice(0, 1000));
  return { forwarded: payload.logEvents.length, logGroup: payload.logGroup, response: responseText.slice(0, 1000) };
};
`;
