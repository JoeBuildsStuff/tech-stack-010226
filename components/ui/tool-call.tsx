"use client";

import * as React from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function ToolCallCode({
  value,
  copyLabel = "Copied to clipboard",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value: string;
  copyLabel?: string;
}) {
  return (
    <div
      data-slot="tool-call-code"
      className={cn("relative px-2 pb-2", className)}
      {...props}
    >
      <pre className="max-w-full overflow-x-auto p-2 text-xs break-words whitespace-pre-wrap">
        {value}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 h-6 w-6 p-0"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success(copyLabel);
        }}
      >
        <CopyIcon className="size-3" strokeWidth={1.5} />
      </Button>
    </div>
  );
}

export { ToolCallCode };
