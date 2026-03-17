"use client";

import { Editor, useEditorState } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { useCallback } from "react";
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
import TableButton from "./table-button";

interface BubbleMenuProps {
  editor: Editor;
  onRequestCommentFromSelection?: (payload: {
    anchorFrom: number;
    anchorTo: number;
    anchorExact: string;
    anchorPrefix: string;
    anchorSuffix: string;
    position: {
      top: number;
      left: number;
    };
  }) => void;
}

const BubbleMenuComponent = ({
  editor,
  onRequestCommentFromSelection,
}: BubbleMenuProps) => {
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

  const handleSetTextAlign = (alignment: "left" | "center" | "right") => {
    const chain = editor.chain().focus() as unknown as {
      setTextAlign: (value: typeof alignment) => { run: () => boolean };
    };

    chain.setTextAlign(alignment).run();
  };

  const bubbleMenuRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      node.style.zIndex = "20";
    }
  }, []);

  const handleRequestComment = () => {
    const { from, to, empty } = editor.state.selection;
    if (empty || to <= from) {
      return;
    }

    const doc = editor.state.doc;
    const prefixStart = Math.max(1, from - 32);
    const suffixEnd = Math.min(doc.content.size, to + 32);
    const coords = editor.view.coordsAtPos(to);

    onRequestCommentFromSelection?.({
      anchorFrom: from,
      anchorTo: to,
      anchorExact: doc.textBetween(from, to, " ", " "),
      anchorPrefix: doc.textBetween(prefixStart, from, " ", " "),
      anchorSuffix: doc.textBetween(to, suffixEnd, " ", " "),
      position: {
        top: coords.bottom + 8,
        left: (coords.left + coords.right) / 2,
      },
    });
  };

  return (
    <TiptapBubbleMenu
      ref={bubbleMenuRef}
      className=""
      options={{
        offset: 6,
        placement: "top",
      }}
      editor={editor}
      shouldShow={({ editor, state }) => {
        if (!editor.isFocused) {
          return false;
        }

        const { from, to, empty } = state.selection;

        if (empty) {
          return false;
        }

        const selectedText = state.doc.textBetween(from, to).trim();
        return selectedText.length > 0;
      }}
    >
      <div className="flex flex-row gap-0.5 border rounded-xl border-border bg-background p-1">
        <Tooltip>
          <TooltipTrigger>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="text-xs" variant="secondary">
                  {editorState.isHeading1 && <Heading1 className="" />}
                  {editorState.isHeading2 && <Heading2 className="" />}
                  {editorState.isHeading3 && <Heading3 className="" />}
                  {editorState.isOrderedList && <ListOrdered className="" />}
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
                portalled={false}
                align="start"
                side="bottom"
                sideOffset={10}
                className="text-xs w-48 bg-background"
              >
                <DropdownMenuItem
                  onClick={() => editor.chain().setParagraph().focus().run()}
                >
                  <Type className="" />
                  <span className="text-xs">Text</span>
                  <DropdownMenuShortcut>⌘ ⌥ 0</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    editor.chain().toggleHeading({ level: 1 }).focus().run()
                  }
                >
                  <Heading1 className="" />
                  <span className="text-xs">Heading 1</span>
                  <DropdownMenuShortcut>⌘ ⌥ 1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    editor.chain().toggleHeading({ level: 2 }).focus().run()
                  }
                >
                  <Heading2 className="" />
                  <span className="text-xs">Heading 2</span>
                  <DropdownMenuShortcut>⌘ ⌥ 2</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    editor.chain().toggleHeading({ level: 3 }).focus().run()
                  }
                >
                  <Heading3 className="" />
                  <span className="text-xs">Heading 3</span>
                  <DropdownMenuShortcut>⌘ ⌥ 3</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    editor.chain().toggleOrderedList().focus().run()
                  }
                >
                  <ListOrdered className="" />
                  <span className="text-xs">Ordered list</span>
                  <DropdownMenuShortcut>⌘ ⇧ 7</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    editor.chain().toggleBulletList().focus().run()
                  }
                >
                  <List className="" />
                  <span className="text-xs">Bullet list</span>
                  <DropdownMenuShortcut>⌘ ⇧ 8</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                >
                  <Code className="" />
                  <span className="text-xs">Code block</span>
                  <DropdownMenuShortcut>⌘ ⌥ C</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent>
            <p>Block type</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="text-xs" variant="secondary">
                  {editorState.isAlignLeft && <AlignLeft className="" />}
                  {editorState.isAlignCenter && <AlignCenter className="" />}
                  {editorState.isAlignRight && <AlignRight className="" />}
                  {!editorState.isAlignLeft &&
                    !editorState.isAlignCenter &&
                    !editorState.isAlignRight && <AlignLeft className="" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                portalled={false}
                align="start"
                side="bottom"
                sideOffset={10}
                className="text-xs w-40 bg-background"
              >
                <DropdownMenuItem
                  onClick={() => {
                    handleSetTextAlign("left");
                  }}
                >
                  <AlignLeft className="" />
                  <span className="text-xs">Left</span>
                  <DropdownMenuShortcut>⌘ ⇧ L</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    handleSetTextAlign("center");
                  }}
                >
                  <AlignCenter className="" />
                  <span className="text-xs">Center</span>
                  <DropdownMenuShortcut>⌘ ⇧ E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    handleSetTextAlign("right");
                  }}
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

        <Tooltip>
          <TooltipTrigger>
            <Toggle
              onClick={() => editor.chain().toggleBold().focus().run()}
              pressed={editorState.isBold}
              size="sm"
              className="text-xs"
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
              onClick={() => editor.chain().toggleItalic().focus().run()}
              pressed={editorState.isItalic}
              size="sm"
              className="text-xs"
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
              onClick={() => editor.chain().toggleStrike().focus().run()}
              pressed={editorState.isStrike}
              size="sm"
              className="text-xs"
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
        <Tooltip>
          <TooltipTrigger>
            <Toggle
              onClick={() => editor.chain().toggleUnderline().focus().run()}
              pressed={editorState.isUnderline}
              size="sm"
              className="text-xs"
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
        <Tooltip>
          <TooltipTrigger>
            <Toggle
              onClick={() => editor.chain().toggleCode().focus().run()}
              pressed={editorState.isCode}
              size="sm"
              className="text-xs"
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
        <LinkButton editor={editor} size="sm" className="text-xs" />
        <TableButton editor={editor} size="sm" className="text-xs" />
        {onRequestCommentFromSelection ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="text-xs"
                onClick={handleRequestComment}
              >
                <MessageSquare className="" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add comment</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TiptapBubbleMenu>
  );
};

export default BubbleMenuComponent;
