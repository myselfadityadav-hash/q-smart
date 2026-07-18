"use client";

import { Clock, Hash, Timer, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceType, Token, TokenPriority } from "@/lib/qsmart/types";
import {
  STATUS_LABEL,
  formatClock,
  formatEta,
  priorityBadgeClass,
  priorityEmoji,
  priorityLabel,
  serviceTypeLabel,
  statusBadgeClass,
} from "@/lib/qsmart/format";

interface QueueCardProps {
  token: Token | null;
  serviceTypes: ServiceType[];
  /** "hero" = large customer-facing display; "compact" = queue list row. */
  variant?: "hero" | "compact";
  nowServingNumber?: number | null;
  highlight?: boolean;
}

export function QueueCard({
  token,
  serviceTypes,
  variant = "hero",
  nowServingNumber,
  highlight,
}: QueueCardProps) {
  if (!token) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Hash className="size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No token yet</p>
        </CardContent>
      </Card>
    );
  }

  const isCalled = token.status === "called";
  const isWaiting = token.status === "waiting";

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors",
          highlight && "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md font-bold tabular-nums",
            isCalled
              ? "bg-emerald-500 text-white"
              : token.priority === "vip"
              ? "bg-amber-500 text-white"
              : token.priority === "express"
              ? "bg-slate-400 text-white"
              : "bg-muted text-foreground"
          )}
        >
          {priorityEmoji(token.priority) || token.number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">
              {serviceTypeLabel(token.serviceType, serviceTypes)}
            </p>
            {token.priority !== "regular" && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", priorityBadgeClass(token.priority))}>
                {priorityLabel(token.priority)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Joined {formatClock(token.joinedAt)}
          </p>
        </div>
        <div className="text-right">
          {isWaiting ? (
            <>
              <p className="text-xs text-muted-foreground">Position</p>
              <p className="text-sm font-semibold tabular-nums">#{token.position}</p>
            </>
          ) : (
            <Badge variant="outline" className={statusBadgeClass(token.status)}>
              {STATUS_LABEL[token.status]}
            </Badge>
          )}
        </div>
        {isWaiting && (
          <div className="hidden text-right sm:block">
            <p className="text-xs text-muted-foreground">ETA</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatEta(token.etaSec)}
            </p>
          </div>
        )}
      </div>
    );
  }

  // hero variant
  return (
    <Card
      className={cn(
        "overflow-hidden border-0 shadow-lg",
        isCalled && "ring-2 ring-emerald-400",
        token.priority === "vip" && !isCalled && "ring-2 ring-amber-400/50",
        token.priority === "express" && !isCalled && "ring-1 ring-slate-400/30"
      )}
    >
      <div
        className={cn(
          "px-6 py-5 text-white",
          isCalled
            ? "bg-gradient-to-br from-emerald-500 to-teal-600"
            : token.priority === "vip"
            ? "bg-gradient-to-br from-amber-500 to-amber-700"
            : token.priority === "express"
            ? "bg-gradient-to-br from-slate-500 to-slate-700"
            : "bg-gradient-to-br from-slate-700 to-slate-900"
        )}
      >
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn(
              "border-white/30 bg-white/10 text-white",
              isCalled && "border-white/40"
            )}
          >
            {STATUS_LABEL[token.status]}
          </Badge>
          <div className="flex items-center gap-1.5">
            {token.priority !== "regular" && (
              <Badge variant="outline" className="border-white/40 bg-white/20 text-white text-xs">
                {priorityEmoji(token.priority)} {priorityLabel(token.priority)}
              </Badge>
            )}
            <span className="text-xs text-white/80">
              {serviceTypeLabel(token.serviceType, serviceTypes)}
            </span>
          </div>
        </div>
        <p className="mt-4 text-sm uppercase tracking-widest text-white/70">
          Your Token
        </p>
        <motion.p
          key={token.number}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
          className={cn(
            "font-mono text-7xl font-black leading-none tabular-nums",
            isCalled && "animate-glow-pulse"
          )}
        >
          {String(token.number).padStart(2, "0")}
        </motion.p>
      </div>
      <CardContent className="grid grid-cols-3 gap-2 pt-5">
        <Stat
          icon={<Hash className="size-4" />}
          label="Position"
          value={isWaiting ? `#${token.position}` : "—"}
          highlight={isWaiting}
        />
        <Stat
          icon={<Timer className="size-4" />}
          label="Est. Wait"
          value={isWaiting ? formatEta(token.etaSec) : isCalled ? "Now" : "—"}
        />
        <Stat
          icon={<UserRound className="size-4" />}
          label="Now Serving"
          value={nowServingNumber != null ? String(nowServingNumber) : "—"}
        />
        <div className="col-span-3 flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          Joined at {formatClock(token.joinedAt)}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/60 px-3 py-2", highlight && "animate-count-up")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
