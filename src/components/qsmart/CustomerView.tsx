"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  Hash,
  Headset,
  LogOut,
  RefreshCw,
  Share2,
  Target,
  Ticket,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
  CreditCard,
  FileText,
  Banknote,
  Wallet,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/qsmart/api";
import { getSocket, useQueueSubscription } from "@/lib/qsmart/socket";
import { QueueCard } from "./QueueCard";
import { ConnectionStatusBar } from "./ConnectionStatusBar";
import { TokenReceipt } from "./TokenReceipt";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import type { Branch, EtaConfidence, ServiceType, Teller, Token, TokenPriority } from "@/lib/qsmart/types";
import { formatApproxCallTime, formatEta, priorityBadgeClass, priorityEmoji, priorityLabel } from "@/lib/qsmart/format";

interface CustomerViewProps {
  branchId: string;
  branch?: Branch;
  branches: Branch[];
  serviceTypes: ServiceType[];
  tellers?: Teller[];
  loadingMeta: boolean;
}

const storageKey = (branchId: string) => `qsmart:token:${branchId}`;
const SOUND_PREF_KEY = "qsmart:sound-enabled";

/** Map service type IDs to icons and gradient backgrounds */
const SERVICE_VISUALS: Record<string, { icon: React.ReactNode; gradient: string; bg: string }> = {
  general: {
    icon: <Users className="size-5" />,
    gradient: "from-blue-500 to-indigo-600",
    bg: "bg-blue-500/10 dark:bg-blue-500/15",
  },
  deposits: {
    icon: <Banknote className="size-5" />,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
  },
  withdrawals: {
    icon: <Wallet className="size-5" />,
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
  },
  loans: {
    icon: <CreditCard className="size-5" />,
    gradient: "from-purple-500 to-violet-600",
    bg: "bg-purple-500/10 dark:bg-purple-500/15",
  },
  accounts: {
    icon: <FileText className="size-5" />,
    gradient: "from-cyan-500 to-blue-600",
    bg: "bg-cyan-500/10 dark:bg-cyan-500/15",
  },
};

function getServiceVisual(id: string) {
  return SERVICE_VISUALS[id] ?? {
    icon: <Ticket className="size-5" />,
    gradient: "from-slate-500 to-slate-700",
    bg: "bg-slate-500/10 dark:bg-slate-500/15",
  };
}

/** Queue position timeline steps */
const TIMELINE_STEPS = [
  { key: "joined", label: "Joined", icon: Ticket },
  { key: "waiting", label: "Waiting", icon: Clock },
  { key: "called", label: "Called", icon: BellRing },
  { key: "serving", label: "Being Served", icon: Headset },
  { key: "complete", label: "Complete", icon: CheckCircle2 },
] as const;

function getActiveStep(status: string): number {
  switch (status) {
    case "waiting": return 1;
    case "called": return 2;
    case "serving": return 3;
    case "completed": return 4;
    case "no_show":
    case "cancelled": return 0;
    default: return 0;
  }
}

function loadStored(branchId: string): Token | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(branchId));
    return raw ? (JSON.parse(raw) as Token) : null;
  } catch {
    return null;
  }
}

function storeToken(branchId: string, token: Token | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(storageKey(branchId), JSON.stringify(token));
    else window.localStorage.removeItem(storageKey(branchId));
  } catch {
    /* ignore */
  }
}

function loadSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(SOUND_PREF_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

function storeSoundPref(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

/** Confetti / sparkle particles for the celebration effect. */
function ConfettiBurst() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 200 - 100,
    delay: Math.random() * 0.3,
    duration: 0.8 + Math.random() * 0.6,
    size: 4 + Math.random() * 6,
    color: [
      "bg-emerald-400",
      "bg-teal-400",
      "bg-emerald-300",
      "bg-yellow-400",
      "bg-emerald-500",
    ][i % 5],
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={cn("absolute rounded-full", p.color)}
          style={{
            width: p.size,
            height: p.size,
            left: "50%",
            top: "50%",
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{
            x: p.x,
            y: -60 - Math.random() * 80,
            opacity: 0,
            scale: [0, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

/** Skeleton loading state for initial load */
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}

export function CustomerView({
  branchId,
  branch,
  branches,
  serviceTypes,
  tellers,
  loadingMeta,
}: CustomerViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  // Defensive: props may briefly be undefined during Fast-Refresh / HMR even
  // though page.tsx passes `?? []`. Guard here so a single undefined prop can
  // never crash the whole route.
  const safeBranches = branches ?? [];
  const safeServiceTypes = serviceTypes ?? [];
  const safeTellers = tellers ?? [];
  const [myToken, setMyToken] = useState<Token | null>(null);
  const [isReturning, setIsReturning] = useState(false);

  // Restore any stored token on the client only (SSR + hydration-safe).
  useEffect(() => {
    const stored = loadStored(branchId);
    setMyToken(stored);
    setIsReturning(!!stored);
  }, [branchId]);
  const [serviceType, setServiceType] = useState<string>(
    safeServiceTypes[0]?.id ?? "general"
  );
  const [priority, setPriority] = useState<TokenPriority>("regular");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCalled, setJustCalled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [etaConfidence, setEtaConfidence] = useState<EtaConfidence | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const myTokenIdRef = useRef<string | null>(myToken?.id ?? null);
  myTokenIdRef.current = myToken?.id ?? null;

  // Restore sound preference from localStorage
  useEffect(() => {
    setSoundEnabled(loadSoundPref());
  }, []);

  // Keep serviceType valid once metadata loads.
  useEffect(() => {
    if (safeServiceTypes.length && !safeServiceTypes.find((s) => s.id === serviceType)) {
      setServiceType(safeServiceTypes[0].id);
    }
  }, [safeServiceTypes, serviceType]);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      // Create a short beep using Web Audio API
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio API not available
    }
  }, [soundEnabled]);

  const onTokenCalled = useCallback(
    (tokenId: string) => {
      if (tokenId === myTokenIdRef.current) {
        setJustCalled(true);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        toast({
          title: "It's your turn!",
          description: "Please proceed to the counter.",
        });
        // Vibrate on supported devices.
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        // Play sound notification
        playNotificationSound();
      }
    },
    [toast, playNotificationSound]
  );

  const { state, connected } = useQueueSubscription(branchId, onTokenCalled);

  // Listen for terminal-status events targeted at this customer's token.
  useEffect(() => {
    const s = getSocket();
    const handleCompleted = (p: { token: Token }) => {
      if (p.token.id === myTokenIdRef.current) {
        setMyToken((prev) =>
          prev ? { ...p.token, status: "completed" } : prev
        );
        toast({
          title: "Service completed",
          description: "Thanks for using Q-Smart!",
        });
      }
    };
    const handleRemoved = (p: { token: Token; reason: string }) => {
      if (p.token.id === myTokenIdRef.current) {
        const status = p.reason === "no_show" ? "no_show" : "cancelled";
        setMyToken((prev) => (prev ? { ...p.token, status } : prev));
        if (status === "no_show") {
          toast({
            title: "Marked as no-show",
            description: "You were not present when called.",
            variant: "destructive",
          });
        }
      }
    };
    s.on("service_completed", handleCompleted);
    s.on("token_removed", handleRemoved);
    return () => {
      s.off("service_completed", handleCompleted);
      s.off("token_removed", handleRemoved);
    };
  }, [toast]);

  // Reconcile the local token with the live queue state.
  // Use a ref to prevent infinite loops: only update if the token data actually changed.
  const lastReconcileRef = useRef<string>("");
  useEffect(() => {
    if (!state || !myToken) return;
    // Terminal states are event-driven; don't overwrite them.
    if (
      myToken.status === "completed" ||
      myToken.status === "no_show" ||
      myToken.status === "cancelled"
    ) {
      return;
    }
    // Check if our token is in nowServingList (multi-counter).
    const inServing = state.nowServingList?.some((t) => t.id === myToken.id);
    if (inServing) {
      const servingToken = state.nowServingList?.find((t) => t.id === myToken.id);
      if (servingToken) {
        const key = `${servingToken.id}:${servingToken.status}:${servingToken.position}:${servingToken.etaSec}`;
        if (key !== lastReconcileRef.current) {
          lastReconcileRef.current = key;
          setMyToken({ ...servingToken });
        }
        return;
      }
    }
    // Backwards compat: check single nowServing.
    if (state.nowServing?.id === myToken.id) {
      const key = `${state.nowServing.id}:${state.nowServing.status}:${state.nowServing.position}:${state.nowServing.etaSec}`;
      if (key !== lastReconcileRef.current) {
        lastReconcileRef.current = key;
        setMyToken({ ...state.nowServing });
      }
      return;
    }
    const found = state.queue.find((t) => t.id === myToken.id);
    if (found) {
      const key = `${found.id}:${found.status}:${found.position}:${found.etaSec}`;
      if (key !== lastReconcileRef.current) {
        lastReconcileRef.current = key;
        setMyToken(found);
      }
    } else if (myToken.status === "called") {
      // Was being served and now gone without an explicit event → assume done.
      const key = `${myToken.id}:completed`;
      if (key !== lastReconcileRef.current) {
        lastReconcileRef.current = key;
        setMyToken({ ...myToken, status: "completed" });
      }
    } else if (myToken.status === "waiting") {
      // Orphaned localStorage token — waiting but not in queue or nowServingList.
      const key = `${myToken.id}:orphaned`;
      if (key !== lastReconcileRef.current) {
        lastReconcileRef.current = key;
        setMyToken(null);
      }
    }
  }, [state, myToken]);

  // Persist token.
  useEffect(() => {
    storeToken(branchId, myToken);
  }, [branchId, myToken]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const { token } = await api.joinQueue(branchId, serviceType, priority);
      setMyToken(token);
      setJustCalled(false);
      setIsReturning(true);
      toast({
        title: `Token #${token.number} issued`,
        description: `You're #${token.position} in line.${token.priority !== "regular" ? ` (${priorityLabel(token.priority)} priority)` : ""}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join queue");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!myToken) return;
    setLeaveDialogOpen(false);
    try {
      await api.leaveQueue(myToken.id);
      setMyToken({ ...myToken, status: "cancelled" });
      toast({ title: "You left the queue" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave queue");
    }
  };

  const handleReset = () => {
    setMyToken(null);
    setJustCalled(false);
    setError(null);
    setIsReturning(false);
    setFeedbackGiven(false);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    storeSoundPref(next);
  };

  const handleShareToken = async () => {
    if (!myToken || !branch) return;
    const text = `Q-Smart Token #${String(myToken.number).padStart(2, "0")} at ${branch.name} — Position #${myToken.position}, Est. wait: ${formatEta(myToken.etaSec)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Queue Token", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied to clipboard", description: "Token info shared!" });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied to clipboard", description: "Token info shared!" });
      } catch {
        toast({ title: "Could not share", variant: "destructive" });
      }
    }
  };

  // Fetch ETA confidence when customer has an active waiting token
  useEffect(() => {
    if (myToken?.status === "waiting" && branchId) {
      api.getEtaConfidence(branchId)
        .then(setEtaConfidence)
        .catch(() => setEtaConfidence(null));
    } else if (myToken?.status !== "waiting") {
      setEtaConfidence(null);
    }
  }, [myToken?.status, branchId]);

  // Auto-open feedback modal when token becomes "completed" and feedback not yet given
  useEffect(() => {
    if (myToken?.status === "completed" && !feedbackGiven && !feedbackOpen) {
      const timer = setTimeout(() => setFeedbackOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, [myToken?.status, feedbackGiven, feedbackOpen]);

  const handleSubmitFeedback = async () => {
    if (!myToken || feedbackRating === 0) return;
    setFeedbackSubmitting(true);
    try {
      await api.submitFeedback(myToken.id, feedbackRating, feedbackComment || undefined);
      setFeedbackGiven(true);
      setFeedbackOpen(false);
      toast({ title: "Thanks for your feedback!" });
    } catch {
      toast({ title: "Couldn't submit feedback", variant: "destructive" });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const isActive =
    myToken && (myToken.status === "waiting" || myToken.status === "called");

  // Compute progress percentage (0% = back of queue, 100% = next in line).
  const progressPct =
    myToken?.status === "waiting" && state
      ? state.waitingCount <= 1
        ? 100
        : Math.round(
            ((state.waitingCount - myToken.position) / (state.waitingCount - 1)) * 100
          )
      : 0;

  // Status-based gradient background tint
  const statusBgClass = myToken?.status === "waiting"
    ? "bg-gradient-to-b from-amber-50/50 via-transparent to-transparent dark:from-amber-950/20"
    : myToken?.status === "called"
    ? "bg-gradient-to-b from-emerald-50/50 via-transparent to-transparent dark:from-emerald-950/20"
    : myToken?.status === "completed" || myToken?.status === "cancelled" || myToken?.status === "no_show"
    ? "bg-gradient-to-b from-slate-50/50 via-transparent to-transparent dark:from-slate-950/20"
    : "";

  return (
    <div className={cn("mx-auto w-full max-w-md px-4 py-6 sm:py-10 transition-colors duration-500", statusBgClass)}>
      {/* Connection status bar */}
      {!connected && (
        <div className="mb-4">
          <ConnectionStatusBar connected={connected} branchName={branch?.name} />
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-muted-foreground"
          onClick={() => router.push("/")}
        >
          <ArrowLeft className="size-4" />
          Home
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={toggleSound}
            title={soundEnabled ? "Mute notifications" : "Enable sound notifications"}
          >
            {soundEnabled ? (
              <Bell className="size-4 text-muted-foreground" />
            ) : (
              <BellOff className="size-4 text-muted-foreground/50" />
            )}
          </Button>
          <ConnectionDot connected={connected} />
        </div>
      </div>

      {/* Welcome back greeting for returning customers */}
      {isReturning && myToken && (myToken.status === "waiting" || myToken.status === "called") && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10"
        >
          <span className="animate-wave-hand text-lg">👋</span>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Welcome back to {branch?.name ?? "Branch"}!
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              Your token is still active — see your position below.
            </p>
          </div>
        </motion.div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Customer
            </p>
            <h1 className="mt-1 text-balance text-2xl font-bold">{branch?.name ?? "Branch"}</h1>
            {branch?.location && (
              <p className="text-sm text-muted-foreground">{branch.location}</p>
            )}
          </div>
          {safeBranches.length > 1 && (
            <Select value={branchId} onValueChange={(id) => router.push(`/?view=customer&branch=${id}`)}>
              <SelectTrigger className="w-[160px]">
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
      </div>

      {loadingMeta ? (
        <LoadingSkeleton />
      ) : !myToken ? (
        /* ---- Join screen ---- */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="size-5 text-emerald-600" />
                Get your token
              </CardTitle>
              <CardDescription>
                Pick a service and grab a virtual token. You'll get live updates
                on your phone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {safeServiceTypes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <Ticket className="size-8 opacity-30" />
                  <p className="text-sm">No service types available yet.</p>
                  <p className="text-xs">Please check back shortly.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Service type</label>
                  <div className="grid gap-2">
                    {safeServiceTypes.map((s) => {
                      const visual = getServiceVisual(s.id);
                      const isSelected = serviceType === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setServiceType(s.id)}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 hover-lift focus-ring",
                            isSelected
                              ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-500/10 shadow-sm"
                              : "border-border hover:bg-accent hover:shadow-sm"
                          )}
                        >
                          {/* Animated gradient icon background */}
                          <div
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-lg text-white transition-transform duration-200",
                              `bg-gradient-to-br ${visual.gradient}`,
                              isSelected && "scale-110"
                            )}
                          >
                            {visual.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{s.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="size-3.5" />
                              ~{formatEta(s.estimatedSec)}
                            </span>
                          </div>
                          {/* Selection indicator */}
                          <div
                            className={cn(
                              "flex size-5 items-center justify-center rounded-full border-2 transition-colors duration-200",
                              isSelected
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-muted-foreground/30"
                            )}
                          >
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              >
                                <CheckCircle2 className="size-3 text-white" />
                              </motion.div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Priority selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority level</label>
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {([
                    { value: "regular" as TokenPriority, label: "Regular", emoji: "🟢", desc: "Standard queue" },
                    { value: "express" as TokenPriority, label: "Express", emoji: "⚡", desc: "Faster service" },
                    { value: "vip" as TokenPriority, label: "VIP", emoji: "⭐", desc: "Top priority" },
                  ] as const).map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "flex min-w-[7rem] flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-center transition-all duration-200 hover-lift focus-ring",
                        priority === p.value
                          ? p.value === "vip"
                            ? "border-amber-500 bg-amber-50/80 dark:bg-amber-500/10 shadow-sm"
                            : p.value === "express"
                            ? "border-slate-400 bg-slate-50/80 dark:bg-slate-500/10 shadow-sm"
                            : "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-500/10 shadow-sm"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      <span className="text-lg">{p.emoji}</span>
                      <span className="text-xs font-semibold">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                size="lg"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleJoin}
                disabled={joining || safeServiceTypes.length === 0}
              >
                {joining ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Issuing token…
                  </>
                ) : (
                  <>
                    <Ticket className="size-4" />
                    Get Token
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        /* ---- Active / terminal token screen ---- */
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={myToken.status}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              {/* Pulsing glow on token when waiting */}
              {myToken.status === "waiting" && (
                <div className="absolute inset-0 rounded-xl animate-glow-pulse" />
              )}
              <div className="relative">
                <QueueCard
                  token={myToken}
                  serviceTypes={safeServiceTypes}
                  nowServingNumber={state?.nowServing?.number ?? null}
                />
                {/* Subtle animated pattern overlay on token card */}
                {isActive && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl opacity-[0.04]" style={{
                    backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
                    backgroundSize: '16px 16px',
                  }} />
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Celebration confetti effect when called */}
          <AnimatePresence>
            {showConfetti && myToken.status === "called" && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative"
              >
                <ConfettiBurst />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Queue Position Timeline */}
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <Card>
                <CardContent className="pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Queue Progress
                  </p>
                  <QueueTimeline currentStep={getActiveStep(myToken.status)} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Progress bar + approx call time (when waiting) */}
          {myToken.status === "waiting" && state && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Queue progress</span>
                    <span className="tabular-nums text-muted-foreground">
                      {progressPct}%
                    </span>
                  </div>
                  <Progress value={progressPct} className="h-2.5" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Timer className="size-4" />
                      Approx. call time
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatApproxCallTime(myToken.etaSec)}
                      </span>
                      <EtaAccuracyBadge confidence={etaConfidence} />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {myToken.status === "called" && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="animate-slide-in-left"
            >
              <Card className="border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 relative overflow-hidden animate-glow-pulse">
                {/* Sparkle overlay */}
                {showConfetti && <ConfettiBurst />}
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20"
                    >
                      <BellRing className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                        It&apos;s your turn!
                      </p>
                      <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                        Please proceed to the counter now.
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const teller = myToken.tellerId
                      ? safeTellers.find((t) => t.id === myToken.tellerId)
                      : undefined;
                    if (!teller) return null;
                    const branchTellers = safeTellers.filter(
                      (t) => t.branchId === branchId
                    );
                    const counterNo =
                      branchTellers.findIndex((t) => t.id === teller.id) + 1;
                    return (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-500/20">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm">
                          <Headset className="size-4" />
                          Counter {counterNo || ""}
                        </span>
                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          {teller.name}
                        </span>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {myToken.status === "waiting" && state && (
            <WaitingDetails
              position={myToken.position}
              etaSec={myToken.etaSec}
              ahead={Math.max(0, state.waitingCount)}
              avgSec={state.avgServiceTimeSec}
              joinedAt={myToken.joinedAt}
            />
          )}

          {myToken.status === "completed" && (
            <TerminalNotice
              icon={<CheckCircle2 className="size-6 text-emerald-600" />}
              title="Service complete"
              desc="Thanks for using Q-Smart. Have a great day!"
              variant="success"
            />
          )}
          {/* Prediction-vs-Actual summary card */}
          {myToken.status === "completed" && myToken.predictedEtaSec != null && myToken.calledAt && myToken.joinedAt && (
            <ServiceSummaryCard
              predictedSec={myToken.predictedEtaSec}
              actualSec={Math.round((myToken.calledAt - myToken.joinedAt) / 1000)}
            />
          )}
          {/* Feedback prompt after completion */}
          {myToken.status === "completed" && !feedbackGiven && !feedbackOpen && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Button
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setFeedbackOpen(true)}
              >
                Rate your experience
              </Button>
            </motion.div>
          )}
          {myToken.status === "completed" && feedbackGiven && (
            <p className="text-center text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Feedback submitted — thank you!
            </p>
          )}
          {myToken.status === "no_show" && (
            <TerminalNotice
              icon={<XCircle className="size-6 text-rose-600" />}
              title="Marked as no-show"
              desc="You weren't present when called. Grab a new token to rejoin."
              variant="destructive"
            />
          )}
          {myToken.status === "cancelled" && (
            <TerminalNotice
              icon={<LogOut className="size-6 text-zinc-500" />}
              title="You left the queue"
              desc="Grab a new token whenever you're ready."
              variant="neutral"
            />
          )}

          {/* Now serving + upcoming preview */}
          {isActive && state && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Live queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Active counters — show each teller currently serving */}
                {state.nowServingList && state.nowServingList.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Headset className="size-3.5" />
                      Now serving
                    </p>
                    {state.nowServingList.map((t) => {
                      const teller = t.tellerId
                        ? safeTellers.find((tl) => tl.id === t.tellerId)
                        : undefined;
                      const branchTellers = safeTellers.filter(
                        (tl) => tl.branchId === branchId
                      );
                      const counterNo = teller
                        ? branchTellers.findIndex((tl) => tl.id === teller.id) + 1
                        : null;
                      const isMine = t.id === myToken.id;
                      return (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25 }}
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-3 py-2 transition-colors",
                            isMine
                              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
                              : "bg-muted/50"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex size-8 items-center justify-center rounded-md font-mono text-sm font-bold tabular-nums transition-colors",
                                isMine
                                  ? "bg-emerald-500 text-white"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                              )}
                            >
                              {String(t.number).padStart(2, "0")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {teller ? `Counter ${counterNo ?? ""} · ${teller.name}` : "Being served"}
                            </span>
                          </span>
                          {isMine && (
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              You
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Hash className="size-4" />
                      Now serving
                    </span>
                    <span className="font-mono text-lg font-bold tabular-nums">—</span>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Users className="size-3.5" />
                    Up next
                  </p>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                    {state.queue.length === 0 ? (
                      <p className="py-3 text-center text-sm text-muted-foreground">
                        No one else is waiting.
                      </p>
                    ) : (
                      state.queue.slice(0, 6).map((t) => (
                        <QueueRow
                          key={t.id}
                          number={t.number}
                          position={t.position}
                          isMe={t.id === myToken.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isActive ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      onClick={() => setLeaveDialogOpen(true)}
                    >
                      <LogOut className="size-4" />
                      Leave queue
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>You will lose your position in line</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={handleShareToken}
                    >
                      <Share2 className="size-4" />
                      <span className="hidden sm:inline">Share</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Share your token info</TooltipContent>
                </Tooltip>
                {/* Print receipt button when waiting */}
                {myToken.status === "waiting" && branch && (
                  <TokenReceipt token={myToken} branch={branch} serviceTypes={safeServiceTypes} />
                )}
              </>
            ) : (
              <Button
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleReset}
              >
                <Ticket className="size-4" />
                Get new token
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Leave queue confirmation dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <LogOut className="size-5" />
              Leave Queue?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to leave the queue? You will lose your current
              position and need to get a new token to rejoin.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-rose-200/60 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-500/20">
                <AlertCircle className="size-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Your position: #{myToken?.position ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Est. wait: {myToken ? formatEta(myToken.etaSec) : "—"}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setLeaveDialogOpen(false)}
            >
              Stay in queue
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeave}
            >
              <LogOut className="size-4" />
              Yes, leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback dialog */}
      <Dialog open={feedbackOpen} onOpenChange={(open) => { if (!feedbackSubmitting) setFeedbackOpen(open); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              How was your wait?
            </DialogTitle>
            <DialogDescription>
              Your feedback helps us improve our service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Emoji rating */}
            <div className="flex justify-center gap-4">
              {([
                { value: 3, emoji: "😊", label: "Great" },
                { value: 2, emoji: "😐", label: "Okay" },
                { value: 1, emoji: "😞", label: "Poor" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFeedbackRating(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border-2 px-5 py-3 transition-all duration-200 hover-lift focus-ring",
                    feedbackRating === opt.value
                      ? cn(
                          opt.value === 3
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 scale-110"
                            : opt.value === 2
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 scale-110"
                            : "border-rose-500 bg-rose-50 dark:bg-rose-500/10 scale-110",
                          "animate-scale-in"
                        )
                      : "border-border hover:bg-accent"
                  )}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            {/* Comment field */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Additional comments (optional)
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Tell us more about your experience…"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setFeedbackOpen(false)}
              disabled={feedbackSubmitting}
            >
              Skip
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleSubmitFeedback}
              disabled={feedbackRating === 0 || feedbackSubmitting}
            >
              {feedbackSubmitting ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PWA install prompt (mobile-only, with 7-day dismissal memory) */}
      <PwaInstallPrompt />
    </div>
  );
}

/** Vertical queue position timeline */
function QueueTimeline({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-start gap-0">
      {TIMELINE_STEPS.map((step, i) => {
        const isCompleted = i <= currentStep;
        const isCurrent = i === currentStep;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {/* Connector line + dot */}
            <div className="flex w-full items-center">
              {/* Left connector */}
              {i > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 transition-colors duration-500",
                    i <= currentStep
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/20"
                  )}
                />
              )}
              {/* Step dot / icon */}
              <motion.div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300",
                  isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                )}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={isCurrent ? { duration: 2, repeat: Infinity } : {}}
              >
                <Icon className="size-4" />
              </motion.div>
              {/* Right connector */}
              {i < TIMELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 transition-colors duration-500",
                    i < currentStep
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "mt-1 text-[10px] font-medium leading-tight text-center",
                isCompleted
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground/50"
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        connected
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          connected ? "bg-emerald-500" : "bg-amber-500"
        )}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}

function WaitingDetails({
  position,
  etaSec,
  ahead,
  avgSec,
  joinedAt,
}: {
  position: number;
  etaSec: number;
  ahead: number;
  avgSec: number;
  joinedAt: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Detail icon={<Users className="size-4" />} label="Ahead of you" value={String(Math.max(0, position - 1))} />
      <Detail icon={<Timer className="size-4" />} label="Est. wait" value={formatEta(etaSec)} />
      <Detail icon={<Clock className="size-4" />} label="Avg / person" value={formatEta(avgSec)} />
      <TimeInQueue joinedAt={joinedAt} />
    </div>
  );
}

/** Live time-in-queue counter component */
function TimeInQueue({ joinedAt }: { joinedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const hh = Math.floor(secs / 3600);

  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="mx-auto mb-1 flex size-7 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
        <Clock className="size-4" />
      </div>
      <p className="text-lg font-bold tabular-nums">
        {hh > 0 ? `${hh}:` : ""}{mm}:{ss}
      </p>
      <p className="text-xs text-muted-foreground">Time in queue</p>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center hover-lift transition-colors">
      <div className="mx-auto mb-1 flex size-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        {icon}
      </div>
      {/* Pulse on value change — re-mounts via key, scaling briefly. */}
      <motion.p
        key={value}
        initial={{ scale: 1, y: 8, opacity: 0 }}
        animate={{ scale: [1, 1.18, 1], y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300 animate-count-up"
      >
        {value}
      </motion.p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function QueueRow({
  number,
  position,
  isMe,
}: {
  number: number;
  position: number;
  isMe: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
        isMe
          ? "bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
          : "bg-muted/40"
      )}
    >
      <span className="tabular-nums">#{String(number).padStart(2, "0")}</span>
      <span className="text-xs text-muted-foreground">
        {isMe ? "You" : `Position ${position}`}
      </span>
    </div>
  );
}

function TerminalNotice({
  icon,
  title,
  desc,
  variant = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  variant?: "success" | "destructive" | "neutral";
}) {
  const variantClass = {
    success: "border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5",
    destructive: "border-rose-200/60 bg-rose-50/50 dark:border-rose-500/20 dark:bg-rose-500/5",
    neutral: "",
  }[variant];

  return (
    <Card className={cn("transition-colors", variantClass)}>
      <CardContent className="flex items-center gap-3 py-5">
        <div className="relative">
          {variant === "success" ? (
            <div className="flex size-6 items-center justify-center">
              <svg
                className="size-6 text-emerald-600 dark:text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M20 6 9 17l-5-5"
                  className="animate-check-draw"
                />
              </svg>
            </div>
          ) : (
            icon
          )}
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** ETA confidence badge shown next to the approximate call time */
function EtaAccuracyBadge({ confidence }: { confidence: EtaConfidence | null }) {
  if (!confidence || confidence.sampleSize === 0) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-slate-200 bg-slate-50 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
      >
        New
      </Badge>
    );
  }
  switch (confidence.confidence) {
    case "high":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
        >
          <Target className="size-3" />
          High accuracy
        </Badge>
      );
    case "medium":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
        >
          <Target className="size-3" />
          Moderate accuracy
        </Badge>
      );
    case "low":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-rose-200 bg-rose-50 text-[10px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
        >
          <Target className="size-3" />
          Estimate only
        </Badge>
      );
  }
}

/** Service summary card showing predicted vs actual wait after completion */
function ServiceSummaryCard({
  predictedSec,
  actualSec,
}: {
  predictedSec: number;
  actualSec: number;
}) {
  const diff = predictedSec - actualSec;
  const pctDiff = predictedSec > 0 ? Math.round(Math.abs(diff) / predictedSec * 100) : 0;
  const isFaster = diff > 0;
  const isSlower = diff < 0;
  const isClose = Math.abs(diff) <= predictedSec * 0.3;

  const ratio = predictedSec > 0 ? Math.min(actualSec / predictedSec, 2) : 1;
  const barPct = Math.round(ratio * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="border-slate-200/60 bg-gradient-to-br from-white/80 to-slate-50/60 shadow-sm backdrop-blur-sm dark:border-slate-700/40 dark:from-slate-900/80 dark:to-slate-800/60">
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            {isClose ? (
              <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : isFaster ? (
              <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
            )}
            Wait time breakdown
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-100 bg-white/60 p-3 text-center dark:border-slate-700/40 dark:bg-slate-800/40">
              <p className="text-xs text-muted-foreground">Predicted wait</p>
              <p className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-300">
                {formatEta(predictedSec)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white/60 p-3 text-center dark:border-slate-700/40 dark:bg-slate-800/40">
              <p className="text-xs text-muted-foreground">Actual wait</p>
              <p className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-300">
                {formatEta(actualSec)}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Actual vs predicted</span>
              <span
                className={cn(
                  "font-semibold",
                  isClose
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isFaster
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                )}
              >
                {isClose
                  ? "On target"
                  : isFaster
                    ? `${pctDiff}% faster`
                    : `${pctDiff}% slower`}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isClose
                    ? "bg-emerald-500"
                    : isFaster
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                )}
                style={{ width: `${Math.min(barPct, 100)}%` }}
              />
              {/* Predicted marker line at 100% */}
              <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-400 dark:bg-slate-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
