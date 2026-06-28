/**
 * Route registry.
 *
 * Order matters for middleware scoping:
 *  1. Public routers (health probes, all /auth/* endpoints) are registered
 *     FIRST so they are never touched by requireAuth.
 *  2. requireAuth middleware is inserted next.  Every router registered after
 *     this point requires a valid session token + matching X-User-Id header.
 *  3. Protected routers follow.
 *
 * This means adding a new protected router is a single router.use() call
 * after step 3 — no per-route decoration needed.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/require-auth";

import healthRouter                                          from "./health";
import authRouter                                            from "./auth";
import { pushPublicRouter, pushProtectedRouter }             from "./push";
import adminRouter                                           from "./admin";
import driverRouter                                          from "./driver";
import ordersRouter                                          from "./orders";
import ratingsRouter                                         from "./ratings";
import announcementsRouter                                   from "./announcements";
import locationsRouter                                       from "./locations";
import { supportPublicRouter, supportProtectedRouter }       from "./support";

const router: IRouter = Router();

// ── 1. Public (no session required) ──────────────────────────────────────────
router.use(healthRouter);         // GET /  GET /healthz
router.use(authRouter);           // POST /auth/login  /auth/register-request  etc.
router.use(pushPublicRouter);     // GET /push/vapid-public-key (public key is not a secret)
router.use(adminRouter);          // POST /admin/drivers/:id/approve  etc. (X-Admin-Key auth)
router.use(supportPublicRouter);  // POST /support/message (public anon) + /support/contact

// ── 2. Session validation gate ────────────────────────────────────────────────
// All routes registered after this line require a valid Supabase JWT in the
// Authorization: Bearer header. The JWT is verified cryptographically by
// requireAuth via supabase.auth.getUser(token).
router.use(requireAuth);

// ── 3. Protected routes ───────────────────────────────────────────────────────
router.use(pushProtectedRouter);  // POST /push/subscribe (auth userId enforced)
router.use(driverRouter);
router.use(ordersRouter);
router.use(ratingsRouter);
router.use(announcementsRouter);
router.use(locationsRouter);
router.use(supportProtectedRouter); // GET /support/thread  POST /support/thread/send

export default router;
