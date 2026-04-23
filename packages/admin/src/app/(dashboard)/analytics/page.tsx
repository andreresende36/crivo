"use client";

import { BarChart3, TrendingUp, Filter, MousePointerClick } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight font-display">Analytics</h2>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Tendências, funil de conversão e performance histórica.</p>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Cards placeholder com skeleton visual */}
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm">
          <BarChart3 size={32} className="text-muted-foreground/40" />
          <p className="text-foreground font-bold">Volume de Ofertas</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-50">Gráfico detalhado de ofertas analisadas e aprovadas por dia.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm">
          <TrendingUp size={32} className="text-muted-foreground/40" />
          <p className="text-foreground font-bold">Tendências de Desconto</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-50">Acompanhe os tickets médios e porcentagens de desconto ao longo da semana.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm">
          <Filter size={32} className="text-muted-foreground/40" />
          <p className="text-foreground font-bold">Funil de Conversão</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-50">Veja onde as ofertas são mais rejeitadas e entenda os motivos.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm lg:col-span-3">
          <MousePointerClick size={32} className="text-muted-foreground/40" />
          <p className="text-foreground font-bold">Mapa de Calor (Envios)</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-75">Descubra os melhores horários de movimentação de produtos e horários-pico.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
      </div>
    </div>
  );
}
