"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TableHoverControlsProps {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
}

interface TableControlsPosition {
  tableIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

type TableEdge = "column" | "row";

const TABLE_CONTROLS_ATTR = "data-table-hover-controls";
const TABLE_HOVER_PROXIMITY = 40;

function getTableIndex(editor: Editor, table: HTMLTableElement) {
  return Array.from(editor.view.dom.querySelectorAll("table")).indexOf(table);
}

function getNearbyTable(editor: Editor, clientX: number, clientY: number) {
  const tables = Array.from(editor.view.dom.querySelectorAll("table"));

  return (
    tables.find((table) => {
      const rect = table.getBoundingClientRect();

      return (
        clientX >= rect.left - TABLE_HOVER_PROXIMITY &&
        clientX <= rect.right + TABLE_HOVER_PROXIMITY &&
        clientY >= rect.top - TABLE_HOVER_PROXIMITY &&
        clientY <= rect.bottom + TABLE_HOVER_PROXIMITY
      );
    }) ?? null
  );
}

function getEdgeCellPosition(editor: Editor, tableIndex: number, edge: TableEdge) {
  let currentTableIndex = -1;
  let targetCellPosition: number | null = null;

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "table") {
      currentTableIndex += 1;

      if (currentTableIndex > tableIndex) {
        return false;
      }
    }

    if (currentTableIndex !== tableIndex || targetCellPosition !== null) {
      return true;
    }

    if (edge === "column") {
      const firstRow = node.type.name === "table" ? node.firstChild : null;

      if (!firstRow) {
        return true;
      }

      const lastCellIndex = firstRow.childCount - 1;
      let cellOffset = 0;

      for (let index = 0; index < firstRow.childCount; index += 1) {
        if (index === lastCellIndex) {
          targetCellPosition = position + 2 + cellOffset;
          return false;
        }

        cellOffset += firstRow.child(index).nodeSize;
      }

      return true;
    }

    if (edge === "row" && node.type.name === "table") {
      const lastRowIndex = node.childCount - 1;
      let rowOffset = 0;

      for (let rowIndex = 0; rowIndex < node.childCount; rowIndex += 1) {
        const row = node.child(rowIndex);

        if (rowIndex === lastRowIndex && row.firstChild) {
          targetCellPosition = position + 2 + rowOffset;
          return false;
        }

        rowOffset += row.nodeSize;
      }
    }

    return true;
  });

  return targetCellPosition;
}

export function TableHoverControls({
  editor,
  containerRef,
}: TableHoverControlsProps) {
  const [position, setPosition] = useState<TableControlsPosition | null>(null);
  const activeTableRef = useRef<HTMLTableElement | null>(null);

  const updatePosition = useCallback(
    (table: HTMLTableElement) => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const tableIndex = getTableIndex(editor, table);

      if (tableIndex < 0) {
        setPosition(null);
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      activeTableRef.current = table;
      setPosition({
        tableIndex,
        top: tableRect.top - containerRect.top,
        left: tableRect.left - containerRect.left,
        width: tableRect.width,
        height: tableRect.height,
      });
    },
    [containerRef, editor]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }

      if (target.closest(`[${TABLE_CONTROLS_ATTR}]`)) {
        return;
      }

      const table =
        target.closest(".ProseMirror table") ??
        getNearbyTable(editor, event.clientX, event.clientY);

      if (table instanceof HTMLTableElement) {
        updatePosition(table);
      } else {
        activeTableRef.current = null;
        setPosition(null);
      }
    },
    [editor, updatePosition]
  );

  const handlePointerLeave = useCallback(() => {
    activeTableRef.current = null;
    setPosition(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [containerRef, handlePointerLeave, handlePointerMove]);

  useEffect(() => {
    if (!position || !activeTableRef.current) {
      return;
    }

    const updateActivePosition = () => {
      if (activeTableRef.current) {
        updatePosition(activeTableRef.current);
      }
    };

    window.addEventListener("resize", updateActivePosition);

    return () => {
      window.removeEventListener("resize", updateActivePosition);
    };
  }, [position, updatePosition]);

  const addTablePart = (edge: TableEdge) => {
    if (!position) {
      return;
    }

    const cellPosition = getEdgeCellPosition(editor, position.tableIndex, edge);

    if (cellPosition === null) {
      return;
    }

    const chain = editor.chain().focus().setCellSelection({
      anchorCell: cellPosition,
    });

    if (edge === "column") {
      chain.addColumnAfter().run();
    } else {
      chain.addRowAfter().run();
    }

    requestAnimationFrame(() => {
      if (activeTableRef.current) {
        updatePosition(activeTableRef.current);
      }
    });
  };

  if (!position) {
    return null;
  }

  return (
    <div
      {...{ [TABLE_CONTROLS_ATTR]: "" }}
      className="pointer-events-none absolute z-20"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
      }}
    >
      <div
        className="pointer-events-auto absolute -right-8 top-0 flex h-full w-8 items-center justify-end"
        onPointerMove={() => {
          if (activeTableRef.current) {
            updatePosition(activeTableRef.current);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="flex h-full w-6 items-center justify-center rounded-md bg-muted/80 p-0 text-muted-foreground opacity-80 shadow-sm transition-opacity hover:text-foreground hover:opacity-100"
              aria-label="Add column"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addTablePart("column")}
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Add column</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="pointer-events-auto absolute -bottom-8 left-0 flex h-8 w-full items-end justify-center"
        onPointerMove={() => {
          if (activeTableRef.current) {
            updatePosition(activeTableRef.current);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="flex h-6 w-full items-center justify-center rounded-md bg-muted/80 p-0 text-muted-foreground opacity-80 shadow-sm transition-opacity hover:text-foreground hover:opacity-100"
              aria-label="Add row"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addTablePart("row")}
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add row</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
