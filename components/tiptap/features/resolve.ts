import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import type { Extensions } from "@tiptap/react";

import type { EditorFeature, FeatureContext, SlashCommand } from "./types";

/**
 * StarterKit ships every node/mark enabled. We start from "everything optional
 * off" and let features turn their pieces back on, so a minimal feature set
 * yields a minimal schema. Keys left unset (paragraph, history, gapcursor,
 * dropcursor, hardBreak…) keep StarterKit's defaults.
 */
const STARTER_KIT_BASE: Record<string, unknown> = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  blockquote: false,
  codeBlock: false,
  horizontalRule: false,
  // These also ship inside StarterKit; the link/underline/codeBlock features
  // re-add standalone, configured copies, so disable the bundled ones to avoid
  // duplicate-extension warnings.
  link: false,
  underline: false,
};

export interface ResolveOptions {
  placeholder?: string;
}

export function resolveExtensions(
  features: EditorFeature[],
  context: FeatureContext,
  options: ResolveOptions = {}
): Extensions {
  const starterKitOptions = { ...STARTER_KIT_BASE };
  for (const feature of features) {
    if (feature.starterKit) {
      Object.assign(starterKitOptions, feature.starterKit);
    }
  }

  const standalone = features.flatMap(
    (feature) => feature.extensions?.(context) ?? []
  );

  return [
    StarterKit.configure(starterKitOptions),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Write something…",
    }),
    ...standalone,
  ];
}

export function resolveSlash(features: EditorFeature[]): SlashCommand[] {
  return features.flatMap((feature) => feature.slash ?? []);
}
