import crypto from "node:crypto";
import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold: number = LEVELS[env.NODE_ENV === "test" ? "error" : "debug"];

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug(message: string, fields?: Record<string, unknown>): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>): void {
    write("error", message, fields);
  },
  child(context: Record<string, unknown>) {
    return {
      debug: (message: string, fields?: Record<string, unknown>): void =>
        write("debug", message, { ...context, ...fields }),
      info: (message: string, fields?: Record<string, unknown>): void =>
        write("info", message, { ...context, ...fields }),
      warn: (message: string, fields?: Record<string, unknown>): void =>
        write("warn", message, { ...context, ...fields }),
      error: (message: string, fields?: Record<string, unknown>): void =>
        write("error", message, { ...context, ...fields }),
    };
  },
};

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
