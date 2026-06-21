"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ScrollFadeAreaProps = {
  children: ReactNode;
  className?: string;
  scrollAreaClassName?: string;
  contentClassName?: string;
  watch?: unknown;
};

export function ScrollFadeArea({
  children,
  className,
  scrollAreaClassName,
  contentClassName,
  watch,
}: ScrollFadeAreaProps) {
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) return;

    const updateFade = () => {
      const nextFade = {
        top: viewport.scrollTop > 1,
        bottom:
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight >
          1,
      };

      setScrollFade((currentFade) =>
        currentFade.top === nextFade.top &&
        currentFade.bottom === nextFade.bottom
          ? currentFade
          : nextFade
      );
    };

    updateFade();
    viewport.addEventListener("scroll", updateFade, { passive: true });

    const resizeObserver = new ResizeObserver(updateFade);
    resizeObserver.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) resizeObserver.observe(content);

    return () => {
      viewport.removeEventListener("scroll", updateFade);
      resizeObserver.disconnect();
    };
  }, [watch]);

  return (
    <div className={cn("relative min-h-0", className)}>
      <ScrollArea
        ref={scrollAreaRef}
        className={cn("h-full w-full", scrollAreaClassName)}
      >
        <div className={contentClassName}>{children}</div>
      </ScrollArea>

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-background to-transparent transition-opacity duration-200 ease-out motion-reduce:transition-none",
          scrollFade.top ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-background to-transparent transition-opacity duration-200 ease-out motion-reduce:transition-none",
          scrollFade.bottom ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
