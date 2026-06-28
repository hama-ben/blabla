import { Router, type IRouter } from "express";
import { eq, avg, sql } from "drizzle-orm";
import { db, ratingsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/orders/:orderId/rate", async (req, res): Promise<void> => {
  const { orderId } = req.params;
  const { raterUserId, ratedUserId, raterType, stars } = req.body as {
    raterUserId?: string; ratedUserId?: string; raterType?: string; stars?: number;
  };

  if (!raterUserId || !ratedUserId || !raterType || stars == null) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  if (stars < 1 || stars > 5) {
    res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5 نجوم" });
    return;
  }

  const [existing] = await db
    .select({ id: ratingsTable.id })
    .from(ratingsTable)
    .where(
      sql`${ratingsTable.orderId} = ${orderId} AND ${ratingsTable.raterUserId} = ${raterUserId}`
    );

  if (existing) {
    res.status(409).json({ error: "لقد قمت بالتقييم بالفعل لهذا الطلب" });
    return;
  }

  const { comment } = req.body as { comment?: string };

  const [rating] = await db
    .insert(ratingsTable)
    .values({ orderId, raterUserId, ratedUserId, raterType, stars, comment: comment?.trim() || null })
    .returning();

  req.log.info({ orderId, raterType, stars }, "Rating submitted");
  res.status(201).json({ id: rating.id, stars: rating.stars });
});

router.post("/ratings/:ratingId/dispute", async (req, res): Promise<void> => {
  const { ratingId } = req.params;
  const { disputeReason } = req.body as { disputeReason?: string };

  if (!disputeReason?.trim()) {
    res.status(400).json({ error: "يرجى كتابة سبب الاعتراض" });
    return;
  }

  const [existing] = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.id, ratingId));

  if (!existing) {
    res.status(404).json({ error: "التقييم غير موجود" });
    return;
  }
  if (existing.disputeCount >= 1) {
    res.status(409).json({ error: "لقد قدّمت اعتراضاً من قبل على هذا التقييم" });
    return;
  }

  await db
    .update(ratingsTable)
    .set({ isDisputed: true, disputeReason, disputeCount: 1 })
    .where(eq(ratingsTable.id, ratingId));

  req.log.info({ ratingId }, "Rating disputed");
  res.json({ success: true });
});

router.get("/driver/:driverId/rating", async (req, res): Promise<void> => {
  const { driverId } = req.params;

  const result = await db
    .select({ avgStars: avg(ratingsTable.stars), total: sql<number>`count(*)::int` })
    .from(ratingsTable)
    .where(
      sql`${ratingsTable.ratedUserId} = ${driverId} AND ${ratingsTable.raterType} = 'consumer'`
    );

  const avgStars = result[0]?.avgStars ? parseFloat(result[0].avgStars) : null;
  const total = result[0]?.total ?? 0;

  res.json({ avgStars, total });
});

router.get("/orders/:orderId/rating", async (req, res): Promise<void> => {
  const { orderId } = req.params;
  const { raterUserId } = req.query as { raterUserId?: string };

  const rows = await db
    .select()
    .from(ratingsTable)
    .where(
      raterUserId
        ? sql`${ratingsTable.orderId} = ${orderId} AND ${ratingsTable.raterUserId} = ${raterUserId}`
        : sql`${ratingsTable.orderId} = ${orderId}`
    );

  res.json(
    rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      raterUserId: r.raterUserId,
      ratedUserId: r.ratedUserId,
      raterType: r.raterType,
      stars: r.stars,
      isDisputed: r.isDisputed,
      disputeCount: r.disputeCount,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

export default router;
