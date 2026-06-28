import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Accept both the correct name and the legacy typo that may exist on Render.
// Priority: SUPABASE_DB_URL → SUPABASE_BD_URL (typo fallback) → crash.
const rawUrl =
  process.env.SUPABASE_DB_URL ??
  process.env.SUPABASE_BD_URL;

if (!rawUrl) {
  throw new Error(
    "[db] Neither SUPABASE_DB_URL nor SUPABASE_BD_URL is set. " +
    "Set SUPABASE_DB_URL to the direct Supabase Postgres connection string."
  );
}

// Always SSL for Supabase — rejectUnauthorized:false is intentional
// (TLS tunnel enforced by the connection string; we need encryption, not cert pinning).
export const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

export * from "./schema";
