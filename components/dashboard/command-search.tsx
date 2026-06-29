"use client";

import { useEffect, useState, useMemo, ReactNode } from "react";
import { Search, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CommandOption {
  id: string | number;
  label: string;
  keywords?: string[];
  icon?: LucideIcon | ReactNode;
  shortcut?: string | number;
  metadata?: Record<string, unknown>;
}

export interface CommandGroupConfig {
  id: string;
  heading: string;
  options: CommandOption[];
  filterFn?: (options: CommandOption[], query: string) => CommandOption[];
  limit?: number;
}

export interface CommandSearchProps {
  /**
   * Array of command groups to display
   */
  groups: CommandGroupConfig[];
  /**
   * Callback when a command option is selected
   */
  onSelect?: (option: CommandOption, groupId: string) => void;
  /**
   * Callback when search query changes
   */
  onSearch?: (query: string) => void;
  /**
   * Controlled search value
   */
  searchValue?: string;
  /**
   * Callback when search value changes
   */
  onSearchValueChange?: (value: string) => void;
  /**
   * Placeholder text for the search input
   */
  placeholder?: string;
  /**
   * Placeholder text for the trigger button
   */
  buttonPlaceholder?: string;
  /**
   * Aria label for the trigger button
   */
  buttonAriaLabel?: string;
  /**
   * Whether to show the search action item
   */
  showSearchAction?: boolean;
  /**
   * Custom render function for command items
   */
  renderItem?: (option: CommandOption, groupId: string) => ReactNode;
  /**
   * Popover width
   */
  popoverWidth?: string;
  /**
   * Maximum height for the command list
   */
  maxHeight?: string;
}

const defaultFilterFn = (
  options: CommandOption[],
  query: string
): CommandOption[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) => {
    const labelMatch = option.label.toLowerCase().includes(normalizedQuery);
    const keywordMatch = option.keywords?.some((keyword) =>
      keyword.toLowerCase().includes(normalizedQuery)
    );
    return labelMatch || keywordMatch;
  });
};

export default function CommandSearch({
  groups,
  onSelect,
  onSearch,
  searchValue: controlledSearchValue,
  onSearchValueChange,
  placeholder = "Type a command or search...",
  buttonPlaceholder = "Search...",
  buttonAriaLabel = "Search",
  showSearchAction = true,
  renderItem,
  popoverWidth = "w-[400px]",
  maxHeight = "max-h-[300px]",
}: CommandSearchProps) {
  const [open, setOpen] = useState(false);
  const [internalSearchValue, setInternalSearchValue] = useState("");

  const searchValue = controlledSearchValue ?? internalSearchValue;
  const setSearchValue = onSearchValueChange ?? setInternalSearchValue;

  // Detect Mac after mount to avoid SSR/client hydration mismatch
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      navigator.platform.toUpperCase().indexOf("MAC") >= 0 ||
        /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
    );
  }, []);

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    return groups.map((group) => {
      const filterFn = group.filterFn ?? defaultFilterFn;
      const filtered = filterFn(group.options, searchValue);
      const limit = group.limit ?? filtered.length;
      return {
        ...group,
        filteredOptions: filtered.slice(0, limit),
      };
    });
  }, [groups, searchValue]);

  const hasResults =
    filteredGroups.some((group) => group.filteredOptions.length > 0) ||
    (showSearchAction && searchValue.trim().length > 0);

  const handleSelectOption = (option: CommandOption, groupId: string) => {
    onSelect?.(option, groupId);
  };

  const handleSelectSearch = (value: string) => {
    onSearch?.(value);
    setOpen(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  const defaultRenderItem = (option: CommandOption) => {
    const Icon = option.icon;
    return (
      <>
        {Icon && typeof Icon === "function" ? (
          <Icon className="size-4" />
        ) : Icon ? (
          Icon
        ) : null}
        <span>{option.label}</span>
        {option.shortcut !== undefined && (
          <CommandShortcut>{option.shortcut}</CommandShortcut>
        )}
      </>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 h-7 text-muted-foreground hover:text-foreground justify-between shadow-none"
          aria-label={buttonAriaLabel}
        >
          <div className="flex items-center gap-2">
            <Search className="size-3" />
            <span className="text-xs">{buttonPlaceholder}</span>
          </div>
          <KbdGroup>
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${popoverWidth} p-0 rounded-xl`} align="end">
        <Command shouldFilter={false} className="rounded-xl">
          <CommandInput
            placeholder={placeholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <ScrollArea className={maxHeight}>
              {!hasResults && <CommandEmpty>No results found.</CommandEmpty>}

              {filteredGroups.map((group, groupIndex) => {
                if (group.filteredOptions.length === 0) return null;

                return (
                  <div key={group.id}>
                    {groupIndex > 0 && <CommandSeparator />}
                    <CommandGroup heading={group.heading}>
                      {group.filteredOptions.map((option) => {
                        const itemContent = renderItem
                          ? renderItem(option, group.id)
                          : defaultRenderItem(option);

                        return (
                          <CommandItem
                            key={option.id}
                            value={`${group.id}-${option.id}`}
                            onSelect={() =>
                              handleSelectOption(option, group.id)
                            }
                            keywords={option.keywords}
                          >
                            {itemContent}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </div>
                );
              })}

              {showSearchAction && searchValue.trim() && (
                <>
                  {filteredGroups.some(
                    (group) => group.filteredOptions.length > 0
                  ) && <CommandSeparator />}
                  <CommandGroup heading="Search">
                    <CommandItem
                      value={`search-${searchValue}`}
                      onSelect={() => handleSelectSearch(searchValue)}
                      keywords={[searchValue]}
                    >
                      <Search />
                      <span>Search for &quot;{searchValue}&quot;</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
