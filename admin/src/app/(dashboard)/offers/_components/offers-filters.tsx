"use client";

import { useCallback } from "react";
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface OffersFilters {
  search: string;
  status: string;
  category_id: string;
  min_price: string;
  max_price: string;
  min_discount: string;
  min_score: string;
  sort_by: string;
  sort_dir: string;
  page: number;
  page_size: number;
}

export const DEFAULT_FILTERS: OffersFilters = {
  search: "",
  status: "",
  category_id: "",
  min_price: "",
  max_price: "",
  min_discount: "",
  min_score: "",
  sort_by: "score",
  sort_dir: "desc",
  page: 1,
  page_size: 25,
};

interface StatusCount {
  pending: number;
  in_queue: number;
  sent: number;
}

interface OffersFiltersBarProps {
  filters: OffersFilters;
  onChange: (patch: Partial<OffersFilters>) => void;
  counts: StatusCount;
  total: number;
  categories?: { id: string; name: string }[];
}

const STATUS_TABS = [
  { id: "", label: "Todas" },
  { id: "pending", label: "Pendentes" },
  { id: "in_queue", label: "Na Fila" },
  { id: "sent", label: "Enviadas" },
] as const;

export function OffersFiltersBar({
  filters,
  onChange,
  counts,
  total,
  categories,
}: OffersFiltersBarProps) {
  const countFor = (id: string) => {
    if (id === "") return total;
    if (id === "pending") return counts.pending;
    if (id === "in_queue") return counts.in_queue;
    if (id === "sent") return counts.sent;
    return 0;
  };

  const hasActiveFilters =
    filters.category_id ||
    filters.min_price ||
    filters.max_price ||
    filters.min_discount ||
    filters.min_score;

  const clearFilters = useCallback(() => {
    onChange({
      category_id: "",
      min_price: "",
      max_price: "",
      min_discount: "",
      min_score: "",
      page: 1,
    });
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Status Tabs + Search */}
      <div className="flex flex-col lg:flex-row justify-between gap-3">
        <div className="flex gap-1.5 text-sm font-medium bg-secondary p-1 rounded-xl border border-border">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ status: t.id, page: 1 })}
              className={cn(
                "px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap",
                filters.status === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}{" "}
              <span className="opacity-60 text-xs ml-1 font-mono">
                ({countFor(t.id)})
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-secondary border border-border px-4 py-2 rounded-xl text-sm">
          <div className="relative w-full md:w-64">
            <Search
              className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <Input
              placeholder="Buscar por título ou ML ID..."
              value={filters.search}
              onChange={(e) =>
                onChange({ search: e.target.value, page: 1 })
              }
              className="pl-7 bg-transparent border-transparent focus-visible:ring-0 focus-visible:border-transparent h-8 shadow-none w-full"
            />
          </div>
        </div>
      </div>

      {/* Advanced Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        {categories && categories.length > 0 && (
          <Select
            value={filters.category_id || "all"}
            onValueChange={(v: string | null) =>
              onChange({ category_id: !v || v === "all" ? "" : v, page: 1 })
            }
          >
            <SelectTrigger className="w-44 h-8 text-xs bg-secondary border-border">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">Todas Categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          type="number"
          placeholder="Preço min"
          value={filters.min_price}
          onChange={(e) => onChange({ min_price: e.target.value, page: 1 })}
          className="w-28 h-8 text-xs bg-secondary border-border"
        />
        <Input
          type="number"
          placeholder="Preço max"
          value={filters.max_price}
          onChange={(e) => onChange({ max_price: e.target.value, page: 1 })}
          className="w-28 h-8 text-xs bg-secondary border-border"
        />
        <Input
          type="number"
          placeholder="Desc. min %"
          value={filters.min_discount}
          onChange={(e) => onChange({ min_discount: e.target.value, page: 1 })}
          className="w-28 h-8 text-xs bg-secondary border-border"
        />
        <Input
          type="number"
          placeholder="Score min"
          value={filters.min_score}
          onChange={(e) => onChange({ min_score: e.target.value, page: 1 })}
          className="w-28 h-8 text-xs bg-secondary border-border"
        />

        <Select
          value={`${filters.sort_by}:${filters.sort_dir}`}
          onValueChange={(v: string | null) => {
            if (!v) return;
            const [sort_by, sort_dir] = v.split(":");
            onChange({ sort_by, sort_dir, page: 1 });
          }}
        >
          <SelectTrigger className="w-44 h-8 text-xs bg-secondary border-border">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="score:desc">Score (maior)</SelectItem>
            <SelectItem value="score:asc">Score (menor)</SelectItem>
            <SelectItem value="price:asc">Preço (menor)</SelectItem>
            <SelectItem value="price:desc">Preço (maior)</SelectItem>
            <SelectItem value="discount:desc">Desconto (maior)</SelectItem>
            <SelectItem value="date:desc">Mais recentes</SelectItem>
            <SelectItem value="date:asc">Mais antigos</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={String(filters.page_size)}
          onValueChange={(v: string | null) =>
            onChange({ page_size: Number(v || 25), page: 1 })
          }
        >
          <SelectTrigger className="w-24 h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="10">10/pág</SelectItem>
            <SelectItem value="25">25/pág</SelectItem>
            <SelectItem value="50">50/pág</SelectItem>
            <SelectItem value="100">100/pág</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <X size={12} /> Limpar
          </button>
        )}
      </div>
    </div>
  );
}
