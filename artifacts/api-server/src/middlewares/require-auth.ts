/**
 * requireAuth middleware — Supabase Auth JWT validation
 *
 * Reads the `Authorization: Bearer <access_token>` header on every
 * protected request. The token is a Supabase-issued JWT.
 *
 * Validation:
 *  1. Bearer token must be present.
 *  2. Token is verified cryptographically via supabase.auth.getUser(token),
 *     which validates the JWT signature, issuer, audience, and expiry
 *     server-side. No local base64 decoding used.
 *  3. userType is read from app_metadata (set by admin at registration).
 *     If absent (legacy/admin-created users), a DB lookup is performed.
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
import { getSupabaseAuth } from "../lib/supabase-server";
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  // Verify the JWT cryptographically via Supabase (checks signature, issuer, expiry).
  const supabase = getSupabaseAuth();
  if (!supabase) {
    logger.error("requireAuth: Supabase auth client not available — SUPABASE_URL/SUPABASE_ANON_KEY not set");
    res.status(503).json({ error: "الخادم غير مهيأ بشكل صحيح" });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "رمز المصادقة غير صالح أو منتهي الصلاحية" });
    return;
  }

  const userId = user.id;

  // Try to get userType from app_metadata (set at registration, no DB call needed)
  const userTypeFromMeta =
    (user.app_metadata as Record<string, unknown>)?.userType as string | undefined ??
    (user.user_metadata as Record<string, unknown>)?.userType as string | undefined;

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
