/**
 * Socket.io real-time server.
 *
 * Security model:
 *  - Every connection is authenticated at handshake time via io.use() middleware.
 *    The client passes { auth: { sessionToken } } in the Socket.io handshake
 *    where sessionToken is the Supabase JWT access token.
 *  - The token is verified cryptographically via supabase.auth.getUser(token),
 *    which validates JWT signature, issuer, audience, and expiry server-side.
 *    No local base64 decoding is used — forged tokens are rejected.
 *  - After authentication, socket.data.userId and socket.data.userType are set
 *    from the verified Supabase user object, NOT from any client-supplied payload.
 *
 * Room layout:
 *  - "user:<userId>"  — targeted consumer/driver events (order status changes).
 *  - "drivers"        — broadcast room for new-order events to all active drivers.
 */

import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { getSupabaseAuth } from "./supabase-server";
import { logger } from "./logger";

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  // ── Handshake authentication middleware ───────────────────────────────────
  // Runs before any event handler. Rejects unauthenticated connections.
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.sessionToken as string | undefined;

    if (!token) {
      logger.warn({ socketId: socket.id }, "Socket rejected: no sessionToken in handshake");
      return next(new Error("UNAUTHORIZED"));
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      logger.error("Socket auth: Supabase client unavailable — rejecting all connections");
      return next(new Error("SERVICE_UNAVAILABLE"));
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn({ socketId: socket.id, err: error?.message }, "Socket rejected: invalid or expired JWT");
      return next(new Error("UNAUTHORIZED"));
    }

    const userType =
      (user.app_metadata as Record<string, unknown>)?.userType as string ??
      (user.user_metadata as Record<string, unknown>)?.userType as string ??
      "";

    socket.data.userId   = user.id;
    socket.data.userType = userType;

    next();
  });

  io.on("connection", (socket: Socket) => {
    const { userId, userType } = socket.data as { userId: string; userType: string };
    logger.info({ socketId: socket.id, userId }, "Socket authenticated and connected");

    socket.on("register", () => {
      socket.join(`user:${userId}`);
      logger.info({ socketId: socket.id, userId }, "Socket: joined user room");
    });

    socket.on("register_driver", () => {
      socket.join("drivers");
      logger.info({ socketId: socket.id, userId, userType }, "Socket: joined drivers room");
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, "Socket disconnected");
    });
  });

  logger.info("Socket.io server initialised (with Supabase JWT authentication)");
  return io;
}

/** Broadcast a new-order event to all connected drivers. */
export function emitToDrivers(event: string, data: unknown): void {
  if (!io) return;
  io.to("drivers").emit(event, data);
}

/** Send an event to a specific consumer/driver by their persistent userId. */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

export function getIO(): SocketIOServer | null {
  return io;
}
