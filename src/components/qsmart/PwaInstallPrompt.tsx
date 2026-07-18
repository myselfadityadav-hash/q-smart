"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Before-install prompt event shape (not yet in standard TS lib).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

const DISMISS_KEY = "qsmart:pwa-install-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Returns true if the dismissal has expired (or was never set). */
function isDismissalExpired(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > DISMISS_TTL_MS;
  } catch {
    return true;
  }
}

function rememberDismissal() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * PWA install prompt — a small bottom-of-screen card that listens for the
 * `beforeinstallprompt` event and offers an "Install" CTA. Only renders on
 * mobile-ish viewports. Remembers dismissal for 7 days via localStorage.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if the app is already running standalone.
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        // iOS Safari doesn't support display-mode; fall back to navigator.standalone.
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    if (standalone) return;

    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile.
      e.preventDefault();
      if (!isDismissalExpired()) return;
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // If the app was installed while we were open, hide the prompt.
    const installedHandler = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  // Only show on mobile-ish viewports (<= 768px). We use a media query so the
  // prompt re-evaluates responsively without re-render thrash.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "dismissed") {
        rememberDismissal();
      }
      setVisible(false);
      setDeferred(null);
    } catch {
      // Some browsers throw if prompt() is called twice; just hide.
      setVisible(false);
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    rememberDismissal();
    setVisible(false);
  };

  if (!isMobile) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-4 sm:bottom-4"
          role="dialog"
          aria-label="Install Q-Smart"
        >
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-200/70 bg-background/95 p-3 shadow-2xl shadow-emerald-900/20 backdrop-blur-md dark:border-emerald-500/30">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Smartphone className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">
                Install Q-Smart
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Add to your home screen for faster queue access.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={installing}
              className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Download className="size-3.5" />
              {installing ? "…" : "Install"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDismiss}
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Not now"
            >
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
