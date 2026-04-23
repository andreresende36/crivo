"use client";

import { useCallback, useMemo } from "react";
import { adminFetch } from "@/lib/api";
import { useSupabase } from "./use-supabase";
import type { AISuggestions, OffersListingResponse } from "@crivo/types";

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

  return useMemo(() => ({
    // Offers — server-side listing
    getOffers: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      }
      return fetchWithAuth<OffersListingResponse>(
        `/api/admin/offers?${qs.toString()}`
      );
    },

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

    // Offer content curation
    generateSuggestions: (id: string) =>
      fetchWithAuth<AISuggestions>(`/api/admin/offers/${id}/suggestions`, {
        method: "POST",
      }),

    updateContent: (
      id: string,
      content: {
        custom_title?: string;
        offer_body?: string;
        extra_notes?: string;
      }
    ) =>
      fetchWithAuth(`/api/admin/offers/${id}/content`, {
        method: "PATCH",
        body: JSON.stringify(content),
      }),

    approveToQueue: (
      id: string,
      content: {
        custom_title?: string;
        offer_body?: string;
        extra_notes?: string;
      }
    ) =>
      fetchWithAuth(`/api/admin/offers/${id}/approve-to-queue`, {
        method: "POST",
        body: JSON.stringify(content),
      }),

    removeFromQueue: (id: string) =>
      fetchWithAuth(`/api/admin/offers/${id}/remove-from-queue`, {
        method: "POST",
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fetchWithAuth]);
}
