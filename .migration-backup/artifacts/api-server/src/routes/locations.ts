import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savedLocationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/locations/:userId", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const locations = await db
    .select()
    .from(savedLocationsTable)
    .where(eq(savedLocationsTable.userId, userId));

  res.json(
    locations.map(l => ({
      id: l.id,
      userId: l.userId,
      label: l.label,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

router.post("/locations/:userId", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { label, latitude, longitude } = req.body as {
    label?: string; latitude?: number; longitude?: number;
  };

  if (!label?.trim() || latitude == null || longitude == null) {
    res.status(400).json({ error: "الاسم والإحداثيات مطلوبة" });
    return;
  }

  const [location] = await db
    .insert(savedLocationsTable)
    .values({
      userId,
      label: label.trim(),
      latitude: String(latitude),
      longitude: String(longitude),
    })
    .returning();

  res.status(201).json({
    id: location.id,
    userId: location.userId,
    label: location.label,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    createdAt: location.createdAt.toISOString(),
  });
});

router.delete("/locations/:locationId", async (req, res): Promise<void> => {
  const { locationId } = req.params;
  await db.delete(savedLocationsTable).where(eq(savedLocationsTable.id, locationId));
  res.json({ success: true });
});

export default router;
