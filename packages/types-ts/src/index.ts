export type { Json, Database, Tables, TablesInsert, TablesUpdate, Enums } from "./supabase.js"
export { Constants } from "./supabase.js"
import type { Tables } from "./supabase.js"

export {
  ScoreBreakdownSchema,
  ProductVariationSchema,
  ProductVariationsSchema,
  MlCookieSchema,
  SystemLogDetailsSchema,
  AdminSettingValueSchema,
} from "./score-breakdown.js"
export type {
  ScoreBreakdown,
  ProductVariation,
  MlCookie,
  SystemLogDetails,
  AdminSettingValue,
} from "./score-breakdown.js"
import type { ScoreBreakdown } from "./score-breakdown.js"

/** Convenience row aliases */
export type Product = Tables<"products">
export type ScoredOffer = Tables<"scored_offers">
export type SentOffer = Tables<"sent_offers">
export type AffiliateLink = Tables<"affiliate_links">
export type PriceHistory = Tables<"price_history">
export type User = Tables<"users">
export type Category = Tables<"categories">
export type Brand = Tables<"brands">
export type Badge = Tables<"badges">

/** View row aliases */
export type QueueItem = Tables<"vw_approved_unsent">
export type TopDeal = Tables<"vw_top_deals">
export type DailySummary = Tables<"mv_last_24h_summary">

/** RPC / API response shapes */
export interface AISuggestions {
  titles: string[]
  bodies: string[]
}

export interface OffersListingResponse {
  offers: OfferRow[]
  total: number
  counts: {
    pending: number
    in_queue: number
    sent: number
  }
}

export interface ScoreBucket {
  score_bucket: number
  count: number
}

export interface HourlySend {
  hour: number
  count: number
}

export interface DailyMetric {
  day: string
  products_scraped: number
  offers_scored: number
  offers_approved: number
  offers_sent: number
  avg_score: number | null
  avg_discount: number | null
}

export interface ConversionFunnel {
  scraped: number
  scored: number
  approved: number
  sent: number
}

export interface OfferRow {
  product_id: string
  ml_id: string
  title: string
  current_price: number
  original_price: number | null
  pix_price: number | null
  discount_percent: number
  thumbnail_url: string | null
  product_url: string
  free_shipping: boolean
  rating_stars: number | null
  rating_count: number | null
  scored_offer_id: string
  final_score: number
  status: string
  scored_at: string
  queue_priority: number
  admin_notes: string | null
  score_breakdown: ScoreBreakdown | null
  approved_at: string | null
  custom_title: string | null
  offer_body: string | null
  extra_notes: string | null
  brand: string | null
  category: string | null
  badge: string | null
  lowest_price: number | null
  sent_at: string | null
  display_status: "pending" | "in_queue" | "sent"
}
