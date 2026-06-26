"use server";

import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Json } from "@/types/supabase";

/** Storage buckets for chat attachments. Create in Supabase Dashboard → Storage if missing. */
const CHAT_IMAGES_BUCKET = "chat-images";
const CHAT_FILES_BUCKET = "chat-files";

// Types kept minimal to avoid coupling with client store shapes
export type ChatRole = "user" | "assistant" | "system";

export interface CreateSessionParams {
  title?: string;
  context?: Json | null;
}

export async function createChatSession(params: CreateSessionParams = {}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

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

  revalidatePath("/workspace");
  return { data };
}

export async function updateChatSessionTitle(sessionId: string, title: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId)
    .eq("user_id", userData.user.id)
    .select("id, title, updated_at")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/workspace");
  return { data };
}

export async function deleteChatSession(sessionId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

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
  revalidatePath("/workspace");
  return { data: { success: true } };
}

export async function listChatSessions() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      chat_messages(count)
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

export async function getChatSessionSummariesByIds(sessionIds: string[]) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

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

export interface AddMessageParams {
  sessionId: string;
  role: ChatRole;
  content: string;
  parentId?: string | null;
  reasoning?: string | null;
  context?: Json | null;
  functionResult?: Json | null;
  citations?: Json | null;
  rootUserMessageId?: string | null;
  variantGroupId?: string | null;
  variantIndex?: number | null;
}

export async function addChatMessage(params: AddMessageParams) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const insertData = {
    session_id: params.sessionId,
    parent_id: params.parentId ?? null,
    role: params.role,
    content: params.content,
    reasoning: params.reasoning ?? null,
    context: params.context ?? null,
    function_result: params.functionResult ?? null,
    citations: params.citations ?? null,
    root_user_message_id: params.rootUserMessageId ?? null,
    variant_group_id: params.variantGroupId ?? null,
    variant_index: params.variantIndex ?? 0,
  };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_messages")
    .insert(insertData)
    .select("id, created_at")
    .single();

  if (error) return { error: error.message };
  return { data };
}

export interface AttachmentInput {
  name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  width?: number | null;
  height?: number | null;
}

export async function addChatAttachments(
  messageId: string,
  attachments: AttachmentInput[]
) {
  if (!attachments || attachments.length === 0) return { data: [] };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const rows = attachments.map((a) => ({
    message_id: messageId,
    name: a.name,
    mime_type: a.mime_type,
    size: a.size,
    storage_path: a.storage_path,
    width: a.width ?? null,
    height: a.height ?? null,
  }));

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_attachments")
    .insert(rows)
    .select("id, name, storage_path");

  if (error) return { error: error.message };
  return { data };
}

export interface ToolCallInput {
  name: string;
  arguments: Json;
  result?: Json | null;
  reasoning?: string | null;
}

export async function addChatToolCalls(
  messageId: string,
  calls: ToolCallInput[]
) {
  if (!calls || calls.length === 0) return { data: [] };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const rows = calls.map((c) => ({
    message_id: messageId,
    name: c.name,
    arguments: c.arguments,
    result: c.result ?? null,
    reasoning: c.reasoning ?? null,
  }));

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_tool_calls")
    .insert(rows)
    .select("id, name");

  if (error) return { error: error.message };
  return { data };
}

export interface SuggestedActionInput {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Json;
}

export async function addChatSuggestedActions(
  messageId: string,
  actions: SuggestedActionInput[]
) {
  if (!actions || actions.length === 0) return { data: [] };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const rows = actions.map((a) => ({
    message_id: messageId,
    type: a.type,
    label: a.label,
    payload: a.payload,
  }));

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_suggested_actions")
    .insert(rows)
    .select("id, type, label");

  if (error) return { error: error.message };
  return { data };
}

export async function getChatMessages(sessionId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_messages")
    .select(
      `
      id,
      session_id,
      parent_id,
      role,
      content,
      reasoning,
      context,
      function_result,
      citations,
      root_user_message_id,
      variant_group_id,
      variant_index,
      created_at,
      seq,
      chat_attachments (*),
      chat_tool_calls (*),
      chat_suggested_actions (*)
    `
    )
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });

  if (error) return { error: error.message };
  return { data };
}

export interface SetActiveVariantParams {
  sessionId: string;
  userMessageId: string;
  activeIndex: number;
  signature?: string | null;
  signatures?: string[] | null;
}

export async function setActiveVariant(params: SetActiveVariantParams) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const row = {
    session_id: params.sessionId,
    user_message_id: params.userMessageId,
    active_index: params.activeIndex,
    signature: params.signature ?? null,
    signatures: params.signatures ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_branch_state")
    .upsert(row, { onConflict: "session_id,user_message_id" })
    .select("id, active_index")
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function getBranchState(sessionId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .schema(APP_SCHEMA)
    .from("chat_branch_state")
    .select("user_message_id, active_index, signature, signatures")
    .eq("session_id", sessionId);

  if (error) return { error: error.message };
  return { data };
}
