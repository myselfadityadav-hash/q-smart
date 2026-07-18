"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BellRing,
  Building2,
  Clock,
  Cpu,
  Database,
  Globe,
  Hash,
  Headset,
  MessageSquareQuote,
  Monitor,
  MonitorPlay,
  QrCode,
  Shield,
  Smartphone,
  Sparkles,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
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

/** Feature carousel items */
const FEATURES = [
  { icon: <Smartphone className="size-5" />, title: "Mobile-first", desc: "Join queues from any device — no app needed." },
  { icon: <Wifi className="size-5" />, title: "Real-time sync", desc: "Live position updates via WebSockets." },
  { icon: <BellRing className="size-5" />, title: "Smart notifications", desc: "Sound, vibration, and visual alerts when called." },
  { icon: <Clock className="size-5" />, title: "Smart ETAs", desc: "Rolling average service time for accurate wait estimates." },
  { icon: <MonitorPlay className="size-5" />, title: "Lobby display", desc: "Full-screen TV board for waiting areas." },
  { icon: <Shield className="size-5" />, title: "Admin dashboard", desc: "Manage branches, services, and tellers in one place." },
];

/** Testimonials */
const TESTIMONIALS = [
  { text: "No more standing in line!", author: "Sarah M.", role: "Customer" },
  { text: "Got called while having coffee ☕", author: "James K.", role: "Customer" },
  { text: "The ETA was spot on", author: "Priya R.", role: "Customer" },
  { text: "Our lobby is so much calmer now", author: "Alex T.", role: "Branch Manager" },
  { text: "Setup took 5 minutes — incredible", author: "Morgan L.", role: "Operations" },
];

/** Tech badges */
const TECH_BADGES = [
  { icon: <Globe className="size-3.5" />, label: "Next.js 16" },
  { icon: <Zap className="size-3.5" />, label: "Socket.IO" },
  { icon: <Database className="size-3.5" />, label: "SQLite" },
  { icon: <Cpu className="size-3.5" />, label: "Tailwind CSS 4" },
  { icon: <Monitor className="size-3.5" />, label: "shadcn/ui" },
];

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
  const goLobby = () => {
    router.push(`/?view=lobby&branch=${branchId}`);
  };

  // Feature carousel rotation
  const [featureIndex, setFeatureIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFeatureIndex((i) => (i + 1) % FEATURES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Testimonial auto-rotation
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTestimonialIndex((i) => (i + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Recently served counter with animation
  const [recentlyServed, setRecentlyServed] = useState(0);
  useEffect(() => {
    // Simulate recently served counter
    const id = setInterval(() => {
      setRecentlyServed((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Parallax scroll offset
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      {/* Subtle dot-grid pattern background (very faint) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 text-foreground/[0.04] dark:text-foreground/[0.05] bg-grid-pattern"
      />
      {/* Hero with gradient pattern background + animated gradient border */}
      <div className="relative rounded-3xl p-[2px] animate-gradient-border bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400">
        <div
          className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-8 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/30 sm:p-12 lg:p-16"
          style={{ transform: `translateY(${scrollY * 0.02}px)` }}
        >
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
            <h1 className="gradient-text bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-balance text-4xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300 sm:text-6xl">
              Q-Smart
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              Skip the physical line. Scan, grab a token, and wait wherever you want.
              Live positions and smart ETAs sync to your phone in real time.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
              <Pill icon={<Smartphone className="size-3.5" />} text="Mobile customer" />
              <Pill icon={<Monitor className="size-3.5" />} text="Teller dashboard" />
              <Pill icon={<MonitorPlay className="size-3.5" />} text="Lobby display" />
            </div>
          </motion.div>

          {/* Live Stats mini-bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground sm:gap-6"
          >
            <span className="flex items-center gap-1.5">
              <Building2 className="size-3.5 text-emerald-500" />
              <span className="font-semibold text-foreground">{branches.length}</span> Branches
            </span>
            <span className="size-1 rounded-full bg-muted-foreground/30" />
            <span className="flex items-center gap-1.5">
              <Hash className="size-3.5 text-emerald-500" />
              <span className="font-semibold text-foreground">4</span> Services
            </span>
            <span className="size-1 rounded-full bg-muted-foreground/30" />
            <span className="flex items-center gap-1.5">
              <Headset className="size-3.5 text-emerald-500" />
              <span className="font-semibold text-foreground">4</span> Tellers
            </span>
            <span className="size-1 rounded-full bg-muted-foreground/30" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-foreground shadow-sm card-shine dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <CheckCircleAnimated className="size-3.5 text-emerald-500" />
              <motion.span
                key={recentlyServed}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="relative z-[2] font-semibold text-foreground"
              >
                {recentlyServed}
              </motion.span>{" "}
              <span className="relative z-[2]">Served today</span>
            </span>
          </motion.div>

          {/* Feature carousel */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="mt-6 flex justify-center"
          >
            <div className="relative h-12 w-72 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={featureIndex}
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -16, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 flex items-center justify-center gap-2 text-sm"
                >
                  <span className="text-emerald-500">{FEATURES[featureIndex].icon}</span>
                  <span className="font-medium">{FEATURES[featureIndex].title}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-muted-foreground">{FEATURES[featureIndex].desc}</span>
                </motion.div>
              </AnimatePresence>
              {/* Carousel dots */}
              <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-1">
                {FEATURES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFeatureIndex(i)}
                    className={cn(
                      "size-1.5 rounded-full transition-all duration-300",
                      i === featureIndex
                        ? "w-4 bg-emerald-500"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Action cards */}
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {/* Customer card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="animate-slide-in-right"
        >
          <Card className="relative h-full overflow-hidden border-emerald-200/60 shadow-sm dark:border-emerald-500/20">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-500/10 blur-2xl" />
            {/* Animated dots pattern */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
              backgroundSize: '16px 16px',
            }} />
            <CardHeader className="relative">
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
            <CardContent className="relative space-y-5">
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
                    <div className="relative rounded-lg p-[2px] shadow-sm animate-glow-pulse bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 animate-gradient-border">
                      <div className="rounded-md bg-white p-2">
                        <QRCodeSVG value={customerUrl} size={96} level="M" />
                      </div>
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
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 active:animate-scale-in"
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
          className="animate-slide-in-right"
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

      {/* Lobby display card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-6"
      >
        <Card className="relative overflow-hidden border-teal-200/60 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm dark:border-teal-500/20">
          <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 size-40 rounded-full bg-teal-500/15 blur-3xl" />
          <CardContent className="relative flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-emerald-400">
                <MonitorPlay className="size-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Lobby Display
                </span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">
                A full-screen &ldquo;Now Serving&rdquo; board for your waiting area
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Cast it to a TV in the lobby. Big animated token numbers for every
                active counter, a live clock, the upcoming queue, and daily stats —
                all updated in real time over WebSockets.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <LobbyChip text="Big animated tokens" />
                <LobbyChip text="Per-counter cards" />
                <LobbyChip text="Live clock" />
                <LobbyChip text="Up-next queue" />
                <LobbyChip text="Kiosk auto-hide" />
                <LobbyChip text="Voice announcements" />
              </div>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-400"
              onClick={goLobby}
              disabled={loading || branches.length === 0}
            >
              <MonitorPlay className="size-4" />
              Launch lobby display
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-16"
      >
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          How it works
        </h2>
        <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
          {/* Connecting dashed line (desktop only) */}
          <div className="pointer-events-none absolute left-[16.67%] top-12 hidden h-px w-[33.33%] sm:block" style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgb(16 185 129 / 0.3) 0px, rgb(16 185 129 / 0.3) 6px, transparent 6px, transparent 12px)',
          }} />
          <div className="pointer-events-none absolute right-[16.67%] top-12 hidden h-px w-[33.33%] sm:block" style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgb(16 185 129 / 0.3) 0px, rgb(16 185 129 / 0.3) 6px, transparent 6px, transparent 12px)',
          }} />
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

      {/* Testimonial / Trust section — auto-rotating */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-16"
      >
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          What people say
        </h2>
        <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
          {/* Show 3 testimonials at a time, rotating */}
          {[0, 1, 2].map((offset) => {
            const idx = (testimonialIndex + offset) % TESTIMONIALS.length;
            const t = TESTIMONIALS[idx];
            return (
              <AnimatePresence mode="wait" key={`${testimonialIndex}-${offset}`}>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, delay: offset * 0.1 }}
                >
                  <QuoteCard text={t.text} author={t.author} role={t.role} />
                </motion.div>
              </AnimatePresence>
            );
          })}
        </div>
        {/* Testimonial dots */}
        <div className="mt-4 flex justify-center gap-1.5">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setTestimonialIndex(i)}
              className={cn(
                "size-2 rounded-full transition-all duration-300",
                i === testimonialIndex
                  ? "w-4 bg-emerald-500"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      </motion.div>

      {/* Footer area with tech badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="mt-16 flex flex-col items-center gap-4 border-t pt-8"
      >
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-emerald-500" />
            Real-time updates
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-emerald-500" />
            Instant notifications
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-emerald-500" />
            Smart ETAs
          </span>
        </div>

        {/* Tech badges */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TECH_BADGES.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {badge.icon}
              {badge.label}
            </span>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/60">
          Powered by Next.js · Socket.IO · SQLite
        </p>
      </motion.div>
    </div>
  );
}

/** Animated check-circle icon for the served counter */
function CheckCircleAnimated({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 3 }}
      />
      <motion.path
        d="M22 4 12 14.01l-3-3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.8, repeat: Infinity, repeatDelay: 3 }}
      />
    </motion.svg>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
      {icon}
      {text}
    </span>
  );
}

function LobbyChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">
      {text}
    </span>
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
    <div className="relative rounded-xl border bg-card p-5 transition-transform duration-200 hover:scale-[1.02] hover-lift">
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

function QuoteCard({ text, author, role }: { text: string; author: string; role?: string }) {
  return (
    <Card className="relative overflow-hidden hover-lift transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-emerald-50 dark:bg-emerald-500/5" />
      <CardContent className="relative pt-5">
        <MessageSquareQuote className="size-5 text-emerald-500/60" />
        <p className="mt-2 text-sm font-medium italic leading-relaxed">
          &ldquo;{text}&rdquo;
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          — {author}{role && <span className="text-muted-foreground/60"> · {role}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
