/**
 * SupportReplyToast
 *
 * Prominent in-app banner shown when an admin sends a support reply while
 * the user is on any page other than the support chat.
 *
 * - Appears at the bottom of the viewport, above the bottom safe area
 * - Shows support icon + title + message preview (≤ 50 chars)
 * - Tapping anywhere on the toast opens the support chat
 * - X button dismisses without opening
 * - Auto-dismissed by the parent hook after 7 s
 */

import { useEffect, useState } from "react";
import { HeadphonesIcon, X } from "lucide-react";
import { useSupportChatStore } from "@/stores/support-chat";
import type { AdminReplyToast } from "@/hooks/use-admin-reply-toast";

interface Props {
  toast: AdminReplyToast;
  onDismiss: () => void;
}

const MAX_PREVIEW = 50;

function truncate(text: string): string {
  return text.length > MAX_PREVIEW ? text.slice(0, MAX_PREVIEW) + "…" : text;
}

export function SupportReplyToast({ toast, onDismiss }: Props) {
  const openSupport = useSupportChatStore((s) => s.open);
  const [visible, setVisible] = useState(false);

  // Trigger entrance animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleTap = () => {
    openSupport();
    onDismiss();
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss();
  };

  return (
    <div
      dir="rtl"
      className={`
        fixed bottom-6 left-4 right-4 z-[500] mx-auto max-w-sm
        transition-all duration-300 ease-out
        ${visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}
      `}
    >
      <div
        onClick={handleTap}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTap(); }}
        className="
          flex items-start gap-3 w-full cursor-pointer
          bg-white dark:bg-slate-900
          border border-primary/20 dark:border-primary/30
          rounded-2xl shadow-2xl shadow-primary/10
          px-4 py-3
          select-none
          active:scale-[0.98] transition-transform
        "
      >
        {/* Icon */}
        <div className="shrink-0 w-10 h-10 bg-gradient-to-br from-primary to-cyan-500 rounded-xl flex items-center justify-center mt-0.5">
          <HeadphonesIcon className="w-5 h-5 text-white" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-primary leading-none mb-1">
            رسالة جديدة من الدعم الفني
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
            {truncate(toast.message.message)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            اضغط لفتح المحادثة
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="إغلاق"
          className="
            shrink-0 w-7 h-7 rounded-xl
            bg-slate-100 dark:bg-slate-800
            flex items-center justify-center
            text-slate-400 hover:text-slate-600 dark:hover:text-slate-200
            hover:bg-slate-200 dark:hover:bg-slate-700
            transition-colors mt-0.5
          "
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar — drains over 7 s to signal auto-dismiss */}
      <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-1">
        <div
          className="h-full bg-primary rounded-full"
          style={{
            animation: "drain 7s linear forwards",
          }}
        />
      </div>

      <style>{`
        @keyframes drain {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
