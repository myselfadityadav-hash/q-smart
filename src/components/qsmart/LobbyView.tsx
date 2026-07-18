"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Headset,
  Megaphone,
  Monitor,
  Ticket,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQueueSubscription } from "@/lib/qsmart/socket";
import type { Branch, ServiceType, Teller } from "@/lib/qsmart/types";
import { formatEta, serviceTypeLabel } from "@/lib/qsmart/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LobbyViewProps {
  branchId: string;
  branches: Branch[];
  serviceTypes: ServiceType[];
  tellers: Teller[];
  loadingMeta: boolean;
}

/** Ambient floating dots for background effect — enhanced with more particles and varied sizes */
function AmbientParticles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: `${5 + Math.random() * 90}%`,
        top: `${5 + Math.random() * 90}%`,
        size: 2 + Math.random() * 6,
        duration: 4 + Math.random() * 8,
        delay: Math.random() * 5,
        opacity: 0.15 + Math.random() * 0.25,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute rounded-full bg-emerald-400/30"
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
          }}
          animate={{
            y: [0, -25, 0],
            opacity: [d.opacity, d.opacity + 0.3, d.opacity],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/** Marquee ticker bar for recent completions */
function CompletionMarquee({ completedTokens }: { completedTokens: string[] }) {
  if (completedTokens.length === 0) return null;

  // Duplicate the items for seamless looping
  const items = [...completedTokens, ...completedTokens];

  return (
    <div className="relative z-10 overflow-hidden border-t border-white/5 bg-slate-950/80 backdrop-blur-sm">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {items.map((item, i) => (
          <span
            key={i}
            className="mx-6 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"
          >
            <CheckCircle2 className="size-3 text-emerald-400/60" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Animated number transition component */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
      className={cn("inline-block font-mono tabular-nums", className)}
    >
      {value}
    </motion.span>
  );
}

export function LobbyView({
  branchId,
  branches,
  serviceTypes,
  tellers,
  loadingMeta,
}: LobbyViewProps) {
  const router = useRouter();

  // Defensive: props may briefly be undefined during Fast-Refresh / HMR.
  const safeBranches = branches ?? [];
  const safeServiceTypes = serviceTypes ?? [];
  const safeTellers = tellers ?? [];

  const [now, setNow] = useState(() => Date.now());
  const [showControls, setShowControls] = useState(true);

  // Count-up effect for servedToday
  const [displayedServed, setDisplayedServed] = useState(0);
  const prevServedRef = useRef(0);

  // Track recently completed tokens for the marquee
  const [recentlyCompleted, setRecentlyCompleted] = useState<string[]>([]);

  // Voice announcement toggle — persisted in localStorage.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("qsmart:lobby:voice") === "on";
  });
  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("qsmart:lobby:voice", next ? "on" : "off");
      return next;
    });
  }, []);

  // Live clock — ticks every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-hide the control bar after 8s of no mouse movement (kiosk feel).
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setShowControls(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setShowControls(false), 8000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("touchstart", reset);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("touchstart", reset);
    };
  }, []);

  const branch = safeBranches.find((b) => b.id === branchId);
  const branchTellers = useMemo(
    () => safeTellers.filter((t) => t.branchId === branchId),
    [safeTellers, branchId]
  );

  // Keep a ref to state so the onTokenCalled callback can access latest data.
  const stateRef = useRef<ReturnType<typeof useQueueSubscription>["state"]>(null);

  // Track the last time a token was called for the "Last called" indicator
  const [lastCalledTime, setLastCalledTime] = useState<number | null>(null);
  const prevServingCountRef = useRef(0);

  // Track when "YOUR TURN" pulse should show
  const [showYourTurn, setShowYourTurn] = useState(false);

  // Voice announcement handler — fired when a token_called event arrives.
  const handleTokenCalled = useCallback(
    (tokenId: string) => {
      setLastCalledTime(Date.now());
      setShowYourTurn(true);
      setTimeout(() => setShowYourTurn(false), 5000);

      if (!voiceEnabled) return;
      // Small delay so the queue state has time to update.
      setTimeout(() => {
        const currentState = stateRef.current;
        const token = currentState?.nowServingList.find((t) => t.id === tokenId);
        if (!token) return;
        const counterIndex = branchTellers.findIndex((t) => t.id === token.tellerId);
        const counterNo = counterIndex >= 0 ? counterIndex + 1 : null;
        const utterance = new SpeechSynthesisUtterance(
          `Now serving token ${token.number} at counter ${counterNo ?? "?"}`
        );
        utterance.rate = 0.95;
        utterance.pitch = 1;
        window.speechSynthesis.cancel(); // prevent overlap
        window.speechSynthesis.speak(utterance);
      }, 350);
    },
    [voiceEnabled, branchTellers]
  );

  const { state, connected } = useQueueSubscription(branchId, handleTokenCalled);

  // Sync state ref after each render.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Count-up animation for servedToday
  useEffect(() => {
    const target = state?.servedToday ?? 0;
    if (target === prevServedRef.current) {
      setDisplayedServed(target);
      return;
    }
    // Animate from previous to new value
    const start = prevServedRef.current;
    const diff = target - start;
    const duration = 600; // ms
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedServed(Math.round(start + diff * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevServedRef.current = target;
        setDisplayedServed(target);
      }
    };
    requestAnimationFrame(animate);
  }, [state?.servedToday]);

  const servingList = state?.nowServingList ?? [];
  const upcoming = state?.queue ?? [];

  // Detect new serving entries to update lastCalledTime
  useEffect(() => {
    if (servingList.length > prevServingCountRef.current) {
      setLastCalledTime(Date.now());
    }
    prevServingCountRef.current = servingList.length;
  }, [servingList.length]);

  // Track recently completed for marquee — derive from servedToday
  useEffect(() => {
    if (!state) return;
    const served = state.servedToday;
    if (served > 0) {
      const items = Array.from({ length: Math.min(served, 8) }, (_, i) => {
        const num = served - i;
        return `Token ${String(num).padStart(2, "0")} completed`;
      });
      setRecentlyCompleted(items);
    }
  }, [state?.servedToday]);

  // Attach the teller name + a derived counter number to each serving token.
  const counters = servingList.map((tok) => {
    const teller = safeTellers.find((t) => t.id === tok.tellerId);
    const counterIndex = branchTellers.findIndex((t) => t.id === tok.tellerId);
    return {
      token: tok,
      tellerName: teller?.name ?? "—",
      counterNo: counterIndex >= 0 ? counterIndex + 1 : null,
    };
  });

  const timeString = new Date(now).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateString = new Date(now).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Compute "Last called X seconds ago"
  const lastCalledSecAgo = lastCalledTime
    ? Math.floor((Date.now() - lastCalledTime) / 1000)
    : null;

  // Compute branch closing time (default: 5 PM)
  const branchHours = "5:00 PM";

  if (loadingMeta) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        <Skeleton className="h-12 w-72 bg-slate-800" />
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 bg-slate-800 lg:col-span-2" />
          <Skeleton className="h-64 bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white">
      {/* Ambient gradient glows */}
      <div className="pointer-events-none absolute -left-40 top-0 size-[32rem] rounded-full bg-emerald-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 size-[32rem] rounded-full bg-teal-500/15 blur-[120px]" />
      {/* Subtle dot-grid overlay (very faint, behind the main content) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-grid-pattern text-white/[0.04]"
      />

      {/* Ambient floating dots */}
      <AmbientParticles />

      {/* Scan-line overlay for TV/kiosk feel */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-[0.03]">
        <div
          className="absolute inset-x-0 h-32 bg-gradient-to-b from-white/80 to-transparent animate-scan-line"
        />
      </div>

      {/* YOUR TURN pulsing overlay */}
      <AnimatePresence>
        {showYourTurn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.1, 1], opacity: [0, 1, 0.8] }}
              transition={{ duration: 0.5, type: "tween", ease: "easeOut" }}
              className="rounded-3xl bg-emerald-500/20 px-12 py-6 backdrop-blur-md"
            >
              <p className="animate-scale-bounce text-5xl font-black uppercase tracking-widest text-emerald-400 sm:text-7xl" style={{ textShadow: "0 0 40px rgba(16,185,129,0.6)" }}>
                YOUR TURN
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar — branch + clock + controls */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-between gap-4 px-6 py-4 transition-all duration-500 sm:px-10",
          showControls ? "opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="size-4" />
            Exit
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-1.5 px-2 transition-colors",
                  voiceEnabled
                    ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                )}
                onClick={toggleVoice}
              >
                <motion.span
                  key={voiceEnabled ? "on" : "off"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                >
                  {voiceEnabled ? (
                    <Volume2 className="size-4" />
                  ) : (
                    <VolumeX className="size-4" />
                  )}
                </motion.span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Voice announcements {voiceEnabled ? "on" : "off"}
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <Ticket className="size-5 text-white" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Q-Smart Lobby
              </p>
              <h1 className="text-balance text-lg font-bold leading-tight sm:text-xl">
                {branch?.name ?? "Branch"}
              </h1>
            </div>
          </div>
          {safeBranches.length > 1 && (
            <Select
              value={branchId}
              onValueChange={(id) =>
                router.push(`/?view=lobby&branch=${id}`)
              }
            >
              <SelectTrigger className="ml-2 w-[180px] border-white/15 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {safeBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Branch hours indicator */}
          <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 sm:flex">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
            Open until {branchHours}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              {dateString}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
            <Clock className="size-5 text-emerald-400" />
            <span className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl animate-count-up">
              {timeString}
            </span>
          </div>
          <ConnectionPill connected={connected} />
        </div>
      </div>

      {/* Main board */}
      <div className="relative z-10 flex flex-1 flex-col gap-6 px-6 pb-4 sm:px-10">
        {/* Gradient separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

        {/* NOW SERVING — the hero of the board */}
        <section className="flex-1">
          <div className="mb-4 flex items-center gap-3">
            <Megaphone className="size-6 text-emerald-400" />
            <h2 className="text-balance text-2xl font-black uppercase tracking-widest text-white sm:text-3xl">
              Now Serving
            </h2>
            <div className="ml-2 h-px flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent" />
            {/* Last called indicator */}
            {lastCalledSecAgo !== null && (
              <motion.span
                key={lastCalledSecAgo}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs font-medium text-slate-400 whitespace-nowrap"
              >
                Last called {lastCalledSecAgo < 60 ? `${lastCalledSecAgo}s ago` : `${Math.floor(lastCalledSecAgo / 60)}m ago`}
              </motion.span>
            )}
          </div>

          {counters.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {counters.map((c) => (
                  <motion.div
                    key={c.token.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.45, type: "spring", stiffness: 120 }}
                    className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 via-slate-900 to-slate-900 p-6 shadow-2xl shadow-emerald-900/40 animate-border-dance card-shine animate-scale-in"
                  >
                    <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-emerald-400/20 blur-2xl" />
                    {/* Shimmer overlay */}
                    <div className="pointer-events-none absolute inset-0 animate-shimmer-subtle rounded-2xl" />
                    <div className="relative flex items-center justify-between">
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                        <Headset className="size-3.5" />
                        Counter {c.counterNo ?? "—"}
                      </span>
                      <span className="text-xs font-medium text-slate-400">
                        {c.tellerName}
                      </span>
                    </div>
                    <p className="relative mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
                      Token
                    </p>
                    <motion.p
                      key={c.token.number}
                      initial={{ scale: 1.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.4, type: "spring", stiffness: 180 }}
                      className="relative font-mono text-7xl font-black leading-none tabular-nums text-white animate-scale-in sm:text-8xl"
                      style={{ textShadow: "0 0 50px rgba(16,185,129,0.45)" }}
                    >
                      {String(c.token.number).padStart(2, "0")}
                    </motion.p>
                    <div className="relative mt-4 flex items-center justify-between text-sm">
                      <span className="text-slate-300">
                        {serviceTypeLabel(c.token.serviceType, safeServiceTypes)}
                      </span>
                      <ServingElapsed since={c.token.calledAt} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 py-20 text-center">
              <motion.div
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              >
                <Megaphone className="size-14 text-emerald-400/60" />
              </motion.div>
              <p className="mt-4 animate-breathe text-xl font-semibold text-slate-300">
                No one is being served right now
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Tokens will appear here the moment a teller calls the next customer.
              </p>
            </div>
          )}
        </section>

        {/* Gradient separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-teal-500/20 to-transparent" />

        {/* UP NEXT + Stats */}
        <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          {/* Upcoming queue */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-teal-400" />
                <h3 className="text-balance text-lg font-bold uppercase tracking-widest text-white sm:text-xl">
                  Up Next
                </h3>
              </div>
              <span className="rounded-full bg-teal-500/20 px-3 py-1 text-sm font-bold tabular-nums text-teal-300">
                {upcoming.length} waiting
              </span>
            </div>
            {upcoming.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.slice(0, 9).map((t, i) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                      i === 0
                        ? "border-amber-400/40 bg-amber-400/10"
                        : i % 2 === 0
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-white/10 bg-white/5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-lg font-black tabular-nums",
                        i === 0
                          ? "bg-amber-400 text-slate-900"
                          : "bg-white/10 text-white"
                      )}
                    >
                      {String(t.number).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {serviceTypeLabel(t.serviceType, safeServiceTypes)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {i === 0 ? "Next up" : `Position #${t.position}`}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-300">
                      {formatEta(t.etaSec)}
                    </span>
                  </motion.div>
                ))}
                {/* Scroll indicator if many waiting */}
                {upcoming.length > 9 && (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 py-3">
                    <span className="text-xs text-slate-500">
                      +{upcoming.length - 9} more waiting
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Users className="size-10 text-slate-600" />
                <p className="mt-3 text-sm text-slate-400">
                  The queue is empty. New tokens will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="flex flex-col gap-4">
            <div className="card-shine rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-slate-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Served Today
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <AnimatedNumber
                  value={displayedServed}
                  className="text-5xl font-black text-white"
                />
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400" />
                  Waiting <AnimatedNumber value={state?.waitingCount ?? 0} className="font-bold" />
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-400" />
                  No-show <AnimatedNumber value={state?.noShowToday ?? 0} className="font-bold" />
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Avg Service Time
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">
                {formatEta(state?.avgServiceTimeSec ?? 0)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Rolling avg of last 20 services
              </p>
            </div>
            {branch?.location && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  <Building2 className="size-3.5" />
                  Location
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  {branch.location}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Gradient fade overlay at bottom */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-24 bg-gradient-to-t from-[#0a0a0b] to-transparent" />

      {/* Subtle wave animation at the bottom */}
      <div className="pointer-events-none relative z-10 mt-auto">
        <svg
          className="w-full text-emerald-500/10"
          viewBox="0 0 1440 60"
          fill="none"
          preserveAspectRatio="none"
          style={{ height: 40 }}
        >
          <motion.path
            d="M0 30 Q360 0 720 30 T1440 30 V60 H0 Z"
            fill="currentColor"
            animate={{
              d: [
                "M0 30 Q360 0 720 30 T1440 30 V60 H0 Z",
                "M0 25 Q360 50 720 25 T1440 25 V60 H0 Z",
                "M0 30 Q360 0 720 30 T1440 30 V60 H0 Z",
              ],
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </div>

      {/* Completion marquee ticker bar */}
      <CompletionMarquee completedTokens={recentlyCompleted} />

      {/* Footer hint */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center gap-2 pb-3 text-xs text-slate-600 transition-opacity duration-500",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <Monitor className="size-3.5" />
        Lobby display mode · move the mouse to show controls
      </div>
    </div>
  );
}

/** A big elapsed timer for a serving token. */
function ServingElapsed({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return <span className="text-slate-500">—</span>;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="flex items-center gap-1.5 font-mono tabular-nums text-emerald-300">
      <Clock className="size-3.5" />
      {mm}:{ss}
    </span>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex",
        connected
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-400/30 bg-amber-500/10 text-amber-300"
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          connected ? "bg-emerald-400" : "animate-pulse bg-amber-400"
        )}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}
