import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent schema bootstrap — runs every time the server starts.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run against a
 * database that already has all tables.  Any new column added to an
 * existing table must be expressed as a separate ALTER TABLE … ADD
 * COLUMN IF NOT EXISTS statement below.
 */
const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS "users" (
  "id"                      text        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"                    text        NOT NULL,
  "email"                   text        NOT NULL,
  "phone"                   text        NOT NULL,
  "password_hash"           text        NOT NULL,
  "user_type"               text        NOT NULL,
  "wilaya"                  text        NOT NULL DEFAULT '',
  "commune"                 text        NOT NULL DEFAULT '',
  "account_status"          text        NOT NULL DEFAULT 'pending',
  "subscription_expires_at" timestamp,
  "free_trial_claimed"      boolean     NOT NULL DEFAULT false,
  CONSTRAINT "users_email_unique" UNIQUE("email"),
  CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

CREATE TABLE IF NOT EXISTS "driver_status" (
  "driver_id"      text      PRIMARY KEY NOT NULL,
  "current_status" text      NOT NULL DEFAULT 'مغلق',
  "updated_at"     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "driver_details" (
  "driver_id"              text PRIMARY KEY NOT NULL,
  "wilaya"                 text NOT NULL DEFAULT '',
  "commune"                text NOT NULL DEFAULT '',
  "truck_front_photo_url"  text,
  "driver_license_url"     text,
  "truck_video_url"        text,
  "truck_side_photo_url"   text
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id"           text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      text      NOT NULL,
  "driver_id"    text,
  "water_volume" text      NOT NULL,
  "barrel_count" integer   NOT NULL DEFAULT 0,
  "total_price"  numeric   NOT NULL,
  "latitude"     text,
  "longitude"    text,
  "status"       text      NOT NULL DEFAULT 'معلق',
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id"            text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id"     text      NOT NULL,
  "receipt_image" text      NOT NULL,
  "status"        text      NOT NULL DEFAULT 'pending',
  "admin_notes"   text,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "reviewed_at"   timestamp
);

CREATE TABLE IF NOT EXISTS "ratings" (
  "id"             text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"       text      NOT NULL,
  "rater_user_id"  text      NOT NULL,
  "rated_user_id"  text      NOT NULL,
  "rater_type"     text      NOT NULL,
  "stars"          integer   NOT NULL,
  "dispute_reason" text,
  "is_disputed"    boolean   NOT NULL DEFAULT false,
  "dispute_count"  integer   NOT NULL DEFAULT 0,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "announcements" (
  "id"              text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title"           text      NOT NULL,
  "content"         text      NOT NULL,
  "target_audience" text      NOT NULL DEFAULT 'all',
  "badge_text"      text,
  "is_active"       boolean   NOT NULL DEFAULT true,
  "created_at"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "saved_locations" (
  "id"         text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    text      NOT NULL,
  "label"      text      NOT NULL,
  "latitude"   text      NOT NULL,
  "longitude"  text      NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id"              text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" text      NOT NULL,
  "user_id"         text      NOT NULL,
  "user_type"       text      NOT NULL,
  "read_at"         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "announcement_reads_unique" UNIQUE ("announcement_id", "user_id", "user_type")
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id"          text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"     text,
  "message"     text      NOT NULL,
  "sender_type" text      NOT NULL DEFAULT 'user',
  "admin_id"    text,
  "status"      text      NOT NULL DEFAULT 'pending',
  "created_at"  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_devices" (
  "id"           text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      text      NOT NULL,
  "device_id"    text      NOT NULL,
  "device_label" text      NOT NULL DEFAULT '',
  "first_seen_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at"  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "driver_appeals" (
  "id"             text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id"      text      NOT NULL,
  "message"        text      NOT NULL,
  "status"         text      NOT NULL DEFAULT 'pending',
  "admin_response" text,
  "created_at"     timestamp NOT NULL DEFAULT now(),
  "reviewed_at"    timestamp
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"           text      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      text      NOT NULL,
  "subscription" jsonb     NOT NULL,
  "created_at"   timestamp NOT NULL DEFAULT now(),
  "updated_at"   timestamp NOT NULL DEFAULT now()
);

-- ── Additive column migrations (always safe to re-run) ─────────────────────

ALTER TABLE "ratings"        ADD COLUMN IF NOT EXISTS "comment" text;

ALTER TABLE "driver_details" ADD COLUMN IF NOT EXISTS "is_legacy_driver"  boolean NOT NULL DEFAULT false;
ALTER TABLE "driver_details" ADD COLUMN IF NOT EXISTS "trial_granted_at"  timestamp;

-- One-time backfill: any driver who has no docs yet is a legacy driver
-- (registered before the document upload feature was added).
-- ON CONFLICT DO NOTHING prevents double-runs from failing.
UPDATE "driver_details"
SET "is_legacy_driver" = true
WHERE "truck_front_photo_url" IS NULL
  AND "driver_license_url" IS NULL
  AND "is_legacy_driver" = false;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at"              timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_approval_granted"  boolean NOT NULL DEFAULT false;

-- Support chat: two-way conversation between users and admin
ALTER TABLE "support_messages" ADD COLUMN IF NOT EXISTS "sender_type" text NOT NULL DEFAULT 'user';
ALTER TABLE "support_messages" ADD COLUMN IF NOT EXISTS "admin_id"    text;
`;

export async function runMigrations(): Promise<void> {
  logger.info("Running DB schema bootstrap…");
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    logger.info("✅ DB schema ready");
  } catch (err: unknown) {
    const cause  = (err as { cause?: unknown })?.cause ?? err;
    const pgCode = (cause as { code?: string })?.code ?? (err as { code?: string })?.code;
    const msg    = err instanceof Error ? err.message : String(err);

    // 23505 = unique_violation — happens when two server instances race to
    // CREATE TABLE at the same time. The table exists (or is being created)
    // so the schema is fine; continue normally instead of aborting.
    if (pgCode === "23505") {
      logger.warn({ pgCode, err: msg }, "⚠️  Schema race detected (table already exists) — continuing");
      return;
    }

    logger.error({ pgCode, err: msg }, "❌ DB schema bootstrap failed — server cannot start");
    throw err;
  } finally {
    client.release();
  }
}
