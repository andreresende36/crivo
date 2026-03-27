"use client";

import { Settings2, SlidersHorizontal, Clock, Percent, BellRing } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight font-display flex items-center gap-2">
            <Settings2 size={28} /> Configurações
          </h2>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Módulo global de ajustes do robô de captura e pontuação.</p>
        </div>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] -z-10 rounded-full" />
          <SlidersHorizontal size={32} className="text-muted-foreground/40 text-primary transition-colors group-hover:text-primary" />
          <p className="text-foreground font-bold">Ajustes de Score</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-62.5">Modifique os pesos do algoritmo para categorias específicas.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[50px] -z-10 rounded-full" />
          <Clock size={32} className="text-muted-foreground/40 transition-colors group-hover:text-accent" />
          <p className="text-foreground font-bold">Horários do Bot</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-62.5">Configure janelas de disparo e envio diário para evitar spam de noite.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-success/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-success/10 blur-[50px] -z-10 rounded-full" />
          <Percent size={32} className="text-muted-foreground/40 transition-colors group-hover:text-success" />
          <p className="text-foreground font-bold">Limites de Desconto</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-62.5">Estabeleça % mínima para cada categoria antes da aprovação automática.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
        
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-warning/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-warning/10 blur-[50px] -z-10 rounded-full" />
          <BellRing size={32} className="text-muted-foreground/40 transition-colors group-hover:text-warning" />
          <p className="text-foreground font-bold">Notificações</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-62.5">Configure webhooks e alertas vitais do sistema para o Telegram.</p>
          <span className="mt-2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">Em breve</span>
        </div>
      </div>
    </div>
  );
}
