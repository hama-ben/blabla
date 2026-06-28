/**
 * Auth Rate Limiter
 *
 * Applied only to /api/auth/* routes.
 * - 5 attempts per 15 minutes per IP address.
 * - Returns 429 with a message when the limit is hit.
 * - Logs a warning including the offending IP on every rejection.
 * - Fail-open: if the limiter itself throws (memory pressure, etc.) the
 *   request is allowed through rather than blocking legitimate users.
 *
 * /api/health and /api/healthz are NEVER affected — they are mounted on a
 * separate path and this middleware is not applied to them.
 */

import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const _limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,                  // max 5 requests per window per IP (v8 API)
  standardHeaders: "draft-7",
  legacyHeaders: false,

  handler: (req: Request, res: Response) => {
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    logger.warn(
      { ip, path: req.path, method: req.method },
      "Rate limit triggered on auth route"
    );
    res.status(429).json({
      error: "طلبات كثيرة جداً. يرجى المحاولة مجدداً بعد 15 دقيقة.",
      code: "RATE_LIMITED",
    });
  },
});

/**
 * Fail-open wrapper: if the rate-limiter store throws for any reason,
 * we log a warning and call next() to allow the request through.
 * This ensures an infrastructure glitch never blocks legitimate users.
 */
export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  try {
    _limiter(req, res, (err?: unknown) => {
      if (err) {
        logger.warn({ err }, "Rate limiter internal error — failing open");
        next();
        return;
      }
      next();
    });
  } catch (err) {
    logger.warn({ err }, "Rate limiter threw synchronously — failing open");
    next();
  }
}
