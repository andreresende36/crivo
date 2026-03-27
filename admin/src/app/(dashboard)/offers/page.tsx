"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import DashboardLoading from "../loading";
import { useSupabase } from "@/hooks/use-supabase";
import { useAdminApi } from "@/hooks/use-admin-api";
import {
  Globe,
  CheckCircle,
  XCircle,
  Send,
  Clock,
  Search,
  ExternalLink,
  ArrowUpDown,
  MoreVertical,
  ChevronDown,
  Filter,
  Check,
  ChevronLeft,
  ChevronRight,
  Activity
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Types ---
interface OfferRow {
  scored_offer_id: string;
  product_id: string;
  ml_id: string;
  title: string;
  current_price: number;
  original_price: number | null;
  discount_percent: number;
  thumbnail_url: string | null;
  product_url: string;
  free_shipping: boolean;
  final_score: number;
  status: string;
  scored_at: string;
  queue_priority: number;
  admin_notes: string | null;
  category_name: string | null;
  badge_name: string | null;
}

// --- UI Components ---
function ScoreBadge({ score }: { score: number }) {
  const getStyleClasses = (s: number) => {
    if (s >= 90) return "bg-gradient-to-br from-primary to-accent text-black shadow-[0_0_15px_var(--color-primary)] font-extrabold";
    if (s >= 70) return "bg-success text-black shadow-[0_0_10px_var(--color-success)]";
    if (s >= 40) return "bg-warning text-black shadow-[0_0_10px_var(--color-warning)]";
    return "bg-destructive text-white shadow-[0_0_10px_var(--color-destructive)]";
  };
  return (
    <div className={cn("w-11 h-11 rounded-full flex items-center justify-center font-sans text-sm font-bold shrink-0", getStyleClasses(score))}>
      {Math.round(score)}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; border: string; bg: string; label: string }> = {
  approved: { icon: CheckCircle, color: "text-success", border: "border-success/20", bg: "bg-success/10", label: "Crivo!" },
  pending: { icon: Clock, color: "text-warning", border: "border-warning/20", bg: "bg-warning/10", label: "Garimpando..." },
  rejected: { icon: XCircle, color: "text-destructive", border: "border-destructive/20", bg: "bg-destructive/10", label: "Rejeitado" },
  sent: { icon: Send, color: "text-primary", border: "border-primary/20", bg: "bg-primary/10", label: "Enviado" },
};

function StatusBadge({ status }: { status: string }) {
  const config = Object.keys(STATUS_CONFIG).includes(status) 
    ? STATUS_CONFIG[status] 
    : { icon: Globe, color: "text-muted-foreground", border: "border-border/20", bg: "bg-gray-400/10", label: status };
  
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border", config.bg, config.border)}>
      <Icon size={12} className={config.color} />
      <span className={cn("text-[10px] uppercase tracking-wider font-bold", config.color)}>
        {config.label}
      </span>
    </div>
  );
}

export default function OffersPage() {
  const supabase = useSupabase();
  const api = useAdminApi();
  
  // Data
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScraped, setLastScraped] = useState<string | null>(null);

  // View State
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailOffer, setDetailOffer] = useState<OfferRow | null>(null);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [sortBy, setSortBy] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("scored_offers")
      .select(`
        id,
        product_id,
        final_score,
        status,
        scored_at,
        queue_priority,
        admin_notes,
        products!inner (
          ml_id,
          title,
          current_price,
          original_price,
          discount_percent,
          thumbnail_url,
          product_url,
          free_shipping,
          categories ( name ),
          badges ( name )
        )
      `)
      .order("scored_at", { ascending: false })
      .limit(1000); // Fetch a heavy chunk, paginate locally for snappy feel

    const { data, error } = await query;
    if (error) {
      console.error("Fetch offers error:", error);
      toast.error("Erro ao carregar ofertas");
      setLoading(false);
      return;
    }

    const mapped: OfferRow[] = (data || []).map((row: any) => {
      const p = row.products;
      const cat = p?.categories;
      const bdg = p?.badges;
      return {
        scored_offer_id: row.id,
        product_id: row.product_id,
        ml_id: p?.ml_id,
        title: p?.title,
        current_price: p?.current_price,
        original_price: p?.original_price,
        discount_percent: p?.discount_percent,
        thumbnail_url: p?.thumbnail_url,
        product_url: p?.product_url,
        free_shipping: p?.free_shipping,
        final_score: row.final_score,
        status: row.status,
        scored_at: row.scored_at,
        queue_priority: row.queue_priority,
        admin_notes: row.admin_notes,
        category_name: cat?.name || null,
        badge_name: bdg?.name || null,
      };
    });

    setOffers(mapped);
    if (mapped.length > 0) setLastScraped(mapped[0].scored_at);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    if (active) {
      fetchOffers();
    }
    return () => { active = false; };
  }, [fetchOffers]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("offers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scored_offers" },
        () => fetchOffers()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchOffers]);

  // Derived Data
  const categories = useMemo(() => {
    const cats = new Set(offers.map(o => o.category_name).filter(Boolean));
    return Array.from(cats) as string[];
  }, [offers]);

  const filteredOffers = useMemo(() => {
    let result = offers;
    
    // 1. Status Tab
    if (activeTab !== "all") {
      result = result.filter(o => o.status === activeTab);
    }
    
    // 2. Category Filter
    if (categoryFilter !== "all") {
      result = result.filter(o => o.category_name === categoryFilter);
    }
    
    // 3. Search Search
    if (search.trim() !== "") {
      const lowerSearch = search.toLowerCase();
      result = result.filter(o => o.title.toLowerCase().includes(lowerSearch) || o.ml_id.includes(lowerSearch));
    }
    
    // 4. Sort
    result = [...result].sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case "score": valA = a.final_score; valB = b.final_score; break;
        case "price": valA = a.current_price; valB = b.current_price; break;
        case "discount": valA = a.discount_percent; valB = b.discount_percent; break;
        case "title": valA = a.title.toLowerCase(); valB = b.title.toLowerCase(); break;
        default: valA = a.scored_at; valB = b.scored_at; break;
      }
      
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [offers, activeTab, categoryFilter, search, sortBy, sortDir]);

  // Mini KPIs based on filters
  const { totalAprovadas, totalPendentes, totalRejeitadas, scoreMedio, descontoMedio, maiorDescontoMsg } = useMemo(() => {
    const aprovadas = offers.filter(o => o.status === "approved").length;
    const pendentes = offers.filter(o => o.status === "pending").length;
    const rejeitadas = offers.filter(o => o.status === "rejected").length;
    
    if (filteredOffers.length === 0) return { totalAprovadas: aprovadas, totalPendentes: pendentes, totalRejeitadas: rejeitadas, scoreMedio: 0, descontoMedio: 0, maiorDescontoMsg: "—" };
    
    const sumScore = filteredOffers.reduce((acc, o) => acc + o.final_score, 0);
    const sumDiscount = filteredOffers.reduce((acc, o) => acc + o.discount_percent, 0);
    const maxOffer = filteredOffers.reduce((prev, current) => (prev.discount_percent > current.discount_percent) ? prev : current);

    return {
      totalAprovadas: aprovadas,
      totalPendentes: pendentes,
      totalRejeitadas: rejeitadas,
      scoreMedio: Math.round(sumScore / filteredOffers.length),
      descontoMedio: Math.round(sumDiscount / filteredOffers.length),
      maiorDescontoMsg: `${Math.round(maxOffer.discount_percent)}% OFF (${maxOffer.title.slice(0, 15)}...)`
    };
  }, [offers, filteredOffers]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredOffers.length / itemsPerPage) || 1;
  const paginatedOffers = filteredOffers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Actions
  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
      if (col === "title" || col === "price") setSortDir("asc");
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paginatedOffers.length && paginatedOffers.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginatedOffers.map(o => o.scored_offer_id)));
    }
  };

  const handleStatusChange = async (id: string, status: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // Optimistic UI updates
    setOffers(prev => prev.map(o => o.scored_offer_id === id ? { ...o, status } : o));
    
    toast.success(`Movida para: ${status === 'approved' ? 'Aprovadas' : 'Rejeitadas'}`);
    await api.updateOfferStatus(id, status);
  };

  const handleBulk = async (action: string) => {
    if (selected.size === 0) return;
    
    const count = selected.size;
    const arrayIds = Array.from(selected);
    
    // Optimistic bulk update
    if (action === "approved" || action === "rejected") {
      setOffers(prev => prev.map(o => arrayIds.includes(o.scored_offer_id) ? { ...o, status: action } : o));
    }

    setSelected(new Set());
    toast.success(`${count} ofertas processadas em lote com sucesso.`);
    await api.bulkAction(arrayIds, action);
  };

  const openSheet = (offer: OfferRow, e: React.MouseEvent) => {
    // Only open if click is not on a button or checkbox
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="checkbox"]')) return;
    setDetailOffer(offer);
  };

  const handleSheetHotkeys = useCallback(async (action: "approved" | "rejected") => {
    if (!detailOffer) return;
    await api.updateOfferStatus(detailOffer.scored_offer_id, action);
    toast.success(action === "approved" ? "Oferta Aprovada!" : "Oferta Rejeitada!");
    
    const currentIndex = filteredOffers.findIndex(o => o.scored_offer_id === detailOffer.scored_offer_id);
    const nextOffer = filteredOffers[currentIndex + 1];
    setDetailOffer(nextOffer || null);
    fetchOffers();
  }, [detailOffer, filteredOffers, api, fetchOffers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!detailOffer) return;
      if (e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); handleSheetHotkeys("approved"); }
      if (e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); handleSheetHotkeys("rejected"); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailOffer, handleSheetHotkeys]);

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      
      {/* HEADER DA PÁGINA */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2 font-display">
            Ofertas Tracker
            <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-foreground mt-1 border border-border">
              {filteredOffers.length} DE {offers.length}
            </span>
          </h2>
          {lastScraped ? (
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
              <Activity size={14} className="text-success" />
              Último scraping: <span className="font-mono">{new Date(lastScraped).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </p>
          ) : (
            <p className="text-muted-foreground mt-1">Gestão de ofertas pontuadas pelo modelo de AI.</p>
          )}
        </div>

        {/* QUICK FILTERS */}
        <div className="flex items-center gap-2 bg-secondary border border-border px-4 py-2 rounded-xl text-sm shadow-sm backdrop-blur-md">
          <div className="relative w-full md:w-60">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-7 bg-transparent border-transparent focus-visible:ring-0 focus-visible:border-transparent h-8 shadow-none w-full"
            />
          </div>

          <div className="w-px h-6 bg-border mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer">
              <span className="hidden sm:block">
                {categoryFilter === "all" ? "Categorias" : "1 Categoria"}
              </span>
              <Filter size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border text-foreground">
              <DropdownMenuLabel>Filtrar por Categoria</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="focus:bg-secondary cursor-pointer" onClick={() => { setCategoryFilter("all"); setCurrentPage(1); }}>
                {categoryFilter === "all" ? <Check size={14} className="mr-2 text-success" /> : <span className="w-6" />}
                Todas
              </DropdownMenuItem>
              {categories.map(c => (
                <DropdownMenuItem key={c} className="focus:bg-secondary cursor-pointer text-xs py-2" onClick={() => { setCategoryFilter(c); setCurrentPage(1); }}>
                  {categoryFilter === c ? <Check size={14} className="mr-2 text-success shrink-0" /> : <span className="w-6 shrink-0" />}
                  <span className="truncate">{c}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* TABS & MINI KPIS */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-4 overflow-x-auto no-scrollbar mb-4">
        <div className="flex gap-2 text-sm font-medium bg-secondary p-1 rounded-xl border border-border">
          {[
            { id: "all", label: "Todas", count: offers.length },
            { id: "approved", label: "Aprovadas", count: totalAprovadas },
            { id: "pending", label: "Pendentes", count: totalPendentes },
            { id: "rejected", label: "Rejeitadas", count: totalRejeitadas }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setCurrentPage(1); }}
              className={cn(
                "px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap",
                activeTab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label} <span className="opacity-60 text-xs ml-1 font-mono">({t.count})</span>
            </button>
          ))}
        </div>

        {/* INLINE KPIs (Contextualized) */}
        <div className="hidden sm:flex items-center gap-6 px-4 py-2 bg-secondary border border-border rounded-xl shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Score Médio</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={cn("w-2 h-2 rounded-full", scoreMedio >= 75 ? "bg-success" : "bg-warning")} />
              <span className="font-mono text-foreground text-sm tabular-nums">{scoreMedio}</span>
            </div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Desconto Médio</span>
            <span className="font-mono text-foreground text-sm tabular-nums mt-0.5">{descontoMedio}%</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Maior Deal</span>
            <span className="text-foreground text-sm mt-0.5 truncate max-w-30" title={maiorDescontoMsg}>{maiorDescontoMsg}</span>
          </div>
        </div>
      </div>

      {/* TABLE LIST */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-200">
            <thead>
              <tr className="bg-background border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                <th className="px-4 py-3 w-12 text-center">
                  <Checkbox 
                    checked={paginatedOffers.length > 0 && selected.size === paginatedOffers.length} 
                    onCheckedChange={toggleAll}
                    className="border-border data-[state=checked]:bg-success data-[state=checked]:border-success"
                  />
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-foreground transition group" onClick={() => handleSort("title")}>
                  <div className="flex items-center gap-1">Produto <ArrowUpDown size={12} className={cn("opacity-0 transition-opacity", sortBy === 'title' && "opacity-100", sortDir === 'desc' && "rotate-180")} /></div>
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-foreground transition group" onClick={() => handleSort("price")}>
                   <div className="flex items-center gap-1">Preço <ArrowUpDown size={12} className={cn("opacity-0 transition-opacity", sortBy === 'price' && "opacity-100", sortDir === 'desc' && "rotate-180")} /></div>
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-foreground transition group w-24" onClick={() => handleSort("score")}>
                   <div className="flex justify-center items-center gap-1">Score <ArrowUpDown size={12} className={cn("opacity-0 transition-opacity", sortBy === 'score' && "opacity-100", sortDir === 'desc' && "rotate-180")} /></div>
                </th>
                <th className="px-4 py-3 w-32">Status</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedOffers.map((o, i) => {
                const isSelected = selected.has(o.scored_offer_id);
                return (
                  <tr 
                    key={o.scored_offer_id} 
                    onClick={(e) => { openSheet(o, e) }}
                    className={cn(
                      "group border-b border-border last:border-0 hover:bg-secondary transition duration-300 cursor-pointer relative",
                      isSelected ? "bg-success/5" : ""
                    )}
                  >
                    <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleSelect(o.scored_offer_id)}
                        className="border-border data-[state=checked]:bg-success data-[state=checked]:border-success"
                      />
                    </td>
                    
                    {/* Produto */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-secondary border border-border shrink-0 overflow-hidden relative flex items-center justify-center">
                          {o.thumbnail_url ? (
                            <img src={o.thumbnail_url} alt="" className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen opacity-90" />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 py-1">
                          <h4 className="font-medium text-[15px] text-foreground truncate pr-4">{o.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {o.category_name && (
                              <span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                                {o.category_name}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
                              {o.scored_at.slice(11, 16)}
                            </span>
                          </div>
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
                      <div className="flex justify-center">
                         <ScoreBadge score={o.final_score} />
                      </div>
                    </td>

                    {/* Status & Inline Actions */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 shrink-0 transition-opacity duration-200">
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                          {o.status !== 'approved' && (
                             <button onClick={(e) => handleStatusChange(o.scored_offer_id, "approved", e)} className="p-1.5 hover:bg-success/20 text-muted-foreground hover:text-success rounded-md transition" title="Aprovar">
                               <CheckCircle size={16} />
                             </button>
                          )}
                          {o.status !== 'rejected' && (
                             <button onClick={(e) => handleStatusChange(o.scored_offer_id, "rejected", e)} className="p-1.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-md transition" title="Rejeitar">
                               <XCircle size={16} />
                             </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Actions Menu */}
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                       <button onClick={() => window.open(o.product_url, '_blank')} className="p-1.5 hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-md transition" title="Abrir no Mercado Livre">
                         <MoreVertical size={16} />
                       </button>
                    </td>
                  </tr>
                );
              })}
              
              {paginatedOffers.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <Search size={32} className="text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">Nenhuma oferta reflete os filtros atuais.</p>
                      <button onClick={() => { setActiveTab("all"); setCategoryFilter("all"); setSearch(""); }} className="text-xs text-success hover:underline uppercase tracking-wider font-bold">Limpar Filtros</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="p-4 flex items-center justify-between text-sm bg-background border-t border-border mt-auto">
           <p className="text-muted-foreground text-sm">
             Mostrando <span className="text-foreground font-bold font-mono">{(currentPage - 1) * itemsPerPage + (filteredOffers.length ? 1 : 0)}</span> a <span className="text-foreground font-bold font-mono">{Math.min(currentPage * itemsPerPage, filteredOffers.length)}</span> de <span className="text-foreground font-bold font-mono">{filteredOffers.length}</span>
           </p>
           <div className="flex items-center gap-2">
             <button 
               onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
               disabled={currentPage === 1}
               className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:hover:bg-secondary transition"
             >
               <ChevronLeft size={16} />
             </button>
             <div className="px-3 font-mono text-sm font-bold">
               {currentPage} / {totalPages}
             </div>
             <button 
               onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
               disabled={currentPage === totalPages}
               className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:hover:bg-secondary transition"
             >
               <ChevronRight size={16} />
             </button>
           </div>
        </div>
      </div>

      {/* BULK ACTIONS FLOATING BAR */}
      <div 
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-2xl p-2 flex items-center gap-4 transition-all duration-300 z-50",
          selected.size > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
        )}
      >
        <div className="pl-4 pr-2 flex items-center gap-2 border-r border-border py-1">
           <div className="w-5 h-5 rounded bg-success/20 text-success flex items-center justify-center text-xs font-bold font-mono">
             {selected.size}
           </div>
           <span className="text-sm font-medium text-foreground mr-2">selecionadas</span>
        </div>
        <div className="flex gap-2">
           <button onClick={() => handleBulk("approved")} className="flex items-center gap-2 px-4 py-2 bg-success/10 hover:bg-success/20 border border-success/30 text-success rounded-xl text-sm font-bold transition">
             <CheckCircle size={16} /> Aprovar
           </button>
           <button onClick={() => handleBulk("rejected")} className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive rounded-xl text-sm font-bold transition">
             <XCircle size={16} /> Rejeitar
           </button>
           <DropdownMenu>
             <DropdownMenuTrigger className="flex items-center justify-center p-2 hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-xl transition border border-transparent">
               <MoreVertical size={16} />
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end" className="bg-card border-border">
               <DropdownMenuItem onClick={() => handleBulk("deleted")} className="text-destructive focus:bg-destructive/10 focus:text-destructive/80">
                 Deletar permanentemente
               </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>
        </div>
      </div>

      {/* DETAIL SHEET (Preservado e integrado) */}
      <Sheet open={detailOffer !== null} onOpenChange={(open) => !open && setDetailOffer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background border-l-white/10 text-foreground">
          {detailOffer && (
            <>
              <SheetHeader className="pb-4 border-b border-border">
                <SheetTitle className="text-left text-foreground">Detalhes da Oferta</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                
                {detailOffer.thumbnail_url && (
                  <div className="w-full h-48 bg-muted rounded-2xl flex items-center justify-center overflow-hidden border border-border">
                    <img src={detailOffer.thumbnail_url} alt="" className="h-full object-contain mix-blend-multiply dark:mix-blend-screen opacity-90" />
                  </div>
                )}
                
                <div>
                  <h3 className="font-semibold text-lg text-foreground leading-tight">{detailOffer.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono border border-border px-2 py-0.5 rounded-full">ML ID: {detailOffer.ml_id}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl font-bold font-mono text-foreground tracking-tight tabular-nums">
                    {formatCurrency(detailOffer.current_price)}
                  </span>
                  {detailOffer.original_price && (
                    <span className="text-lg text-muted-foreground line-through font-mono tabular-nums opacity-60">
                      {formatCurrency(detailOffer.original_price)}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded bg-success/10 text-success text-sm font-bold">
                    -{Math.round(detailOffer.discount_percent)}% OFF
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-secondary border border-border">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Score Algorítmico</p>
                    <div className="mt-2"><ScoreBadge score={detailOffer.final_score} /></div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status Atual</p>
                    <div className="mt-2"><StatusBadge status={detailOffer.status} /></div>
                  </div>
                  <div className="col-span-2 border-t border-border pt-4 mt-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Metadata</p>
                    <div className="grid grid-cols-2 gap-y-3">
                      <div><p className="text-xs text-muted-foreground">Categoria</p><p className="text-sm text-foreground font-medium">{detailOffer.category_name || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Frete</p><p className="text-sm text-foreground font-medium">{detailOffer.free_shipping ? "Grátis" : "Pago"}</p></div>
                      <div className="col-span-2"><p className="text-xs text-muted-foreground">Timestamp</p><p className="text-sm text-foreground font-medium">{new Date(detailOffer.scored_at).toLocaleString()}</p></div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => window.open(detailOffer.product_url, "_blank")} className="flex-1 py-3 hover:bg-secondary/80 text-foreground rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 border border-border">
                    <ExternalLink size={16} /> Abrir no Mercado Livre
                  </button>
                </div>
                
                <div className="p-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">Copy & Paste</p>
                  <div className="bg-[#0F0518] p-4 rounded-xl text-[14px] leading-snug whitespace-pre-line border border-border shadow-inner text-foreground font-sans">
                    {detailOffer.status === "approved" ? "✨" : "👀"} <span className="font-bold">{detailOffer.title}</span>{"\n\n"}
                    {detailOffer.original_price && detailOffer.original_price > detailOffer.current_price && (
                      <>💸 <span className="font-bold">Desconto de R$ {formatCurrency(detailOffer.original_price - detailOffer.current_price).replace("R$", "").trim()}!</span>{"\n"}</>
                    )}
                    De <span className="line-through">R$ {formatCurrency(detailOffer.original_price || 0).replace("R$", "").trim()}</span> por <span className="font-bold text-success">R$ {formatCurrency(detailOffer.current_price).replace("R$", "").trim()} no pix</span> 🤘🏻{"\n"}
                    <span className="text-xs opacity-60">📉 ({Math.round(detailOffer.discount_percent)}% OFF aplicado)</span>{"\n\n"}
                    {detailOffer.free_shipping && <>✅ Frete Grátis{"\n"}</>}
                    {detailOffer.final_score >= 90 && <>⭐ Avaliações Altas do Vendedor{"\n\n"}</>}
                    🛒 <span className="text-primary hover:text-primary/80 hover:underline cursor-pointer transition">Comprar agora! (meli.la/{detailOffer.product_id.slice(-6)})</span>{"\n\n"}
                    <span className="text-xs italic text-muted-foreground">Sempre Black — Aqui todo dia é Black Friday 🖤</span>
                  </div>
                </div>

              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}
