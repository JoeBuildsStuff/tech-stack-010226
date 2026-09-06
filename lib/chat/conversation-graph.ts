/** Shared pure traversal for persisted parent-linked conversations. */
export interface LinkedMessage {
  id: string;
  parentId: string | null;
  seq: number;
  role: string;
}

export function pathToMessage<T extends LinkedMessage>(
  messages: T[],
  leafId: string | null
): T[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const result: T[] = [];
  const visited = new Set<string>();
  let cursor = leafId;
  while (cursor) {
    if (visited.has(cursor)) throw new Error("Conversation contains a cycle");
    visited.add(cursor);
    const message = byId.get(cursor);
    if (!message) throw new Error("Conversation parent is missing");
    result.push(message);
    cursor = message.parentId;
  }
  return result.reverse();
}

export function conversationBranches<T extends LinkedMessage>(
  messages: T[],
  selectedPath: T[]
) {
  const children = new Map<string | null, T[]>();
  for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
    const siblings = children.get(message.parentId) || [];
    siblings.push(message);
    children.set(message.parentId, siblings);
  }
  const selectedChildren = new Map(
    selectedPath.map((message) => [message.parentId, message.id])
  );
  return Object.fromEntries(
    messages.map((message) => [
      message.id,
      {
        messageId: message.id,
        parentId: message.parentId,
        childIds: (children.get(message.id) || []).map((child) => child.id),
        siblingIds: (children.get(message.parentId) || [])
          .filter((sibling) => sibling.role === message.role)
          .map((sibling) => sibling.id),
        selectedChildId: selectedChildren.get(message.id) || null,
      },
    ])
  );
}
