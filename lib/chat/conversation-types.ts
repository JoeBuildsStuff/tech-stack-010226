import type { Json } from "@/types/supabase";

export type ChatTurnMode = "new" | "edit" | "retry";
export type ChatMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChatSettings {
  reasoningEffort?: string | null;
  webSearchEnabled: boolean;
  [key: string]: Json | undefined;
}

export interface PersistedAttachmentInput {
  name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  width?: number | null;
  height?: number | null;
}

export interface PersistedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  url: string | null;
  width: number | null;
  height: number | null;
}

export interface PersistedChatMessage {
  id: string;
  sessionId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  context: Json | null;
  functionResult: Json | null;
  citations: Json | null;
  createdAt: string;
  seq: number;
  turnId: string | null;
  model: string | null;
  settings: ChatSettings;
  status: ChatMessageStatus;
  rootUserMessageId: string | null;
  variantGroupId: string | null;
  variantIndex: number;
  attachments: PersistedAttachment[];
  toolCalls: Json[];
  suggestedActions: Json[];
}

export interface ChatBranchInfo {
  messageId: string;
  parentId: string | null;
  childIds: string[];
  siblingIds: string[];
  selectedChildId: string | null;
}

export interface ChatConversationSession {
  id: string;
  title: string;
  context: Json | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversation {
  session: ChatConversationSession;
  activeLeafId: string | null;
  messages: PersistedChatMessage[];
  selectedPath: PersistedChatMessage[];
  branches: Record<string, ChatBranchInfo>;
}

export interface BeginChatTurnInput {
  sessionId: string;
  content: string;
  mode: ChatTurnMode;
  targetMessageId?: string | null;
  model?: string | null;
  settings?: Partial<ChatSettings> | null;
  attachments?: PersistedAttachmentInput[];
  turnId?: string | null;
  accountId?: string | null;
  context?: Json | null;
}

export interface BeginChatTurnResult {
  sessionId: string;
  turnId: string;
  mode: ChatTurnMode;
  userMessageId: string;
  assistantMessageId: string;
  parentId: string | null;
  model: string;
  settings: ChatSettings;
  userMessage: PersistedChatMessage;
  history: PersistedChatMessage[];
}

export interface CompleteChatTurnInput {
  sessionId: string;
  turnId: string;
  assistantMessageId: string;
  content: string;
  reasoning?: string | null;
  citations?: Json | null;
  functionResult?: Json | null;
  toolCalls?: Json[];
  suggestedActions?: Json[];
  accountId?: string | null;
}

export interface FailChatTurnInput {
  sessionId: string;
  turnId: string;
  assistantMessageId: string;
  status: "failed" | "cancelled";
  error?: string | null;
  accountId?: string | null;
}
