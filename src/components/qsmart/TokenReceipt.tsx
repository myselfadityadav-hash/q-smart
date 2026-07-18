"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Branch, ServiceType, Token } from "@/lib/qsmart/types";
import { formatEta, priorityLabel } from "@/lib/qsmart/format";

interface TokenReceiptProps {
  token: Token;
  branch: Branch;
  serviceTypes: ServiceType[];
}

export function TokenReceipt({ token, branch, serviceTypes }: TokenReceiptProps) {
  const stName = serviceTypes.find((s) => s.id === token.serviceType)?.name ?? token.serviceType;
  const dateStr = new Date(token.joinedAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  const timeStr = new Date(token.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handlePrint}
      >
        <Printer className="size-3.5" />
        Print Receipt
      </Button>

      {/* Printable receipt — uses #token-receipt id for @media print targeting */}
      <div id="token-receipt" className="hidden" style={{ fontWeight: "normal" }}>
        <div style={{
          width: 300,
          margin: "0 auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 16,
          border: "2px dashed #9ca3af",
          borderRadius: 8,
        }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 18, fontWeight: 700 }}>Q-Smart</p>
            <p style={{ fontSize: 14 }}>Virtual Queue Token</p>
          </div>
          <div style={{
            borderTop: "1px solid #d1d5db",
            borderBottom: "1px solid #d1d5db",
            paddingTop: 8,
            paddingBottom: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Token #</span>
              <span style={{ fontWeight: 700, fontSize: 24 }}>{String(token.number).padStart(2, "0")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Branch</span>
              <span>{branch.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Service</span>
              <span>{stName}</span>
            </div>
            {token.priority !== "regular" && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Priority</span>
                <span style={{ fontWeight: 700 }}>{priorityLabel(token.priority)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Position</span>
              <span>#{token.position}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Est. Wait</span>
              <span>{formatEta(token.etaSec)}</span>
            </div>
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
            <span>{dateStr}</span>
            <span>{timeStr}</span>
          </div>
          <div style={{ marginTop: 12, textAlign: "center", color: "#9ca3af", fontSize: 10 }}>
            <p>Keep this receipt. You will be notified</p>
            <p>when it&apos;s your turn.</p>
          </div>
        </div>
      </div>
    </>
  );
}
