"use client";

import { Editor, useEditorState } from "@tiptap/react";
import {
  ArrowLeftToLine,
  ArrowUpToLine,
  ArrowRightToLine,
  ArrowDownToLine,
  Grid2x2,
  Grid2x2X,
  Columns3Cog,
  BetweenHorizonalStart,
  FoldHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TableButtonProps {
  editor: Editor;
  size?: "sm" | "default";
  className?: string;
}

const TableButton = ({
  editor,
  size = "sm",
  className = "",
}: TableButtonProps) => {
  const editorState = useEditorState({
    editor,
    selector: (state: { editor: Editor }) => ({
      isTable: state.editor.isActive("table"),
    }),
  });

  const handleInsertTable = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({
        rows: 2,
        cols: 2,
        withHeaderRow: true,
      })
      .run();
  };

  const handleAddColumnBefore = () => {
    if (!editor) return;
    editor.chain().focus().addColumnBefore().run();
  };

  const handleAddColumnAfter = () => {
    if (!editor) return;
    editor.chain().focus().addColumnAfter().run();
  };

  const handleAddRowBefore = () => {
    if (!editor) return;
    editor.chain().focus().addRowBefore().run();
  };

  const handleAddRowAfter = () => {
    if (!editor) return;
    editor.chain().focus().addRowAfter().run();
  };

  const handleDeleteColumn = () => {
    if (!editor) return;
    editor.chain().focus().deleteColumn().run();
  };

  const handleDeleteRow = () => {
    if (!editor) return;
    editor.chain().focus().deleteRow().run();
  };

  const handleDeleteTable = () => {
    if (!editor) return;
    editor.chain().focus().deleteTable().run();
  };

  const handleMergeCells = () => {
    if (!editor) return;
    editor.chain().focus().mergeCells().run();
  };

  const handleSplitCell = () => {
    if (!editor) return;
    editor.chain().focus().splitCell().run();
  };

  // If not in a table, show insert table button (no popover)
  if (!editorState.isTable) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Toggle
            size={size}
            className={className}
            pressed={false}
            onClick={handleInsertTable}
          >
            <Grid2x2 className="" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Insert Table <span className="ml-2">⌘T</span>
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // If in a table, show gear icon with popover of table editing options
  return (
    <Popover>
      <PopoverTrigger>
        <Tooltip>
          <TooltipTrigger>
            <Toggle
              size={size}
              className={className}
              pressed={editorState.isTable}
            >
              <Columns3Cog className="" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            <p>Table Options</p>
          </TooltipContent>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddColumnBefore}
            className="w-full justify-start"
          >
            <ArrowLeftToLine className="mr-2 h-4 w-4" />
            Add Column Before
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddColumnAfter}
            className="w-full justify-start"
          >
            <ArrowRightToLine className="mr-2 h-4 w-4" />
            Add Column After
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteColumn}
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <div className="mr-1 h-4 w-4 flex items-center justify-center">
              <div className="h-4 w-[.4rem] -ml-1 border border-destructive rounded-xs" />
            </div>
            Delete Column
          </Button>

          <Separator className="" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddRowBefore}
            className="w-full justify-start"
          >
            <ArrowUpToLine className="mr-2 h-4 w-4" />
            Add Row Above
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddRowAfter}
            className="w-full justify-start"
          >
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Add Row Below
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteRow}
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <div className="mr-1 h-4 w-4 flex items-center justify-center">
              <div className="h-[.4rem] w-4 -ml-1 border border-destructive rounded-xs" />
            </div>
            Delete Row
          </Button>

          <Separator className="" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSplitCell}
            className="w-full justify-start"
          >
            <BetweenHorizonalStart className="mr-2 h-4 w-4" />
            Split Cell
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMergeCells}
            className="w-full justify-start"
          >
            <FoldHorizontal className="mr-2 h-4 w-4" />
            Merge Cells
          </Button>

          <Separator className="" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteTable}
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <Grid2x2X className="mr-2 h-4 w-4" />
            Delete Table
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TableButton;
