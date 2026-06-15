import { Bird } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-3">
        <header className="flex flex-col items-center justify-center mb-2">
          <Bird className="size-8 shrink-0" />
          <h1 className="text-xl font-bold">A Web App</h1>
          <p className="text-sm text-muted-foreground">
            A Web App that does something.
          </p>
        </header>
      {children}
    </main>
  );
}
