import "server-only";
import {
  pathToMessage,
  conversationBranches,
} from "@/lib/chat/conversation-graph";

import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import type {
  BeginChatTurnInput,
  BeginChatTurnResult,
  ChatConversation,
  ChatMessageStatus,
  ChatSettings,
  CompleteChatTurnInput,
  FailChatTurnInput,
  PersistedAttachment,
  PersistedChatMessage,
} from "@/lib/chat/conversation-types";
import type { Json } from "@/types/supabase";

type ChatClient = Awaited<ReturnType<typeof createClient>>;
type RawAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  width: number | null;
  height: number | null;
};
type RawMessage = {
  id: string;
  session_id: string;
  parent_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  context: Json | null;
  function_result: Json | null;
  citations: Json | null;
  root_user_message_id: string | null;
  variant_group_id: string | null;
  variant_index: number;
  created_at: string;
  seq: number;
  turn_id: string | null;
  model: string | null;
  settings: Json;
  status: ChatMessageStatus;
  chat_attachments?: RawAttachment[];
  chat_tool_calls?: Json[];
  chat_suggested_actions?: Json[];
};

const result = <T>(data: T): { data: T; error?: never } => ({ data });
const failure = (error: string): { error: string; data?: never } => ({ error });

async function authenticatedClient(
  client: ChatClient,
  accountId?: string | null
): Promise<{ userId: string } | { error: string }> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { error: "Not authenticated" };
  if (accountId && accountId !== data.user.id) {
    return { error: "Account changed while the chat request was in flight" };
  }
  return { userId: data.user.id };
}

function asSettings(value: unknown, model?: string | null): ChatSettings {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...raw,
    reasoningEffort:
      typeof raw.reasoningEffort === "string" ? raw.reasoningEffort : null,
    webSearchEnabled: raw.webSearchEnabled !== false,
    ...(model ? { model } : {}),
  } as ChatSettings;
}

async function signedAttachment(
  client: ChatClient,
  attachment: RawAttachment
): Promise<PersistedAttachment> {
  const bucket = attachment.mime_type.startsWith("image/")
    ? "chat-images"
    : "chat-files";
  const { data } = await client.storage
    .from(bucket)
    .createSignedUrl(attachment.storage_path, 3600);
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mime_type,
    size: attachment.size,
    storagePath: attachment.storage_path,
    url: data?.signedUrl ?? null,
    width: attachment.width,
    height: attachment.height,
  };
}

async function mapMessage(
  client: ChatClient,
  row: RawMessage
): Promise<PersistedChatMessage> {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    context: row.context,
    functionResult: row.function_result,
    citations: row.citations,
    createdAt: row.created_at,
    seq: row.seq,
    turnId: row.turn_id,
    model: row.model,
    settings: asSettings(row.settings, row.model),
    status: row.status,
    rootUserMessageId: row.root_user_message_id,
    variantGroupId: row.variant_group_id,
    variantIndex: row.variant_index,
    attachments: await Promise.all(
      (row.chat_attachments ?? []).map((a) => signedAttachment(client, a))
    ),
    toolCalls: row.chat_tool_calls ?? [],
    suggestedActions: row.chat_suggested_actions ?? [],
  };
}

async function loadConversation(
  client: ChatClient,
  userId: string,
  sessionId: string
): Promise<{ data: ChatConversation; rows: RawMessage[] } | { error: string }> {
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
    .select(
      "id, session_id, parent_id, role, content, reasoning, context, function_result, citations, root_user_message_id, variant_group_id, variant_index, created_at, seq, turn_id, model, settings, status, chat_attachments(*), chat_tool_calls(*), chat_suggested_actions(*)"
    )
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (messageError) return failure(messageError.message);

  const rawRows = (rows ?? []) as unknown as RawMessage[];
  const mapped = await Promise.all(
    rawRows.map((row) => mapMessage(client, row))
  );
  const activeLeafId = session.active_leaf_id;
  let selectedPath: PersistedChatMessage[];
  try {
    selectedPath = pathToMessage(mapped, activeLeafId);
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Invalid conversation history"
    );
  }
  const branches = conversationBranches(mapped, selectedPath);

  return {
    data: {
      session: {
        id: session.id,
        title: session.title,
        context: session.context as Json | null,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
      activeLeafId,
      messages: mapped,
      selectedPath,
      branches,
    },
    rows: rawRows,
  };
}

function rpc(client: ChatClient) {
  return client.schema(APP_SCHEMA) as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>
    ): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export async function beginChatTurn(input: BeginChatTurnInput) {
  const client = await createClient();
  const auth = await authenticatedClient(client, input.accountId);
  if ("error" in auth) return failure(auth.error);
  if (input.mode !== "retry" && !input.content.trim())
    return failure("Message content is required");

  const settings = input.settings ?? null;
  const { data: raw, error } = await rpc(client).rpc("begin_chat_turn", {
    p_session_id: input.sessionId,
    p_content: input.content,
    p_mode: input.mode,
    p_target_message_id: input.targetMessageId ?? null,
    p_model: input.model ?? null,
    p_settings: settings,
    p_turn_id: input.turnId ?? null,
    p_context: input.context ?? null,
    p_attachments: input.attachments ?? [],
  });
  if (error) return failure(error.message);
  const started = raw as {
    turnId: string;
    sessionId: string;
    mode: "new" | "edit" | "retry";
    userMessageId: string;
    assistantMessageId: string;
    parentId: string | null;
    model: string;
    settings: Json;
    status: ChatMessageStatus;
  };

  const conversation = await loadConversation(
    client,
    auth.userId,
    input.sessionId
  );
  if ("error" in conversation) return failure(conversation.error);
  const userMessage = conversation.data.messages.find(
    (message) => message.id === started.userMessageId
  );
  if (!userMessage)
    return failure("The persisted user message could not be loaded");
  // Build history from this turn's parent, not mutable session selection.
  const history = pathToMessage(
    conversation.data.messages,
    userMessage.parentId
  ).filter((message) => message.status === "completed");

  const beginResult: BeginChatTurnResult = {
    sessionId: started.sessionId,
    turnId: started.turnId,
    mode: started.mode,
    userMessageId: started.userMessageId,
    assistantMessageId: started.assistantMessageId,
    parentId: started.parentId,
    model: started.model,
    settings: asSettings(started.settings, started.model),
    userMessage,
    history,
  };
  return result(beginResult);
}

export async function completeChatTurn(input: CompleteChatTurnInput) {
  const client = await createClient();
  const auth = await authenticatedClient(client, input.accountId);
  if ("error" in auth) return failure(auth.error);
  const { error } = await rpc(client).rpc("complete_chat_turn", {
    p_session_id: input.sessionId,
    p_turn_id: input.turnId,
    p_assistant_message_id: input.assistantMessageId,
    p_content: input.content,
    p_reasoning: input.reasoning ?? null,
    p_citations: input.citations ?? null,
    p_function_result: input.functionResult ?? null,
    p_tool_calls: input.toolCalls ?? [],
    p_actions: input.suggestedActions ?? [],
  });
  if (error) return failure(error.message);
  const conversation = await loadConversation(
    client,
    auth.userId,
    input.sessionId
  );
  if ("error" in conversation) return failure(conversation.error);
  const message = conversation.data.messages.find(
    (item) => item.id === input.assistantMessageId
  );
  return message
    ? result(message)
    : failure("The completed assistant message could not be loaded");
}

export async function failChatTurn(input: FailChatTurnInput) {
  const client = await createClient();
  const auth = await authenticatedClient(client, input.accountId);
  if ("error" in auth) return failure(auth.error);
  const { data, error } = await rpc(client).rpc("fail_chat_turn", {
    p_session_id: input.sessionId,
    p_turn_id: input.turnId,
    p_assistant_message_id: input.assistantMessageId,
    p_status: input.status,
    p_error: input.error ?? null,
  });
  return error ? failure(error.message) : result(data);
}

export async function getChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  const client = await createClient();
  const auth = await authenticatedClient(client, accountId);
  if ("error" in auth) return failure(auth.error);
  const conversation = await loadConversation(client, auth.userId, sessionId);
  return "error" in conversation
    ? failure(conversation.error)
    : result(conversation.data);
}

export async function selectChatBranch(
  sessionId: string,
  leafMessageId: string,
  accountId?: string | null
) {
  const client = await createClient();
  const auth = await authenticatedClient(client, accountId);
  if ("error" in auth) return failure(auth.error);
  const { data, error } = await rpc(client).rpc("select_chat_branch", {
    p_session_id: sessionId,
    p_message_id: leafMessageId,
  });
  return error ? failure(error.message) : result(data);
}

export async function clearChatConversation(
  sessionId: string,
  accountId?: string | null
) {
  const client = await createClient();
  const auth = await authenticatedClient(client, accountId);
  if ("error" in auth) return failure(auth.error);
  const { data, error } = await rpc(client).rpc("clear_chat_conversation", {
    p_session_id: sessionId,
  });
  if (error) return failure(error.message);
  // Delete blobs only after the database transaction committed. Retrying a
  // failed storage cleanup must never bring deleted conversation rows back.
  const cleared = data as {
    attachments: Array<{ storage_path: string; mime_type: string }>;
  };
  const pathsByBucket = new Map<string, Set<string>>();
  for (const attachment of cleared.attachments || []) {
    const bucket = attachment.mime_type.startsWith("image/")
      ? "chat-images"
      : "chat-files";
    const paths = pathsByBucket.get(bucket) || new Set<string>();
    paths.add(attachment.storage_path);
    pathsByBucket.set(bucket, paths);
  }
  await Promise.all(
    [...pathsByBucket].map(async ([bucket, paths]) => {
      const { error: cleanupError } = await client.storage
        .from(bucket)
        .remove([...paths]);
      if (cleanupError)
        console.error("Chat attachment cleanup failed:", cleanupError.message);
    })
  );
  return result({ success: true, activeLeafId: null });
}
