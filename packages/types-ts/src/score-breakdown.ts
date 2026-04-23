import { z } from "zod"

export const ScoreBreakdownSchema = z.object({
  discount: z.number(),
  badge: z.number(),
  rating: z.number(),
  reviews: z.number(),
  free_shipping: z.number(),
  installments: z.number(),
  title_quality: z.number(),
}).catchall(z.number())

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>

export const ProductVariationSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
}).passthrough()

export const ProductVariationsSchema = z.array(ProductVariationSchema)

export type ProductVariation = z.infer<typeof ProductVariationSchema>

export const MlCookieSchema = z.record(z.string(), z.unknown())

export type MlCookie = z.infer<typeof MlCookieSchema>
