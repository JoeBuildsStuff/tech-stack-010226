"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { File, Plus, Table2, type LucideIcon } from "lucide-react";
import { SidebarLogo } from "@/components/dashboard/app-sidebar-logo";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";

type NavigationItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  logo?: {
    light: string;
    dark: string;
    imageClassName?: string;
  };
  action?: () => void;
  actionAriaLabel?: string;
};

function NavLogo({
  light,
  dark,
  alt,
  imageClassName = "size-4",
}: {
  light: string;
  dark: string;
  alt: string;
  imageClassName?: string;
}) {
  return (
    <span className="relative mr-2 flex size-4 shrink-0 items-center justify-center overflow-visible">
      <Image
        src={light}
        alt={alt}
        width={24}
        height={24}
        className={cn(imageClassName, "dark:hidden")}
      />
      <Image
        src={dark}
        alt={alt}
        width={24}
        height={24}
        className={cn("hidden dark:block", imageClassName)}
      />
    </span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  const handleCreateNote = () => {
    console.log("Create note clicked");
  };

  const handleCreateTable = () => {
    console.log("Create table clicked");
  };

  const handleCreateOpenAI = () => {
    console.log("Create OpenAI chat clicked");
  };

  const navigationItems: NavigationItem[] = [
    {
      label: "Notes",
      href: "/dashboard/notes",
      icon: File,
      action: handleCreateNote,
      actionAriaLabel: "Create new note",
    },
    {
      label: "Table",
      href: "/dashboard/table",
      icon: Table2,
      action: handleCreateTable,
      actionAriaLabel: "Create new table",
    },
    {
      label: "OpenAI",
      href: "/dashboard/openai",
      logo: {
        light: "/openai/SVGs/OAI_OpenAI-Blossom_Black.svg",
        dark: "/openai/SVGs/OAI_OpenAI-Blossom_White.svg",
      },
    },
    {
      label: "Anthropic",
      href: "/dashboard/anthropic",
      logo: {
        light: "/anthropic/Claude_Symbol_4.svg",
        dark: "/anthropic/Claude_Symbol_2.svg",
      },
    },
  ];

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarLogo />
        </SidebarHeader>
        <SidebarContent className="flex flex-col">
          {/* Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "w-full justify-start",
                        pathname.startsWith(item.href)
                          ? "bg-muted/50 hover:bg-muted font-semibold"
                          : "hover:bg-muted"
                      )}
                    >
                      <Link href={item.href}>
                        {item.icon ? (
                          <item.icon className="size-3.5 mr-2 flex-none text-muted-foreground" />
                        ) : item.logo ? (
                          <NavLogo
                            light={item.logo.light}
                            dark={item.logo.dark}
                            alt={`${item.label} logo`}
                            imageClassName={item.logo.imageClassName}
                          />
                        ) : null}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.action && (
                      <SidebarMenuAction asChild showOnHover={true}>
                        <button
                          onClick={item.action}
                          className="disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
                          aria-label={item.actionAriaLabel}
                        >
                          <Plus className="size-4 text-muted-foreground" />
                        </button>
                      </SidebarMenuAction>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <AuthButton />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
