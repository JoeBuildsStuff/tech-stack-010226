"use client";

import { Editor, useEditorState } from "@tiptap/react";
import {
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Code,
  MessageSquare,
  FileDiff,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/tiptap/dropdown-menu-tiptap";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/tiptap/link-button";
import TableButton from "@/components/tiptap/table-button";
import { CopyButton } from "@/components/ui/copy-button";
import { Separator } from "@/components/ui/separator";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

interface FixedMenuProps {
  editor: Editor;
  /**
   * Enabled feature ids. Each control renders only when its feature is on, so a
   * partial menu is this exact menu with some items hidden — never a restyle.
   * Defaults to everything on (the full menu).
   */
  enabled?: Set<string>;
  placement?: "top" | "bottom";
  showReview?: boolean;
  onShowReviewChange?: (show: boolean) => void;
  suggesting?: boolean;
  onSuggestingChange?: (value: boolean) => void;
}

const ALL_ON = {
  has: () => true,
} as unknown as Set<string>;

const FixedMenu = ({
  editor,
  enabled = ALL_ON,
  placement = "top",
  showReview,
  onShowReviewChange,
  suggesting,
  onSuggestingChange,
}: FixedMenuProps) => {
  const editorState = useEditorState({
    editor,
    selector: (state: { editor: Editor }) => ({
      isBold: state.editor.isActive("bold"),
      isItalic: state.editor.isActive("italic"),
      isStrike: state.editor.isActive("strike"),
      isUnderline: state.editor.isActive("underline"),
      isCode: state.editor.isActive("code"),
      isHeading1: state.editor.isActive("heading", { level: 1 }),
      isHeading2: state.editor.isActive("heading", { level: 2 }),
      isHeading3: state.editor.isActive("heading", { level: 3 }),
      isOrderedList: state.editor.isActive("orderedList"),
      isBulletList: state.editor.isActive("bulletList"),
      isCodeBlock: state.editor.isActive("codeBlock"),
      isAlignLeft: state.editor.isActive({ textAlign: "left" }),
      isAlignCenter: state.editor.isActive({ textAlign: "center" }),
      isAlignRight: state.editor.isActive({ textAlign: "right" }),
    }),
  });

  const has = (id: string) => enabled.has(id);
  const showHeadings = has("headings");
  const showLists = has("lists");
  const showCodeBlock = has("codeBlock");
  const showBlockGroup = showHeadings || showLists || showCodeBlock;
  const showAlign = has("align");
  const showBasic = has("basicMarks");
  const showUnderline = has("underline");
  const showLink = has("link");
  const showTable = has("table");
  const showFormatGroup =
    showBasic ||
    showUnderline ||
    showLink ||
    showTable ||
    Boolean(onSuggestingChange);

  const handleSetTextAlign = (alignment: "left" | "center" | "right") => {
    const chain = editor.chain().focus() as unknown as {
      setTextAlign: (value: typeof alignment) => { run: () => boolean };
    };

    chain.setTextAlign(alignment).run();
  };

  const getContentToCopy = () => {
    if (!editor) return "";

    const htmlContent = editor.getHTML();
    const textContent = editor.getText();

    // Return HTML content if it's different from plain text, otherwise return plain text
    return htmlContent !== textContent ? htmlContent : textContent;
  };

  return (
    <ScrollAreaPrimitive.Root
      className={
        placement === "bottom"
          ? "h-12 min-w-0 rounded-b-md border-t border-border bg-card"
          : "h-12 min-w-0 rounded-t-md border-b border-border bg-card"
      }
    >
      <ScrollAreaPrimitive.Viewport className="rounded-[inherit]">
        <div className="flex h-full flex-row items-center justify-between p-2">
          <div className="flex flex-row gap-1">
            {/* type of node */}
            {showBlockGroup && (
              <div className="flex flex-row gap-0.5 w-fit">
                <Tooltip>
                  <TooltipTrigger>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="text-xs"
                          variant="secondary"
                        >
                          {editorState.isHeading1 && <Heading1 className="" />}
                          {editorState.isHeading2 && <Heading2 className="" />}
                          {editorState.isHeading3 && <Heading3 className="" />}
                          {editorState.isOrderedList && (
                            <ListOrdered className="" />
                          )}
                          {editorState.isBulletList && <List className="" />}
                          {editorState.isCodeBlock && <Code className="" />}
                          {!editorState.isHeading1 &&
                            !editorState.isHeading2 &&
                            !editorState.isHeading3 &&
                            !editorState.isOrderedList &&
                            !editorState.isBulletList &&
                            !editorState.isCodeBlock && <Type className="" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={4}
                        className="text-xs w-48"
                      >
                        <DropdownMenuItem
                          onClick={() =>
                            editor.chain().focus().setParagraph().run()
                          }
                        >
                          <Type className="" />
                          <span className="text-xs">Text</span>
                          <DropdownMenuShortcut>⌘ ⌥ 0</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        {showHeadings && (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                editor
                                  .chain()
                                  .focus()
                                  .toggleHeading({ level: 1 })
                                  .run()
                              }
                            >
                              <Heading1 className="" />
                              <span className="text-xs">Heading 1</span>
                              <DropdownMenuShortcut>⌘ ⌥ 1</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                editor
                                  .chain()
                                  .focus()
                                  .toggleHeading({ level: 2 })
                                  .run()
                              }
                            >
                              <Heading2 className="" />
                              <span className="text-xs">Heading 2</span>
                              <DropdownMenuShortcut>⌘ ⌥ 2</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                editor
                                  .chain()
                                  .focus()
                                  .toggleHeading({ level: 3 })
                                  .run()
                              }
                            >
                              <Heading3 className="" />
                              <span className="text-xs">Heading 3</span>
                              <DropdownMenuShortcut>⌘ ⌥ 3</DropdownMenuShortcut>
                            </DropdownMenuItem>
                          </>
                        )}
                        {showLists && (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                editor.chain().focus().toggleOrderedList().run()
                              }
                            >
                              <ListOrdered className="" />
                              <span className="text-xs">Ordered list</span>
                              <DropdownMenuShortcut>⌘ ⇧ 7</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                editor.chain().focus().toggleBulletList().run()
                              }
                            >
                              <List className="" />
                              <span className="text-xs">Bullet list</span>
                              <DropdownMenuShortcut>⌘ ⇧ 8</DropdownMenuShortcut>
                            </DropdownMenuItem>
                          </>
                        )}
                        {showCodeBlock && (
                          <DropdownMenuItem
                            onClick={() =>
                              editor.chain().focus().toggleCodeBlock().run()
                            }
                          >
                            <Code className="" />
                            <span className="text-xs">Code block</span>
                            <DropdownMenuShortcut>⌘ ⌥ C</DropdownMenuShortcut>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Block type</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* alignment */}
            {showAlign && (
              <div className="flex flex-row gap-0.5 w-fit">
                <Tooltip>
                  <TooltipTrigger>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="text-xs"
                          variant="secondary"
                        >
                          {editorState.isAlignLeft && <AlignLeft className="" />}
                          {editorState.isAlignCenter && (
                            <AlignCenter className="" />
                          )}
                          {editorState.isAlignRight && (
                            <AlignRight className="" />
                          )}
                          {!editorState.isAlignLeft &&
                            !editorState.isAlignCenter &&
                            !editorState.isAlignRight && (
                              <AlignLeft className="" />
                            )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={4}
                        className="text-xs w-40"
                      >
                        <DropdownMenuItem
                          onClick={() => handleSetTextAlign("left")}
                        >
                          <AlignLeft className="" />
                          <span className="text-xs">Left</span>
                          <DropdownMenuShortcut>⌘ ⇧ L</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSetTextAlign("center")}
                        >
                          <AlignCenter className="" />
                          <span className="text-xs">Center</span>
                          <DropdownMenuShortcut>⌘ ⇧ E</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSetTextAlign("right")}
                        >
                          <AlignRight className="" />
                          <span className="text-xs">Right</span>
                          <DropdownMenuShortcut>⌘ ⇧ R</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Text alignment</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* formatting */}
            {showFormatGroup && (
              <div className="flex flex-row gap-0.5 w-fit">
                {showBasic && (
                  <>
                    <Tooltip>
                      <TooltipTrigger>
                        <Toggle
                          onClick={() =>
                            editor.chain().focus().toggleBold().run()
                          }
                          pressed={editorState.isBold}
                          size="sm"
                        >
                          <Bold className="" />
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Bold <span className="ml-2">⌘B</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <Toggle
                          onClick={() =>
                            editor.chain().focus().toggleItalic().run()
                          }
                          pressed={editorState.isItalic}
                          size="sm"
                        >
                          <Italic className="" />
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Italic <span className="ml-2">⌘I</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <Toggle
                          onClick={() =>
                            editor.chain().focus().toggleStrike().run()
                          }
                          pressed={editorState.isStrike}
                          size="sm"
                        >
                          <Strikethrough className="" />
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Strikethrough <span className="ml-2">⌘⇧X</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                {showUnderline && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Toggle
                        onClick={() =>
                          editor.chain().focus().toggleUnderline().run()
                        }
                        pressed={editorState.isUnderline}
                        size="sm"
                      >
                        <Underline className="" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Underline <span className="ml-2">⌘U</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {showBasic && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Toggle
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        pressed={editorState.isCode}
                        size="sm"
                      >
                        <Code className="" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Inline code <span className="ml-2">⌘E</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {showLink && <LinkButton editor={editor} size="sm" />}
                {showTable && <TableButton editor={editor} size="sm" />}
                {onSuggestingChange ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <Toggle
                        size="sm"
                        pressed={suggesting ?? false}
                        onPressedChange={onSuggestingChange}
                        aria-label={
                          suggesting
                            ? "Turn off suggesting mode"
                            : "Turn on suggesting mode"
                        }
                      >
                        <FileDiff className="" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {suggesting
                          ? "Suggesting mode on"
                          : "Suggesting mode off"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-row items-center gap-1">
            <Separator orientation="vertical" className="mx-1 h-6" />
            <CopyButton
              textToCopy={getContentToCopy()}
              size="sm"
              variant="ghost"
              className="text-xs"
              successMessage="Content copied to clipboard"
              errorMessage="Failed to copy content"
            />
            {onShowReviewChange ? (
              <Tooltip>
                <TooltipTrigger>
                  <Toggle
                    size="sm"
                    pressed={showReview ?? false}
                    onPressedChange={onShowReviewChange}
                    aria-label={
                      showReview ? "Hide review panel" : "Show review panel"
                    }
                  >
                    <MessageSquare className="" />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showReview ? "Hide review panel" : "Show review panel"}
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
};

export default FixedMenu;
