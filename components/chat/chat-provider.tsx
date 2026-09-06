"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useChatStore } from "@/lib/chat/chat-store";
import { createClient } from "@/lib/supabase/client";

/** Bind the cache to verified auth. Conversation data never lives in context. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    let authVersion = 0;
    const state = useChatStore.getState();
    if (!state.isAccountReady) state.setAccountPending();

    const verify = async (version: number) => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (mounted && version === authVersion) {
          useChatStore
            .getState()
            .setAccount(error ? null : (data.user?.id ?? null));
        }
      } catch {
        if (mounted && version === authVersion)
          useChatStore.getState().setAccount(null);
      }
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const version = ++authVersion;
      const current = useChatStore.getState();
      if (
        event === "SIGNED_OUT" ||
        (session?.user?.id ?? null) !== current.accountId
      ) {
        current.setAccountPending();
      }
      // Leave the auth callback before calling another auth method; the SDK
      // processes callbacks under its auth lock.
      setTimeout(() => {
        if (mounted) void verify(version);
      }, 0);
    });
    void verify(++authVersion);
    const onFocus = () => {
      void verify(++authVersion);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [supabase, pathname]); // Recheck server-action sign-outs after navigation too.

  return children;
}
