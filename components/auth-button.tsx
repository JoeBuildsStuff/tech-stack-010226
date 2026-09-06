"use client"

import {
  ChevronsUpDown,
  Home,
  Laptop2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Sun,
  User,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { CurrentUserAvatar } from "@/components/current-user-avatar"
import { useCurrentUserName } from "@/hooks/use-current-user-name"
import { useCurrentUserEmail } from "@/hooks/use-current-user-email"
import { useIsMobile } from "@/hooks/use-mobile"
import { signOut } from "@/app/(Auth)/actions/auth"
import { useChatStore } from "@/lib/chat/chat-store"

type AuthButtonProps = {
  variant?: "icon" | "full"
  side?: "top" | "right" | "bottom" | "left"
}

export function AuthButton({ variant = "full", side }: AuthButtonProps) {
  // Always call hooks unconditionally
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const userName = useCurrentUserName()
  const userEmail = useCurrentUserEmail()

  // Check if user is authenticated
  // Both hooks return default values when there's no session:
  // userName returns '?' and userEmail returns 'anon@email.com'
  const isAuthenticated = userName !== '?' && userEmail !== 'anon@email.com'

  // Determine dropdown side position
  const dropdownSide = side ?? (isMobile ? "bottom" : "right")

  // Handle login/logout
  const handleAuthAction = () => {
    if (isAuthenticated) {
      // Clear and abort client work before the server action redirects. The
      // auth listener also handles sign-outs from other tabs/providers.
      useChatStore.getState().resetForAccount(null)
      void signOut()
    } else {
      // Redirect to login
      router.push('/signin')
    }
  }

  // Get icon for current theme
  const getThemeIcon = (currentTheme: string | undefined) => {
    switch (currentTheme) {
      case 'light':
        return <Sun className="size-4 shrink-0 text-muted-foreground" />
      case 'dark':
        return <Moon className="size-4 shrink-0 text-muted-foreground" />
      case 'system':
        return <Laptop2 className="size-4 shrink-0 text-muted-foreground" />
      default:
        return <Laptop2 className="size-4 shrink-0" />
    }
  }

  // Icon variant when logged out - show signin/signup buttons
  if (variant === "icon" && !isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/signin">
            Sign In
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/signup">
            Sign Up
          </Link>
        </Button>
      </div>
    )
  }

  // Icon variant when logged in - show avatar with dropdown
  if (variant === "icon" && isAuthenticated) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <CurrentUserAvatar />
            <span className="sr-only">Account menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 rounded-lg"
          side={dropdownSide}
          align="end"
          sideOffset={4}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <CurrentUserAvatar />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs">{userEmail}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem 
              asChild
              className="cursor-pointer"
            >
              <Link href="/dashboard">
                <LayoutDashboard />
                Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              asChild
              className="cursor-pointer"
            >
              <Link href="/dashboard/account-settings/profile">
                <User />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 justify-between">
                {getThemeIcon(theme)}
                <span>Theme</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light" className="flex items-center gap-2 justify-between"><span>Light</span> <Sun className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark" className="flex items-center gap-2 justify-between"><span>Dark</span> <Moon className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system" className="flex items-center gap-2 justify-between"><span>System</span> <Laptop2 className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={handleAuthAction}
            className="cursor-pointer"
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Full variant (default) - use sidebar components
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <CurrentUserAvatar />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs">{userEmail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={dropdownSide}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <CurrentUserAvatar />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="truncate text-xs">{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
          <DropdownMenuSub>
          <DropdownMenuItem 
              asChild
              className="cursor-pointer"
            >
              <Link href="/dashboard/account-settings/profile">
                <User />
                Profile
              </Link>
            </DropdownMenuItem>
          <DropdownMenuItem 
              asChild
              className="cursor-pointer"
            >
              <Link href="/home">
                <Home />
                Home Page
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSubTrigger className="flex items-center gap-2 justify-between">
              {getThemeIcon(theme)}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light" className="flex items-center gap-2 justify-between"><span>Light</span> <Sun className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="flex items-center gap-2 justify-between"><span>Dark</span> <Moon className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" className="flex items-center gap-2 justify-between"><span>System</span> <Laptop2 className="size-4 shrink-0 text-muted-foreground" /></DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleAuthAction}
              className="cursor-pointer"
            >
              {isAuthenticated ? <LogOut /> : <LogIn />}
              {isAuthenticated ? 'Log out' : 'Login'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
