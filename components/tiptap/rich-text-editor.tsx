"use client";

import { EditorContent } from "@tiptap/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { presets, type PresetName } from "@/components/tiptap/features/presets";
import type { EditorFeature, FeatureContext } from "@/components/tiptap/features/types";
import { useRichTextEditor } from "@/components/tiptap/use-rich-text-editor";
import FixedMenu from "@/components/tiptap/fixed-menu";
import { SlashCommandMenu } from "@/components/tiptap/slash-command-menu";
import BubbleMenuComponent from "@/components/tiptap/bubble-menu";
import { TableHoverControls } from "@/components/tiptap/table-hover-controls";

export interface RichTextEditorProps {
  /** Named feature set. Ignored when `features` is provided. */
  preset?: PresetName;
  /** Explicit feature list (compose à la carte). Overrides `preset`. */
  features?: EditorFeature[];
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  /** Fixed toolbar placement, or `false` to hide it. */
  toolbar?: "top" | "bottom" | false;
  bubbleMenu?: boolean;
  slashMenu?: boolean;
  /** Per-instance services for feature extensions (upload config, etc.). */
  context?: FeatureContext;
  className?: string;
  editorClassName?: string;
}

/**
 * Config-driven editor for the common card use cases (comment box, description,
 * full document). Pick a `preset` or pass `features`, choose toolbar placement,
 * and toggle the bubble/slash menus. The fixed and bubble menus are the canonical
 * {@link FixedMenu} / {@link BubbleMenu} gated by the enabled features, so a
 * partial editor's menus match the full menu exactly. Comments/suggestions (which
 * need a docked review panel) compose {@link useRichTextEditor} directly — see the
 * notes page.
 */
export function RichTextEditor({
  preset = "standard",
  features,
  content,
  onChange,
  placeholder,
  toolbar = "top",
  bubbleMenu = false,
  slashMenu = false,
  context,
  className,
  editorClassName,
}: RichTextEditorProps) {
  const resolvedFeatures = features ?? presets[preset];
  const core = useRichTextEditor({
    features: resolvedFeatures,
    content,
    onChange,
    placeholder,
    context,
  });
  const { editor, editorContentRef, enabledFeatures, slashCommands } = core;

  if (!editor) {
    return (
      <div className={cn("rounded-md border border-border bg-card", className)}>
        <div
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none p-3",
            editorClassName
          )}
        >
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border bg-card",
        className
      )}
    >
      <TooltipProvider>
        {toolbar === "top" ? (
          <FixedMenu editor={editor} enabled={enabledFeatures} placement="top" />
        ) : null}

        <div
          ref={editorContentRef}
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none p-3 [&_.ProseMirror]:outline-none",
            editorClassName
          )}
        >
          <EditorContent
            editor={editor}
            className="[&_a:hover]:cursor-pointer"
          />
          <TableHoverControls editor={editor} containerRef={editorContentRef} />
        </div>

        {toolbar === "bottom" ? (
          <FixedMenu
            editor={editor}
            enabled={enabledFeatures}
            placement="bottom"
          />
        ) : null}

        {bubbleMenu ? (
          <BubbleMenuComponent editor={editor} enabled={enabledFeatures} />
        ) : null}
        {slashMenu ? (
          <SlashCommandMenu editor={editor} commands={slashCommands} />
        ) : null}
      </TooltipProvider>
    </div>
  );
}
