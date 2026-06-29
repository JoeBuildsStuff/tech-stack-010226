"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SlashCommand } from "@/components/tiptap/features/types";

type MenuState = { from: number; query: string; left: number; top: number };

export function SlashCommandMenu({
  editor,
  commands,
}: {
  editor: Editor;
  commands: SlashCommand[];
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const command of commands) {
      if (!seen.includes(command.group)) {
        seen.push(command.group);
      }
    }
    return seen;
  }, [commands]);

  const updateMenu = useCallback(() => {
    const { $from, empty } = editor.state.selection;
    if (!empty || !$from.parent.isTextblock) {
      setMenu(null);
      return;
    }

    const textBeforeCursor = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "￼"
    );
    const currentLine = textBeforeCursor.slice(
      textBeforeCursor.lastIndexOf("\n") + 1
    );
    if (!currentLine.startsWith("/") || currentLine.includes(" ")) {
      setMenu(null);
      return;
    }

    const coords = editor.view.coordsAtPos($from.pos);
    setMenu({
      from: $from.pos - currentLine.length,
      query: currentLine.slice(1).toLowerCase(),
      left: coords.left,
      top: coords.bottom + 6,
    });
  }, [editor]);

  const filteredCommands = useMemo(
    () =>
      commands.filter((command) =>
        `${command.label} ${command.description}`
          .toLowerCase()
          .includes(menu?.query ?? "")
      ),
    [commands, menu?.query]
  );

  const chooseCommand = useCallback(
    (command: SlashCommand) => {
      if (!menu) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: menu.from, to: editor.state.selection.from })
        .run();
      command.run(editor);
      setMenu(null);
    },
    [editor, menu]
  );

  useEffect(() => {
    editor.on("transaction", updateMenu);
    window.addEventListener("resize", updateMenu);
    window.addEventListener("scroll", updateMenu, true);
    return () => {
      editor.off("transaction", updateMenu);
      window.removeEventListener("resize", updateMenu);
      window.removeEventListener("scroll", updateMenu, true);
    };
  }, [editor, updateMenu]);

  useEffect(() => {
    if (!menu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex(
          (index) => (index + 1) % Math.max(filteredCommands.length, 1)
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (index) =>
            (index - 1 + Math.max(filteredCommands.length, 1)) %
            Math.max(filteredCommands.length, 1)
        );
      } else if (event.key === "Enter" && filteredCommands.length) {
        event.preventDefault();
        chooseCommand(filteredCommands[selectedIndex] ?? filteredCommands[0]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
      }
    };
    editor.view.dom.addEventListener("keydown", handleKeyDown, true);
    return () =>
      editor.view.dom.removeEventListener("keydown", handleKeyDown, true);
  }, [chooseCommand, editor, filteredCommands, menu, selectedIndex]);

  if (!menu || !commands.length) return null;

  const activeIndex = Math.min(
    selectedIndex,
    Math.max(filteredCommands.length - 1, 0)
  );

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) setMenu(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-px"
          style={{ left: menu.left, top: menu.top }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label="Insert block"
        align="start"
        side="bottom"
        sideOffset={0}
        className="w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {filteredCommands.length ? (
          groups.map((group) => {
            const groupCommands = filteredCommands.filter(
              (command) => command.group === group
            );
            if (!groupCommands.length) return null;

            return (
              <div key={group}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {group}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {groupCommands.map((command) => {
                    const index = filteredCommands.indexOf(command);
                    const Icon = command.icon;
                    return (
                      <DropdownMenuItem
                        key={command.id}
                        className={
                          index === activeIndex
                            ? "bg-accent text-accent-foreground"
                            : undefined
                        }
                        onSelect={() => chooseCommand(command)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <Icon />
                        <span>{command.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </div>
            );
          })
        ) : (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No matching blocks
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
