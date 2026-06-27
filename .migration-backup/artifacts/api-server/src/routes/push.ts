/**
 * POST /api/push/subscribe
 * Saves a Web Push PushSubscription object for a userId.
 * One row per userId — upsert so re-subscribes (e.g. after permission reset)
 * replace the stale endpoint rather than accumulating dead ones.
 *
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key so the client can subscribe without
 * embedding it at build time (useful for server-rendered / native builds).
 * This route is intentionally public — the key is not a secret.
 */

import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/push/vapid-public-key", (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  res.json({ publicKey: key });
});

router.post("/push/subscribe", async (req, res): Promise<void> => {
  const { userId, subscription } = req.body as {
    userId?: string;
    subscription?: unknown;
  };

  if (!userId || !subscription || typeof subscription !== "object") {
    res.status(400).json({ error: "userId and subscription are required" });
    return;
  }

  // Upsert: if a row already exists for this userId update it, else insert.
  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId,
      subscription,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.userId,
      set: {
        subscription,
        updatedAt: sql`now()`,
      },
    });

  req.log.info({ userId }, "Push subscription saved");
  res.status(201).json({ ok: true });
});

export default router;
