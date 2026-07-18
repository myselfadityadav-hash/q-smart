"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type ConnectionQuality = "good" | "fair" | "poor";

interface ConnectionStatusBarProps {
  connected: boolean;
  /** Current branch name for context */
  branchName?: string;
}

/**
 * Enhanced connection status bar with quality indicator, retry count,
 * and animated reconnection state.
 */
export function ConnectionStatusBar({ connected, branchName }: ConnectionStatusBarProps) {
  const [attemptCount, setAttemptCount] = useState(0);
  const [quality, setQuality] = useState<ConnectionQuality>("good");
  const [latency, setLatency] = useState<number | null>(null);
  const [dots, setDots] = useState(0);
  const prevConnected = useRef(connected);

  // Track reconnection attempts + latency
  useEffect(() => {
    if (connected) {
      // Measure latency on connect
      const start = Date.now();
      fetch("/api/health?XTransformPort=3004", { method: "HEAD", cache: "no-store" })
        .then(() => {
          const ms = Date.now() - start;
          setLatency(ms);
          if (ms < 100) setQuality("good");
          else if (ms < 300) setQuality("fair");
          else setQuality("poor");
        })
        .catch(() => {
          setQuality("poor");
          setLatency(null);
        });
      // Reset attempt count asynchronously
      const raf = requestAnimationFrame(() => setAttemptCount(0));
      return () => cancelAnimationFrame(raf);
    }
    // Disconnected: update state asynchronously
    const raf = requestAnimationFrame(() => {
      if (prevConnected.current) {
        setAttemptCount(1);
      } else {
        setAttemptCount((c) => c + 1);
      }
      setQuality("poor");
      setLatency(null);
    });
    prevConnected.current = connected;
    return () => cancelAnimationFrame(raf);
  }, [connected]);

  // Animated dots for "Reconnecting..." text
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, [connected]);

  // Periodic latency check while connected
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      const start = Date.now();
      fetch("/api/health?XTransformPort=3004", { method: "HEAD", cache: "no-store" })
        .then(() => {
          const ms = Date.now() - start;
          setLatency(ms);
          if (ms < 100) setQuality("good");
          else if (ms < 300) setQuality("fair");
          else setQuality("poor");
        })
        .catch(() => setQuality("poor"));
    }, 15000);
    return () => clearInterval(id);
  }, [connected]);

  // Don't show bar when connected with good quality — use minimal indicator
  if (connected) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            "size-2 rounded-full",
            quality === "good" ? "bg-emerald-500" : quality === "fair" ? "bg-amber-500" : "bg-rose-500"
          )}
        />
        {latency !== null && (
          <span className="text-muted-foreground tabular-nums">{latency}ms</span>
        )}
      </div>
    );
  }

  // Disconnected — show full status bar
  const dotsStr = ".".repeat(dots);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <WifiOff className="size-4 text-amber-600 dark:text-amber-400" />
          </motion.div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Reconnecting{dotsStr}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
              {attemptCount > 0 ? `Attempt ${attemptCount}` : "Connecting…"}
            </p>
          </div>
        </div>
        {branchName && (
          <span className="text-xs text-amber-600/60 dark:text-amber-400/60">
            {branchName}
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
