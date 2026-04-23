"use client";

import type { OfferRow } from "@/lib/types";
import Image from "next/image";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExternalLink, Pencil, CheckCircle, XCircle, Send, Clock, Globe } from "lucide-react";
import { ScoreBreakdownBar } from "./score-breakdown";

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; color: string; border: string; bg: string; label: string }
> = {
  pending: { icon: Clock, color: "text-warning", border: "border-warning/20", bg: "bg-warning/10", label: "Pendente" },
  in_queue: { icon: CheckCircle, color: "text-success", border: "border-success/20", bg: "bg-success/10", label: "Na Fila" },
  sent: { icon: Send, color: "text-primary", border: "border-primary/20", bg: "bg-primary/10", label: "Enviada" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { icon: Globe, color: "text-muted-foreground", border: "border-border/20", bg: "bg-gray-400/10", label: status };
  const Icon = config.icon;
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border", config.bg, config.border)}>
      <Icon size={12} className={config.color} />
      <span className={cn("text-[10px] uppercase tracking-wider font-bold", config.color)}>{config.label}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 90 ? "bg-gradient-to-br from-primary to-accent text-black shadow-[0_0_15px_var(--color-primary)] font-extrabold"
    : score >= 70 ? "bg-success text-black shadow-[0_0_10px_var(--color-success)]"
    : score >= 40 ? "bg-warning text-black shadow-[0_0_10px_var(--color-warning)]"
    : "bg-destructive text-white shadow-[0_0_10px_var(--color-destructive)]";
  return (
    <div className={cn("w-11 h-11 rounded-full flex items-center justify-center font-sans text-sm font-bold shrink-0", cls)}>
      {Math.round(score)}
    </div>
  );
}

interface OfferPreviewCardProps {
  offer: OfferRow | null;
  open: boolean;
  onClose: () => void;
  onEdit: (offer: OfferRow) => void;
  onStatusChange: (id: string, status: string) => void;
}

export function OfferPreviewCard({ offer, open, onClose, onEdit, onStatusChange }: OfferPreviewCardProps) {
  if (!offer) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background border-l-white/10 text-foreground">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="text-left text-foreground">Detalhes da Oferta</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Thumbnail */}
          {offer.thumbnail_url && (
            <div className="w-full h-48 bg-muted rounded-2xl flex items-center justify-center overflow-hidden border border-border relative">
              {/* URL externa do MercadoLivre — unoptimized até configurar domínio no next.config */}
              <Image src={offer.thumbnail_url} fill alt="" className="object-contain mix-blend-multiply dark:mix-blend-screen opacity-90" unoptimized />
            </div>
          )}

          {/* Title & ML ID */}
          <div>
            <h3 className="font-semibold text-lg text-foreground leading-tight">
              {offer.custom_title || offer.title}
            </h3>
            {offer.custom_title && (
              <p className="text-xs text-muted-foreground mt-1 line-through">{offer.title}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono border border-border px-2 py-0.5 rounded-full">
                ML ID: {offer.ml_id}
              </span>
            </div>
          </div>

          {/* Price Block */}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold font-mono text-foreground tracking-tight tabular-nums">
              {formatCurrency(offer.current_price)}
            </span>
            {offer.original_price && (
              <span className="text-lg text-muted-foreground line-through font-mono tabular-nums opacity-60">
                {formatCurrency(offer.original_price)}
              </span>
            )}
            <span className="px-2 py-1 rounded bg-success/10 text-success text-sm font-bold">
              -{Math.round(offer.discount_percent)}% OFF
            </span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {offer.lowest_price !== null && offer.current_price <= offer.lowest_price && (
              <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                Menor preço histórico
              </span>
            )}
            {offer.discount_percent >= 50 && (
              <span className="px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20">
                Super Desconto
              </span>
            )}
            {offer.free_shipping && (
              <span className="px-2 py-1 rounded bg-success/10 text-success text-xs font-bold border border-success/20">
                Frete Grátis
              </span>
            )}
          </div>

          {/* Score & Status Grid */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-secondary border border-border">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Score</p>
              <div className="mt-2"><ScoreBadge score={offer.final_score} /></div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status</p>
              <div className="mt-2"><StatusBadge status={offer.display_status} /></div>
            </div>

            {/* Score Breakdown */}
            {offer.score_breakdown && (
              <div className="col-span-2 border-t border-border pt-4 mt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">Composição do Score</p>
                <ScoreBreakdownBar breakdown={offer.score_breakdown} />
              </div>
            )}

            {/* Metadata */}
            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Metadata</p>
              <div className="grid grid-cols-2 gap-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Categoria</p>
                  <p className="text-sm text-foreground font-medium">{offer.category || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frete</p>
                  <p className="text-sm text-foreground font-medium">{offer.free_shipping ? "Grátis" : "Pago"}</p>
                </div>
                {offer.rating_stars !== null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Avaliação</p>
                    <p className="text-sm text-foreground font-medium">{offer.rating_stars} ({offer.rating_count || 0})</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Scoring</p>
                  <p className="text-sm text-foreground font-medium">{new Date(offer.scored_at).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Curated Content Preview */}
          {(offer.custom_title || offer.offer_body) && (
            <div className="p-4 rounded-2xl bg-secondary border border-border space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Conteúdo Curado</p>
              {offer.custom_title && (
                <p className="text-sm font-medium text-foreground">{offer.custom_title}</p>
              )}
              {offer.offer_body && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">{offer.offer_body}</p>
              )}
              {offer.extra_notes && (
                <p className="text-xs text-muted-foreground italic border-t border-border pt-2 mt-2">{offer.extra_notes}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(offer)}
              className="flex-1 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 border border-primary/30"
            >
              <Pencil size={16} /> Editar & Curar
            </button>
            <button
              onClick={() => window.open(offer.product_url, "_blank")}
              className="py-3 px-4 hover:bg-secondary/80 text-foreground rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 border border-border"
            >
              <ExternalLink size={16} />
            </button>
          </div>

          {/* Quick Status Actions */}
          {offer.display_status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => onStatusChange(offer.scored_offer_id, "approved")}
                className="flex-1 py-2.5 bg-success/10 hover:bg-success/20 border border-success/30 text-success rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> Aprovar
              </button>
              <button
                onClick={() => onStatusChange(offer.scored_offer_id, "rejected")}
                className="flex-1 py-2.5 bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
              >
                <XCircle size={16} /> Rejeitar
              </button>
            </div>
          )}
          {offer.display_status === "in_queue" && (
            <button
              onClick={() => onStatusChange(offer.scored_offer_id, "remove_from_queue")}
              className="w-full py-2.5 bg-warning/10 hover:bg-warning/20 border border-warning/30 text-warning rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
            >
              Remover da Fila
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
