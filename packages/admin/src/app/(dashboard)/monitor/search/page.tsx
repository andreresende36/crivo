import { Search, Activity } from "lucide-react";

export default function MonitorSearchPage() {
  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight font-display flex items-center gap-2">
            <Activity size={28} /> Monitoramento / Busca
          </h2>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Busque por ofertas específicas no Mercado Livre utilizando termos e filtros.</p>
        </div>
      </header>
      
      <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center gap-4 min-h-60 shadow-sm relative overflow-hidden group text-center">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] -z-10 rounded-full" />
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center border border-border mb-2">
          <Search size={32} className="text-muted-foreground/50 transition-colors group-hover:text-primary" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Busca Avulsa</h3>
        <p className="text-muted-foreground text-sm max-w-sm">Este módulo permitirá buscar itens ativamente fora do fluxo de scraping automático.</p>
        <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">Em Desenvolvimento</span>
      </div>
    </div>
  );
}
