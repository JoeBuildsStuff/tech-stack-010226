import type { EditorFeature } from "./types";

/**
 * Inline comment threads. Recognised by id in {@link useRichTextEditor}, which
 * mounts the comment anchors extension + composer + review panel via
 * `useDocumentComments` when this feature is present and a `documentId` is set.
 */
export const commentsFeature: EditorFeature = {
  id: "comments",
};

/**
 * Redline (tracked-changes) suggestions. Recognised by id in
 * {@link useRichTextEditor}, which mounts the redline marks + track-changes
 * extension via `useDocumentSuggestions` when present and a `documentId` is set.
 */
export const suggestionsFeature: EditorFeature = {
  id: "suggestions",
};
