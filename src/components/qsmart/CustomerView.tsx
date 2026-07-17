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
  Hash,
  LogOut,
  RefreshCw,
  Ticket,
  Timer,
  Users,
  XCircle,
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/qsmart/api";
import { getSocket, useQueueSubscription } from "@/lib/qsmart/socket";
import { QueueCard } from "./QueueCard";
import type { Branch, ServiceType, Token } from "@/lib/qsmart/types";
import { formatApproxCallTime, formatEta } from "@/lib/qsmart/format";

interface CustomerViewProps {
  branchId: string;
  branch?: Branch;
  serviceTypes: ServiceType[];
  loadingMeta: boolean;
}

const storageKey = (branchId: string) => `qsmart:token:${branchId}`;
const SOUND_PREF_KEY = "qsmart:sound-enabled";

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

export function CustomerView({
  branchId,
  branch,
  serviceTypes,
  loadingMeta,
}: CustomerViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [myToken, setMyToken] = useState<Token | null>(null);

  // Restore any stored token on the client only (SSR + hydration-safe).
  useEffect(() => {
    setMyToken(loadStored(branchId));
  }, [branchId]);
  const [serviceType, setServiceType] = useState<string>(
    serviceTypes[0]?.id ?? "general"
  );
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCalled, setJustCalled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const myTokenIdRef = useRef<string | null>(myToken?.id ?? null);
  myTokenIdRef.current = myToken?.id ?? null;

  // Restore sound preference from localStorage
  useEffect(() => {
    setSoundEnabled(loadSoundPref());
  }, []);

  // Keep serviceType valid once metadata loads.
  useEffect(() => {
    if (serviceTypes.length && !serviceTypes.find((s) => s.id === serviceType)) {
      setServiceType(serviceTypes[0].id);
    }
  }, [serviceTypes, serviceType]);

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
        setMyToken({ ...servingToken });
        return;
      }
    }
    // Backwards compat: check single nowServing.
    if (state.nowServing?.id === myToken.id) {
      setMyToken({ ...state.nowServing });
      return;
    }
    const found = state.queue.find((t) => t.id === myToken.id);
    if (found) {
      setMyToken(found);
    } else if (myToken.status === "called") {
      // Was being served and now gone without an explicit event → assume done.
      setMyToken({ ...myToken, status: "completed" });
    } else if (myToken.status === "waiting") {
      // BUG FIX: Orphaned localStorage token — waiting but not in queue or nowServingList.
      // This happens when the backend resets/clears its DB but the customer's
      // localStorage still has a stale token. Auto-clear and show the join screen.
      setMyToken(null);
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
      const { token } = await api.joinQueue(branchId, serviceType);
      setMyToken(token);
      setJustCalled(false);
      toast({
        title: `Token #${token.number} issued`,
        description: `You're #${token.position} in line.`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join queue");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!myToken) return;
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
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    storeSoundPref(next);
  };

  const isActive =
    myToken && (myToken.status === "waiting" || myToken.status === "called");

  // Compute progress percentage (0% = back of queue, 100% = next in line).
  const progressPct =
    myToken?.status === "waiting" && state && state.waitingCount > 0
      ? Math.round(
          ((state.waitingCount - myToken.position) / (state.waitingCount - 1)) * 100
        )
      : myToken?.status === "waiting" && state && state.waitingCount <= 1
        ? 100
        : 0;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:py-10">
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

      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Customer
        </p>
        <h1 className="mt-1 text-2xl font-bold">{branch?.name ?? "Branch"}</h1>
        {branch?.location && (
          <p className="text-sm text-muted-foreground">{branch.location}</p>
        )}
      </div>

      {loadingMeta ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4 rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
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
              {serviceTypes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <Ticket className="size-8 opacity-30" />
                  <p className="text-sm">No service types available yet.</p>
                  <p className="text-xs">Please check back shortly.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Service type</label>
                  <div className="grid gap-2">
                    {serviceTypes.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setServiceType(s.id)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                          serviceType === s.id
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                            : "border-border hover:bg-accent"
                        )}
                      >
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          ~{formatEta(s.estimatedSec)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                disabled={joining || serviceTypes.length === 0}
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
            >
              <QueueCard
                token={myToken}
                serviceTypes={serviceTypes}
                nowServingNumber={state?.nowServing?.number ?? null}
              />
            </motion.div>
          </AnimatePresence>

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
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatApproxCallTime(myToken.etaSec)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {myToken.status === "called" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10">
                <CardContent className="flex items-center gap-3 py-4">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <BellRing className="size-5 text-emerald-600" />
                  </motion.div>
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                      It&apos;s your turn!
                    </p>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                      Please proceed to the counter now.
                    </p>
                  </div>
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
            />
          )}

          {myToken.status === "completed" && (
            <TerminalNotice
              icon={<CheckCircle2 className="size-6 text-emerald-600" />}
              title="Service complete"
              desc="Thanks for using Q-Smart. Have a great day!"
            />
          )}
          {myToken.status === "no_show" && (
            <TerminalNotice
              icon={<XCircle className="size-6 text-rose-600" />}
              title="Marked as no-show"
              desc="You weren't present when called. Grab a new token to rejoin."
            />
          )}
          {myToken.status === "cancelled" && (
            <TerminalNotice
              icon={<LogOut className="size-6 text-zinc-500" />}
              title="You left the queue"
              desc="Grab a new token whenever you're ready."
            />
          )}

          {/* Now serving + upcoming preview */}
          {isActive && state && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Live queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="size-4" />
                    Now serving
                  </span>
                  <span className="font-mono text-lg font-bold tabular-nums">
                    {state.nowServingList && state.nowServingList.length > 0
                      ? state.nowServingList.map((t) => `#${String(t.number).padStart(2, "0")}`).join(", ")
                      : "—"}
                  </span>
                </div>
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
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
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isActive ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleLeave}
              >
                <LogOut className="size-4" />
                Leave queue
              </Button>
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
}: {
  position: number;
  etaSec: number;
  ahead: number;
  avgSec: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Detail icon={<Users className="size-4" />} label="Ahead of you" value={String(Math.max(0, position - 1))} />
      <Detail icon={<Timer className="size-4" />} label="Est. wait" value={formatEta(etaSec)} />
      <Detail icon={<Clock className="size-4" />} label="Avg / person" value={formatEta(avgSec)} />
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
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="mx-auto mb-1 flex size-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        {icon}
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
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
        "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
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
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        {icon}
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}
