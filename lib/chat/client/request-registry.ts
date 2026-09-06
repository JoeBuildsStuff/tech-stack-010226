/** Requests belong to an authenticated account epoch and a conversation, never a tab selection. */
export interface ChatRequest {
  accountId: string;
  accountEpoch: number;
  sessionId: string;
  requestId: string;
  controller: AbortController;
}

const requests = new Map<string, ChatRequest>();

function key(accountId: string, sessionId: string) {
  return `${accountId}:${sessionId}`;
}

export function registerChatRequest(request: ChatRequest): boolean {
  const requestKey = key(request.accountId, request.sessionId);
  if (requests.has(requestKey)) return false;
  requests.set(requestKey, request);
  return true;
}

export function releaseChatRequest(request: ChatRequest) {
  const requestKey = key(request.accountId, request.sessionId);
  if (requests.get(requestKey) === request) requests.delete(requestKey);
}

export function abortChatRequest(accountId: string, sessionId: string) {
  requests.get(key(accountId, sessionId))?.controller.abort();
}

export function abortAllChatRequests() {
  for (const request of requests.values()) request.controller.abort();
  requests.clear();
}
