import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Supabase Postgres is the permanent primary database.
// SUPABASE_DB_URL must be set — no fallback to any other connection.
const rawUrl = process.env.SUPABASE_DB_URL;

if (!rawUrl) {
  throw new Error(
    "[db] SUPABASE_DB_URL is not set — database operations cannot start. " +
    "Set this secret to the direct Supabase Postgres connection string."
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
