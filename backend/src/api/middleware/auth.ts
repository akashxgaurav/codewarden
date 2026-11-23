import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyIdToken } from "../../services/firebase.service.js";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    next();
    return;
  }
  try {
    req.user = await verifyIdToken(token);
    next();
  } catch {
    _res.status(401).json({ ok: false, error: "Invalid Firebase ID token" });
  }
};
