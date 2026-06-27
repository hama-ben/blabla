/**
 * useAdminReplyToast
 *
 * Listens for incoming admin support replies on two parallel channels:
 *   1. Socket.io "support_reply" — arrives ~100 ms after the admin sends
 *   2. Supabase Realtime postgres_changes — arrives ~200–300 ms later
 *
 * Deduplication: each message id is tracked in a ref so whichever channel
 * fires first wins and the second is silently ignored.
 *
 * Suppression: if the support chat modal is already open the user is already
 * reading the message live — no toast is shown in that case.
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSupportChatStore } from "@/stores/support-chat";
import { getSocket } from "@/lib/socket-client";
import type { SupportMessage } from "@/hooks/use-support-unread";

export interface AdminReplyToast {
  message: SupportMessage;
  key: string;
}

export function useAdminReplyToast(userId: string | null) {
  const [toast, setToast] = useState<AdminReplyToast | null>(null);

  // Keep a ref so event callbacks always see the latest value without
  // needing to be recreated (avoids effect cleanup/re-subscribe churn).
  const isOpenRef  = useRef(false);
  const shownIds   = useRef<Set<string>>(new Set());
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = useSupportChatStore((s) => s.isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Clear the toast when the user opens the support chat
  useEffect(() => {
    if (isOpen) {
      setToast(null);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [isOpen]);

  const tryShow = (msg: SupportMessage) => {
    if (!msg?.id) return;
    if (isOpenRef.current) return;         // chat is open — user sees it live
    if (shownIds.current.has(msg.id)) return; // already shown via other channel
    shownIds.current.add(msg.id);

    // Cancel any previous auto-dismiss timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setToast({ message: msg, key: msg.id });

    // Auto-dismiss after 7 s
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 7000);
  };

  const dismiss = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setToast(null);
  };

  // ── Channel 1: Socket.io fast-path ─────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    const handler = (data: { message?: SupportMessage }) => {
      if (data?.message) tryShow(data.message);
    };
    socket.on("support_reply", handler);
    return () => { socket.off("support_reply", handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Channel 2: Supabase Realtime fallback ──────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`support-toast-${userId}`)
      .on(
        "postgres_changes" as Parameters<ReturnType<typeof supabase.channel>["on"]>[0],
        {
          event:  "INSERT",
          schema: "public",
          table:  "support_messages",
          filter: `user_id=eq.${userId}`,
        } as any,
        (payload: any) => {
          const msg = payload.new as SupportMessage;
          if (msg?.senderType === "admin") tryShow(msg);
        }
      )
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, dismiss };
}
