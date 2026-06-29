"use client";

import type { Editor } from "@tiptap/react";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Grid2x2,
  List,
  ListOrdered,
  Minus,
  TextQuote,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CommandGroup = "Text" | "List" | "Layout";

type SlashCommand = {
  label: string;
  description: string;
  icon: typeof Type;
  group: CommandGroup;
  run: (editor: Editor) => void;
};

const COMMANDS: SlashCommand[] = [
  {
    label: "Text",
    description: "Plain paragraph",
    icon: Type,
    group: "Text",
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    label: "Large heading",
    description: "Heading 1",
    icon: Heading1,
    group: "Text",
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    label: "Medium heading",
    description: "Heading 2",
    icon: Heading2,
    group: "Text",
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    label: "Small heading",
    description: "Heading 3",
    icon: Heading3,
    group: "Text",
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    label: "Block quote",
    description: "Add a quote block",
    icon: TextQuote,
    group: "Text",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    description: "Add a code block",
    icon: Code,
    group: "Text",
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: "Bullet list",
    description: "Create a bulleted list",
    icon: List,
    group: "List",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Ordered list",
    description: "Create a numbered list",
    icon: ListOrdered,
    group: "List",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
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
  {
    label: "Divider",
    description: "Insert a horizontal rule",
    icon: Minus,
    group: "Layout",
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

const COMMAND_GROUPS: CommandGroup[] = ["Text", "List", "Layout"];

type MenuState = { from: number; query: string; left: number; top: number };

export function SlashCommandMenu({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
      "\ufffc"
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
      COMMANDS.filter((command) =>
        `${command.label} ${command.description}`
          .toLowerCase()
          .includes(menu?.query ?? "")
      ),
    [menu?.query]
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

  if (!menu) return null;

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
          COMMAND_GROUPS.map((group) => {
            const commands = filteredCommands.filter(
              (command) => command.group === group
            );
            if (!commands.length) return null;

            return (
              <div key={group}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {group}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {commands.map((command) => {
                    const index = filteredCommands.indexOf(command);
                    const Icon = command.icon;
                    return (
                      <DropdownMenuItem
                        key={command.label}
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
