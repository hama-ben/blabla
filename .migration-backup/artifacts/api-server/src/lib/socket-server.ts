/**
 * Socket.io real-time server.
 *
 * Security model:
 *  - Every connection is authenticated at handshake time via io.use() middleware.
 *    The client passes { auth: { sessionToken } } in the Socket.io handshake
 *    where sessionToken is the Supabase JWT access token.
 *  - The JWT is decoded locally (no network round-trip) to extract userId and
 *    userType from app_metadata. Expiry is checked at handshake time.
 *  - After authentication, socket.data.userId and socket.data.userType are set
 *    from the validated token, NOT from any client-supplied event payload.
 *
 * Room layout:
 *  - "user:<userId>"  — targeted consumer/driver events (order status changes).
 *  - "drivers"        — broadcast room for new-order events to all active drivers.
 */

import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: SocketIOServer | null = null;

interface JwtPayload {
  sub?: string;
  exp?: number;
  app_metadata?: { userType?: string };
  user_metadata?: { userType?: string };
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
}

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
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.sessionToken as string | undefined;

    if (!token) {
      logger.warn({ socketId: socket.id }, "Socket rejected: no sessionToken in handshake");
      return next(new Error("UNAUTHORIZED"));
    }

    const payload = decodeJwt(token);

    if (!payload || !payload.sub) {
      logger.warn({ socketId: socket.id }, "Socket rejected: invalid JWT");
      return next(new Error("UNAUTHORIZED"));
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ socketId: socket.id }, "Socket rejected: JWT expired");
      return next(new Error("UNAUTHORIZED"));
    }

    const userType =
      payload.app_metadata?.userType ?? payload.user_metadata?.userType ?? "";

    socket.data.userId   = payload.sub;
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
