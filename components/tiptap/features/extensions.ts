import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TableCell } from "@tiptap/extension-table/cell";
import { TableHeader } from "@tiptap/extension-table/header";
import { Image } from "@tiptap/extension-image";
import { createLowlight, common } from "lowlight";

import { CodeBlock } from "@/components/tiptap/code-block";
import { CustomImageView } from "@/components/tiptap/custom-image-view";

export const lowlight = createLowlight(common);

export const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlock);
  },
});

function tableCellAlignmentAttributes() {
  return {
    horizontalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        element.style.textAlign || element.getAttribute("data-horizontal-align"),
      renderHTML: (attributes: { horizontalAlign?: string | null }) =>
        attributes.horizontalAlign
          ? {
              "data-horizontal-align": attributes.horizontalAlign,
              style: `text-align: ${attributes.horizontalAlign};`,
            }
          : {},
    },
    verticalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        element.style.verticalAlign ||
        element.getAttribute("data-vertical-align"),
      renderHTML: (attributes: { verticalAlign?: string | null }) =>
        attributes.verticalAlign
          ? {
              "data-vertical-align": attributes.verticalAlign,
              style: `vertical-align: ${attributes.verticalAlign};`,
            }
          : {},
    },
  };
}

function mergeStyleAttributes(
  ...attributeSets: Array<Record<string, unknown> | null | undefined>
) {
  const merged = mergeAttributes(
    ...attributeSets.map((attributes) => {
      if (!attributes) {
        return {};
      }

      const rest = { ...attributes };
      delete rest.style;

      return rest;
    })
  );
  const style = attributeSets
    .map((attributes) => attributes?.style)
    .filter(
      (style): style is string => typeof style === "string" && style.length > 0
    )
    .join(" ");

  return style ? { ...merged, style } : merged;
}

export const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellAlignmentAttributes(),
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "td",
      mergeStyleAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

export const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...tableCellAlignmentAttributes(),
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeStyleAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width");
          if (!width) return null;
          const parsed = parseInt(width, 10);
          return Number.isNaN(parsed) ? null : parsed;
        },
        renderHTML: (attributes) =>
          attributes.width ? { width: String(attributes.width) } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute("height");
          if (!height) return null;
          const parsed = parseInt(height, 10);
          return Number.isNaN(parsed) ? null : parsed;
        },
        renderHTML: (attributes) =>
          attributes.height ? { height: String(attributes.height) } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CustomImageView);
  },
}).configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: {
    class: "tiptap-image",
  },
});
