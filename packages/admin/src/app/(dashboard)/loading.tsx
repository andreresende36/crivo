import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full min-h-[60vh] text-muted-foreground animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center w-16 h-16 mb-4">
        {/* Decorative background glow */}
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
        <Loader2 className="w-8 h-8 animate-spin text-primary relative z-10" />
      </div>
      <h3 className="text-lg font-medium text-foreground tracking-tight">Carregando...</h3>
      <p className="text-sm mt-1 opacity-70">Preparando as informações</p>
    </div>
  );
}
