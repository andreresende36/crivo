"use client";

import { useCallback } from "react";
import { adminFetch } from "@/lib/api";
import { useSupabase } from "./use-supabase";

export function useAdminApi() {
  const supabase = useSupabase();

  const fetchWithAuth = useCallback(
    async <T = unknown>(path: string, options?: RequestInit): Promise<T> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Nao autenticado");
      return adminFetch<T>(path, options, session.access_token);
    },
    [supabase]
  );

  return {
    // Offers
    updateOfferStatus: (id: string, status: string) =>
      fetchWithAuth(`/api/admin/offers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),

    deleteOffer: (id: string) =>
      fetchWithAuth(`/api/admin/offers/${id}`, { method: "DELETE" }),

    bulkAction: (ids: string[], action: string) =>
      fetchWithAuth("/api/admin/offers/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, action }),
      }),

    updateNotes: (id: string, admin_notes: string) =>
      fetchWithAuth(`/api/admin/offers/${id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ admin_notes }),
      }),

    // Queue
    reorderQueue: (offer_id: string, new_priority: number) =>
      fetchWithAuth("/api/admin/queue/reorder", {
        method: "POST",
        body: JSON.stringify({ offer_id, new_priority }),
      }),

    skipOffer: (id: string) =>
      fetchWithAuth(`/api/admin/queue/${id}/skip`, { method: "POST" }),

    pinOffer: (id: string) =>
      fetchWithAuth(`/api/admin/queue/${id}/pin`, { method: "POST" }),

    // Send & Scrape
    sendNow: () => fetchWithAuth("/api/admin/send-now", { method: "POST" }),

    sendSpecific: (id: string) =>
      fetchWithAuth(`/api/admin/send-now/${id}`, { method: "POST" }),

    scrapeNow: () =>
      fetchWithAuth("/api/admin/scrape-now", { method: "POST" }),

    // Settings
    getSettings: () => fetchWithAuth("/api/admin/settings"),

    updateSettings: (settings: Record<string, unknown>) =>
      fetchWithAuth("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings }),
      }),

    // Analytics
    getDailyMetrics: (days = 30) =>
      fetchWithAuth(`/api/admin/analytics/daily?days=${days}`),

    getHourlyMetrics: () => fetchWithAuth("/api/admin/analytics/hourly"),

    getFunnel: (hours = 24) =>
      fetchWithAuth(`/api/admin/analytics/funnel?hours=${hours}`),
  };
}
