"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import type { OfferRow, AISuggestions } from "@crivo/types";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, CheckCircle, Save } from "lucide-react";
import { toast } from "sonner";

interface OfferEditModalProps {
  offer: OfferRow | null;
  open: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    content: { custom_title?: string; offer_body?: string; extra_notes?: string }
  ) => Promise<void>;
  onApproveToQueue: (
    id: string,
    content: { custom_title?: string; offer_body?: string; extra_notes?: string }
  ) => Promise<void>;
  onGenerateSuggestions: (id: string) => Promise<AISuggestions>;
}

export function OfferEditModal({
  offer,
  open,
  onClose,
  onSave,
  onApproveToQueue,
  onGenerateSuggestions,
}: OfferEditModalProps) {
  const [customTitle, setCustomTitle] = useState("");
  const [offerBody, setOfferBody] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync state when offer changes
  const [currentOfferId, setCurrentOfferId] = useState<string | null>(null);
  if (offer && offer.scored_offer_id !== currentOfferId) {
    setCurrentOfferId(offer.scored_offer_id);
    setCustomTitle(offer.custom_title || "");
    setOfferBody(offer.offer_body || "");
    setExtraNotes(offer.extra_notes || "");
    setSuggestions(null);
  }

  const handleGenerateSuggestions = useCallback(async () => {
    if (!offer) return;
    setLoadingSuggestions(true);
    try {
      const result = await onGenerateSuggestions(offer.scored_offer_id);
      setSuggestions(result);
    } catch {
      toast.error("Erro ao gerar sugestões");
    } finally {
      setLoadingSuggestions(false);
    }
  }, [offer, onGenerateSuggestions]);

  const handleSave = useCallback(async () => {
    if (!offer) return;
    setSaving(true);
    try {
      await onSave(offer.scored_offer_id, {
        custom_title: customTitle || undefined,
        offer_body: offerBody || undefined,
        extra_notes: extraNotes || undefined,
      });
      toast.success("Conteúdo salvo");
      onClose();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }, [offer, customTitle, offerBody, extraNotes, onSave, onClose]);

  const handleApprove = useCallback(async () => {
    if (!offer) return;
    setSaving(true);
    try {
      await onApproveToQueue(offer.scored_offer_id, {
        custom_title: customTitle || undefined,
        offer_body: offerBody || undefined,
        extra_notes: extraNotes || undefined,
      });
      toast.success("Oferta aprovada e na fila de envio!");
      onClose();
    } catch {
      toast.error("Erro ao aprovar");
    } finally {
      setSaving(false);
    }
  }, [offer, customTitle, offerBody, extraNotes, onApproveToQueue, onClose]);

  if (!offer) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center relative">
              {offer.thumbnail_url ? (
                // URL externa do MercadoLivre — unoptimized até configurar domínio no next.config
                <Image src={offer.thumbnail_url} fill alt="" className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{offer.title}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {formatCurrency(offer.current_price)}{" "}
                {offer.discount_percent > 0 && (
                  <span className="text-success">(-{Math.round(offer.discount_percent)}%)</span>
                )}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* AI Suggestions Button */}
          <button
            onClick={handleGenerateSuggestions}
            disabled={loadingSuggestions}
            className={cn(
              "w-full py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 border",
              loadingSuggestions
                ? "bg-muted border-border text-muted-foreground"
                : "bg-gradient-to-r from-violet-500/10 to-primary/10 border-violet-500/30 text-violet-400 hover:from-violet-500/20 hover:to-primary/20"
            )}
          >
            {loadingSuggestions ? (
              <><Loader2 size={16} className="animate-spin" /> Gerando sugestões...</>
            ) : (
              <><Sparkles size={16} /> Gerar Sugestões com IA</>
            )}
          </button>

          {/* Section 1: Title */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Título
            </label>
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={offer.title}
              className="bg-secondary border-border"
            />
            {suggestions && suggestions.titles.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-violet-400 font-bold flex items-center gap-1">
                  <Sparkles size={10} /> Sugestões de Título
                </p>
                {suggestions.titles.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setCustomTitle(t)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition border",
                      customTitle === t
                        ? "bg-violet-500/10 border-violet-500/30 text-foreground"
                        : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Message Body */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Corpo da Mensagem
            </label>
            <textarea
              value={offerBody}
              onChange={(e) => setOfferBody(e.target.value)}
              placeholder="Corpo da mensagem para o Telegram..."
              rows={5}
              className="flex w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
            {suggestions && suggestions.bodies.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-violet-400 font-bold flex items-center gap-1">
                  <Sparkles size={10} /> Sugestões de Corpo
                </p>
                {suggestions.bodies.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => setOfferBody(b)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs transition border whitespace-pre-line max-h-32 overflow-y-auto",
                      offerBody === b
                        ? "bg-violet-500/10 border-violet-500/30 text-foreground"
                        : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Notes */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Notas (internas)
            </label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Notas internas, não enviadas ao canal..."
              rows={2}
              className="flex w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground rounded-xl text-sm font-medium transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar Rascunho
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-success/10 hover:bg-success/20 border border-success/30 text-success rounded-xl text-sm font-bold transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Aprovar para Envio
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
