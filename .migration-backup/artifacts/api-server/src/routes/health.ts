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

// ── Configuration health check ────────────────────────────────────────────────
// Reports which required environment variables are present, the DB
// connectivity status, and an overall readiness verdict.
// Never leaks values — only "set" | "missing".
// Returns 200 always so the deployment platform stays satisfied; consumers
// must inspect the JSON body for the real status.
router.get("/health/config", async (_req, res) => {
  const timestamp = new Date().toISOString();

  // ── Environment variable audit ────────────────────────────────────────────
  type VarStatus = "set" | "missing";

  function check(name: string): VarStatus {
    const v = process.env[name]?.trim();
    return v ? "set" : "missing";
  }

  const env: Record<string, VarStatus> = {
    SUPABASE_URL:              check("SUPABASE_URL"),
    SUPABASE_ANON_KEY:         check("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: check("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_DB_URL:           check("SUPABASE_DB_URL"),
    VAPID_PUBLIC_KEY:          check("VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY:         check("VAPID_PRIVATE_KEY"),
    ADMIN_API_KEY:             check("ADMIN_API_KEY"),
    SMTP_HOST:                 check("SMTP_HOST"),
    SMTP_USER:                 check("SMTP_USER"),
    SMTP_PASS:                 check("SMTP_PASS"),
  };

  // ── Required vars (app cannot function without these) ─────────────────────
  const required: (keyof typeof env)[] = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_DB_URL",
  ];
  const missingRequired = required.filter((k) => env[k] === "missing");

  // ── Optional vars (degrade gracefully when absent) ────────────────────────
  const optional: (keyof typeof env)[] = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "ADMIN_API_KEY",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
  ];
  const missingOptional = optional.filter((k) => env[k] === "missing");

  // ── DB probe ──────────────────────────────────────────────────────────────
  let db: "ok" | "degraded" = "ok";
  let dbDetail: string | undefined;

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  } catch (err) {
    db = "degraded";
    dbDetail = err instanceof Error ? err.message : String(err);
  }

  // ── Readiness ─────────────────────────────────────────────────────────────
  const ready = missingRequired.length === 0 && db === "ok";

  res.status(200).json({
    ready,
    timestamp,
    db,
    ...(dbDetail ? { dbDetail } : {}),
    env,
    ...(missingRequired.length > 0 ? { missingRequired } : {}),
    ...(missingOptional.length > 0 ? { missingOptional } : {}),
  });
});

export default router;
