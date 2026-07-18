"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCheck,
  Clock,
  Coffee,
  Download,
  Hash,
  Headset,
  History,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MinusCircle,
  PlayCircle,
  RotateCcw,
  Ticket,
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
import { Input } from "@/components/ui/input";
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
import { ConnectionStatusBar } from "./ConnectionStatusBar";
import type { ActivityEntry, Branch, HourlyStat, ServiceType, Teller, Token } from "@/lib/qsmart/types";
import {
  formatClock,
  formatEta,
  priorityBadgeClass,
  priorityEmoji,
  priorityLabel,
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

  // Defensive: props may briefly be undefined during Fast-Refresh / HMR.
  const safeBranches = branches ?? [];
  const safeServiceTypes = serviceTypes ?? [];
  const safeTellers = tellers ?? [];

  const [branchId, setBranchId] = useState<string>(
    () => safeBranches[0]?.id ?? "main"
  );
  const branchTellers = useMemo(
    () => safeTellers.filter((t) => t.branchId === branchId),
    [safeTellers, branchId]
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
  const [busy, setBusy] = useState<null | "next" | "complete" | "noshow" | "reset" | "pause" | "resume" | "transfer">(null);
  const [justCompleted, setJustCompleted] = useState(false);

  // ---- Pause / Resume State ----
  const isPaused = (state?.pausedTellers ?? []).includes(tellerId);

  // ---- Transfer Token State ----
  const [transferTokenId, setTransferTokenId] = useState<string | null>(null);
  const [transferServiceType, setTransferServiceType] = useState<string>("");

  // ---- PIN Login State ----
  const [loggedInTeller, setLoggedInTeller] = useState<Omit<Teller, "pin"> | null>(null);
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Restore session from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("qsmart:teller:session");
      if (!stored) return;
      const { tellerId: tid, branchId: bid } = JSON.parse(stored) as { tellerId: string; branchId: string };
      // Validate the stored session against current data.
      const teller = safeTellers.find((t) => t.id === tid && t.branchId === bid && t.active !== false);
      if (teller) {
        setBranchId(bid);
        setTellerId(tid);
        setLoggedInTeller({ id: teller.id, name: teller.name, branchId: teller.branchId, active: teller.active });
      } else {
        // Session invalid — clear it.
        localStorage.removeItem("qsmart:teller:session");
      }
    } catch {
      localStorage.removeItem("qsmart:teller:session");
    }
  }, []); // run once on mount

  const handleLogin = async () => {
    setLoginError("");
    if (!branchId) {
      setLoginError("Select a branch first.");
      return;
    }
    if (!tellerId) {
      setLoginError("Select a teller first.");
      return;
    }
    if (!loginPin || loginPin.length !== 4) {
      setLoginError("Enter a 4-digit PIN.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await api.tellerLogin(branchId, tellerId, loginPin);
      if (res.ok && res.teller) {
        setLoggedInTeller(res.teller);
        localStorage.setItem("qsmart:teller:session", JSON.stringify({ tellerId, branchId }));
        toast({ title: `Welcome, ${res.teller.name}!` });
      } else {
        setLoginError(res.error ?? "Invalid PIN. Please try again.");
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignOut = () => {
    setLoggedInTeller(null);
    setLoginPin("");
    setLoginError("");
    localStorage.removeItem("qsmart:teller:session");
    toast({ title: "Signed out" });
  };

  // Activity log
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Hourly stats for chart
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  const chartFetched = useRef(false);

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
      // Also refresh hourly stats
      api.getHourlyStats(branchId).then(setHourlyStats).catch(() => {});
      chartFetched.current = true;
    }
  }, [state?.servedToday, state?.noShowToday, fetchActivity, branchId]);

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
          description: serviceTypeLabel(res.token.serviceType, safeServiceTypes),
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
      // Brief flash effect on stats cards
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 800);
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

  const handlePause = async () => {
    if (!guard("pause")) return;
    setBusy("pause");
    try {
      await api.pauseTeller(branchId, tellerId);
      toast({ title: "Counter paused", description: "You won't receive new customers until you resume." });
    } catch (e) {
      toast({ title: "Couldn't pause", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async () => {
    if (!guard("resume")) return;
    setBusy("resume");
    try {
      await api.resumeTeller(branchId, tellerId);
      toast({ title: "Counter resumed", description: "You're ready to serve customers again." });
    } catch (e) {
      toast({ title: "Couldn't resume", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleTransfer = async () => {
    if (!transferTokenId || !transferServiceType) {
      toast({ title: "Select a service type", variant: "destructive" });
      return;
    }
    setBusy("transfer");
    try {
      const res = await api.transferToken(branchId, transferTokenId, transferServiceType);
      toast({
        title: `Token #${res.token.number} transferred`,
        description: `Moved to ${serviceTypeLabel(transferServiceType, safeServiceTypes)}`,
      });
      setTransferTokenId(null);
      setTransferServiceType("");
    } catch (e) {
      toast({ title: "Couldn't transfer", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = () => {
    if (activity.length === 0) {
      toast({ title: "Nothing to export yet", description: "No completed tokens today." });
      return;
    }
    const header = ["Token", "Service Type", "Status", "Teller", "Called At", "Completed At", "Service Duration (sec)"];
    const rows = activity.map((e) => {
      const svc = serviceTypeLabel(e.serviceType, safeServiceTypes);
      const status = e.status === "completed" ? "Done" : "No-show";
      const teller = e.tellerName ?? "";
      const called = e.calledAt ? new Date(e.calledAt).toISOString() : "";
      const done = e.completedAt ? new Date(e.completedAt).toISOString() : "";
      const dur = e.serviceDurationSec != null ? String(e.serviceDurationSec) : "";
      return [String(e.number), svc, status, teller, called, done, dur];
    });
    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const branchName = safeBranches.find((b) => b.id === branchId)?.name ?? branchId;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `qsmart-activity-${branchName.toLowerCase().replace(/\s+/g, "-")}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${activity.length} record(s) downloaded.` });
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

  // ---- Login Screen ----
  if (!loggedInTeller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-4 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 120 }}
          className="w-full max-w-md"
        >
          {/* Branding */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <Ticket className="size-7 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Q-Smart</h1>
              <p className="text-sm text-muted-foreground">Teller Sign In</p>
            </div>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="size-5 text-emerald-500" />
                Sign in to your counter
              </CardTitle>
              <CardDescription>
                Select your branch, name, and enter your PIN.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Branch selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Branch</label>
                <Select value={branchId} onValueChange={(id) => { setBranchId(id); setTellerId(""); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Teller selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Teller</label>
                <Select value={tellerId} onValueChange={setTellerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select teller…" />
                  </SelectTrigger>
                  <SelectContent>
                    {branchTellers.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled={t.active === false}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* PIN input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">PIN</label>
                <div className="relative">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={loginPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setLoginPin(val);
                      if (loginError) setLoginError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                    className="h-11 text-center text-lg tracking-[0.3em] font-mono"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {loginError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  >
                    <AlertTriangle className="size-4 shrink-0" />
                    {loginError}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit */}
              <Button
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                size="lg"
                onClick={handleLogin}
                disabled={loginLoading || !tellerId || !branchId}
              >
                {loginLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Sign In
              </Button>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="mr-1 size-3" />
              Back to home
            </Button>
          </p>
        </motion.div>
      </div>
    );
  }

  // ---- Dashboard (logged in) ----
  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Subtle grid pattern overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 text-foreground/[0.03] dark:text-foreground/[0.04] bg-grid-pattern"
      />
      {/* Connection status bar */}
      {!connected && (
        <div className="mb-4">
          <ConnectionStatusBar connected={connected} branchName={safeBranches.find((b) => b.id === branchId)?.name} />
        </div>
      )}
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
              {safeBranches.find((b) => b.id === branchId)?.name ?? "Branch"}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              {safeBranches.map((b) => (
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
            onClick={handleSignOut}
          >
            <LogOut className="size-3.5" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Analytics Chart */}
      {hourlyStats.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-muted-foreground" />
                Hourly Throughput
              </CardTitle>
              <CardDescription>
                Customers served & no-shows per hour (last 8h)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Subtle grid lines */}
                <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-0">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="border-b border-muted/30" />
                  ))}
                </div>
                <div className="flex items-end gap-1.5 h-28 relative">
                  {(() => {
                    const maxVal = Math.max(1, ...hourlyStats.map(s => s.served + s.noShow));
                    const peakHour = hourlyStats.reduce((peak, h) => (h.served + h.noShow) > (peak.served + peak.noShow) ? h : peak, hourlyStats[0]);
                    return hourlyStats.map((h) => {
                      const total = h.served + h.noShow;
                      const servedH = Math.max(2, (h.served / maxVal) * 100);
                      const noShowH = Math.max(0, (h.noShow / maxVal) * 100);
                      const isPeak = h.hour === peakHour.hour && total > 0;
                      return (
                        <div key={h.hour} className="flex flex-1 flex-col items-center gap-1 group relative">
                          {/* Hover tooltip */}
                          <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold">{h.served} served</p>
                              {h.noShow > 0 && <p className="text-rose-500">{h.noShow} no-show</p>}
                              {isPeak && <p className="text-emerald-500 font-semibold">⭐ Peak</p>}
                            </div>
                            <div className="size-2 rotate-45 border-b border-r bg-popover -mt-1" />
                          </div>
                          <div className="flex w-full flex-col items-center gap-0.5" style={{ height: '96px' }}>
                            <div className="flex w-full flex-col justify-end h-full gap-px">
                              {h.noShow > 0 && (
                                <div
                                  className="w-full rounded-t-sm bg-rose-300 dark:bg-rose-500/50 transition-all"
                                  style={{ height: `${noShowH}%` }}
                                />
                              )}
                              {h.served > 0 && (
                                <div
                                  className={cn(
                                    "w-full rounded-t-sm transition-all",
                                    isPeak
                                      ? "bg-emerald-500 dark:bg-emerald-400 ring-2 ring-emerald-300/50"
                                      : "bg-emerald-400 dark:bg-emerald-500/60"
                                  )}
                                  style={{ height: `${servedH}%` }}
                                />
                              )}
                              {total === 0 && (
                                <div className="w-full rounded-t-sm bg-muted/40" style={{ height: '4px' }} />
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "text-[10px] tabular-nums",
                            isPeak ? "text-emerald-500 font-bold" : "text-muted-foreground"
                          )}>
                            {h.hour}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-500/60" />
                  Served
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-rose-300 dark:bg-rose-500/50" />
                  No-show
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-500 ring-1 ring-emerald-300/50" />
                  Peak
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <motion.div
          animate={justCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          <StatCard
            icon={<Users className="size-4" />}
            label="Waiting"
            value={state?.waitingCount ?? 0}
            accent="amber"
            flash={justCompleted}
          />
        </motion.div>
        <motion.div
          animate={justCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <StatCard
            icon={<UserCheck className="size-4" />}
            label="Served today"
            value={state?.servedToday ?? 0}
            accent="emerald"
            flash={justCompleted}
            shine
          />
        </motion.div>
        <motion.div
          animate={justCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <StatCard
            icon={<TrendingUp className="size-4" />}
            label="Avg service"
            value={formatEta(state?.avgServiceTimeSec ?? 0)}
            accent="slate"
            flash={justCompleted}
          />
        </motion.div>
        <motion.div
          animate={justCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <StatCard
            icon={<XCircle className="size-4" />}
            label="No-shows"
            value={state?.noShowToday ?? 0}
            accent="rose"
            flash={justCompleted}
          />
        </motion.div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Now serving + actions */}
          <Card className="overflow-hidden relative">
            {/* Paused dimmed overlay */}
            {isPaused && !myServingToken && (
              <div className="pointer-events-none absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Coffee className="size-8 text-amber-500/60" />
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Counter is paused</p>
                  <p className="text-xs text-muted-foreground">Resume to accept new customers</p>
                </div>
              </div>
            )}
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
                <span className="text-balance text-sm font-semibold uppercase tracking-wide">
                  Your Counter
                </span>
              </div>
              {myServingToken && (
                <Badge className="border-white/30 bg-white/15 text-white">
                  {serviceTypeLabel(myServingToken.serviceType, safeServiceTypes)}
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
                  className="flex flex-col items-center gap-1 text-center animate-border-left-pulse"
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
                  <Hash className="size-10 opacity-30 animate-float-y" />
                  <p className="text-sm">No customer at your counter.</p>
                  <p className="text-xs">Call the next token to begin.</p>
                </div>
              )}

              {/* Paused banner */}
              {isPaused && !myServingToken && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                >
                  <Coffee className="size-4 shrink-0" />
                  <span className="text-sm font-medium">Counter paused</span>
                  <span className="text-sm text-amber-600 dark:text-amber-400">— you won't receive new customers</span>
                </motion.div>
              )}

              {/* Actions */}
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <div className="relative">
                  <Button
                    size="lg"
                    className="bg-emerald-600 text-white hover:bg-emerald-700 w-full relative overflow-hidden animate-scale-in"
                    onClick={handleNext}
                    disabled={!!busy || !!myServingToken || isPaused}
                  >
                    {/* Shimmer effect when people are waiting */}
                    {(state?.waitingCount ?? 0) > 0 && !myServingToken && !busy && !isPaused && (
                      <span className="absolute inset-0 animate-shimmer" />
                    )}
                    {busy === "next" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Megaphone className="size-4" />
                    )}
                    <span className="relative">Call Next</span>
                  </Button>
                </div>
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

              {/* Pause / Resume */}
              <div className="mt-3 flex justify-center">
                {isPaused ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    onClick={handleResume}
                    disabled={!!busy}
                  >
                    {busy === "resume" ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                    Resume Counter
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10"
                    onClick={handlePause}
                    disabled={!!busy || !!myServingToken}
                  >
                    {busy === "pause" ? <Loader2 className="size-3.5 animate-spin" /> : <Coffee className="size-3.5" />}
                    Pause Counter
                  </Button>
                )}
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
                    const tName = safeTellers.find((tl) => tl.id === t.tellerId)?.name ?? "Unknown";
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
                              {serviceTypeLabel(t.serviceType, safeServiceTypes)}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleExportCsv}
                    disabled={activity.length === 0}
                    title="Download today's activity log as a CSV file"
                  >
                    <Download className="size-3.5" />
                    Export CSV
                  </Button>
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
                              {serviceTypeLabel(entry.serviceType, safeServiceTypes)}
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
                        "group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        i === 0 &&
                          "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
                        transferTokenId === t.id && "ring-2 ring-amber-400 border-amber-300",
                        t.priority === "vip" && i !== 0 && "border-amber-300/60 dark:border-amber-500/30",
                        t.priority === "express" && i !== 0 && "border-slate-300/60 dark:border-slate-500/30"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-md font-bold tabular-nums",
                          i === 0
                            ? "bg-emerald-500 text-white"
                            : t.priority === "vip"
                            ? "bg-amber-500 text-white"
                            : t.priority === "express"
                            ? "bg-slate-400 text-white"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {priorityEmoji(t.priority) || t.number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">
                            {serviceTypeLabel(t.serviceType, safeServiceTypes)}
                          </p>
                          {t.priority !== "regular" && (
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", priorityBadgeClass(t.priority))}>
                              {priorityLabel(t.priority)}
                            </Badge>
                          )}
                        </div>
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
                      {/* Transfer button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        title="Transfer to another service"
                        onClick={() => {
                          setTransferTokenId(t.id);
                          setTransferServiceType(t.serviceType);
                        }}
                      >
                        <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                      </Button>
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
            {/* Transfer token panel */}
            <AnimatePresence>
              {transferTokenId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-t"
                >
                  <div className="space-y-3 px-1 pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <ArrowRightLeft className="size-4" />
                      Transfer Token
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Move this token to a different service type.
                    </p>
                    <Select value={transferServiceType} onValueChange={setTransferServiceType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                      <SelectContent>
                        {safeServiceTypes.filter(st => st.active !== false).map((st) => (
                          <SelectItem key={st.id} value={st.id}>
                            {st.name} (~{formatEta(st.estimatedSec)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
                        onClick={handleTransfer}
                        disabled={!!busy || !transferServiceType}
                      >
                        {busy === "transfer" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                        Transfer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setTransferTokenId(null); setTransferServiceType(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
  flash,
  shine,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "amber" | "emerald" | "slate" | "rose";
  flash?: boolean;
  shine?: boolean;
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
    <Card className={cn("dark-card-border", flash && "ring-2 ring-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-500/5 transition-all", shine && "card-shine")}>
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
