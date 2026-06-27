import { defineConfig } from "drizzle-kit";
import path from "path";

// Supabase Postgres is the permanent primary database.
// SUPABASE_DB_URL must be set — no fallback to any other connection.
const url = process.env.SUPABASE_DB_URL;

if (!url) {
  throw new Error(
    "SUPABASE_DB_URL is not set — ensure the Supabase DB connection string is configured."
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
