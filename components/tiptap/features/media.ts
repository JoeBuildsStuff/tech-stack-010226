import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table/row";
import { Grid2x2 } from "lucide-react";

import { FileNode } from "@/components/tiptap/file-node";
import { createFileHandlerConfig } from "@/components/tiptap/file-handler";

import { AlignedTableCell, AlignedTableHeader, ResizableImage } from "./extensions";
import type { EditorFeature } from "./types";

/** Hyperlinks (replaces StarterKit's bundled link). */
export const linkFeature: EditorFeature = {
  id: "link",
  starterKit: { link: false },
  extensions: () => [
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https"],
    }),
  ],
};

/** Tables with resizable columns and per-cell alignment. */
export const tableFeature: EditorFeature = {
  id: "table",
  extensions: () => [
    Table.configure({ resizable: true }),
    TableRow,
    AlignedTableCell,
    AlignedTableHeader,
  ],
  slash: [
    {
      id: "table",
      label: "Table",
      description: "Insert a table",
      icon: Grid2x2,
      group: "Layout",
      run: (editor) =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
          .run(),
    },
  ],
};

/** Inline images (resizable node view). */
export const imageFeature: EditorFeature = {
  id: "image",
  extensions: () => [ResizableImage],
};

/**
 * Drop/paste upload for images and non-image files. Inserts image nodes (needs
 * {@link imageFeature}) or fileNode nodes, and cleans up storage on delete.
 */
export const filesFeature: EditorFeature = {
  id: "files",
  extensions: (ctx) => [
    FileNode,
    createFileHandlerConfig({
      onFileDrop: ctx.onFileDrop,
      fileUploadConfig: ctx.upload
        ? {
            supabaseBucket: ctx.upload.supabaseBucket,
            pathPrefix: ctx.upload.pathPrefix,
            maxFileSize: ctx.upload.maxFileSize,
            allowedMimeTypes: ctx.upload.allowedMimeTypes,
          }
        : undefined,
    }),
  ],
};
