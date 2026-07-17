"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  Clock,
  Hash,
  Headset,
  History,
  Inbox,
  Loader2,
  Megaphone,
  MinusCircle,
  RotateCcw,
  TrendingUp,
  UserCheck,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/qsmart/api";
import { useQueueSubscription } from "@/lib/qsmart/socket";
import type { ActivityEntry, Branch, ServiceType, Teller, Token } from "@/lib/qsmart/types";
import {
  formatClock,
  formatEta,
  serviceTypeLabel,
} from "@/lib/qsmart/format";

interface TellerViewProps {
  branches: Branch[];
  serviceTypes: ServiceType[];
  tellers: Teller[];
  loadingMeta: boolean;
}

export function TellerView({
  branches,
  serviceTypes,
  tellers,
  loadingMeta,
}: TellerViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [branchId, setBranchId] = useState<string>(
    () => branches[0]?.id ?? "main"
  );
  const branchTellers = useMemo(
    () => tellers.filter((t) => t.branchId === branchId),
    [tellers, branchId]
  );
  const [tellerId, setTellerId] = useState<string>("");

  // Restore last-used branch from localStorage on the client only (SSR-safe).
  useEffect(() => {
    const saved = localStorage.getItem("qsmart:teller:branch");
    if (saved) setBranchId(saved);
  }, []);

  // Initialise / fix teller selection when branch changes.
  useEffect(() => {
    if (branchTellers.length === 0) {
      setTellerId("");
      return;
    }
    if (!branchTellers.find((t) => t.id === tellerId)) {
      setTellerId(branchTellers[0].id);
    }
  }, [branchTellers, tellerId]);

  useEffect(() => {
    localStorage.setItem("qsmart:teller:branch", branchId);
  }, [branchId]);

  const { state, connected } = useQueueSubscription(branchId);
  const [busy, setBusy] = useState<null | "next" | "complete" | "noshow" | "reset">(null);

  // Activity log
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const nowServingList = state?.nowServingList ?? [];
  const myServingToken = tellerId
    ? nowServingList.find((t) => t.tellerId === tellerId) ?? null
    : null;
  const otherServing = tellerId
    ? nowServingList.filter((t) => t.tellerId !== tellerId)
    : nowServingList;
  const teller = branchTellers.find((t) => t.id === tellerId);

  // Fetch activity log
  const fetchActivity = useCallback(async () => {
    if (!branchId) return;
    setActivityLoading(true);
    try {
      const data = await api.getActivityLog(branchId);
      setActivity(data);
    } catch {
      // Silent fail for activity log
    } finally {
      setActivityLoading(false);
    }
  }, [branchId]);

  // Load activity on mount and when branch changes
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Refresh activity when queue state changes (new completions, etc.)
  useEffect(() => {
    if (state) {
      fetchActivity();
    }
  }, [state?.servedToday, state?.noShowToday, fetchActivity]);

  const guard = (action: string): boolean => {
    if (!tellerId) {
      toast({ title: "Select a teller first", variant: "destructive" });
      return false;
    }
    if (busy) return false;
    return true;
  };

  const handleNext = async () => {
    if (!guard("next")) return;
    setBusy("next");
    try {
      const res = await api.callNext(branchId, tellerId);
      if (res.token) {
        toast({
          title: `Calling token #${res.token.number}`,
          description: serviceTypeLabel(res.token.serviceType, serviceTypes),
        });
      } else {
        toast({ title: "Queue is empty" });
      }
    } catch (e) {
      toast({
        title: "Couldn't call next",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async () => {
    if (!guard("complete")) return;
    setBusy("complete");
    try {
      const res = await api.completeService(branchId, tellerId);
      toast({
        title: "Service completed",
        description: `Token #${res.token?.number} served in ${formatEta(
          res.serviceTimeSec
        )}.`,
      });
    } catch (e) {
      toast({
        title: "Couldn't complete",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleNoShow = async () => {
    if (!guard("noshow")) return;
    setBusy("noshow");
    try {
      await api.markNoShow(branchId, tellerId);
      toast({ title: "Marked as no-show" });
    } catch (e) {
      toast({
        title: "Couldn't mark no-show",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    setBusy("reset");
    try {
      const res = await api.resetBranch(branchId);
      toast({
        title: "Queue reset",
        description: `${res.clearedCount} token(s) cleared.`,
      });
      fetchActivity();
    } catch (e) {
      toast({
        title: "Couldn't reset queue",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loadingMeta) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Skeleton className="h-10 w-40" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-muted-foreground"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="size-4" />
            Home
          </Button>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Teller Dashboard
            </p>
            <h1 className="text-xl font-bold leading-tight">
              {branches.find((b) => b.id === branchId)?.name ?? "Branch"}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tellerId} onValueChange={setTellerId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sign in as…" />
            </SelectTrigger>
            <SelectContent>
              {branchTellers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ConnectionDot connected={connected} />
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Users className="size-4" />}
          label="Waiting"
          value={state?.waitingCount ?? 0}
          accent="amber"
        />
        <StatCard
          icon={<UserCheck className="size-4" />}
          label="Served today"
          value={state?.servedToday ?? 0}
          accent="emerald"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Avg service"
          value={formatEta(state?.avgServiceTimeSec ?? 0)}
          accent="slate"
        />
        <StatCard
          icon={<XCircle className="size-4" />}
          label="No-shows"
          value={state?.noShowToday ?? 0}
          accent="rose"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Now serving + actions */}
          <Card className="overflow-hidden">
            <div
              className={cn(
                "flex items-center justify-between px-6 py-4 text-white transition-colors",
                myServingToken
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                  : "bg-gradient-to-r from-slate-700 to-slate-900"
              )}
            >
              <div className="flex items-center gap-2">
                <Megaphone className="size-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Your Counter
                </span>
              </div>
              {myServingToken && (
                <Badge className="border-white/30 bg-white/15 text-white">
                  {serviceTypeLabel(myServingToken.serviceType, serviceTypes)}
                </Badge>
              )}
            </div>
            <CardContent className="pt-6">
              {myServingToken ? (
                <motion.div
                  key={myServingToken.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Token
                  </p>
                  <motion.p
                    key={myServingToken.number}
                    initial={{ scale: 1.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-mono text-8xl font-black leading-none tabular-nums"
                    style={{
                      textShadow: myServingToken
                        ? "0 0 40px rgba(16,185,129,0.3)"
                        : "none",
                    }}
                  >
                    {String(myServingToken.number).padStart(2, "0")}
                  </motion.p>
                  <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-4" />
                      Called {formatClock(myServingToken.calledAt)}
                    </span>
                    <ElapsedTimer since={myServingToken.calledAt} />
                  </div>
                  {teller && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Headset className="size-3.5" />
                      Served by {teller.name}
                    </p>
                  )}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-8 text-center text-muted-foreground">
                  <Hash className="size-10 opacity-30" />
                  <p className="text-sm">No customer at your counter.</p>
                  <p className="text-xs">Call the next token to begin.</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <Button
                  size="lg"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleNext}
                  disabled={!!busy || !!myServingToken}
                >
                  {busy === "next" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Megaphone className="size-4" />
                  )}
                  Call Next
                </Button>
                <Button
                  size="lg"
                  variant="default"
                  className="bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
                  onClick={handleComplete}
                  disabled={!!busy || !myServingToken}
                >
                  {busy === "complete" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCheck className="size-4" />
                  )}
                  Complete
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  onClick={handleNoShow}
                  disabled={!!busy || !myServingToken}
                >
                  {busy === "noshow" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MinusCircle className="size-4" />
                  )}
                  No-Show
                </Button>
              </div>
              {myServingToken && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Complete or mark no-show before calling the next customer.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Other counters */}
          {otherServing.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Headset className="size-4 text-muted-foreground" />
                  Other Counters
                </CardTitle>
                <CardDescription>
                  Currently being served by other tellers at this branch.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {otherServing.map((t) => {
                    const tName = tellers.find((tl) => tl.id === t.tellerId)?.name ?? "Unknown";
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-lg border px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 font-bold tabular-nums text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {t.number}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {serviceTypeLabel(t.serviceType, serviceTypes)}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Headset className="size-3" />
                              {tName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Called</p>
                          <p className="text-sm font-medium tabular-nums">
                            {formatClock(t.calledAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Log */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4 text-muted-foreground" />
                  Activity Log
                </CardTitle>
                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        disabled={!!busy}
                      >
                        <RotateCcw className="size-3.5" />
                        Reset Queue
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="size-5 text-rose-500" />
                          Reset Queue?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear ALL waiting tokens and cancel all
                          currently-being-served tokens for this branch. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleReset}
                          className="bg-rose-600 text-white hover:bg-rose-700"
                        >
                          Yes, Reset Queue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading && activity.length === 0 ? (
                <div className="space-y-2 py-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activity.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <Inbox className="size-8 opacity-30" />
                  <p className="text-sm">No activity yet today.</p>
                  <p className="text-xs">Completed and no-show tokens will appear here.</p>
                </div>
              ) : (
                <ScrollArea className="h-[280px] pr-3">
                  <div className="space-y-2">
                    {activity.map((entry) => (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                          entry.status === "completed"
                            ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                            : "border-rose-200/60 bg-rose-50/40 dark:border-rose-500/20 dark:bg-rose-500/5"
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-md font-bold tabular-nums text-sm",
                            entry.status === "completed"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                          )}
                        >
                          {entry.number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {serviceTypeLabel(entry.serviceType, serviceTypes)}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                entry.status === "completed"
                                  ? "border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300"
                                  : "border-rose-200 text-rose-700 dark:border-rose-500/30 dark:text-rose-300"
                              )}
                            >
                              {entry.status === "completed" ? "Done" : "No-show"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {entry.tellerName ?? "Unknown teller"}
                            {entry.serviceDurationSec != null && entry.status === "completed"
                              ? ` · ${formatEta(entry.serviceDurationSec)}`
                              : ""}
                            {" · "}
                            {formatClock(entry.completedAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Queue list */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                Upcoming
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {state?.queue.length ?? 0}
              </Badge>
            </CardTitle>
            <CardDescription>
              Next customer is at the top. Avg / person:{" "}
              {formatEta(state?.avgServiceTimeSec ?? 0)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ScrollArea className="h-[520px] pr-3">
              {state && state.queue.length > 0 ? (
                <div className="space-y-2">
                  {state.queue.map((t, i) => (
                    <div
                      key={t.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        i === 0 &&
                          "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-md font-bold tabular-nums",
                          i === 0
                            ? "bg-emerald-500 text-white"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {t.number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {serviceTypeLabel(t.serviceType, serviceTypes)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatClock(t.joinedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">ETA</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatEta(t.etaSec)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Users className="size-8 opacity-30" />
                  <p className="mt-2 text-sm">The queue is empty.</p>
                  <p className="text-xs">New tokens will appear here live.</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ElapsedTimer({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="flex items-center gap-1.5 font-mono tabular-nums">
      <Clock className="size-4" />
      {mm}:{ss}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "amber" | "emerald" | "slate" | "rose";
}) {
  const accents: Record<string, string> = {
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            accents[accent]
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
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
          connected ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
        )}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}
