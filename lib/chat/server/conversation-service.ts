import "server-only";
import { z } from "zod";
import {
  pathToMessage,
  conversationBranches,
} from "@/lib/chat/conversation-graph";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import {
  parseActions,
  parseCitations,
  parseMessageParts,
  parseSettings,
  parseToolCalls,
  parseTurnRequest,
  type ChatMessagePart,
  type ChatMessageStatus,
  type ChatSettings,
  type ChatToolCall,
  type Citation,
} from "@/lib/chat/contracts";
import { joinTextParts, joinThinkingParts, toolCallsOf } from "@/lib/chat/parts";
import type {
  BeginChatTurnInput,
  BeginChatTurnResult,
  ChatConversation,
  ChatTurnRecord,
  PersistedAttachment,
  PersistedChatMessage,
} from "@/lib/chat/conversation-types";
import type { Json } from "@/types/supabase";

export type ChatClient = Awaited<ReturnType<typeof createClient>>;
export interface ChatAuth {
  client: ChatClient;
  userId: string;
}

type Result<T> = { data: T; error?: never } | { error: string; data?: never };
const ok = <T>(data: T): Result<T> => ({ data });
const failure = <T = never>(error: string): Result<T> => ({ error });

const statusSchema = z.enum([
  "pending",
  "streaming",
  "awaiting_input",
  "completed",
  "failed",
  "cancelled",
]);

const attachmentRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  size: z.coerce.number(),
  storage_path: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

const messageRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  parent_id: z.string().nullable(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  reasoning: z.string().nullable(),
  parts: z.unknown(),
  context: z.custom<Json>().nullable(),
  citations: z.unknown(),
  root_user_message_id: z.string().nullable(),
  variant_group_id: z.string().nullable(),
  variant_index: z.number(),
  created_at: z.string(),
  seq: z.coerce.number(),
  turn_id: z.string().nullable(),
  model: z.string().nullable(),
  settings: z.unknown(),
  status: statusSchema,
  chat_attachments: z.array(attachmentRowSchema).default([]),
  chat_tool_calls: z.array(z.unknown()).default([]),
  chat_suggested_actions: z.array(z.unknown()).default([]),
});
type MessageRow = z.infer<typeof messageRowSchema>;

const MESSAGE_COLUMNS =
  "id, session_id, parent_id, role, content, reasoning, parts, context, citations, root_user_message_id, variant_group_id, variant_index, created_at, seq, turn_id, model, settings, status, chat_attachments(*), chat_tool_calls(*), chat_suggested_actions(*)";

/** Verify the caller, and that the browser still believes it is the same account. */
export async function authenticate(
  accountId?: string | null
): Promise<Result<ChatAuth>> {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return failure("Not authenticated");
  if (accountId && accountId !== data.user.id)
    return failure("Account changed while the chat request was in flight");
  return ok({ client, userId: data.user.id });
}

async function rpc(auth: ChatAuth, name: string, args: Record<string, unknown>) {
  const { data, error } = await auth.client.schema(APP_SCHEMA).rpc(name, args);
  return error ? failure<unknown>(error.message) : ok<unknown>(data);
}

async function signedAttachment(
  client: ChatClient,
  row: MessageRow["chat_attachments"][number]
): Promise<PersistedAttachment> {
  const bucket = row.mime_type.startsWith("image/") ? "chat-images" : "chat-files";
  const { data } = await client.storage
    .from(bucket)
    .createSignedUrl(row.storage_path, 3600);
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    storagePath: row.storage_path,
    url: data?.signedUrl ?? null,
    width: row.width,
    height: row.height,
  };
}

/** Rows saved before parts existed: reasoning, then tools, then the answer. */
function legacyParts(row: MessageRow): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [];
  if (row.reasoning?.trim())
    parts.push({ type: "thinking", text: row.reasoning, startedAt: 0, endedAt: 0 });
  for (const toolCall of parseToolCalls(row.chat_tool_calls))
    parts.push({ type: "tool", toolCall });
  if (row.content.trim()) parts.push({ type: "text", text: row.content });
  return parts;
}

async function mapMessage(
  client: ChatClient,
  row: MessageRow
): Promise<PersistedChatMessage> {
  const parts =
    row.role === "assistant"
      ? (parseMessageParts(row.parts) ?? legacyParts(row))
      : [];
  return {
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    role: row.role,
    content: row.content,
    parts,
    context: row.context,
    citations: parseCitations(row.citations),
    createdAt: row.created_at,
    seq: row.seq,
    turnId: row.turn_id,
    model: row.model,
    settings: parseSettings(row.settings),
    status: row.status,
    rootUserMessageId: row.root_user_message_id,
    variantGroupId: row.variant_group_id,
    variantIndex: row.variant_index,
    attachments: await Promise.all(
      row.chat_attachments.map((attachment) => signedAttachment(client, attachment))
    ),
    suggestedActions: parseActions(row.chat_suggested_actions),
  };
}

export async function loadConversation(
  auth: ChatAuth,
  sessionId: string
): Promise<Result<ChatConversation>> {
  const { client, userId } = auth;
  const { data: session, error: sessionError } = await client
    .schema(APP_SCHEMA)
    .from("chat_sessions")
    .select("id, title, context, created_at, updated_at, active_leaf_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (sessionError || !session)
    return failure(sessionError?.message ?? "Chat session not found");

  const { data: rows, error: messageError } = await client
    .schema(APP_SCHEMA)
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (messageError) return failure(messageError.message);

  const parsedRows = z.array(messageRowSchema).safeParse(rows ?? []);
  if (!parsedRows.success) return failure("Chat history has an unexpected shape");
  const messages = await Promise.all(
    parsedRows.data.map((row) => mapMessage(client, row))
  );
  const activeLeafId: string | null = session.active_leaf_id;
  let selectedPath: PersistedChatMessage[];
  try {
    selectedPath = pathToMessage(messages, activeLeafId);
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Invalid conversation history"
    );
  }

  return ok({
    session: {
      id: session.id,
      title: session.title,
      context: session.context,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    activeLeafId,
    messages,
    selectedPath,
    branches: conversationBranches(messages, selectedPath),
  });
}

/** The completed messages leading to a message, plus the message itself. */
export function pathThrough(
  conversation: ChatConversation,
  messageId: string
): PersistedChatMessage[] {
  return pathToMessage(conversation.messages, messageId).filter(
    (message) => message.id === messageId || message.status === "completed"
  );
}

const beginResultSchema = z.object({
  turnId: z.string(),
  sessionId: z.string(),
  mode: z.enum(["new", "edit", "retry"]),
  userMessageId: z.string(),
  assistantMessageId: z.string(),
  parentId: z.string().nullable().optional(),
  model: z.string(),
  settings: z.unknown(),
  existing: z.boolean().optional(),
});

export async function beginTurn(
  auth: ChatAuth,
  input: BeginChatTurnInput
): Promise<Result<BeginChatTurnResult>> {
  if (input.mode !== "retry" && !input.content.trim())
    return failure("Message content is required");
  const started = await rpc(auth, "begin_chat_turn", {
    p_session_id: input.sessionId,
    p_content: input.content,
    p_mode: input.mode,
    p_target_message_id: input.targetMessageId ?? null,
    p_model: input.model ?? null,
    p_settings: input.settings ?? null,
    p_turn_id: input.turnId ?? null,
    p_context: input.context ?? null,
    p_attachments: input.attachments ?? [],
    p_request: input.request ?? {},
  });
  if (started.error !== undefined) return failure(started.error);
  const turn = beginResultSchema.safeParse(started.data);
  if (!turn.success) return failure("Unexpected response when starting the turn");

  const conversation = await loadConversation(auth, input.sessionId);
  if (conversation.error !== undefined) return failure(conversation.error);
  const userMessage = conversation.data.messages.find(
    (message) => message.id === turn.data.userMessageId
  );
  if (!userMessage) return failure("The persisted user message could not be loaded");
  // Build history from this turn's parent, not mutable session selection.
  const history = pathThrough(conversation.data, userMessage.id).slice(0, -1);

  return ok({
    sessionId: turn.data.sessionId,
    turnId: turn.data.turnId,
    mode: turn.data.mode,
    userMessageId: turn.data.userMessageId,
    assistantMessageId: turn.data.assistantMessageId,
    parentId: turn.data.parentId ?? null,
    model: turn.data.model,
    settings: parseSettings(turn.data.settings),
    existing: turn.data.existing === true,
    userMessage,
    history,
  });
}

const turnRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  status: statusSchema,
  model: z.string(),
  settings: z.unknown(),
  request: z.unknown(),
  user_message_id: z.string().nullable(),
  assistant_message_id: z.string().nullable(),
  error: z.string().nullable(),
});

export async function getTurn(
  auth: ChatAuth,
  turnId: string
): Promise<Result<ChatTurnRecord>> {
  const { data, error } = await auth.client
    .schema(APP_SCHEMA)
    .from("chat_turns")
    .select(
      "id, session_id, status, model, settings, request, user_message_id, assistant_message_id, error"
    )
    .eq("id", turnId)
    .maybeSingle();
  if (error) return failure(error.message);
  const row = turnRowSchema.safeParse(data);
  if (!row.success) return failure("Chat turn not found");
  return ok({
    id: row.data.id,
    sessionId: row.data.session_id,
    status: row.data.status,
    model: row.data.model,
    settings: parseSettings(row.data.settings),
    request: parseTurnRequest(row.data.request),
    userMessageId: row.data.user_message_id,
    assistantMessageId: row.data.assistant_message_id,
    error: row.data.error,
  });
}

export interface TurnRef {
  sessionId: string;
  turnId: string;
  assistantMessageId: string;
}

/** Checkpoint streamed parts; returns the turn's current status. */
export async function saveTurnProgress(
  auth: ChatAuth,
  turn: TurnRef,
  parts: ChatMessagePart[],
  status: "streaming" | "awaiting_input"
): Promise<Result<ChatMessageStatus>> {
  const saved = await rpc(auth, "save_chat_turn_progress", {
    p_session_id: turn.sessionId,
    p_turn_id: turn.turnId,
    p_assistant_message_id: turn.assistantMessageId,
    p_parts: parts,
    p_content: joinTextParts(parts),
    p_status: status,
  });
  if (saved.error !== undefined) return failure(saved.error);
  const parsed = z.object({ status: statusSchema }).safeParse(saved.data);
  return parsed.success ? ok(parsed.data.status) : failure("Unexpected progress response");
}

export async function resumeTurn(
  auth: ChatAuth,
  turn: { sessionId: string; turnId: string },
  parts: ChatMessagePart[]
) {
  const resumed = await rpc(auth, "resume_chat_turn", {
    p_session_id: turn.sessionId,
    p_turn_id: turn.turnId,
    p_parts: parts,
  });
  return resumed.error !== undefined ? failure(resumed.error) : ok(true);
}

function legacyToolRows(calls: ChatToolCall[]) {
  return calls.map((call) => ({
    name: call.name,
    arguments: call.arguments,
    result: call.result ?? null,
    reasoning: null,
  }));
}

export async function completeTurn(
  auth: ChatAuth,
  turn: TurnRef,
  reply: { parts: ChatMessagePart[]; citations: Citation[] }
) {
  const calls = toolCallsOf(reply.parts);
  const firstSuccess = calls.find((call) => call.result?.success)?.result;
  const completed = await rpc(auth, "complete_chat_turn", {
    p_session_id: turn.sessionId,
    p_turn_id: turn.turnId,
    p_assistant_message_id: turn.assistantMessageId,
    p_content: joinTextParts(reply.parts),
    p_reasoning: joinThinkingParts(reply.parts) || null,
    p_citations: reply.citations.length ? reply.citations : null,
    p_function_result: firstSuccess ?? null,
    p_tool_calls: legacyToolRows(calls),
    p_actions: [],
    p_parts: reply.parts,
  });
  return completed.error !== undefined ? failure(completed.error) : ok(true);
}

export async function failTurn(
  auth: ChatAuth,
  turn: TurnRef,
  outcome: { status: "failed" | "cancelled"; error: string; parts?: ChatMessagePart[] }
) {
  const failed = await rpc(auth, "fail_chat_turn", {
    p_session_id: turn.sessionId,
    p_turn_id: turn.turnId,
    p_assistant_message_id: turn.assistantMessageId,
    p_status: outcome.status,
    p_error: outcome.error,
    p_parts: outcome.parts ?? null,
  });
  return failed.error !== undefined ? failure(failed.error) : ok(true);
}

/** Fail turns whose generator stopped heartbeating (restart, crash, timeout). */
export async function expireStaleTurns(auth: ChatAuth, sessionId: string) {
  const expired = await rpc(auth, "expire_stale_chat_turns", {
    p_session_id: sessionId,
  });
  return expired.error !== undefined ? failure(expired.error) : ok(true);
}

// ─── Server-action entry points ──────────────────────────────────────────────

export async function getChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  const auth = await authenticate(accountId);
  if (auth.error !== undefined) return failure<ChatConversation>(auth.error);
  await expireStaleTurns(auth.data, sessionId);
  return loadConversation(auth.data, sessionId);
}

export async function selectChatBranch(
  sessionId: string,
  leafMessageId: string,
  accountId?: string | null
) {
  const auth = await authenticate(accountId);
  if (auth.error !== undefined) return failure(auth.error);
  return rpc(auth.data, "select_chat_branch", {
    p_session_id: sessionId,
    p_message_id: leafMessageId,
  });
}

const clearedSchema = z.object({
  attachments: z
    .array(z.object({ storage_path: z.string(), mime_type: z.string() }))
    .default([]),
});

export async function clearChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  const auth = await authenticate(accountId);
  if (auth.error !== undefined) return failure(auth.error);
  const cleared = await rpc(auth.data, "clear_chat_conversation", {
    p_session_id: sessionId,
  });
  if (cleared.error !== undefined) return failure(cleared.error);
  // Delete blobs only after the database transaction committed. Retrying a
  // failed storage cleanup must never bring deleted conversation rows back.
  const pathsByBucket = new Map<string, Set<string>>();
  for (const attachment of clearedSchema.catch({ attachments: [] }).parse(cleared.data)
    .attachments) {
    const bucket = attachment.mime_type.startsWith("image/") ? "chat-images" : "chat-files";
    const paths = pathsByBucket.get(bucket) || new Set<string>();
    paths.add(attachment.storage_path);
    pathsByBucket.set(bucket, paths);
  }
  await Promise.all(
    [...pathsByBucket].map(async ([bucket, paths]) => {
      const { error: cleanupError } = await auth.data.client.storage
        .from(bucket)
        .remove([...paths]);
      if (cleanupError)
        console.error("Chat attachment cleanup failed:", cleanupError.message);
    })
  );
  return ok({ success: true, activeLeafId: null });
}

export type { ChatSettings };
