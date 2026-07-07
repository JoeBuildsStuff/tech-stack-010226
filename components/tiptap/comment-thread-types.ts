export type ThreadComment = {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type Thread = {
  id: string;
  documentId: string;
  createdBy: string;
  status: "unresolved" | "resolved";
  anchorFrom: number;
  anchorTo: number;
  anchorExact: string;
  anchorPrefix: string;
  anchorSuffix: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: ThreadComment[];
};

export type ThreadVisibilityFilters = {
  open: boolean;
  resolved: boolean;
};

/** Document-level threads use a zero-width anchor (`anchorFrom === anchorTo`). */
export function isDocumentLevelThread(thread: {
  anchorFrom: number;
  anchorTo: number;
}): boolean {
  return thread.anchorTo === thread.anchorFrom;
}
