import crypto from "node:crypto";
import type { Severity } from "../types/index.js";

export interface LogEvent {
  timestamp?: number;
  message?: string;
  [key: string]: unknown;
}

export interface ErrorReport {
  timestamp: number;
  lastTimestamp: number;
  severity: Severity;
  message: string;
  raw: string;
  fingerprint?: string;
  logGroup?: string | null;
  logStream?: string | null;
}

const LEVELS: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"];
const ERROR_PATTERN = /\b(error|errors|exception|traceback|stack trace|fatal|panic|uncaught|unhandled|assertion\w*|failure|failed)\b/i;
const SEVERITY_PATTERNS: { level: Severity; pattern: RegExp }[] = [
  { level: "CRITICAL", pattern: /\b(fatal|critical|emerg\w*|emergency|panic|out of memory|oom)\b/i },
  { level: "HIGH", pattern: /\b(error|err|exception|severe|uncaught|unhandled|traceback)\b/i },
  { level: "MEDIUM", pattern: /\b(warn|warning|deprecated)\b/i },
];
const CONTINUATION_PATTERN = /^(?:\s+at\s|\s+at\b|\tat\b|\s*Caused by:|\s*File "|\s*\.\.\. \d+ more|\s*from\s|\s*\^+\s*$|\s{2,}\S)/;
const JSON_LEVEL_KEYS = ["level", "severity", "lvl", "log_level", "levelname"];
const JSON_MESSAGE_KEYS = ["message", "msg", "error_message", "event"];
const JSON_ERROR_KEYS = ["error", "err", "exception", "exc_info", "stack", "stacktrace"];
const JSON_CONTEXT_KEYS = ["service", "service_name", "logger", "environment", "env", "host", "hostname", "trace_id", "request_id", "correlation_id"];

function pick(source: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function detectSeverity(message: unknown): Severity {
  const text = String(message ?? "");
  const parsed = parseJson(text);
  if (parsed) {
    const raw = pick(parsed, JSON_LEVEL_KEYS);
    if (raw) {
      const mapped: Record<string, Severity> = {
        fatal: "CRITICAL", critical: "CRITICAL", emerg: "CRITICAL", emergency: "CRITICAL",
        alert: "CRITICAL", panic: "CRITICAL", error: "HIGH", err: "HIGH", exception: "HIGH",
        severe: "HIGH", warn: "MEDIUM", warning: "MEDIUM", info: "INFO", information: "INFO",
        debug: "INFO", trace: "INFO", notice: "INFO",
      };
      const result = mapped[raw.toLowerCase()];
      if (result) return result;
    }
  }
  for (const { level, pattern } of SEVERITY_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return "UNKNOWN";
}

export function isErrorEvent(message: unknown): boolean {
  const text = String(message ?? "");
  const parsed = parseJson(text);
  if (parsed) {
    if (pick(parsed, JSON_ERROR_KEYS)) return true;
    const level = pick(parsed, JSON_LEVEL_KEYS);
    if (level && ["fatal", "critical", "error", "err", "exception", "severe", "alert", "emerg", "panic"].includes(level.toLowerCase())) {
      return true;
    }
  }
  return ERROR_PATTERN.test(text);
}

export function describeEvent(event: LogEvent): string {
  const raw = String(event?.message ?? "");
  const parsed = parseJson(raw);
  if (parsed) {
    const message = pick(parsed, JSON_MESSAGE_KEYS);
    const error = pick(parsed, JSON_ERROR_KEYS);
    const context: Record<string, unknown> = {};
    for (const key of JSON_CONTEXT_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" || typeof value === "number") context[key] = value;
    }
    const body = [message, error].filter(Boolean).join("\n");
    const contextLine = Object.keys(context).length ? `\n[context] ${JSON.stringify(context)}` : "";
    return `${body || raw}${contextLine}`;
  }
  return raw;
}

export function isContinuation(message: unknown): boolean {
  const text = String(message ?? "");
  return text.trim() === "" || CONTINUATION_PATTERN.test(text);
}

export function mergeEvents(matched: LogEvent[], context: LogEvent[]): LogEvent[] {
  const merged = new Map<string, LogEvent>();
  for (const event of [...(matched ?? []), ...(context ?? [])]) {
    const timestamp = event?.timestamp ?? 0;
    const message = String(event?.message ?? "");
    if (!message) continue;
    merged.set(`${timestamp}:${message}`, { timestamp, message });
  }
  return [...merged.values()].sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));
}

export function buildErrorReports(events: LogEvent[], options: { clusterWindowMs?: number; maxReports?: number } = {}): ErrorReport[] {
  const { clusterWindowMs = 60_000, maxReports = 5 } = options;
  const entries: { lines: string[]; timestamp: number; lastTimestamp: number }[] = [];

  for (const event of events ?? []) {
    const message = String(event?.message ?? "");
    const timestamp = event?.timestamp ?? Date.now();
    const previous = entries[entries.length - 1];
    if (previous && isContinuation(message)) {
      previous.lines.push(message);
      previous.lastTimestamp = timestamp;
      continue;
    }
    entries.push({ lines: [message], timestamp, lastTimestamp: timestamp });
  }

  const reports: ErrorReport[] = [];
  for (const entry of entries) {
    const text = entry.lines.join("\n");
    if (!isErrorEvent(text)) continue;
    if (entry.lastTimestamp - entry.timestamp > clusterWindowMs) entry.lines = entry.lines.slice(0, 1);
    reports.push({
      timestamp: entry.timestamp,
      lastTimestamp: entry.lastTimestamp,
      severity: detectSeverity(text),
      message: describeEvent({ message: entry.lines.join("\n") }),
      raw: entry.lines.join("\n"),
    });
    if (reports.length >= maxReports) break;
  }
  return reports;
}

export function fingerprint(report: Partial<ErrorReport>): string {
  const normalised = String(report?.raw ?? report?.message ?? "")
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "")
    .replace(/\b[0-9a-f]{8,}\b/g, "")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return crypto.createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

export function worstSeverity(left: Severity, right: Severity): Severity {
  const leftIndex = LEVELS.indexOf(left);
  const rightIndex = LEVELS.indexOf(right);
  if (leftIndex === -1) return right;
  if (rightIndex === -1) return left;
  return leftIndex <= rightIndex ? left : right;
}
