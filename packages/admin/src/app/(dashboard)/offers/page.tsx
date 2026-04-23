"use client";

import React, { useEffect, useState, useCallback } from "react";
import DashboardLoading from "../loading";
import { useAdminApi } from "@/hooks/use-admin-api";
import { useDebounce } from "@/hooks/use-debounce";
import type { OfferRow } from "@crivo/types";
import { Activity, CheckCircle, XCircle, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { OffersFiltersBar, DEFAULT_FILTERS, type OffersFilters } from "./_components/offers-filters";
import { OffersTable } from "./_components/offers-table";
import { OfferPreviewCard } from "./_components/offer-preview-card";
import { OfferEditModal } from "./_components/offer-edit-modal";

export default function OffersPage() {
  const api = useAdminApi();

  // Data
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ pending: 0, in_queue: 0, sent: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [filters, setFilters] = useState<OffersFilters>(DEFAULT_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 350);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail / Edit
  const [previewOffer, setPreviewOffer] = useState<OfferRow | null>(null);
  const [editOffer, setEditOffer] = useState<OfferRow | null>(null);

  // Fetch offers from server
  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: filters.page,
        page_size: filters.page_size,
        sort_by: filters.sort_by,
        sort_dir: filters.sort_dir,
        status: filters.status || undefined,
        category_id: filters.category_id || undefined,
        search: debouncedSearch || undefined,
        min_price: filters.min_price || undefined,
        max_price: filters.max_price || undefined,
        min_discount: filters.min_discount || undefined,
        min_score: filters.min_score || undefined,
      };

      const data = await api.getOffers(params);
      setOffers(data.offers || []);
      setTotal(data.total || 0);
      setCounts(data.counts || { pending: 0, in_queue: 0, sent: 0 });
    } catch (err) {
      console.error("Fetch offers error:", err);
      toast.error("Erro ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  }, [
    api,
    filters.page,
    filters.page_size,
    filters.sort_by,
    filters.sort_dir,
    filters.status,
    filters.category_id,
    debouncedSearch,
    filters.min_price,
    filters.max_price,
    filters.min_discount,
    filters.min_score,
  ]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Filter updates
  const updateFilters = useCallback((patch: Partial<OffersFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setSelected(new Set());
  }, []);

  // Selection
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === offers.length && offers.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(offers.map((o) => o.scored_offer_id)));
    }
  }, [selected.size, offers]);

  // Status changes
  const handleStatusChange = useCallback(
    async (id: string, status: string) => {
      if (status === "remove_from_queue") {
        await api.removeFromQueue(id);
        toast.success("Oferta removida da fila");
      } else {
        await api.updateOfferStatus(id, status);
        toast.success(
          status === "approved" ? "Oferta aprovada" : "Oferta rejeitada"
        );
      }
      setPreviewOffer(null);
      fetchOffers();
    },
    [api, fetchOffers]
  );

  // Bulk actions
  const handleBulk = useCallback(
    async (action: string) => {
      if (selected.size === 0) return;
      const ids = Array.from(selected);
      const count = ids.length;
      await api.bulkAction(ids, action);
      setSelected(new Set());
      toast.success(`${count} ofertas processadas`);
      fetchOffers();
    },
    [api, selected, fetchOffers]
  );

  // Edit modal handlers
  const handleSave = useCallback(
    async (
      id: string,
      content: { custom_title?: string; offer_body?: string; extra_notes?: string }
    ) => {
      await api.updateContent(id, content);
      fetchOffers();
    },
    [api, fetchOffers]
  );

  const handleApproveToQueue = useCallback(
    async (
      id: string,
      content: { custom_title?: string; offer_body?: string; extra_notes?: string }
    ) => {
      await api.approveToQueue(id, content);
      fetchOffers();
    },
    [api, fetchOffers]
  );

  const handleGenerateSuggestions = useCallback(
    async (id: string) => {
      return api.generateSuggestions(id);
    },
    [api]
  );

  if (loading && offers.length === 0) {
    return <DashboardLoading />;
  }

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2 font-display">
            Ofertas
            {loading && (
              <span className="text-xs text-muted-foreground font-normal animate-pulse">
                Carregando...
              </span>
            )}
          </h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Activity size={14} className="text-success" />
            <span className="font-mono tabular-nums">
              {counts.pending} pendentes
            </span>
            <span className="text-border mx-1">&middot;</span>
            <span className="font-mono tabular-nums">
              {counts.in_queue} na fila
            </span>
            <span className="text-border mx-1">&middot;</span>
            <span className="font-mono tabular-nums">
              {counts.sent} enviadas
            </span>
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-4">
        <OffersFiltersBar
          filters={filters}
          onChange={updateFilters}
          counts={counts}
          total={total}
        />
      </div>

      {/* Table */}
      <OffersTable
        offers={offers}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onRowClick={(o) => setPreviewOffer(o)}
        onEdit={(o) => setEditOffer(o)}
        onStatusChange={handleStatusChange}
        page={filters.page}
        pageSize={filters.page_size}
        total={total}
        onPageChange={(p) => updateFilters({ page: p })}
      />

      {/* Bulk Actions Floating Bar */}
      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-2xl p-2 flex items-center gap-4 transition-all duration-300 z-50",
          selected.size > 0
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-10 pointer-events-none"
        )}
      >
        <div className="pl-4 pr-2 flex items-center gap-2 border-r border-border py-1">
          <div className="w-5 h-5 rounded bg-success/20 text-success flex items-center justify-center text-xs font-bold font-mono">
            {selected.size}
          </div>
          <span className="text-sm font-medium text-foreground mr-2">
            selecionadas
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleBulk("approved")}
            className="flex items-center gap-2 px-4 py-2 bg-success/10 hover:bg-success/20 border border-success/30 text-success rounded-xl text-sm font-bold transition"
          >
            <CheckCircle size={16} /> Aprovar
          </button>
          <button
            onClick={() => handleBulk("rejected")}
            className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive rounded-xl text-sm font-bold transition"
          >
            <XCircle size={16} /> Rejeitar
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-center p-2 hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-xl transition border border-transparent">
              <MoreVertical size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem
                onClick={() => handleBulk("deleted")}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive/80"
              >
                Deletar permanentemente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Preview Sheet */}
      <OfferPreviewCard
        offer={previewOffer}
        open={previewOffer !== null}
        onClose={() => setPreviewOffer(null)}
        onEdit={(o) => {
          setPreviewOffer(null);
          setEditOffer(o);
        }}
        onStatusChange={handleStatusChange}
      />

      {/* Edit Modal */}
      <OfferEditModal
        offer={editOffer}
        open={editOffer !== null}
        onClose={() => setEditOffer(null)}
        onSave={handleSave}
        onApproveToQueue={handleApproveToQueue}
        onGenerateSuggestions={handleGenerateSuggestions}
      />
    </div>
  );
}
