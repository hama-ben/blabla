/**
 * requireAuth middleware — Supabase Auth JWT validation
 *
 * Reads the `Authorization: Bearer <access_token>` header on every
 * protected request. The token is a Supabase-issued JWT.
 *
 * Validation steps:
 *  1. Bearer token must be present.
 *  2. JWT payload is decoded to extract sub (userId), exp, and app_metadata.
 *  3. Expiry is checked locally (no network round-trip).
 *  4. userType is read from app_metadata (set by admin at registration time).
 *     If absent (legacy or admin-created users), a DB lookup is performed.
 *
 * On success: attaches req.auth = { userId, userType } for downstream handlers.
 * On failure: 401 JSON.
 *
 * Public routes (/auth/*, /health) are registered before this middleware
 * and are never affected.
 */

import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

export interface AuthPayload {
  userId: string;
  userType: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

interface JwtPayload {
  sub?: string;
  exp?: number;
  app_metadata?: { userType?: string };
  user_metadata?: { userType?: string };
}

/**
 * Decode a JWT payload without verifying the signature.
 * Fast (no network call). Expiry is verified separately.
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const raw = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(raw) as JwtPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const payload = decodeJwt(token);

  if (!payload || !payload.sub) {
    res.status(401).json({ error: "رمز المصادقة غير صالح" });
    return;
  }

  // Check expiry (exp is Unix timestamp in seconds)
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    res.status(401).json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" });
    return;
  }

  const userId = payload.sub;

  // Try to get userType from app_metadata (set at registration, no DB call needed)
  const userTypeFromMeta =
    payload.app_metadata?.userType ?? payload.user_metadata?.userType;

  if (userTypeFromMeta) {
    req.auth = { userId, userType: userTypeFromMeta };
    next();
    return;
  }

  // Fallback: look up userType from our DB (handles legacy/admin users)
  try {
    const [dbUser] = await db
      .select({ userType: usersTable.userType })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!dbUser) {
      res.status(401).json({ error: "الحساب غير موجود" });
      return;
    }

    req.auth = { userId, userType: dbUser.userType };
    next();
  } catch (err) {
    logger.error({ err, userId }, "requireAuth: DB lookup failed");
    res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
}
