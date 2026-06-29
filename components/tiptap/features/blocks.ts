import { TextAlign } from "@tiptap/extension-text-align";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  TextQuote,
  Type,
} from "lucide-react";

import { CustomCodeBlock, lowlight } from "./extensions";
import type { EditorFeature } from "./types";

/** Paragraph + H1/H2/H3 (the "Aa" block-type menu options + slash). */
export const headingsFeature: EditorFeature = {
  id: "headings",
  starterKit: { heading: { levels: [1, 2, 3] } },
  slash: [
    {
      id: "text",
      label: "Text",
      description: "Plain paragraph",
      icon: Type,
      group: "Text",
      run: (editor) => editor.chain().focus().setParagraph().run(),
    },
    {
      id: "h1",
      label: "Large heading",
      description: "Heading 1",
      icon: Heading1,
      group: "Text",
      run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      id: "h2",
      label: "Medium heading",
      description: "Heading 2",
      icon: Heading2,
      group: "Text",
      run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      label: "Small heading",
      description: "Heading 3",
      icon: Heading3,
      group: "Text",
      run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
    },
  ],
};

/** Bullet + ordered lists. */
export const listsFeature: EditorFeature = {
  id: "lists",
  starterKit: { bulletList: {}, orderedList: {}, listItem: {} },
  slash: [
    {
      id: "bulletList",
      label: "Bullet list",
      description: "Create a bulleted list",
      icon: List,
      group: "List",
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "orderedList",
      label: "Ordered list",
      description: "Create a numbered list",
      icon: ListOrdered,
      group: "List",
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
  ],
};

/** Block quote. */
export const blockquoteFeature: EditorFeature = {
  id: "blockquote",
  starterKit: { blockquote: {} },
  slash: [
    {
      id: "blockquote",
      label: "Block quote",
      description: "Add a quote block",
      icon: TextQuote,
      group: "Text",
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
  ],
};

/** Syntax-highlighted code block (replaces StarterKit's plain code block). */
export const codeBlockFeature: EditorFeature = {
  id: "codeBlock",
  starterKit: { codeBlock: false },
  extensions: () => [CustomCodeBlock.configure({ lowlight })],
  slash: [
    {
      id: "codeBlock",
      label: "Code block",
      description: "Add a code block",
      icon: Code,
      group: "Text",
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
  ],
};

/** Horizontal rule / divider. */
export const horizontalRuleFeature: EditorFeature = {
  id: "horizontalRule",
  starterKit: { horizontalRule: {} },
  slash: [
    {
      id: "divider",
      label: "Divider",
      description: "Insert a horizontal rule",
      icon: Minus,
      group: "Layout",
      run: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
  ],
};

/** Left / center / right text alignment. */
export const alignFeature: EditorFeature = {
  id: "align",
  extensions: () => [TextAlign.configure({ types: ["heading", "paragraph"] })],
};
