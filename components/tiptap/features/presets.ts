import {
  alignFeature,
  blockquoteFeature,
  codeBlockFeature,
  headingsFeature,
  horizontalRuleFeature,
  listsFeature,
} from "./blocks";
import { basicMarksFeature, underlineFeature } from "./marks";
import { filesFeature, imageFeature, linkFeature, tableFeature } from "./media";
import { commentsFeature, suggestionsFeature } from "./review";
import type { EditorFeature } from "./types";

/** Inline rich text: bold/italic/underline/code. The comment-box editor. */
export const commentPreset: EditorFeature[] = [
  basicMarksFeature,
  underlineFeature,
];

/** Everyday prose: headings, lists, links, images. The "description" editor. */
export const standardPreset: EditorFeature[] = [
  headingsFeature,
  basicMarksFeature,
  underlineFeature,
  listsFeature,
  linkFeature,
  imageFeature,
];

/** The full document toolset (no backend-coupled review features). */
export const fullPreset: EditorFeature[] = [
  headingsFeature,
  basicMarksFeature,
  underlineFeature,
  listsFeature,
  alignFeature,
  linkFeature,
  tableFeature,
  blockquoteFeature,
  codeBlockFeature,
  horizontalRuleFeature,
  imageFeature,
  filesFeature,
];

/** Full toolset plus inline comments and tracked-changes suggestions. */
export const notesPreset: EditorFeature[] = [
  ...fullPreset,
  commentsFeature,
  suggestionsFeature,
];

export const presets = {
  comment: commentPreset,
  standard: standardPreset,
  full: fullPreset,
  notes: notesPreset,
} satisfies Record<string, EditorFeature[]>;

export type PresetName = keyof typeof presets;
