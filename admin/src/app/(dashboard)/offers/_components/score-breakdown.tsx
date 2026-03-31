"use client";

import type { ScoreBreakdown } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CRITERIA_CONFIG: Record<string, { label: string; color: string }> = {
  discount: { label: "Desconto", color: "bg-success" },
  badge: { label: "Badge", color: "bg-primary" },
  rating: { label: "Avaliação", color: "bg-amber-500" },
  reviews: { label: "Reviews", color: "bg-orange-500" },
  free_shipping: { label: "Frete Grátis", color: "bg-blue-500" },
  installments: { label: "Parcelas", color: "bg-violet-500" },
  title_quality: { label: "Título", color: "bg-pink-500" },
};

interface ScoreBreakdownBarProps {
  breakdown: ScoreBreakdown;
  className?: string;
}

export function ScoreBreakdownBar({
  breakdown,
  className,
}: ScoreBreakdownBarProps) {
  const entries = Object.entries(breakdown).filter(
    ([key]) => key in CRITERIA_CONFIG
  );
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (total === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "flex h-2.5 w-full rounded-full overflow-hidden bg-muted cursor-help",
            className
          )}
        >
          {entries
            .filter(([, v]) => v > 0)
            .map(([key, value]) => {
              const config = CRITERIA_CONFIG[key];
              const pct = (value / total) * 100;
              return (
                <div
                  key={key}
                  className={cn(config?.color ?? "bg-muted-foreground")}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="bg-card border-border text-foreground p-3 max-w-xs"
        >
          <div className="space-y-1.5">
            {entries
              .sort(([, a], [, b]) => b - a)
              .map(([key, value]) => {
                const config = CRITERIA_CONFIG[key] ?? {
                  label: key,
                  color: "bg-muted-foreground",
                };
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className={cn("w-2 h-2 rounded-full", config.color)}
                      />
                      <span className="text-muted-foreground">
                        {config.label}
                      </span>
                    </div>
                    <span className="font-mono font-bold tabular-nums">
                      {value.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            <div className="border-t border-border pt-1 flex justify-between text-xs font-bold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{total.toFixed(1)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
