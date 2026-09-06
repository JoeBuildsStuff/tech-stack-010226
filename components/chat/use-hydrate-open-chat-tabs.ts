"use client";

import { useEffect, useMemo, useRef } from "react";
import { getChatSessionSummariesByIds } from "@/actions/chat";
import { useChatStore } from "@/lib/chat/chat-store";

export function useHydrateOpenChatTabs() {
  const {
    sessions,
    openSessionIds,
    closeSessionTab,
    upsertSessionFromServer,
    accountId,
    accountEpoch,
    isAccountReady,
  } = useChatStore();

  const missingOpenSessionIds = useMemo(() => {
    const hydratedSessionIds = new Set(sessions.map((session) => session.id));
    return openSessionIds.filter((id) => !hydratedSessionIds.has(id));
  }, [openSessionIds, sessions]);

  const requestedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAccountReady || !accountId || missingOpenSessionIds.length === 0)
      return;

    const requestedKeys = requestedKeysRef.current;
    const requestKey = `${accountId}:${accountEpoch}:${missingOpenSessionIds.join("\0")}`;
    if (requestedKeys.has(requestKey)) return;
    requestedKeys.add(requestKey);

    let cancelled = false;

    async function hydrateOpenTabs() {
      const res = await getChatSessionSummariesByIds(
        missingOpenSessionIds,
        accountId
      );
      const current = useChatStore.getState();
      if (
        cancelled ||
        current.accountId !== accountId ||
        current.accountEpoch !== accountEpoch ||
        !current.isAccountReady
      ) {
        return;
      }

      if ("error" in res && res.error) {
        requestedKeys.delete(requestKey);
        return;
      }

      const foundSessionIds = new Set((res.data || []).map((row) => row.id));

      for (const row of res.data || []) {
        upsertSessionFromServer({
          id: row.id,
          title: row.title,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        });
      }

      for (const sessionId of missingOpenSessionIds) {
        if (!foundSessionIds.has(sessionId)) {
          closeSessionTab(sessionId);
        }
      }
    }

    void hydrateOpenTabs();

    return () => {
      cancelled = true;
      requestedKeys.delete(requestKey);
    };
  }, [
    closeSessionTab,
    accountId,
    accountEpoch,
    isAccountReady,
    missingOpenSessionIds,
    upsertSessionFromServer,
  ]);
}
