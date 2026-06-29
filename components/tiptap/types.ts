export type CommentSelectionPayload = {
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  position: {
    top: number
    left: number
  }
}

// Types for configurable Tiptap component
export interface TiptapFileUploadConfig {
  /** Upload function that returns a promise with the uploaded file path */
  uploadFn?: (file: File) => Promise<string>
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number
  /** Allowed file MIME types */
  allowedMimeTypes?: string[]
  /** Supabase bucket name for uploads */
  supabaseBucket?: string
  /** Custom path prefix for uploads */
  pathPrefix?: string
}

export interface TiptapProps {
  content?: string
  showFixedMenu?: boolean
  showBubbleMenu?: boolean
  showDragHandle?: boolean
  onChange?: (content: string) => void
  onFileDrop?: (files: File[]) => void
  /** File upload configuration */
  fileUploadConfig?: TiptapFileUploadConfig
  /** Whether to show file nodes for non-image files */
  enableFileNodes?: boolean
  /** Called when the user requests to comment on selected text */
  onRequestCommentFromSelection?: (payload: CommentSelectionPayload) => void
  /** Whether the unified review panel (comments + suggestions) is visible */
  showReview?: boolean
  /** Callback when the review panel visibility should change */
  onShowReviewChange?: (show: boolean) => void
  /** Document id used by built-in comments CRUD */
  commentsDocumentId?: string
  /** Document id used by built-in redline (tracked changes) suggestions */
  redlineDocumentId?: string
}

export interface FileUploadResult {
  success: boolean
  filePath?: string
  error?: string
}
