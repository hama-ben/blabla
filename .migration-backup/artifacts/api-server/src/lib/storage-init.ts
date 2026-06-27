import { logger } from "./logger";
import { getSupabaseAdmin } from "./supabase-server";

export const DRIVER_DOCS_BUCKET = "driver-documents";

/**
 * ensureDriverBucket()
 *
 * Runs once at server startup via getSupabaseAdmin() which strictly requires
 * SUPABASE_SERVICE_ROLE_KEY — never falls back to anon key.
 * The service-role key bypasses RLS and has full storage-admin rights.
 */
export async function ensureDriverBucket(): Promise<void> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    logger.warn(
      { bucket: DRIVER_DOCS_BUCKET },
      "ensureDriverBucket: SUPABASE_SERVICE_ROLE_KEY not set — " +
      "cannot verify/create bucket automatically. " +
      "Create the bucket manually in the Supabase dashboard (Storage → New bucket → public: true)."
    );
    return;
  }

  const { data: buckets, error: listError } = await admin.storage.listBuckets();

  if (listError) {
    logger.error(
      { bucket: DRIVER_DOCS_BUCKET, err: listError.message },
      "ensureDriverBucket: listBuckets() failed — check SUPABASE_SERVICE_ROLE_KEY"
    );
    return;
  }

  const bucketNames = (buckets ?? []).map((b) => b.name);
  logger.debug({ found: bucketNames }, "ensureDriverBucket: existing buckets");

  if (bucketNames.includes(DRIVER_DOCS_BUCKET)) {
    logger.info(
      { bucket: DRIVER_DOCS_BUCKET },
      `✅ Storage bucket "${DRIVER_DOCS_BUCKET}" already exists — driver uploads are ready`
    );
    return;
  }

  logger.warn(
    { bucket: DRIVER_DOCS_BUCKET },
    `⚠️  Bucket "${DRIVER_DOCS_BUCKET}" not found — creating it now…`
  );

  const { error: createError } = await admin.storage.createBucket(DRIVER_DOCS_BUCKET, {
    public: true,
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ],
    fileSizeLimit: 20971520,
  });

  if (createError) {
    logger.error(
      { bucket: DRIVER_DOCS_BUCKET, err: createError.message },
      `❌ Failed to create bucket "${DRIVER_DOCS_BUCKET}" — driver uploads will fail until it is created manually`
    );
    return;
  }

  logger.info(
    { bucket: DRIVER_DOCS_BUCKET },
    `✅ Bucket "${DRIVER_DOCS_BUCKET}" created successfully (public, 20 MB limit) — driver uploads are ready`
  );
}
