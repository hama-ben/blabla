/**
 * Admin API — secured with X-Admin-Key header matching ADMIN_API_KEY env var.
 *
 * These endpoints are called by the admin panel (separate project) to:
 *  - List and approve/reject driver applications
 *  - List and approve/reject subscription payment receipts
 *
 * On approval/rejection, a targeted announcement is inserted into the
 * Supabase announcements table using target_audience = driverId
 * (the convention for single-user targeting when target_user_id column
 * is not yet available).
 */

import { Router, type Request, type Response, type NextFunction, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  driverDetailsTable,
  subscriptionPaymentsTable,
} from "@workspace/db";
import { getSupabaseAdmin } from "../lib/supabase-server";

const router: IRouter = Router();

// ── Admin auth middleware ─────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (!adminKey) {
    res.status(503).json({ error: "Admin API not configured (ADMIN_API_KEY missing)" });
    return;
  }
  const provided = req.headers["x-admin-key"];
  if (provided !== adminKey) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/admin", requireAdmin);

// ── Helper: insert targeted announcement to Supabase ─────────────────────────

async function insertTargetedAnnouncement(
  targetUserId: string,
  title: string,
  content: string
): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  await supa.from("announcements").insert({
    title,
    content,
    // Convention: target_audience = userId means "only this user sees it"
    target_audience: targetUserId,
    is_active: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// DRIVER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// GET /admin/drivers?status=pending|approved|rejected|all
router.get("/admin/drivers", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;

  const rows = await db
    .select({
      id:                   usersTable.id,
      name:                 usersTable.name,
      phone:                usersTable.phone,
      email:                usersTable.email,
      wilaya:               usersTable.wilaya,
      commune:              usersTable.commune,
      accountStatus:        usersTable.accountStatus,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      truckFrontPhotoUrl:   driverDetailsTable.truckFrontPhotoUrl,
      driverLicenseUrl:     driverDetailsTable.driverLicenseUrl,
      truckSidePhotoUrl:    driverDetailsTable.truckSidePhotoUrl,
      truckVideoUrl:        driverDetailsTable.truckVideoUrl,
      isLegacyDriver:       driverDetailsTable.isLegacyDriver,
    })
    .from(usersTable)
    .leftJoin(driverDetailsTable, eq(usersTable.id, driverDetailsTable.driverId))
    .where(
      status && status !== "all"
        ? sql`${usersTable.userType} = 'سائق' AND ${usersTable.accountStatus} = ${status}`
        : sql`${usersTable.userType} = 'سائق'`
    )
    .orderBy(desc(usersTable.id));

  res.json(rows.map(r => ({
    ...r,
    subscriptionExpiresAt: r.subscriptionExpiresAt?.toISOString() ?? null,
  })));
});

// POST /admin/drivers/:driverId/approve
router.post("/admin/drivers/:driverId/approve", async (req, res): Promise<void> => {
  const { driverId } = req.params;

  const [user] = await db
    .select({
      id:                   usersTable.id,
      accountStatus:        usersTable.accountStatus,
      firstApprovalGranted: usersTable.firstApprovalGranted,
    })
    .from(usersTable)
    .where(eq(usersTable.id, driverId));

  if (!user) {
    res.status(404).json({ error: "السائق غير موجود" });
    return;
  }

  const isFirstApproval = !user.firstApprovalGranted;
  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const giftExpiry = new Date(now.getTime() + thirtyDaysMs);

  await db
    .update(usersTable)
    .set({
      accountStatus: "approved",
      // First-time approval: overwrite subscription with a fresh 30-day gift
      ...(isFirstApproval
        ? { subscriptionExpiresAt: giftExpiry, firstApprovalGranted: true }
        : {}
      ),
    })
    .where(eq(usersTable.id, driverId));

  if (isFirstApproval) {
    await insertTargetedAnnouncement(
      driverId,
      "🎉 تم قبولك بيننا",
      "تهانينا! حصلت على هدية 30 يوماً مجاناً كمستخدم جديد. مرحباً بك في عائلة ميزو!"
    );
    req.log.info({ driverId, giftExpiry }, "Driver approved (first time) — 30-day gift granted");
  } else {
    await insertTargetedAnnouncement(
      driverId,
      "تم قبولك بيننا",
      "مرحباً بك مجدداً"
    );
    req.log.info({ driverId }, "Driver re-approved — no additional gift");
  }

  res.json({
    ok: true,
    driverId,
    accountStatus: "approved",
    giftGranted: isFirstApproval,
    ...(isFirstApproval ? { subscriptionExpiresAt: giftExpiry.toISOString() } : {}),
  });
});

// POST /admin/drivers/:driverId/reject
router.post("/admin/drivers/:driverId/reject", async (req, res): Promise<void> => {
  const { driverId } = req.params;
  const { reason } = req.body as { reason?: string };

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, driverId));

  if (!user) {
    res.status(404).json({ error: "السائق غير موجود" });
    return;
  }

  await db
    .update(usersTable)
    .set({ accountStatus: "rejected" })
    .where(eq(usersTable.id, driverId));

  // Targeted rejection notification
  await insertTargetedAnnouncement(
    driverId,
    "تم رفض طلبك",
    reason ?? "الرجاء التواصل مع الإدارة عبر الصفحات الرسمية."
  );

  req.log.info({ driverId }, "Driver rejected");
  res.json({ ok: true, driverId, accountStatus: "rejected" });
});

// ═══════════════════════════════════════════════════════════════════════
// SUBSCRIPTION PAYMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// GET /admin/payments?status=pending|approved|rejected|all
router.get("/admin/payments", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;

  const rows = await db
    .select({
      id:           subscriptionPaymentsTable.id,
      driverId:     subscriptionPaymentsTable.driverId,
      receiptImage: subscriptionPaymentsTable.receiptImage,
      status:       subscriptionPaymentsTable.status,
      adminNotes:   subscriptionPaymentsTable.adminNotes,
      createdAt:    subscriptionPaymentsTable.createdAt,
      reviewedAt:   subscriptionPaymentsTable.reviewedAt,
      driverName:   usersTable.name,
      driverPhone:  usersTable.phone,
      driverWilaya: usersTable.wilaya,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    })
    .from(subscriptionPaymentsTable)
    .leftJoin(usersTable, eq(subscriptionPaymentsTable.driverId, usersTable.id))
    .where(
      status && status !== "all"
        ? sql`${subscriptionPaymentsTable.status} = ${status}`
        : sql`1 = 1`
    )
    .orderBy(desc(subscriptionPaymentsTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    createdAt:            r.createdAt?.toISOString()  ?? null,
    reviewedAt:           r.reviewedAt?.toISOString() ?? null,
    subscriptionExpiresAt: r.subscriptionExpiresAt?.toISOString() ?? null,
  })));
});

// POST /admin/payments/:paymentId/approve
router.post("/admin/payments/:paymentId/approve", async (req, res): Promise<void> => {
  const { paymentId } = req.params;

  const [payment] = await db
    .select({
      id:       subscriptionPaymentsTable.id,
      driverId: subscriptionPaymentsTable.driverId,
      status:   subscriptionPaymentsTable.status,
    })
    .from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.id, paymentId));

  if (!payment) {
    res.status(404).json({ error: "الدفع غير موجود" });
    return;
  }

  // Get the driver's current subscription expiry
  const [driver] = await db
    .select({ subscriptionExpiresAt: usersTable.subscriptionExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.id, payment.driverId));

  // Extend from the later of: current expiry or now
  const now         = new Date();
  const baseDate    = driver?.subscriptionExpiresAt && driver.subscriptionExpiresAt > now
    ? driver.subscriptionExpiresAt
    : now;
  const newExpiry   = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Mark payment as approved
  await db
    .update(subscriptionPaymentsTable)
    .set({ status: "approved", reviewedAt: now })
    .where(eq(subscriptionPaymentsTable.id, paymentId));

  // Extend subscription
  await db
    .update(usersTable)
    .set({ subscriptionExpiresAt: newExpiry })
    .where(eq(usersTable.id, payment.driverId));

  // Targeted announcement
  await insertTargetedAnnouncement(
    payment.driverId,
    "تم قبول دفعتك ✅",
    `تم إضافة 30 يوم إلى حسابك. ينتهي اشتراكك في: ${newExpiry.toLocaleDateString("ar-DZ")}.`
  );

  req.log.info({ paymentId, driverId: payment.driverId, newExpiry }, "Payment approved");
  res.json({
    ok: true,
    paymentId,
    driverId: payment.driverId,
    newSubscriptionExpiresAt: newExpiry.toISOString(),
  });
});

// POST /admin/payments/:paymentId/reject
router.post("/admin/payments/:paymentId/reject", async (req, res): Promise<void> => {
  const { paymentId } = req.params;
  const { reason } = req.body as { reason?: string };

  const [payment] = await db
    .select({
      id:       subscriptionPaymentsTable.id,
      driverId: subscriptionPaymentsTable.driverId,
    })
    .from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.id, paymentId));

  if (!payment) {
    res.status(404).json({ error: "الدفع غير موجود" });
    return;
  }

  await db
    .update(subscriptionPaymentsTable)
    .set({ status: "rejected", reviewedAt: new Date(), adminNotes: reason ?? null })
    .where(eq(subscriptionPaymentsTable.id, paymentId));

  await insertTargetedAnnouncement(
    payment.driverId,
    "تواصل مع الإدارة",
    `${reason ?? "لم يتم قبول وصل الدفع."} للتواصل مع الإدارة: https://www.facebook.com/profile.php?id=61590856328769`
  );

  req.log.info({ paymentId, driverId: payment.driverId }, "Payment rejected");
  res.json({ ok: true, paymentId, driverId: payment.driverId, status: "rejected" });
});

export default router;
