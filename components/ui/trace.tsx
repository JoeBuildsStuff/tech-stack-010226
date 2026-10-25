"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

function Trace({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="trace"
      className={cn("flex flex-col gap-1.5 text-sm font-light", className)}
      {...props}
    />
  );
}

type TraceLineStatus = "running" | "error" | "pending";

function TraceLine({
  status,
  className,
  ...props
}: React.ComponentProps<"span"> & { status?: TraceLineStatus }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "group/trace-line flex w-full items-center gap-2 text-muted-foreground",
        status === "error" && "text-destructive",
        status === "pending" && "opacity-60",
        className
      )}
      {...props}
    />
  );
}

function TraceIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-title"
      className={cn(
        "min-w-0 flex-1 truncate text-left",
        "group-data-[status=running]/trace-line:animate-pulse",
        className
      )}
      {...props}
    />
  );
}

function TraceDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function TraceCollapsible({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="trace-collapsible"
      className={cn("text-sm font-light wrap-break-word", className)}
      {...props}
    />
  );
}

function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        data-slot="trace-collapsible-trigger"
        className={cn(
          "group/trace-collapsible-trigger flex w-full cursor-pointer items-center gap-2 text-left transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/trace-collapsible-trigger:rotate-180"
          strokeWidth={1.5}
        />
      </button>
    </CollapsibleTrigger>
  );
}

function TraceCollapsibleContent({
  className,
  keepMounted = false,
  ...props
}: React.ComponentProps<typeof CollapsibleContent> & {
  keepMounted?: boolean;
}) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      forceMount={keepMounted ? true : undefined}
      className={cn(
        "mt-2 space-y-2 pl-6 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
};
