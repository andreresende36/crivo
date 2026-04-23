import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("relative overflow-hidden border-border bg-background/40 backdrop-blur-md group hover:bg-secondary hover:shadow-[0_0_20px_var(--color-primary)] hover:-translate-y-[2px] transition-all duration-300 ring-1 ring-border hover:ring-primary/20", className)}>
      {/* Subtle top gradient on hover */}
      <div className="absolute top-0 left-0 w-full h-0.5 bg-linear-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground/80">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1.5 pt-1 text-xs">
                <span
                  className={cn(
                    "font-semibold px-1.5 py-0.5 rounded-md text-xs uppercase tracking-wider",
                    trend.value >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  )}
                >
                  {trend.value >= 0 ? "+" : ""}
                  {trend.value}%
                </span>
                <span className="text-muted-foreground text-xs">{trend.label}</span>
              </div>
            )}
          </div>
          {icon && (
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.15)] group-hover:scale-110 group-hover:shadow-[0_0_20px_var(--color-primary)] transition-all duration-300">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
