"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSupabase } from "@/hooks/use-supabase";
import { useAdminApi } from "@/hooks/use-admin-api";
import DashboardLoading from "../loading";
import { ScoreCircle } from "@/components/common/score-circle";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import type { QueueItem } from "@crivo/types";

function SortableQueueItem({
  item,
  index,
  onSkip,
  onPin,
  onSendNow,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  onSkip: (id: string) => void;
  onPin: (id: string) => void;
  onSendNow: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.scored_offer_id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-4 p-4 lg:p-5 border-b border-border last:border-0 hover:bg-secondary transition duration-300 relative bg-transparent",
        isDragging && "opacity-50 shadow-2xl z-50 bg-card"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-2 text-muted-foreground/40 hover:text-muted-foreground transition touch-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </button>

      {/* Ranking */}
      <span className="text-[13px] font-bold font-mono text-muted-foreground w-6 text-center tabular-nums">
        #{index + 1}
      </span>

      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl bg-secondary border border-border shrink-0 overflow-hidden relative flex items-center justify-center">
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt=""
            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen opacity-90"
          />
        ) : (
          <div className="w-full h-full bg-muted" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[15px] truncate text-foreground leading-snug">{item.custom_title || item.title}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.category && (
            <span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              {item.category}
            </span>
          )}
          {item.badge && (
            <span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              {item.badge}
            </span>
          )}
          {item.free_shipping && (
            <span className="px-2 py-0.5 rounded bg-success/10 border border-success/20 text-success text-[10px] uppercase tracking-wider font-bold">
              Frete Grátis
            </span>
          )}
          {(item.queue_priority ?? 0) > 0 && (
            <span className="bg-accent/10 border border-accent/20 text-accent text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold">
              📌 Pinned ({item.queue_priority})
            </span>
          )}
          {item.approved_at && (
            <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
              aprovada {new Date(item.approved_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="text-right shrink-0 hidden sm:flex flex-col">
        <span className="font-mono text-lg font-bold text-foreground tracking-tight tabular-nums">
          {formatCurrency(item.current_price ?? 0)}
        </span>
        {item.original_price && (
          <span className="font-mono text-[11px] text-muted-foreground line-through opacity-70 tabular-nums">
            {formatCurrency(item.original_price)}
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-success/10 text-success text-[10px] uppercase tracking-wider font-bold inline-block self-end mt-1">
          -{Math.round(item.discount_percent ?? 0)}% OFF
        </span>
      </div>

      {/* Score */}
      <div className="shrink-0 ml-4 pl-4 border-l border-border hidden sm:block">
        <ScoreCircle score={item.final_score ?? 0} size={44} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-4 lg:opacity-0">
        <button
          onClick={() => onSendNow(item.scored_offer_id!)}
          className="p-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 transition text-primary group/btn"
          title="Enviar agora"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover/btn:-translate-y-0.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
        <button
          onClick={() => onPin(item.scored_offer_id!)}
          className="p-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 transition text-accent group/btn"
          title="Fixar no topo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover/btn:-translate-y-0.5"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
        </button>
        <button
          onClick={() => onSkip(item.scored_offer_id!)}
          className="p-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 transition text-muted-foreground group/btn"
          title="Pular"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover/btn:-translate-y-0.5"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>
        </button>
        <button
          onClick={() => onRemove(item.scored_offer_id!)}
          className="p-2.5 rounded-xl border border-border bg-secondary hover:bg-destructive/10 hover:border-destructive/30 transition text-muted-foreground hover:text-destructive group/btn"
          title="Remover da fila"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover/btn:-translate-y-0.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const supabase = useSupabase();
  const api = useAdminApi();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vw_approved_unsent")
      .select("*")
      .limit(100);
    if (!error && data) setQueue(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("queue-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scored_offers" },
        () => fetchQueue()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sent_offers" },
        () => fetchQueue()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchQueue]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((q) => q.scored_offer_id === active.id);
    const newIndex = queue.findIndex((q) => q.scored_offer_id === over.id);

    const newQueue = arrayMove(queue, oldIndex, newIndex);
    setQueue(newQueue);

    // Update priorities: higher index = lower priority
    const maxPriority = newQueue.length;
    newQueue.forEach((item, i) => {
      const newPriority = maxPriority - i;
      api.reorderQueue(item.scored_offer_id!, newPriority);
    });
  }

  async function handleSendNow(id: string) {
    setSending(true);
    try {
      await api.sendSpecific(id);
      fetchQueue();
      toast.success("Oferta enviada para o grupo!");
    } catch (err) {
      console.error("Send failed:", err);
      toast.error("Ops, algo deu errado. Já estamos de olho.");
    } finally {
      setSending(false);
    }
  }

  async function handlePin(id: string) {
    await api.pinOffer(id);
    fetchQueue();
    toast.success("Oferta fixada no topo da fila.");
  }

  async function handleSkip(id: string) {
    await api.skipOffer(id);
    fetchQueue();
    toast.success("Oferta pulada.");
  }

  async function handleRemove(id: string) {
    await api.removeFromQueue(id);
    fetchQueue();
    toast.success("Oferta removida da fila.");
  }

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-success/30 selection:text-foreground pb-10 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight font-display">Fila de Envio</h2>
          <p className="text-muted-foreground mt-1">Ofertas aprovadas prontas para disparo automático.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge de contagem */}
          <div className="bg-secondary border border-border px-3 py-1.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm backdrop-blur-md">
            <span className="text-muted-foreground">Aguardando:</span>
            <span className="font-mono text-foreground font-bold tabular-nums">{queue.length}</span>
          </div>
          {/* Action buttons */}
          <Button
            onClick={() => {
              setSending(true);
              api.sendNow().then(() => {
                fetchQueue();
                setSending(false);
                toast.success("Oferta do topo enviada com sucesso!");
              });
            }}
            disabled={sending || queue.length === 0}
            className="rounded-xl border border-transparent bg-foreground text-background hover:bg-foreground/90 font-medium h-9 px-4 ml-1 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar do Topo"}
          </Button>
          <Button onClick={fetchQueue} className="rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground font-medium h-9 px-4 shadow-sm transition" variant="outline">
            Atualizar
          </Button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] text-muted-foreground font-medium mb-1">Total na fila</p>
          <p className="text-[24px] font-display font-medium text-foreground tracking-tight tabular-nums">{queue.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] text-muted-foreground font-medium mb-1">Maior score</p>
          <p className="text-[24px] font-display font-medium text-success tracking-tight tabular-nums">
            {queue.length > 0 ? Math.round(queue[0]?.final_score || 0) : "—"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] text-muted-foreground font-medium mb-1">Desconto médio</p>
          <p className="text-[24px] font-display font-medium text-foreground tracking-tight tabular-nums">
            {queue.length > 0
              ? `${Math.round(
                  queue.reduce((s, q) => s + (q.discount_percent ?? 0), 0) /
                    queue.length
                )}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Queue List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={queue.map((q) => q.scored_offer_id!)}
          strategy={verticalListSortingStrategy}
        >
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 blur-[80px] -z-10 rounded-full pointer-events-none" />
            <div className="flex flex-col">
              {queue.map((item, index) => (
                <SortableQueueItem
                  key={item.scored_offer_id}
                  item={item}
                  index={index}
                  onSkip={handleSkip}
                  onPin={handlePin}
                  onSendNow={handleSendNow}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </div>
        </SortableContext>
      </DndContext>

      {queue.length === 0 && !loading && (
        <div className="bg-card border border-border rounded-2xl py-20 text-center shadow-sm">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-lg font-bold text-foreground">Fila vazia</p>
          <p className="text-sm text-muted-foreground mt-1">
            Nenhuma oferta qualificada atingiu os critérios de aprovação no momento.
          </p>
        </div>
      )}
    </div>
  );
}
