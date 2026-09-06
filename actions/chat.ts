"use server";

import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Json } from "@/types/supabase";
import {
  beginChatTurn as beginDurableChatTurn,
  clearChatConversation as clearDurableChatConversation,
  completeChatTurn as completeDurableChatTurn,
  failChatTurn as failDurableChatTurn,
  getChatConversation as getDurableChatConversation,
  selectChatBranch as selectDurableChatBranch,
} from "@/lib/chat/server/conversation-service";
import type {
  BeginChatTurnInput,
  CompleteChatTurnInput,
  FailChatTurnInput,
} from "@/lib/chat/conversation-types";

/** Storage buckets for chat attachments. Create in Supabase Dashboard → Storage if missing. */
const CHAT_IMAGES_BUCKET = "chat-images";
const CHAT_FILES_BUCKET = "chat-files";

// Types kept minimal to avoid coupling with client store shapes
export type ChatRole = "user" | "assistant" | "system";

export interface CreateSessionParams {
  title?: string;
  context?: Json | null;
  accountId?: string | null;
}

export async function createChatSession(params: CreateSessionParams = {}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };
  if (params.accountId && params.accountId !== userData.user.id) {
    return { error: "Account changed while the chat request was in flight" };
  }

  const payload = {
    user_id: userData.user.id,
    title: params.title || "New Chat",
    context: params.context ?? null,
  };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .insert(payload)
    .select("id, title, created_at, updated_at, context")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { data };
}

export async function updateChatSessionTitle(
  sessionId: string,
  title: string,
  accountId?: string | null
) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };
  if (accountId && accountId !== userData.user.id) {
    return { error: "Account changed while the chat request was in flight" };
  }

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId)
    .eq("user_id", userData.user.id)
    .select("id, title, updated_at")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { data };
}

export async function deleteChatSession(
  sessionId: string,
  accountId?: string | null
) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };
  if (accountId && accountId !== userData.user.id) {
    return { error: "Account changed while the chat request was in flight" };
  }

  // 1) Fetch all attachment storage paths for this session
  const { data: attachments, error: fetchError } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_attachments")
    .select("storage_path, mime_type, chat_messages!inner(session_id)")
    .eq("chat_messages.session_id", sessionId);

  if (fetchError) return { error: fetchError.message };

  // 2) Group paths by bucket (images vs files)
  const imagePaths: string[] = [];
  const filePaths: string[] = [];
  type AttachmentRow = { storage_path: string; mime_type: string };
  for (const a of (attachments as AttachmentRow[] | null) || []) {
    if (a.mime_type?.startsWith("image/")) imagePaths.push(a.storage_path);
    else filePaths.push(a.storage_path);
  }

  // 3) Attempt to remove from storage first (best-effort)
  if (imagePaths.length) {
    const { error } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .remove(imagePaths);
    if (error)
      console.error("Failed to remove image attachments from storage:", error);
  }
  if (filePaths.length) {
    const { error } = await supabase.storage
      .from(CHAT_FILES_BUCKET)
      .remove(filePaths);
    if (error)
      console.error("Failed to remove file attachments from storage:", error);
  }

  // 4) Delete the session (cascades to messages/attachments rows)
  const { error: deleteError } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userData.user.id);

  if (deleteError) return { error: deleteError.message };
  revalidatePath("/dashboard");
  return { data: { success: true } };
}

export async function listChatSessions(accountId?: string | null) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };
  if (accountId && accountId !== userData.user.id)
    return { error: "Chat account changed" };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      chat_messages!chat_messages_session_id_fkey(count)
    `
    )
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false });

  if (error) return { error: error.message };
  // Map messageCount for convenience
  type SessionRow = {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    chat_messages?: Array<{ count: number }>;
  };
  const mapped = (data || []).map((row: SessionRow) => ({
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count:
      Array.isArray(row.chat_messages) && row.chat_messages[0]?.count != null
        ? row.chat_messages[0].count
        : 0,
  }));
  return { data: mapped };
}

export async function getChatSessionSummariesByIds(
  sessionIds: string[],
  accountId?: string | null
) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };
  if (accountId && accountId !== userData.user.id)
    return { error: "Chat account changed" };

  const ids = Array.from(new Set(sessionIds.filter(Boolean))).slice(0, 20);
  if (ids.length === 0) return { data: [] };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userData.user.id)
    .in("id", ids);

  if (error) return { error: error.message };
  return { data: data || [] };
}

/** Begin a durable turn and return the server-selected history for the provider. */
export async function beginChatTurn(input: BeginChatTurnInput) {
  return beginDurableChatTurn(input);
}

/** Atomically mark the pending assistant row complete, then return its DTO. */
export async function completeChatTurn(input: CompleteChatTurnInput) {
  return completeDurableChatTurn(input);
}

/** Persist a failed/cancelled turn so reloads never resurrect a fake response. */
export async function failChatTurn(input: FailChatTurnInput) {
  return failDurableChatTurn(input);
}

export async function getChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  return getDurableChatConversation(sessionId, accountId);
}

export async function selectChatBranch(
  sessionId: string,
  leafMessageId: string,
  accountId?: string | null
) {
  return selectDurableChatBranch(sessionId, leafMessageId, accountId);
}

export async function clearChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  return clearDurableChatConversation(sessionId, accountId);
}
