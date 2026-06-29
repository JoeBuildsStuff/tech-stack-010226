import { Underline } from "@tiptap/extension-underline";

import type { EditorFeature } from "./types";

/** Bold / italic / strikethrough / inline code — all from StarterKit. */
export const basicMarksFeature: EditorFeature = {
  id: "basicMarks",
  starterKit: { bold: {}, italic: {}, strike: {}, code: {} },
};

/** Underline — standalone extension (also disables StarterKit's bundled copy). */
export const underlineFeature: EditorFeature = {
  id: "underline",
  starterKit: { underline: false },
  extensions: () => [Underline],
};
