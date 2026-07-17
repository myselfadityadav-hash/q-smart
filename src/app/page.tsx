"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Moon, Sun, Ticket } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useBranches, useServiceTypes, useTellers } from "@/lib/qsmart/hooks";
import { LandingView } from "@/components/qsmart/LandingView";
import { CustomerView } from "@/components/qsmart/CustomerView";
import { TellerView } from "@/components/qsmart/TellerView";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

function App() {
  const params = useSearchParams();
  const view = params.get("view") ?? "landing";
  const branchId = params.get("branch") ?? "main";

  const { data: branches, loading: loadingBranches } = useBranches();
  const { data: serviceTypes, loading: loadingTypes } = useServiceTypes();
  const { data: tellers, loading: loadingTellers } = useTellers();

  const loadingMeta = loadingBranches || loadingTypes || loadingTellers;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Ticket className="size-4" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Q-Smart
            </span>
            <span className="hidden text-xs font-medium uppercase tracking-widest text-muted-foreground sm:inline">
              Virtual Queue
            </span>
          </a>
          <nav className="flex items-center gap-1 text-sm">
            <a
              href="/?view=customer&branch=main"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Customer
            </a>
            <a
              href="/?view=teller"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Teller
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {view === "customer" ? (
          <CustomerView
            branchId={branchId}
            branch={branches?.find((b) => b.id === branchId)}
            serviceTypes={serviceTypes ?? []}
            loadingMeta={loadingMeta}
          />
        ) : view === "teller" ? (
          <TellerView
            branches={branches ?? []}
            serviceTypes={serviceTypes ?? []}
            tellers={tellers ?? []}
            loadingMeta={loadingMeta}
          />
        ) : (
          <LandingView branches={branches ?? []} loading={loadingBranches} />
        )}
      </main>

      <footer className="mt-auto border-t bg-background/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Ticket className="size-3.5 text-emerald-600" />
            Q-Smart — Real-Time Virtual Queuing
          </p>
          <p className="text-xs">
            Next.js · Socket.IO · SQLite · In-memory live state
          </p>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="Toggle theme"
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
