"use client";

import type { OfferRow } from "@crivo/types";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Send,
  Clock,
  Globe,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { ScoreBreakdownBar } from "./score-breakdown";

// --- Status Badge ---
const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; color: string; border: string; bg: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: "text-warning",
    border: "border-warning/20",
    bg: "bg-warning/10",
    label: "Pendente",
  },
  in_queue: {
    icon: CheckCircle,
    color: "text-success",
    border: "border-success/20",
    bg: "bg-success/10",
    label: "Na Fila",
  },
  sent: {
    icon: Send,
    color: "text-primary",
    border: "border-primary/20",
    bg: "bg-primary/10",
    label: "Enviada",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    icon: Globe,
    color: "text-muted-foreground",
    border: "border-border/20",
    bg: "bg-gray-400/10",
    label: status,
  };
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
        config.bg,
        config.border
      )}
    >
      <Icon size={12} className={config.color} />
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider font-bold",
          config.color
        )}
      >
        {config.label}
      </span>
    </div>
  );
}

// --- Score Badge ---
function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 90
      ? "bg-gradient-to-br from-primary to-accent text-black shadow-[0_0_15px_var(--color-primary)] font-extrabold"
      : score >= 70
        ? "bg-success text-black shadow-[0_0_10px_var(--color-success)]"
        : score >= 40
          ? "bg-warning text-black shadow-[0_0_10px_var(--color-warning)]"
          : "bg-destructive text-white shadow-[0_0_10px_var(--color-destructive)]";
  return (
    <div
      className={cn(
        "w-11 h-11 rounded-full flex items-center justify-center font-sans text-sm font-bold shrink-0",
        cls
      )}
    >
      {Math.round(score)}
    </div>
  );
}

// --- Price badges ---
function PriceBadges({
  offer,
}: {
  offer: OfferRow;
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {offer.lowest_price !== null &&
        offer.current_price <= offer.lowest_price && (
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] uppercase tracking-wider font-bold">
            Menor preço
          </span>
        )}
      {offer.discount_percent >= 50 && (
        <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[9px] uppercase tracking-wider font-bold">
          {Math.round(offer.discount_percent)}% OFF
        </span>
      )}
      {offer.free_shipping && (
        <span className="px-1.5 py-0.5 rounded bg-success/10 text-success text-[9px] uppercase tracking-wider font-bold">
          Frete Grátis
        </span>
      )}
    </div>
  );
}

// --- Table Props ---
interface OffersTableProps {
  offers: OfferRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (offer: OfferRow) => void;
  onEdit: (offer: OfferRow) => void;
  onStatusChange: (id: string, status: string) => void;
  // Pagination
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function OffersTable({
  offers,
  selected,
  onToggleSelect,
  onToggleAll,
  onRowClick,
  onEdit,
  onStatusChange,
  page,
  pageSize,
  total,
  onPageChange,
}: OffersTableProps) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  const from = (page - 1) * pageSize + (total > 0 ? 1 : 0);
  const to = Math.min(page * pageSize, total);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-background border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              <th className="px-4 py-3 w-12 text-center">
                <Checkbox
                  checked={
                    offers.length > 0 && selected.size === offers.length
                  }
                  onCheckedChange={onToggleAll}
                  className="border-border data-[state=checked]:bg-success data-[state=checked]:border-success"
                />
              </th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3 w-32 text-center">Score</th>
              <th className="px-4 py-3 w-28">Status</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {offers.map((o) => {
              const isSelected = selected.has(o.scored_offer_id);
              return (
                <tr
                  key={o.scored_offer_id}
                  onClick={() => onRowClick(o)}
                  className={cn(
                    "group border-b border-border last:border-0 hover:bg-secondary transition duration-300 cursor-pointer relative",
                    isSelected ? "bg-success/5" : ""
                  )}
                >
                  <td
                    className="px-4 py-4 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() =>
                        onToggleSelect(o.scored_offer_id)
                      }
                      className="border-border data-[state=checked]:bg-success data-[state=checked]:border-success"
                    />
                  </td>

                  {/* Produto */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center">
                        {o.thumbnail_url ? (
                          <img
                            src={o.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen opacity-90"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 py-1">
                        <h4 className="font-medium text-[15px] text-foreground truncate pr-4">
                          {o.custom_title || o.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {o.category && (
                            <span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                              {o.category}
                            </span>
                          )}
                          {o.brand && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {o.brand}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
                            {o.scored_at?.slice(11, 16)}
                          </span>
                        </div>
                        <PriceBadges offer={o} />
                      </div>
                    </div>
                  </td>

                  {/* Preço */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col text-left">
                      <span className="font-mono text-lg font-bold text-foreground tracking-tight tabular-nums">
                        {formatCurrency(o.current_price)}
                      </span>
                      {o.original_price && (
                        <span className="font-mono text-[11px] text-muted-foreground line-through tabular-nums tracking-tight opacity-70">
                          {formatCurrency(o.original_price)}
                        </span>
                      )}
                      <span className="px-2 py-0.5 mt-1 self-start rounded bg-success/10 text-success text-[10px] uppercase tracking-wider font-bold inline-block">
                        -{Math.round(o.discount_percent)}% OFF
                      </span>
                    </div>
                  </td>

                  {/* Score */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-center gap-1.5">
                      <ScoreBadge score={o.final_score} />
                      {o.score_breakdown && (
                        <ScoreBreakdownBar
                          breakdown={o.score_breakdown}
                          className="w-16"
                        />
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <StatusBadge status={o.display_status} />
                  </td>

                  {/* Actions */}
                  <td
                    className="px-4 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => onEdit(o)}
                        className="p-1.5 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded-md transition"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      {o.display_status === "pending" && (
                        <button
                          onClick={() =>
                            onStatusChange(o.scored_offer_id, "approved")
                          }
                          className="p-1.5 hover:bg-success/20 text-muted-foreground hover:text-success rounded-md transition"
                          title="Aprovar"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {o.display_status !== "sent" &&
                        o.status !== "rejected" && (
                          <button
                            onClick={() =>
                              onStatusChange(
                                o.scored_offer_id,
                                "rejected"
                              )
                            }
                            className="p-1.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-md transition"
                            title="Rejeitar"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-20">
                  <p className="text-muted-foreground text-sm">
                    Nenhuma oferta encontrada.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 flex items-center justify-between text-sm bg-background border-t border-border">
        <p className="text-muted-foreground text-sm">
          Mostrando{" "}
          <span className="text-foreground font-bold font-mono">{from}</span> a{" "}
          <span className="text-foreground font-bold font-mono">{to}</span> de{" "}
          <span className="text-foreground font-bold font-mono">{total}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 font-mono text-sm font-bold">
            {page} / {totalPages}
          </div>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
