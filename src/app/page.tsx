"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Moon, Sun, Ticket, Heart } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useBranches, useServiceTypes, useTellers } from "@/lib/qsmart/hooks";
import { LandingView } from "@/components/qsmart/LandingView";
import { CustomerView } from "@/components/qsmart/CustomerView";
import { TellerView } from "@/components/qsmart/TellerView";
import { LobbyView } from "@/components/qsmart/LobbyView";
import { AdminView } from "@/components/qsmart/AdminView";
import { cn } from "@/lib/utils";

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

  // refreshKey increments when admin data changes, triggering re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const { data: branches, loading: loadingBranches } = useBranches(refreshKey);
  const { data: serviceTypes, loading: loadingTypes } = useServiceTypes(refreshKey);
  const { data: tellers, loading: loadingTellers } = useTellers(undefined, refreshKey);

  const loadingMeta = loadingBranches || loadingTypes || loadingTellers;

  // The lobby display board is a full-screen, chrome-less view designed for TVs
  // in the waiting area. It renders its own layout (no shared header/footer).
  if (view === "lobby") {
    return (
      <LobbyView
        branchId={branchId}
        branches={branches ?? []}
        serviceTypes={serviceTypes ?? []}
        tellers={tellers ?? []}
        loadingMeta={loadingMeta}
      />
    );
  }

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
            <NavLink href="/?view=customer&branch=main" active={view === "customer"}>
              Customer
            </NavLink>
            <NavLink href="/?view=teller" active={view === "teller"}>
              Teller
            </NavLink>
            <NavLink href="/?view=admin" active={view === "admin"}>
              Admin
            </NavLink>
            <NavLink href="/?view=lobby&branch=main" active={view === "lobby"}>
              Lobby
            </NavLink>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {view === "customer" ? (
          <CustomerView
            branchId={branchId}
            branch={branches?.find((b) => b.id === branchId)}
            branches={branches ?? []}
            serviceTypes={serviceTypes ?? []}
            tellers={tellers ?? []}
            loadingMeta={loadingMeta}
          />
        ) : view === "teller" ? (
          <TellerView
            branches={branches ?? []}
            serviceTypes={serviceTypes ?? []}
            tellers={tellers ?? []}
            loadingMeta={loadingMeta}
          />
        ) : view === "admin" ? (
          <AdminView
            branches={branches ?? []}
            serviceTypes={serviceTypes ?? []}
            tellers={tellers ?? []}
            onDataChanged={handleDataChanged}
          />
        ) : (
          <LandingView branches={branches ?? []} loading={loadingBranches} />
        )}
      </main>

      <footer className="mt-auto border-t bg-background/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            {/* Q-Smart mini logo */}
            <span className="flex size-6 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Ticket className="size-3" />
            </span>
            <span className="font-medium text-foreground">Q-Smart</span>
            <span className="text-muted-foreground">— Real-Time Virtual Queuing</span>
          </div>
          <p className="flex items-center gap-1 text-xs">
            Made with <Heart className="size-3 fill-rose-500 text-rose-500" /> for better queues
          </p>
          <p className="text-xs">
            Next.js · Socket.IO · SQLite
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Nav link with animated underline on active state */
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={cn(
        "relative rounded-md px-3 py-1.5 transition-colors hover:bg-accent hover:text-foreground",
        active ? "text-foreground font-medium" : "text-muted-foreground"
      )}
    >
      {children}
      {/* Animated underline on active */}
      <span
        className={cn(
          "absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-emerald-500 transition-all duration-300",
          active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
        )}
      />
    </a>
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
