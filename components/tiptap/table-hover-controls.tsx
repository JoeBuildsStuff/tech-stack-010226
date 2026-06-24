"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { moveTableColumn, moveTableRow } from "@tiptap/pm/tables";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TableHoverControlsProps {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
}

interface CellInfo {
  node: ProseMirrorNode;
  position: number;
}

interface TableInfo {
  tablePosition: number;
  rows: CellInfo[][];
}

interface TableControlsPosition {
  tableIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
  rowIndex: number;
  columnIndex: number;
  rowTop: number;
  rowHeight: number;
  columnLeft: number;
  columnWidth: number;
}

type TableAxis = "column" | "row";
type HorizontalAlign = "left" | "center" | "right";
type VerticalAlign = "top" | "middle" | "bottom";

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

function getTableInfo(editor: Editor, tableIndex: number): TableInfo | null {
  let currentTableIndex = -1;
  let tableInfo: TableInfo | null = null;

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "table") {
      return true;
    }

    currentTableIndex += 1;

    if (currentTableIndex !== tableIndex) {
      return currentTableIndex < tableIndex;
    }

    const rows: CellInfo[][] = [];
    let rowOffset = 0;

    for (let rowIndex = 0; rowIndex < node.childCount; rowIndex += 1) {
      const row = node.child(rowIndex);
      const cells: CellInfo[] = [];
      let cellOffset = 0;

      for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
        const cell = row.child(cellIndex);

        cells.push({
          node: cell,
          position: position + 2 + rowOffset + cellOffset,
        });

        cellOffset += cell.nodeSize;
      }

      rows.push(cells);
      rowOffset += row.nodeSize;
    }

    tableInfo = {
      tablePosition: position,
      rows,
    };

    return false;
  });

  return tableInfo;
}

function getCellIndexesFromDom(cell: HTMLTableCellElement) {
  const row = cell.parentElement;

  if (!(row instanceof HTMLTableRowElement)) {
    return null;
  }

  const section = row.parentElement;
  const rows =
    section instanceof HTMLTableSectionElement
      ? Array.from(section.querySelectorAll(":scope > tr"))
      : Array.from(row.closest("table")?.rows ?? []);

  return {
    rowIndex: rows.indexOf(row),
    columnIndex: Array.from(row.cells).indexOf(cell),
  };
}

function getColumnRect(table: HTMLTableElement, columnIndex: number) {
  const cells = Array.from(table.rows)
    .map((row) => row.cells[columnIndex])
    .filter((cell): cell is HTMLTableCellElement => Boolean(cell));

  if (cells.length === 0) {
    return null;
  }

  const left = Math.min(
    ...cells.map((cell) => cell.getBoundingClientRect().left)
  );
  const right = Math.max(
    ...cells.map((cell) => cell.getBoundingClientRect().right)
  );

  return { left, width: right - left };
}

function getRowRect(table: HTMLTableElement, rowIndex: number) {
  const row = table.rows[rowIndex];

  if (!row) {
    return null;
  }

  const rect = row.getBoundingClientRect();

  return { top: rect.top, height: rect.height };
}

function getTargetCells(info: TableInfo, axis: TableAxis, index: number) {
  if (axis === "column") {
    return info.rows
      .map((row) => row[index])
      .filter((cell): cell is CellInfo => Boolean(cell));
  }

  return info.rows[index] ?? [];
}

function copyNode(node: ProseMirrorNode) {
  return node.type.create(node.attrs, node.content, node.marks);
}

export function TableHoverControls({
  editor,
  containerRef,
}: TableHoverControlsProps) {
  const [position, setPosition] = useState<TableControlsPosition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTableRef = useRef<HTMLTableElement | null>(null);

  const updatePosition = useCallback(
    (
      table: HTMLTableElement,
      rowIndex = position?.rowIndex ?? 0,
      columnIndex = position?.columnIndex ?? 0
    ) => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const tableIndex = getTableIndex(editor, table);
      const rowRect = getRowRect(table, rowIndex);
      const columnRect = getColumnRect(table, columnIndex);

      if (tableIndex < 0 || !rowRect || !columnRect) {
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
        rowIndex,
        columnIndex,
        rowTop: rowRect.top - tableRect.top,
        rowHeight: rowRect.height,
        columnLeft: columnRect.left - tableRect.left,
        columnWidth: columnRect.width,
      });
    },
    [containerRef, editor, position?.columnIndex, position?.rowIndex]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }

      if (target.closest(`[${TABLE_CONTROLS_ATTR}]`)) {
        if (activeTableRef.current) {
          updatePosition(activeTableRef.current);
        }
        return;
      }

      const cell = target.closest(".ProseMirror th, .ProseMirror td");
      const table =
        target.closest(".ProseMirror table") ??
        getNearbyTable(editor, event.clientX, event.clientY);

      if (table instanceof HTMLTableElement) {
        if (cell instanceof HTMLTableCellElement) {
          const indexes = getCellIndexesFromDom(cell);

          if (indexes && indexes.rowIndex >= 0 && indexes.columnIndex >= 0) {
            updatePosition(table, indexes.rowIndex, indexes.columnIndex);
            return;
          }
        }

        updatePosition(table);
      } else if (!menuOpen) {
        activeTableRef.current = null;
        setPosition(null);
      }
    },
    [editor, menuOpen, updatePosition]
  );

  const handlePointerLeave = useCallback(() => {
    if (menuOpen) {
      return;
    }

    activeTableRef.current = null;
    setPosition(null);
  }, [menuOpen]);

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

  const getTablePartContext = useCallback(
    (axis: TableAxis) => {
      if (!position) {
        return null;
      }

      const info = getTableInfo(editor, position.tableIndex);

      if (!info) {
        return null;
      }

      const targetCells = getTargetCells(
        info,
        axis,
        axis === "column" ? position.columnIndex : position.rowIndex
      );

      if (targetCells.length === 0) {
        return null;
      }

      return { info, targetCells };
    },
    [editor, position]
  );

  const focusTablePart = useCallback(
    (axis: TableAxis) => {
      const context = getTablePartContext(axis);

      if (!context) {
        return null;
      }

      editor
        .chain()
        .focus()
        .setTextSelection(context.targetCells[0].position + 1)
        .run();

      return context;
    },
    [editor, getTablePartContext]
  );

  const selectTablePart = useCallback(
    (axis: TableAxis) => {
      const context = getTablePartContext(axis);

      if (!context) {
        return null;
      }

      const anchorCell = context.targetCells[0].position;
      const headCell =
        context.targetCells[context.targetCells.length - 1].position;

      editor
        .chain()
        .focus()
        .setCellSelection({
          anchorCell,
          headCell,
        })
        .run();

      return context;
    },
    [editor, getTablePartContext]
  );

  const refreshPosition = useCallback(() => {
    requestAnimationFrame(() => {
      if (activeTableRef.current) {
        updatePosition(activeTableRef.current);
      }
    });
  }, [updatePosition]);

  const runCommand = useCallback(
    (axis: TableAxis, command: string) => {
      if (!position) {
        return;
      }

      const context = focusTablePart(axis);

      if (!context) {
        return;
      }

      const { info, targetCells } = context;
      const columnCount = info.rows[0]?.length ?? 0;
      const rowCount = info.rows.length;

      if (axis === "column") {
        if (command === "move-before" && position.columnIndex > 0) {
          moveTableColumn({
            from: position.columnIndex,
            to: position.columnIndex - 1,
            pos: info.tablePosition + 1,
          })(editor.state, editor.view.dispatch);
        }

        if (
          command === "move-after" &&
          position.columnIndex < columnCount - 1
        ) {
          moveTableColumn({
            from: position.columnIndex,
            to: position.columnIndex + 1,
            pos: info.tablePosition + 1,
          })(editor.state, editor.view.dispatch);
        }

        if (command === "insert-before") {
          editor.chain().focus().addColumnBefore().run();
        }

        if (command === "insert-after") {
          editor.chain().focus().addColumnAfter().run();
        }

        if (command === "duplicate") {
          const sourceNodes = targetCells.map((cell) => copyNode(cell.node));
          editor.chain().focus().addColumnAfter().run();

          const updatedInfo = getTableInfo(editor, position.tableIndex);
          const nextCells = updatedInfo
            ? getTargetCells(updatedInfo, "column", position.columnIndex + 1)
            : [];
          const tr = editor.state.tr;

          [...nextCells].reverse().forEach((cell, reverseIndex) => {
            const sourceNode = sourceNodes[nextCells.length - 1 - reverseIndex];

            if (sourceNode) {
              tr.replaceWith(
                cell.position,
                cell.position + cell.node.nodeSize,
                sourceNode
              );
            }
          });

          if (tr.docChanged) {
            editor.view.dispatch(tr);
          }
        }

        if (command === "delete") {
          editor.chain().focus().deleteColumn().run();
        }
      }

      if (axis === "row") {
        if (command === "move-before" && position.rowIndex > 0) {
          moveTableRow({
            from: position.rowIndex,
            to: position.rowIndex - 1,
            pos: info.tablePosition + 1,
          })(editor.state, editor.view.dispatch);
        }

        if (command === "move-after" && position.rowIndex < rowCount - 1) {
          moveTableRow({
            from: position.rowIndex,
            to: position.rowIndex + 1,
            pos: info.tablePosition + 1,
          })(editor.state, editor.view.dispatch);
        }

        if (command === "insert-before") {
          editor.chain().focus().addRowBefore().run();
        }

        if (command === "insert-after") {
          editor.chain().focus().addRowAfter().run();
        }

        if (command === "duplicate") {
          const sourceRow = info.rows[position.rowIndex];
          const firstCell = sourceRow?.[0];
          const rowNode = firstCell
            ? editor.state.doc.resolve(firstCell.position).node(-1)
            : null;

          editor.chain().focus().addRowAfter().run();

          const updatedInfo = getTableInfo(editor, position.tableIndex);
          const nextRow = updatedInfo?.rows[position.rowIndex + 1];

          if (rowNode && nextRow?.[0]) {
            const targetRow = editor.state.doc
              .resolve(nextRow[0].position)
              .node(-1);
            const rowPosition = nextRow[0].position - 1;
            const tr = editor.state.tr.replaceWith(
              rowPosition,
              rowPosition + targetRow.nodeSize,
              copyNode(rowNode)
            );

            editor.view.dispatch(tr);
          }
        }

        if (command === "delete") {
          editor.chain().focus().deleteRow().run();
        }
      }

      refreshPosition();
    },
    [editor, position, refreshPosition, focusTablePart]
  );

  const setAlignment = useCallback(
    (axis: TableAxis, direction: HorizontalAlign | VerticalAlign) => {
      const selection = selectTablePart(axis);

      if (!selection) {
        return;
      }

      const isVertical =
        direction === "top" || direction === "middle" || direction === "bottom";

      editor
        .chain()
        .focus()
        .setCellAttribute(
          isVertical ? "verticalAlign" : "horizontalAlign",
          direction
        )
        .run();
    },
    [editor, selectTablePart]
  );

  const addTablePart = useCallback(
    (axis: TableAxis) => {
      if (!position) {
        return;
      }

      if (!focusTablePart(axis)) {
        return;
      }

      if (axis === "column") {
        editor.chain().focus().addColumnAfter().run();
      } else {
        editor.chain().focus().addRowAfter().run();
      }

      refreshPosition();
    },
    [editor, position, refreshPosition, focusTablePart]
  );

  if (!position) {
    return null;
  }

  const columnMenuLabel = `Column ${position.columnIndex + 1} options`;
  const rowMenuLabel = `Row ${position.rowIndex + 1} options`;

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
      {/* Column menu button: hover control above the active table column. */}
      <TableHandleMenu
        axis="column"
        label={columnMenuLabel}
        className="absolute -top-4 flex h-7 items-start justify-center"
        style={{
          left: position.columnLeft,
          width: position.columnWidth,
        }}
        onOpenChange={setMenuOpen}
        onCommand={(command) => runCommand("column", command)}
        onAlign={(alignment) => setAlignment("column", alignment)}
      />

      {/* Row menu button: hover control to the left of the active table row. */}
      <TableHandleMenu
        axis="row"
        label={rowMenuLabel}
        className="absolute -left-4 flex w-7 items-center justify-start"
        style={{
          top: position.rowTop,
          height: position.rowHeight,
        }}
        onOpenChange={setMenuOpen}
        onCommand={(command) => runCommand("row", command)}
        onAlign={(alignment) => setAlignment("row", alignment)}
      />

      {/* Add column button: plus control on the right edge of the table. */}
      <div className="pointer-events-auto absolute -right-4 top-0 flex h-full w-7 items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          className="m-0 flex h-full w-3 shrink-0 items-center justify-center rounded-sm bg-muted/80 p-0 text-muted-foreground opacity-80 shadow-sm ring-1 ring-border transition-opacity hover:bg-accent hover:text-primary hover:opacity-100"
          aria-label="Add column"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => addTablePart("column")}
        >
          <span className="text-xs">+</span>
        </Button>
      </div>

      {/* Add row button: plus control on the bottom edge of the table. */}
      <div className="pointer-events-auto absolute -bottom-4 left-0 flex h-7 w-full items-end justify-center">
        <Button
          type="button"
          variant="ghost"
          className="m-0 flex h-3 w-full shrink-0 items-center justify-center rounded-sm bg-muted/80 p-0 text-muted-foreground opacity-80 shadow-sm ring-1 ring-border transition-opacity hover:bg-accent hover:text-primary hover:opacity-100"
          aria-label="Add row"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => addTablePart("row")}
        >
          <span className="text-xs">+</span>
        </Button>
      </div>
    </div>
  );
}

function TableHandleMenu({
  axis,
  label,
  className,
  style,
  onOpenChange,
  onCommand,
  onAlign,
}: {
  axis: TableAxis;
  label: string;
  className: string;
  style: CSSProperties;
  onOpenChange: (open: boolean) => void;
  onCommand: (command: string) => void;
  onAlign: (alignment: HorizontalAlign | VerticalAlign) => void;
}) {
  const isColumn = axis === "column";
  const handleColorClassName =
    "bg-muted/80 text-muted-foreground ring-border opacity-80 hover:bg-accent hover:text-primary hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-primary";
  const handleSizeClassName = isColumn
    ? "h-3 w-full shrink-0"
    : "h-full w-3 shrink-0";

  return (
    <div className={`pointer-events-auto ${className}`} style={style}>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={`m-0 flex items-center justify-center rounded-sm p-0 shadow-sm ring-1 transition-opacity ${handleSizeClassName} ${handleColorClassName}`}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
          >
            <span className="text-xs font-bold">{isColumn ? "⋯" : "⋮"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isColumn ? "center" : "start"}
          side={isColumn ? "top" : "left"}
          className="w-52"
        >
          <DropdownMenuItem onSelect={() => onCommand("move-before")}>
            {isColumn ? (
              <ArrowLeft className="size-4" />
            ) : (
              <ArrowUp className="size-4" />
            )}
            {isColumn ? "Move column left" : "Move row up"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand("move-after")}>
            {isColumn ? (
              <ArrowRight className="size-4" />
            ) : (
              <ArrowDown className="size-4" />
            )}
            {isColumn ? "Move column right" : "Move row down"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand("insert-before")}>
            {isColumn ? (
              <ArrowLeftToLine className="size-4" />
            ) : (
              <ArrowUpToLine className="size-4" />
            )}
            {isColumn ? "Insert column left" : "Insert row above"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand("insert-after")}>
            {isColumn ? (
              <ArrowRightToLine className="size-4" />
            ) : (
              <ArrowDownToLine className="size-4" />
            )}
            {isColumn ? "Insert column right" : "Insert row below"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <AlignJustify className="size-4" />
              Alignment
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem onSelect={() => onAlign("left")}>
                <AlignLeft className="size-4" />
                Align Left
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAlign("center")}>
                <AlignCenter className="size-4" />
                Align Center
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAlign("right")}>
                <AlignRight className="size-4" />
                Align Right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAlign("top")}>
                <ArrowUp className="size-4" />
                Align Top
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAlign("middle")}>
                <AlignJustify className="size-4" />
                Align Middle
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAlign("bottom")}>
                <ArrowDown className="size-4" />
                Align Bottom
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand("duplicate")}>
            <Copy className="size-4" />
            {isColumn ? "Duplicate column" : "Duplicate row"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onCommand("delete")}
          >
            <Trash2 className="size-4" />
            {isColumn ? "Delete column" : "Delete row"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
