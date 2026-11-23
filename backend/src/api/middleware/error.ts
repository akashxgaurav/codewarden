import type { ErrorRequestHandler, RequestHandler } from "express";
import { toHttpError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ ok: false, error: `Unknown route: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const httpError = toHttpError(error);
  if (httpError.status >= 500) {
    logger.error("request failed", { status: httpError.status, error: httpError.message });
  }
  if (res.headersSent) return;
  res.status(httpError.status).json({
    ok: false,
    error: httpError.message,
    ...(httpError.code ? { code: httpError.code } : {}),
  });
};
