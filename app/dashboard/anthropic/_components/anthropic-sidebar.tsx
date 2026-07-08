"use client";

import { AuthButton } from "@/components/auth-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Folders,
  MessagesSquare,
  PanelLeft,
  Plus,
  Code,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { AnthropicSidebarAction } from "./anthropic-sidebar-action";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const anthropicNavItems = [
  {
    title: "AI Design Sprint",
    url: "#",
  },
  {
    title: "Brainstorm with Claude",
    url: "#",
  },
  {
    title: "Marketing GPT",
    url: "#",
  },
  {
    title: "Startup Helper",
    url: "#",
  },
  {
    title: "Philosophy Debates",
    url: "#",
  },
  {
    title: "Travel Advisor",
    url: "#",
  },
  {
    title: "Code Reviewer",
    url: "#",
  },
  {
    title: "Book Summaries",
    url: "#",
  },
  // More made up chats can be added here!
];

export function AnthropicSidebar() {
  const pathname = usePathname();

  const {
    state,
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  } = useSidebar();

  console.log("Anthropic Sidebar State:", {
    state,
    open,
    openMobile,
    setOpen,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  });

  // Render sidebar content once to reuse
  const sidebarContent = (
    <>
      <SidebarHeader className="flex flex-row items-center justify-between">
        <span className="text-xl font-bold">Claude</span>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-auto">
        <SidebarGroup>
          <SidebarMenuItem>
            <SidebarMenuButton className="group" asChild>
              <Link href="/dashboard/anthropic/new">
                <div className="rounded-full bg-[#D97757] p-0.5">
                  <Plus className="size-4 text-white" />
                </div>

                <span>New Chat</span>

                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-75">
                  <span className="text-xs text-muted-foreground px-0.5">
                    ⇧⌘O
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton asChild>
              <Link href="/dashboard/anthropic/recents">
                <div className="rounded-full p-1">
                  <MessagesSquare className="size-4" />
                </div>
                <span>Chats</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton asChild>
              <Link href="/dashboard/anthropic/projects">
                <div className="rounded-full p-1">
                  <Folders className="size-4" />
                </div>
                <span>Projects</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton>
              <div className="rounded-full p-1">
                <LayoutDashboard className="size-4" />
              </div>
              <span>Artifacts</span>
            </SidebarMenuButton>
            <SidebarMenuButton>
              <div className="rounded-full p-1">
                <Code className="size-4" />
              </div>
              <span>Code</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Starred</SidebarGroupLabel>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {anthropicNavItems.map((item) => {
                const isActive =
                  pathname === item.url ||
                  (item.url !== "/dashboard/anthropic" &&
                    pathname?.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url}>
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    <AnthropicSidebarAction />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t mt-auto">
        <AuthButton />
      </SidebarFooter>
    </>
  );

  return (
    <>
      {/* Mobile: Use Sheet via Sidebar component with offcanvas */}
      {/* Desktop: Custom nested layout implementation */}
      <Sidebar
        variant="inset"
        collapsible={isMobile ? "offcanvas" : "none"}
        className={cn(
          "bg-[#FAF9F5] dark:bg-[#262624]",
          isMobile
            ? ""
            : cn(
                "border-r rounded-l-lg flex-col h-full transition-[width] duration-200 ease-linear !flex",
                open ? "!w-72" : "!w-0 border-0"
              )
        )}
      >
        {isMobile ? (
          sidebarContent
        ) : (
          <div
            className={cn(
              "flex flex-col h-full w-72 transition-opacity duration-200 ease-linear overflow-hidden bg-[#FAF9F5] dark:bg-[#262624] border-r",
              open ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            {sidebarContent}
          </div>
        )}
      </Sidebar>
    </>
  );
}
