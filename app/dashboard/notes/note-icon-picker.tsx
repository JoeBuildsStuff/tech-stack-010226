"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  NOTE_ICON_OPTIONS,
  type NoteIconName,
  getNoteIconOption,
} from "@/lib/note-icons";

type NoteIconPickerProps = {
  iconName: NoteIconName;
  isUpdating?: boolean;
  onSelect: (iconName: NoteIconName) => void | Promise<void>;
};

export function NoteIconPicker({
  iconName,
  isUpdating = false,
  onSelect,
}: NoteIconPickerProps) {
  const activeIconOption = getNoteIconOption(iconName);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={isUpdating}
          aria-label="Select note icon"
          className="mb-1 flex size-[4.5rem] items-center justify-center rounded-lg p-0 text-foreground hover:bg-accent/60"
        >
          <activeIconOption.Icon className="size-10 stroke-[1.25]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit rounded-xl p-2" align="start">
        <div className="grid grid-cols-5 gap-1">
          {NOTE_ICON_OPTIONS.map((option) => (
            <Button
              key={option.name}
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                "relative h-9 w-9",
                iconName === option.name ? "bg-accent" : ""
              )}
              aria-label={`Use ${option.label} icon`}
              disabled={isUpdating}
              onClick={() => {
                void onSelect(option.name);
              }}
            >
              <option.Icon className="size-4" />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
