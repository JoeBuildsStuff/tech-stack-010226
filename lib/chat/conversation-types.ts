import type { Json } from "@/types/supabase";
import type {
  ChatAction,
  ChatMessagePart,
  ChatMessageStatus,
  ChatRole,
  ChatSettings,
  ChatTurnMode,
  ChatTurnRequest,
  Citation,
  PageContext,
} from "@/lib/chat/contracts";

export type { ChatMessageStatus, ChatSettings, ChatTurnMode };

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
  role: ChatRole;
  content: string;
  /** Ordered reply steps; rows saved before parts existed are reconstructed. */
  parts: ChatMessagePart[];
  context: Json | null;
  citations: Citation[];
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
  suggestedActions: ChatAction[];
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
  context?: PageContext | null;
  request?: ChatTurnRequest;
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
  /** True when this turn ID was already begun (an idempotent resend). */
  existing: boolean;
  userMessage: PersistedChatMessage;
  /** Completed messages before the user message, oldest first. */
  history: PersistedChatMessage[];
}

/** First message on the stream that starts a turn. */
export interface TurnStartMessage {
  type: "turn";
  turn: BeginChatTurnResult;
}

export interface ChatTurnRecord {
  id: string;
  sessionId: string;
  status: ChatMessageStatus;
  model: string;
  settings: ChatSettings;
  request: ChatTurnRequest;
  userMessageId: string | null;
  assistantMessageId: string | null;
  error: string | null;
}
