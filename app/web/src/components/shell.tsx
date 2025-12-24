import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnected } from "@/stores/workers";
import { cn } from "@/lib/utils";

interface ShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const connected = useConnected();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 hover:bg-accent rounded-md"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <h1 className="font-semibold">Open Orchestra</h1>

          <Badge
            variant={connected ? "success" : "destructive"}
            className="text-xs"
          >
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card",
          "transform transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <h1 className="font-semibold tracking-tight">Open Orchestra</h1>
          <Badge
            variant={connected ? "success" : "destructive"}
            className="text-xs"
          >
            {connected ? "Live" : "Offline"}
          </Badge>
        </div>

        {/* Sidebar content */}
        <div className="flex flex-col h-[calc(100%-3.5rem)]">
          {sidebar}

          {/* Footer */}
          <div className="mt-auto border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              Control Panel v0.3.0
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-72">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
