"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Clock,
  Gauge,
  Headset,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Star,
  Target,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  getAdminToken,
  setAdminToken,
} from "@/lib/qsmart/api";
import type {
  Admin,
  Branch,
  EtaAccuracyStats,
  FeedbackStats,
  ServiceType,
  Teller,
} from "@/lib/qsmart/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AdminViewProps {
  branches: Branch[];
  serviceTypes: ServiceType[];
  tellers: Teller[];
  onDataChanged: () => void;
}

const RATING_EMOJI: Record<number, string> = { 1: "😞", 2: "😐", 3: "😊" };
const RATING_LABEL: Record<number, string> = { 1: "Poor", 2: "Okay", 3: "Great" };

/** Detect 401 / unauthorized responses from the jsonFetch error message. */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    return /\(401\)|\b401\b|unauthorized/i.test(err.message);
  }
  return false;
}

/** Coerce a `boolean | number | undefined` (SQLite stores 0/1) to a real boolean. */
function toBool(v: boolean | number | undefined | null): boolean {
  return v === true || v === 1;
}

// ─── Branch Form ───────────────────────────────────────────────

interface BranchFormState {
  id: string;
  name: string;
  location: string;
  dailyResetEnabled: boolean;
}

function BranchFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Branch | null;
  onSubmit: (data: BranchFormState) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<BranchFormState>({
    id: "",
    name: "",
    location: "",
    dailyResetEnabled: false,
  });

  // Reset form when dialog opens/closes or editing changes
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setForm(
        editing
          ? {
              id: editing.id,
              name: editing.name,
              location: editing.location,
              dailyResetEnabled: toBool(editing.dailyResetEnabled),
            }
          : { id: "", name: "", location: "", dailyResetEnabled: false }
      );
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            {editing ? "Edit Branch" : "Add Branch"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update branch details below."
              : "Fill in the details to create a new branch."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="branch-id">Branch ID</Label>
              <Input
                id="branch-id"
                placeholder="e.g. downtown"
                value={form.id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, id: e.target.value }))
                }
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              id="branch-name"
              placeholder="e.g. Downtown Branch"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-location">Location</Label>
            <Input
              id="branch-location"
              placeholder="e.g. 123 Main Street"
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
              required
            />
          </div>

          {/* Daily reset toggle */}
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label
                htmlFor="branch-daily-reset"
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                <RotateCcw className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Daily token number reset
              </Label>
              <p className="text-xs text-muted-foreground">
                Reset token numbers to 1 at the start of each new day.
              </p>
            </div>
            <Switch
              id="branch-daily-reset"
              checked={form.dailyResetEnabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, dailyResetEnabled: checked }))
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service Type Form ─────────────────────────────────────────

interface ServiceTypeFormState {
  id: string;
  name: string;
  estimatedSec: number;
}

function ServiceTypeFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ServiceType | null;
  onSubmit: (data: ServiceTypeFormState) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ServiceTypeFormState>({
    id: "",
    name: "",
    estimatedSec: 300,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setForm(
        editing
          ? {
              id: editing.id,
              name: editing.name,
              estimatedSec: editing.estimatedSec,
            }
          : { id: "", name: "", estimatedSec: 300 }
      );
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-emerald-600 dark:text-emerald-400" />
            {editing ? "Edit Service Type" : "Add Service Type"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update service type details below."
              : "Fill in the details to create a new service type."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="stype-id">Service Type ID</Label>
              <Input
                id="stype-id"
                placeholder="e.g. deposits"
                value={form.id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, id: e.target.value }))
                }
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="stype-name">Name</Label>
            <Input
              id="stype-name"
              placeholder="e.g. Deposits"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stype-est">Estimated Time (seconds)</Label>
            <Input
              id="stype-est"
              type="number"
              min={10}
              placeholder="e.g. 300"
              value={form.estimatedSec}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  estimatedSec: parseInt(e.target.value, 10) || 0,
                }))
              }
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Service Type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Teller Form ───────────────────────────────────────────────

interface TellerFormState {
  id: string;
  name: string;
  branchId: string;
  pin: string;
}

function TellerFormDialog({
  open,
  onOpenChange,
  editing,
  branches,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Teller | null;
  branches: Branch[];
  onSubmit: (data: TellerFormState) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TellerFormState>({
    id: "",
    name: "",
    branchId: "",
    pin: "",
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setForm(
        editing
          ? {
              id: editing.id,
              name: editing.name,
              branchId: editing.branchId,
              pin: "",
            }
          : { id: "", name: "", branchId: "", pin: "" }
      );
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headset className="size-5 text-emerald-600 dark:text-emerald-400" />
            {editing ? "Edit Teller" : "Add Teller"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update teller details below."
              : "Fill in the details to create a new teller."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="teller-id">Teller ID</Label>
              <Input
                id="teller-id"
                placeholder="e.g. teller-5"
                value={form.id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, id: e.target.value }))
                }
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="teller-name">Name</Label>
            <Input
              id="teller-name"
              placeholder="e.g. Jane Smith"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teller-branch">Branch</Label>
            <Select
              value={form.branchId}
              onValueChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
            >
              <SelectTrigger id="teller-branch">
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teller-pin">PIN {editing && "(leave blank to keep)"}</Label>
            <Input
              id="teller-pin"
              type="password"
              placeholder="••••"
              value={form.pin}
              onChange={(e) =>
                setForm((f) => ({ ...f, pin: e.target.value }))
              }
              {...(editing ? {} : { required: true })}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Teller"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty state with illustration ──
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-muted-foreground"
    >
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
    </motion.div>
  );
}

// ─── Admin Login Screen ────────────────────────────────────────

function AdminLoginScreen({
  onSuccess,
  onBack,
}: {
  onSuccess: (admin: Admin) => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!username.trim()) {
      setError("Enter a username.");
      return;
    }
    if (!pin || pin.length !== 4) {
      setError("Enter a 4-digit PIN.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.adminLogin(username.trim(), pin);
      if (res.ok && res.token) {
        setAdminToken(res.token);
        onSuccess(res.admin);
      } else {
        setError("Invalid credentials.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring", stiffness: 120 }}
        className="w-full max-w-md"
      >
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <Shield className="size-7 text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Q-Smart</h1>
            <p className="text-sm text-muted-foreground">Admin Sign In</p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="size-5 text-emerald-500" />
              Admin access required
            </CardTitle>
            <CardDescription>
              Sign in with your admin username and PIN to manage branches,
              services, and tellers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="admin-username">
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                  className="h-11 pl-9"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* PIN */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="admin-pin">
                PIN
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setPin(val);
                    if (error) setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                  className="h-11 pl-9 text-center text-lg tracking-[0.3em] font-mono"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              size="lg"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Sign In
            </Button>

            {/* Demo hint */}
            <p className="rounded-md border border-dashed border-emerald-300/60 bg-emerald-50/50 px-3 py-2 text-center text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-400">
              Demo: <span className="font-mono font-semibold">admin</span> /{" "}
              <span className="font-mono font-semibold">9999</span>
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="mr-1 size-3" />
            Back to home
          </Button>
        </p>
      </motion.div>
    </div>
  );
}

// ─── Main AdminView ────────────────────────────────────────────

export function AdminView({
  branches,
  serviceTypes,
  tellers,
  onDataChanged,
}: AdminViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ── Admin auth state ──
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");
  const [admin, setAdmin] = useState<Admin | null>(null);

  // Verify persisted token on mount.
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setAuthState("unauthenticated");
      return;
    }
    api
      .adminMe()
      .then((res) => {
        if (res.ok && res.admin) {
          setAdmin(res.admin);
          setAuthState("authenticated");
        } else {
          setAdminToken(null);
          setAuthState("unauthenticated");
        }
      })
      .catch(() => {
        setAdminToken(null);
        setAuthState("unauthenticated");
      });
  }, []);

  /** Clear the session and bounce back to the login screen. */
  const handleAuthError = useCallback(() => {
    setAdminToken(null);
    setAdmin(null);
    setAuthState("unauthenticated");
    toast({
      title: "Session expired",
      description: "Please sign in again.",
      variant: "destructive",
    });
  }, [toast]);

  const handleLoginSuccess = useCallback(
    (nextAdmin: Admin) => {
      setAdmin(nextAdmin);
      setAuthState("authenticated");
      toast({ title: `Welcome, ${nextAdmin.username}!` });
    },
    [toast]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await api.adminLogout();
    } catch {
      // ignore — we clear the token locally regardless
    }
    setAdminToken(null);
    setAdmin(null);
    setAuthState("unauthenticated");
    toast({ title: "Signed out" });
  }, [toast]);

  // Dialog states – PIN Change
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinChanging, setPinChanging] = useState(false);

  const handleChangePin = useCallback(async () => {
    if (!pinCurrent || !pinNew || !pinConfirm) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }
    if (!/^\d{4,}$/.test(pinNew)) {
      toast({ title: "New PIN must be at least 4 digits", variant: "destructive" });
      return;
    }
    if (pinNew !== pinConfirm) {
      toast({ title: "New PINs do not match", variant: "destructive" });
      return;
    }
    setPinChanging(true);
    try {
      await api.adminChangePin(pinCurrent, pinNew);
      toast({ title: "PIN changed successfully" });
      setPinDialogOpen(false);
      setPinCurrent("");
      setPinNew("");
      setPinConfirm("");
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to change PIN", variant: "destructive" });
    } finally {
      setPinChanging(false);
    }
  }, [pinCurrent, pinNew, pinConfirm, toast]);

  // Loading state for mutations
  const [mutating, setMutating] = useState(false);

  // Dialog states – Branches
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Dialog states – Service Types
  const [stypeDialogOpen, setStypeDialogOpen] = useState(false);
  const [editingStype, setEditingStype] = useState<ServiceType | null>(null);

  // Dialog states – Tellers
  const [tellerDialogOpen, setTellerDialogOpen] = useState(false);
  const [editingTeller, setEditingTeller] = useState<Teller | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "destructive" | "default";
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Search/filter states
  const [branchSearch, setBranchSearch] = useState("");
  const [stypeSearch, setStypeSearch] = useState("");
  const [tellerSearch, setTellerSearch] = useState("");

  // Computed counts for badges and stats
  const activeBranches = branches.filter((b) => b.active !== false).length;
  const inactiveBranches = branches.length - activeBranches;
  const activeStypes = serviceTypes.filter((s) => s.active !== false).length;
  const inactiveStypes = serviceTypes.length - activeStypes;
  const activeTellers = tellers.filter((t) => t.active !== false).length;
  const inactiveTellers = tellers.length - activeTellers;

  // Filtered lists
  const filteredBranches = useMemo(
    () =>
      branches.filter(
        (b) =>
          b.name.toLowerCase().includes(branchSearch.toLowerCase()) ||
          b.location.toLowerCase().includes(branchSearch.toLowerCase())
      ),
    [branches, branchSearch]
  );
  const filteredStypes = useMemo(
    () =>
      serviceTypes.filter((s) =>
        s.name.toLowerCase().includes(stypeSearch.toLowerCase())
      ),
    [serviceTypes, stypeSearch]
  );
  const filteredTellers = useMemo(
    () =>
      tellers.filter(
        (t) =>
          t.name.toLowerCase().includes(tellerSearch.toLowerCase()) ||
          getBranchName(t.branchId).toLowerCase().includes(tellerSearch.toLowerCase())
      ),
    [tellers, tellerSearch]
  );

  // ── Branch handlers ──

  const handleBranchSubmit = async (data: BranchFormState) => {
    setMutating(true);
    try {
      if (editingBranch) {
        await api.updateBranch(editingBranch.id, {
          name: data.name,
          location: data.location,
          dailyResetEnabled: data.dailyResetEnabled,
        });
        toast({ title: "Branch updated", description: data.name });
      } else {
        await api.createBranch(
          data.id,
          data.name,
          data.location,
          data.dailyResetEnabled
        );
        toast({ title: "Branch created", description: data.name });
      }
      setBranchDialogOpen(false);
      setEditingBranch(null);
      onDataChanged();
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthError();
        return;
      }
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save branch",
        variant: "destructive",
      });
    } finally {
      setMutating(false);
    }
  };

  const handleBranchToggle = async (branch: Branch) => {
    const action = branch.active !== false ? "deactivate" : "activate";
    setConfirmDialog({
      open: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} "${branch.name}"?`,
      description: branch.active !== false
        ? `This will disable the branch "${branch.name}". Customers won't be able to join queues at this branch.`
        : `This will re-enable the branch "${branch.name}". Customers will be able to join queues again.`,
      variant: branch.active !== false ? "destructive" : "default",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setMutating(true);
        try {
          await api.updateBranch(branch.id, { active: !branch.active });
          toast({
            title: `Branch ${branch.active ? "deactivated" : "activated"}`,
            description: branch.name,
          });
          onDataChanged();
        } catch (err) {
          if (isAuthError(err)) {
            handleAuthError();
            return;
          }
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to toggle branch",
            variant: "destructive",
          });
        } finally {
          setMutating(false);
        }
      },
    });
  };

  // ── Service Type handlers ──

  const handleStypeSubmit = async (data: ServiceTypeFormState) => {
    setMutating(true);
    try {
      if (editingStype) {
        await api.updateServiceType(editingStype.id, {
          name: data.name,
          estimatedSec: data.estimatedSec,
        });
        toast({ title: "Service type updated", description: data.name });
      } else {
        await api.createServiceType(data.id, data.name, data.estimatedSec);
        toast({ title: "Service type created", description: data.name });
      }
      setStypeDialogOpen(false);
      setEditingStype(null);
      onDataChanged();
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthError();
        return;
      }
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save service type",
        variant: "destructive",
      });
    } finally {
      setMutating(false);
    }
  };

  const handleStypeToggle = async (st: ServiceType) => {
    const action = st.active !== false ? "deactivate" : "activate";
    setConfirmDialog({
      open: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} "${st.name}"?`,
      description: st.active !== false
        ? `Disabling "${st.name}" will remove it from the customer service selection.`
        : `Enabling "${st.name}" will make it available to customers again.`,
      variant: st.active !== false ? "destructive" : "default",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setMutating(true);
        try {
          await api.updateServiceType(st.id, { active: !st.active });
          toast({
            title: `Service type ${st.active ? "deactivated" : "activated"}`,
            description: st.name,
          });
          onDataChanged();
        } catch (err) {
          if (isAuthError(err)) {
            handleAuthError();
            return;
          }
          toast({
            title: "Error",
            description:
              err instanceof Error ? err.message : "Failed to toggle service type",
            variant: "destructive",
          });
        } finally {
          setMutating(false);
        }
      },
    });
  };

  // ── Teller handlers ──

  const handleTellerSubmit = async (data: TellerFormState) => {
    setMutating(true);
    try {
      if (editingTeller) {
        const updateData: { name?: string; branchId?: string; pin?: string } = {
          name: data.name,
          branchId: data.branchId,
        };
        if (data.pin) updateData.pin = data.pin;
        await api.updateTeller(editingTeller.id, updateData);
        toast({ title: "Teller updated", description: data.name });
      } else {
        await api.createTeller(data.id, data.name, data.branchId, data.pin || undefined);
        toast({ title: "Teller created", description: data.name });
      }
      setTellerDialogOpen(false);
      setEditingTeller(null);
      onDataChanged();
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthError();
        return;
      }
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save teller",
        variant: "destructive",
      });
    } finally {
      setMutating(false);
    }
  };

  const handleTellerToggle = async (teller: Teller) => {
    const action = teller.active !== false ? "deactivate" : "activate";
    setConfirmDialog({
      open: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} teller "${teller.name}"?`,
      description: teller.active !== false
        ? `Deactivating "${teller.name}" will prevent them from using the teller dashboard.`
        : `Activating "${teller.name}" will allow them to use the teller dashboard again.`,
      variant: teller.active !== false ? "destructive" : "default",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setMutating(true);
        try {
          await api.updateTeller(teller.id, { active: !teller.active });
          toast({
            title: `Teller ${teller.active ? "deactivated" : "activated"}`,
            description: teller.name,
          });
          onDataChanged();
        } catch (err) {
          if (isAuthError(err)) {
            handleAuthError();
            return;
          }
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to toggle teller",
            variant: "destructive",
          });
        } finally {
          setMutating(false);
        }
      },
    });
  };

  // ── Helper ──

  const getBranchName = (branchId: string) =>
    branches.find((b) => b.id === branchId)?.name ?? branchId;

  const formatSec = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // ── Auth gates ──
  if (authState === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-emerald-500" />
          <p className="text-sm">Verifying admin session…</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <AdminLoginScreen
        onSuccess={handleLoginSuccess}
        onBack={() => router.push("/")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Decorative header with gradient and stats summary */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 size-40 rounded-full bg-teal-400/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Shield className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-sm text-emerald-100">
                  {admin
                    ? `Signed in as ${admin.username}`
                    : "Manage branches, service types, and tellers"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                  <Building2 className="size-3.5" />
                  <span className="font-bold">{branches.length}</span> Branches
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                  <Clock className="size-3.5" />
                  <span className="font-bold">{serviceTypes.length}</span> Services
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                  <Headset className="size-3.5" />
                  <span className="font-bold">{tellers.length}</span> Tellers
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border-white/20 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                onClick={() => setPinDialogOpen(true)}
              >
                <Lock className="size-3.5" />
                Change PIN
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border-white/20 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                onClick={handleSignOut}
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="branches" className="space-y-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="branches" className="gap-1.5">
            <Building2 className="size-4" />
            <span className="hidden sm:inline">Branches</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
              {branches.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="service-types" className="gap-1.5">
            <Clock className="size-4" />
            <span className="hidden sm:inline">Service Types</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
              {serviceTypes.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="tellers" className="gap-1.5">
            <Headset className="size-4" />
            <span className="hidden sm:inline">Tellers</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
              {tellers.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Branches Tab ── */}
        <TabsContent value="branches">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                    Branches
                  </CardTitle>
                  <CardDescription>
                    Manage your branch locations
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setEditingBranch(null);
                    setBranchDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Branch
                </Button>
              </CardHeader>
              <CardContent>
                {/* Quick stats row */}
                <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {activeBranches} active
                  </span>
                  {inactiveBranches > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-slate-400" />
                      {inactiveBranches} inactive
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <RotateCcw className="size-3 text-emerald-600 dark:text-emerald-400" />
                    {branches.filter((b) => toBool(b.dailyResetEnabled)).length}{" "}
                    daily-reset
                  </span>
                </div>

                {/* Search bar */}
                {branches.length > 0 && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search branches..."
                      value={branchSearch}
                      onChange={(e) => setBranchSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}

                {branches.length === 0 ? (
                  <EmptyState
                    icon={<Building2 className="size-8 opacity-30" />}
                    title="No branches yet"
                    description='Click "Add Branch" to get started'
                  />
                ) : filteredBranches.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No branches match &ldquo;{branchSearch}&rdquo;
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence>
                          {filteredBranches.map((branch) => (
                            <motion.tr
                              key={branch.id}
                              initial={{ opacity: 0, backgroundColor: "rgba(16,185,129,0.05)" }}
                              animate={{ opacity: 1, backgroundColor: "transparent" }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="transition-colors hover:bg-muted/50"
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                    <Building2 className="size-4" />
                                  </div>
                                  {branch.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="size-3.5 text-muted-foreground/60" />
                                  {branch.location}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant={
                                      branch.active !== false
                                        ? "default"
                                        : "secondary"
                                    }
                                    className={
                                      branch.active !== false
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                        : ""
                                    }
                                  >
                                    {branch.active !== false ? "Active" : "Inactive"}
                                  </Badge>
                                  {toBool(branch.dailyResetEnabled) && (
                                    <span
                                      title="Daily token number reset enabled"
                                      className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    >
                                      <RotateCcw className="size-3" />
                                      Daily reset
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    onClick={() => {
                                      setEditingBranch(branch);
                                      setBranchDialogOpen(true);
                                    }}
                                    disabled={mutating}
                                    title="Edit branch"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                      "size-8 transition-colors",
                                      branch.active !== false
                                        ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                        : "text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                    )}
                                    onClick={() => handleBranchToggle(branch)}
                                    disabled={mutating}
                                    title={
                                      branch.active !== false
                                        ? "Deactivate"
                                        : "Activate"
                                    }
                                  >
                                    {branch.active !== false ? (
                                      <ToggleRight className="size-4" />
                                    ) : (
                                      <ToggleLeft className="size-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Service Types Tab ── */}
        <TabsContent value="service-types">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-5 text-emerald-600 dark:text-emerald-400" />
                    Service Types
                  </CardTitle>
                  <CardDescription>
                    Define the services offered at branches
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setEditingStype(null);
                    setStypeDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Service Type
                </Button>
              </CardHeader>
              <CardContent>
                {/* Quick stats row */}
                <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {activeStypes} active
                  </span>
                  {inactiveStypes > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-slate-400" />
                      {inactiveStypes} inactive
                    </span>
                  )}
                </div>

                {/* Search bar */}
                {serviceTypes.length > 0 && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search service types..."
                      value={stypeSearch}
                      onChange={(e) => setStypeSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}

                {serviceTypes.length === 0 ? (
                  <EmptyState
                    icon={<Clock className="size-8 opacity-30" />}
                    title="No service types yet"
                    description='Click "Add Service Type" to get started'
                  />
                ) : filteredStypes.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No service types match &ldquo;{stypeSearch}&rdquo;
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Est. Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence>
                          {filteredStypes.map((st) => (
                            <motion.tr
                              key={st.id}
                              initial={{ opacity: 0, backgroundColor: "rgba(16,185,129,0.05)" }}
                              animate={{ opacity: 1, backgroundColor: "transparent" }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="transition-colors hover:bg-muted/50"
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                    <Clock className="size-4" />
                                  </div>
                                  {st.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="size-3.5 text-muted-foreground/60" />
                                  {formatSec(st.estimatedSec)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    st.active !== false ? "default" : "secondary"
                                  }
                                  className={
                                    st.active !== false
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                      : ""
                                  }
                                >
                                  {st.active !== false ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    onClick={() => {
                                      setEditingStype(st);
                                      setStypeDialogOpen(true);
                                    }}
                                    disabled={mutating}
                                    title="Edit service type"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                      "size-8 transition-colors",
                                      st.active !== false
                                        ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                        : "text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                    )}
                                    onClick={() => handleStypeToggle(st)}
                                    disabled={mutating}
                                    title={
                                      st.active !== false
                                        ? "Deactivate"
                                        : "Activate"
                                    }
                                  >
                                    {st.active !== false ? (
                                      <ToggleRight className="size-4" />
                                    ) : (
                                      <ToggleLeft className="size-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Tellers Tab ── */}
        <TabsContent value="tellers">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Headset className="size-5 text-emerald-600 dark:text-emerald-400" />
                    Tellers
                  </CardTitle>
                  <CardDescription>
                    Manage teller accounts and assignments
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setEditingTeller(null);
                    setTellerDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Teller
                </Button>
              </CardHeader>
              <CardContent>
                {/* Quick stats row */}
                <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {activeTellers} active
                  </span>
                  {inactiveTellers > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-slate-400" />
                      {inactiveTellers} inactive
                    </span>
                  )}
                </div>

                {/* Search bar */}
                {tellers.length > 0 && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search tellers..."
                      value={tellerSearch}
                      onChange={(e) => setTellerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}

                {tellers.length === 0 ? (
                  <EmptyState
                    icon={<Headset className="size-8 opacity-30" />}
                    title="No tellers yet"
                    description='Click "Add Teller" to get started'
                  />
                ) : filteredTellers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No tellers match &ldquo;{tellerSearch}&rdquo;
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence>
                          {filteredTellers.map((teller) => (
                            <motion.tr
                              key={teller.id}
                              initial={{ opacity: 0, backgroundColor: "rgba(16,185,129,0.05)" }}
                              animate={{ opacity: 1, backgroundColor: "transparent" }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="transition-colors hover:bg-muted/50"
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                    <Headset className="size-4" />
                                  </div>
                                  {teller.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="size-3.5 text-muted-foreground/60" />
                                  {getBranchName(teller.branchId)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    teller.active !== false
                                      ? "default"
                                      : "secondary"
                                  }
                                  className={
                                    teller.active !== false
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                      : ""
                                  }
                                >
                                  {teller.active !== false ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    onClick={() => {
                                      setEditingTeller(teller);
                                      setTellerDialogOpen(true);
                                    }}
                                    disabled={mutating}
                                    title="Edit teller"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                      "size-8 transition-colors",
                                      teller.active !== false
                                        ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                        : "text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                    )}
                                    onClick={() => handleTellerToggle(teller)}
                                    disabled={mutating}
                                    title={
                                      teller.active !== false
                                        ? "Deactivate"
                                        : "Activate"
                                    }
                                  >
                                    {teller.active !== false ? (
                                      <ToggleRight className="size-4" />
                                    ) : (
                                      <ToggleLeft className="size-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <BranchFormDialog
        open={branchDialogOpen}
        onOpenChange={setBranchDialogOpen}
        editing={editingBranch}
        onSubmit={handleBranchSubmit}
        loading={mutating}
      />
      <ServiceTypeFormDialog
        open={stypeDialogOpen}
        onOpenChange={setStypeDialogOpen}
        editing={editingStype}
        onSubmit={handleStypeSubmit}
        loading={mutating}
      />
      <TellerFormDialog
        open={tellerDialogOpen}
        onOpenChange={setTellerDialogOpen}
        editing={editingTeller}
        branches={branches}
        onSubmit={handleTellerSubmit}
        loading={mutating}
      />

      {/* Confirmation dialog for disable/enable actions */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => {
        if (!open) setConfirmDialog((prev) => ({ ...prev, open: false }));
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDialog.onConfirm}
              className={cn(
                confirmDialog.variant === "destructive" &&
                  "bg-rose-600 text-white hover:bg-rose-700"
              )}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={(open) => { setPinDialogOpen(open); if (!open) { setPinCurrent(""); setPinNew(""); setPinConfirm(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5 text-emerald-600" />
              Change PIN
            </DialogTitle>
            <DialogDescription>
              Update your admin PIN. The new PIN must be at least 4 digits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pin-current">Current PIN</Label>
              <Input
                id="pin-current"
                type="password"
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter current PIN"
                value={pinCurrent}
                onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-new">New PIN</Label>
              <Input
                id="pin-new"
                type="password"
                inputMode="numeric"
                maxLength={10}
                placeholder="At least 4 digits"
                value={pinNew}
                onChange={(e) => setPinNew(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-confirm">Confirm new PIN</Label>
              <Input
                id="pin-confirm"
                type="password"
                inputMode="numeric"
                maxLength={10}
                placeholder="Re-enter new PIN"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
              />
              {pinNew && pinConfirm && pinNew !== pinConfirm && (
                <p className="text-xs text-rose-600">PINs do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleChangePin}
              disabled={pinChanging || !pinCurrent || !pinNew || !pinConfirm || pinNew !== pinConfirm}
            >
              {pinChanging && <Loader2 className="mr-2 size-4 animate-spin" />}
              Change PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ETA Accuracy + Customer Satisfaction sections */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <EtaAccuracySection branches={branches} onAuthError={handleAuthError} />
        <CustomerSatisfactionSection branches={branches} onAuthError={handleAuthError} />
      </div>
    </div>
  );
}

/** ETA Accuracy section — compares predicted vs actual wait times. */
function EtaAccuracySection({
  branches,
  onAuthError,
}: {
  branches: Branch[];
  onAuthError: () => void;
}) {
  const [selectedBranch, setSelectedBranch] = useState(
    branches[0]?.id ?? "main"
  );
  const [stats, setStats] = useState<EtaAccuracyStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(
    async (branchId: string) => {
      setLoading(true);
      try {
        const data = await api.getEtaAccuracy(branchId);
        setStats(data);
      } catch (err) {
        if (isAuthError(err)) {
          onAuthError();
          return;
        }
        setStats(null);
      } finally {
        setLoading(false);
      }
    },
    [onAuthError]
  );

  useEffect(() => {
    fetchStats(selectedBranch);
  }, [selectedBranch, fetchStats]);

  const branchName =
    branches.find((b) => b.id === selectedBranch)?.name ?? selectedBranch;

  const formatSec = (sec: number) => {
    if (!isFinite(sec)) return "—";
    if (sec < 60) return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // MAPE colour band: green ≤20%, amber ≤40%, red >40%
  const mapePct = stats ? Math.round(stats.mape * 100) : 0;
  const mapeBand =
    mapePct <= 20
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
      : mapePct <= 40
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400";

  // Average error direction: positive avgErrorSec = predicted > actual (over-prediction, good for customer).
  // We display "under-predicted" when actual > predicted (avgActualSec > avgPredictedSec).
  const underPredicted = stats ? stats.avgActualSec > stats.avgPredictedSec : false;

  // Distribution buckets
  const buckets = stats?.buckets ?? { under: 0, close: 0, over: 0 };
  const totalBuckets = buckets.under + buckets.close + buckets.over;
  const underPct = totalBuckets > 0 ? (buckets.under / totalBuckets) * 100 : 0;
  const closePct = totalBuckets > 0 ? (buckets.close / totalBuckets) * 100 : 0;
  const overPct = totalBuckets > 0 ? (buckets.over / totalBuckets) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
              ETA Accuracy
            </CardTitle>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardDescription>
            How close predicted wait times were to actual wait times at{" "}
            {branchName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !stats || stats.sampleSize === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Target className="size-10 opacity-30" />
              <p className="text-sm">No data yet</p>
              <p className="text-xs">
                ETA accuracy will appear once tokens are called.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Sample size */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Inbox className="size-3.5" />
                Based on{" "}
                <span className="font-semibold text-foreground">
                  {stats.sampleSize}
                </span>{" "}
                token{stats.sampleSize !== 1 ? "s" : ""} called today
              </div>

              {/* Predicted vs Actual side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    Avg Predicted
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatSec(stats.avgPredictedSec)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Gauge className="size-3" />
                    Avg Actual
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatSec(stats.avgActualSec)}
                  </p>
                </div>
              </div>

              {/* Average error with direction */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {underPredicted ? (
                    <TrendingUp className="size-4 text-rose-500" />
                  ) : (
                    <TrendingDown className="size-4 text-emerald-500" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Error</p>
                    <p className="text-sm font-medium">
                      {formatSec(stats.avgErrorSec)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {underPredicted ? "under-predicted" : "over-predicted"}
                      </span>
                    </p>
                  </div>
                </div>
                {/* MAPE badge */}
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">MAPE</p>
                  <Badge className={cn("mt-0.5 font-semibold", mapeBand)}>
                    {mapePct}%
                  </Badge>
                </div>
              </div>

              {/* Within 60s progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Within ±60s of predicted</span>
                  <span className="font-semibold tabular-nums">
                    {Math.round(stats.within60sPct)}%
                  </span>
                </div>
                <Progress
                  value={stats.within60sPct}
                  className="h-2 bg-muted"
                />
              </div>

              {/* Distribution buckets — horizontal stacked bar */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Prediction distribution
                </p>
                {totalBuckets === 0 ? (
                  <div className="h-3 rounded-full bg-muted" />
                ) : (
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="bg-rose-400 dark:bg-rose-500/70"
                      initial={{ width: 0 }}
                      animate={{ width: `${underPct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      title={`Under-predicted: ${buckets.under}`}
                    />
                    <motion.div
                      className="bg-emerald-400 dark:bg-emerald-500/70"
                      initial={{ width: 0 }}
                      animate={{ width: `${closePct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      title={`Close (±60s): ${buckets.close}`}
                    />
                    <motion.div
                      className="bg-amber-400 dark:bg-amber-500/70"
                      initial={{ width: 0 }}
                      animate={{ width: `${overPct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      title={`Over-predicted: ${buckets.over}`}
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-rose-400 dark:bg-rose-500/70" />
                    <span className="text-muted-foreground">Under</span>
                    <span className="font-semibold tabular-nums">
                      {buckets.under}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-500/70" />
                    <span className="text-muted-foreground">Close</span>
                    <span className="font-semibold tabular-nums">
                      {buckets.close}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-amber-400 dark:bg-amber-500/70" />
                    <span className="text-muted-foreground">Over</span>
                    <span className="font-semibold tabular-nums">
                      {buckets.over}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Customer Satisfaction stats section — shows feedback data per branch */
function CustomerSatisfactionSection({
  branches,
  onAuthError,
}: {
  branches: Branch[];
  onAuthError: () => void;
}) {
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id ?? "main");
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(
    async (branchId: string) => {
      setLoading(true);
      try {
        const data = await api.getFeedbackStats(branchId);
        setStats(data);
      } catch (err) {
        if (isAuthError(err)) {
          onAuthError();
          return;
        }
        setStats(null);
      } finally {
        setLoading(false);
      }
    },
    [onAuthError]
  );

  useEffect(() => {
    fetchStats(selectedBranch);
  }, [selectedBranch, fetchStats]);

  const branchName = branches.find((b) => b.id === selectedBranch)?.name ?? selectedBranch;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="size-4 text-amber-500" />
              Customer Satisfaction
            </CardTitle>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardDescription>
            Feedback collected from customers after service completion at {branchName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !stats || stats.totalResponses === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <MessageSquare className="size-10 opacity-30" />
              <p className="text-sm">No feedback collected yet today.</p>
              <p className="text-xs">Ratings will appear here after customers complete service.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Average rating display */}
              <div className="flex items-center justify-center gap-3 rounded-xl border bg-gradient-to-r from-amber-50/50 to-emerald-50/50 p-6 dark:from-amber-500/5 dark:to-emerald-500/5">
                <span className="text-5xl">
                  {stats.avgRating >= 2.5 ? "😊" : stats.avgRating >= 1.5 ? "😐" : "😞"}
                </span>
                <div className="text-center">
                  <p className="text-4xl font-bold tabular-nums">{stats.avgRating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">out of 3.0</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stats.totalResponses} response{stats.totalResponses !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {/* Distribution bars */}
              <div className="space-y-2">
                {[3, 2, 1].map((rating) => {
                  const count = rating === 1 ? stats.distribution.rating1 : rating === 2 ? stats.distribution.rating2 : stats.distribution.rating3;
                  const pct = stats.totalResponses > 0 ? Math.round((count / stats.totalResponses) * 100) : 0;
                  const barColor = rating === 3 ? "bg-emerald-400 dark:bg-emerald-500/60" : rating === 2 ? "bg-amber-400 dark:bg-amber-500/60" : "bg-rose-400 dark:bg-rose-500/60";
                  return (
                    <div key={rating} className="flex items-center gap-3 text-sm">
                      <span className="w-8 text-center text-lg">{RATING_EMOJI[rating]}</span>
                      <span className="w-12 text-muted-foreground">{RATING_LABEL[rating]}</span>
                      <div className="flex-1 h-3 rounded-full bg-muted/50 overflow-hidden">
                        <motion.div
                          className={cn("h-full rounded-full", barColor)}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums font-medium">{pct}%</span>
                      <span className="w-6 text-right text-xs text-muted-foreground">({count})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
