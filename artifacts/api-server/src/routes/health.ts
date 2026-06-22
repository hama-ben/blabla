import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Root ping — always 200, no dependencies ──────────────────────────────────
// Replit's deployment healthcheck hits /api (which maps to "/" inside this
// router because the router is mounted at /api in app.ts). Return 200
// immediately so the platform always considers the port live.
router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── Legacy ping — always 200, no dependencies ─────────────────────────────────
router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── Full health check with DB connectivity probe ──────────────────────────────
// Uses a direct pool query (not Supabase REST) so Supabase env vars being
// absent does NOT make this return 503.
// Returns 200 in all cases so the deployment platform never rejects a healthy
// port just because the DB is briefly unavailable during a cold start race.
// The "db" field in the body lets monitoring tools see the real DB status.
router.get("/health", async (_req, res) => {
  const timestamp = new Date().toISOString();

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    logger.info("Health check: DB reachable");
    res.status(200).json({ status: "ok", db: "ok", timestamp });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn({ err: detail }, "Health check: DB probe failed — returning 200 with degraded status");
    res.status(200).json({ status: "ok", db: "degraded", detail, timestamp });
  }
});

export default router;
