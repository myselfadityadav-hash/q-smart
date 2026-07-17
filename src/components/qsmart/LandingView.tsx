"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BellRing,
  Building2,
  Clock,
  Monitor,
  QrCode,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Branch } from "@/lib/qsmart/types";

interface LandingViewProps {
  branches: Branch[];
  loading: boolean;
}

export function LandingView({ branches, loading }: LandingViewProps) {
  const router = useRouter();
  const [branchId, setBranchId] = useState<string>(
    branches[0]?.id ?? "main"
  );

  const selected = branches.find((b) => b.id === branchId) ?? branches[0];
  const customerUrl =
    typeof window !== "undefined" && selected
      ? `${window.location.origin}/?view=customer&branch=${selected.id}`
      : "";

  const goCustomer = () => {
    router.push(`/?view=customer&branch=${branchId}`);
  };
  const goTeller = () => {
    router.push(`/?view=teller`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      {/* Hero with gradient pattern background */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-8 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/30 sm:p-12 lg:p-16">
        {/* Subtle pattern overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }} />
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-teal-400/10 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative flex flex-col items-center text-center"
        >
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            <Sparkles className="size-3.5" />
            Real-Time Virtual Queuing
          </Badge>
          <h1 className="bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-4xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300 sm:text-6xl">
            Q-Smart
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Skip the physical line. Scan, grab a token, and wait wherever you want.
            Live positions and smart ETAs sync to your phone in real time.
          </p>
        </motion.div>
      </div>

      {/* Action cards */}
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {/* Customer card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="relative h-full overflow-hidden border-emerald-200/60 shadow-sm dark:border-emerald-500/20">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-500/10 blur-2xl" />
            <CardHeader>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Smartphone className="size-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Customer
                </span>
              </div>
              <CardTitle className="text-2xl">Join a queue from your phone</CardTitle>
              <CardDescription>
                Pick a branch, scan the QR code, and grab your token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Branch</label>
                <Select value={branchId} onValueChange={setBranchId} disabled={loading}>
                  <SelectTrigger className="w-full">
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
                {selected && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="size-3.5" />
                    {selected.location}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
                  {customerUrl ? (
                    <div className="rounded-lg bg-white p-2 shadow-sm">
                      <QRCodeSVG value={customerUrl} size={96} level="M" />
                    </div>
                  ) : (
                    <div className="flex size-24 items-center justify-center">
                      <QrCode className="size-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-medium">Scan to join</p>
                    <p className="max-w-[14rem] break-all text-xs text-muted-foreground">
                      {customerUrl || "Loading…"}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={goCustomer}
                disabled={loading || branches.length === 0}
              >
                Get in line
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Teller card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="relative h-full overflow-hidden shadow-sm">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-slate-500/10 blur-2xl" />
            <CardHeader>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Monitor className="size-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Teller
                </span>
              </div>
              <CardTitle className="text-2xl">Manage the queue dashboard</CardTitle>
              <CardDescription>
                Call next, complete service, and mark no-shows in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="space-y-3">
                <Feature
                  icon={<Users className="size-4" />}
                  title="Live queue"
                  desc="See waiting customers, positions, and ETAs at a glance."
                />
                <Feature
                  icon={<Zap className="size-4" />}
                  title="One-tap actions"
                  desc="Call next, complete, or mark no-show — broadcast instantly."
                />
                <Feature
                  icon={<BellRing className="size-4" />}
                  title="Smart analytics"
                  desc="Rolling average service time and daily served counts."
                />
              </ul>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={goTeller}
              >
                Open teller dashboard
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-16"
      >
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Step
            n={1}
            icon={<QrCode className="size-5" />}
            title="Scan & join"
            desc="Scan the branch QR code and tap to grab a virtual token."
          />
          <Step
            n={2}
            icon={<Clock className="size-5" />}
            title="Wait anywhere"
            desc="Track your live position and ETA — no standing in line."
          />
          <Step
            n={3}
            icon={<BellRing className="size-5" />}
            title="Get called"
            desc="We notify you the moment your token is called."
          />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          {icon}
        </div>
        <span className="text-3xl font-black text-muted-foreground/20">
          {n}
        </span>
      </div>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
