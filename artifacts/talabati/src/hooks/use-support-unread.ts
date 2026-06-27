/**
 * Tracks whether the logged-in user has an unread admin reply.
 *
 * Strategy: store the last-viewed timestamp in localStorage per user.
 * If the latest message in the thread is from sender_type='admin' and
 * its created_at is after the stored timestamp → unread.
 */

import { useState, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

interface SupportMessage {
  id: string;
  userId: string | null;
  message: string;
  senderType: string;
  adminId: string | null;
  status: string;
  createdAt: string;
}

function viewedKey(userId: string) {
  return `mizu_support_viewed_${userId}`;
}

function getLastViewed(userId: string): Date | null {
  try {
    const raw = localStorage.getItem(viewedKey(userId));
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

function setLastViewed(userId: string) {
  try {
    localStorage.setItem(viewedKey(userId), new Date().toISOString());
  } catch { /* ignore */ }
}

export function useSupportUnread(userId: string | null) {
  const [hasUnread, setHasUnread] = useState(false);

  const checkUnread = useCallback(async () => {
    if (!userId) { setHasUnread(false); return; }
    try {
      const data = await customFetch<{ messages: SupportMessage[] }>("/api/support/thread");
      const msgs: SupportMessage[] = data?.messages ?? [];
      if (msgs.length === 0) { setHasUnread(false); return; }

      const latest = msgs[msgs.length - 1];
      if (latest.senderType !== "admin") { setHasUnread(false); return; }

      const lastViewed = getLastViewed(userId);
      if (!lastViewed) { setHasUnread(true); return; }

      const latestDate = new Date(latest.createdAt);
      setHasUnread(latestDate > lastViewed);
    } catch {
      setHasUnread(false);
    }
  }, [userId]);

  useEffect(() => {
    checkUnread();
  }, [checkUnread]);

  // Realtime: re-check whenever a message for this user arrives
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`support-unread-${userId}`)
      .on(
        "postgres_changes" as Parameters<ReturnType<typeof supabase.channel>["on"]>[0],
        {
          event:  "INSERT",
          schema: "public",
          table:  "support_messages",
          filter: `user_id=eq.${userId}`,
        } as any,
        () => { checkUnread(); }
      )
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
  }, [userId, checkUnread]);

  const markViewed = useCallback(() => {
    if (!userId) return;
    setLastViewed(userId);
    setHasUnread(false);
  }, [userId]);

  return { hasUnread, markViewed, refetch: checkUnread };
}

export { getLastViewed, setLastViewed };
export type { SupportMessage };
