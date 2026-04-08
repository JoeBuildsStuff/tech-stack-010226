import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DynamicBreadcrumbs } from "@/components/ui/dynamic-breadcrumbs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CommandSearch from "@/components/dashboard/command-search";
import { ChatFooterBar } from "@/components/chat/chat-footer-bar";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to signin if not authenticated
  // Include the dashboard path as 'next' parameter for redirect after login
  if (!user) {
    redirect("/signin");
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 flex min-h-0 flex-col overflow-hidden px-2 h-dvh">
        <header className="flex h-10 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex grow items-center gap-2 ">
            <SidebarTrigger className="-ml-1" />
            <DynamicBreadcrumbs />
          </div>
          <CommandSearch groups={[]} />
        </header>
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        <ChatFooterBar />
      </main>
    </SidebarProvider>
  );
}
