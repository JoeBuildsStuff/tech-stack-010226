import type { Extensions } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { TiptapFileUploadConfig } from "../types";

/**
 * Per-instance services a feature may need when building its extensions.
 * Supplied by the consumer (e.g. the notes page passes its `documentId`).
 */
export interface FeatureContext {
  /** Document id used by comments + redline suggestions backends. */
  documentId?: string;
  /** Upload configuration for the image/file features. */
  upload?: TiptapFileUploadConfig;
  /** Called when files are dropped/pasted (image/file features). */
  onFileDrop?: (files: File[]) => void;
}

/** An entry in the "/" slash command menu. */
export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: string;
  run: (editor: Editor) => void;
}

/**
 * A capability the editor can have. A feature co-locates the Tiptap extensions
 * it needs with the slash commands it contributes; the fixed/bubble menus are
 * canonical, fully-styled components ({@link FixedMenu}, {@link BubbleMenu}) that
 * render each control based on the enabled feature ids — so a partial menu is the
 * full menu with items hidden, never a restyle.
 *
 * `comments` and `suggestions` are recognised by id in the core (they need React
 * hooks + the review panel) and contribute only their backend wiring.
 */
export interface EditorFeature {
  id: string;
  /** StarterKit option overrides this feature requires (merged across features). */
  starterKit?: Record<string, unknown>;
  /** Standalone extensions this feature adds. */
  extensions?: (ctx: FeatureContext) => Extensions;
  /** Slash-menu entries. */
  slash?: SlashCommand[];
}

export function hasFeature(features: EditorFeature[], id: string): boolean {
  return features.some((feature) => feature.id === id);
}

/** The set of enabled feature ids, used to gate the menu controls. */
export function featureIdSet(features: EditorFeature[]): Set<string> {
  return new Set(features.map((feature) => feature.id));
}
