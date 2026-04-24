export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      affiliate_links: {
        Row: {
          created_at: string | null
          id: string
          long_url: string | null
          ml_link_id: string | null
          product_id: string
          short_url: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          long_url?: string | null
          ml_link_id?: string | null
          product_id: string
          short_url: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          long_url?: string | null
          ml_link_id?: string | null
          product_id?: string
          short_url?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vw_top_deals"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "affiliate_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_partitioned_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_partitioned_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_history_partitioned_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vw_top_deals"
            referencedColumns: ["product_id"]
          },
        ]
      }
      price_history_default: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      price_history_y2026m03: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      price_history_y2026m04: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      price_history_y2026m05: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      price_history_y2026m06: {
        Row: {
          id: string
          original_price: number | null
          pix_price: number | null
          price: number
          product_id: string
          recorded_at: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
        }
        Update: {
          id?: string
          original_price?: number | null
          pix_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          badge_id: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string | null
          current_price: number
          deleted_at: string | null
          discount_percent: number | null
          discount_type: string | null
          first_seen_at: string | null
          free_shipping: boolean | null
          full_shipping: boolean | null
          gender: string | null
          id: string
          installment_count: number | null
          installment_value: number | null
          installments_without_interest: boolean | null
          last_seen_at: string | null
          marketplace_id: string | null
          ml_id: string
          original_price: number | null
          pix_price: number | null
          product_url: string
          rating_count: number | null
          rating_stars: number | null
          thumbnail_url: string | null
          title: string
          variations: Json | null
        }
        Insert: {
          badge_id?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          current_price: number
          deleted_at?: string | null
          discount_percent?: number | null
          discount_type?: string | null
          first_seen_at?: string | null
          free_shipping?: boolean | null
          full_shipping?: boolean | null
          gender?: string | null
          id?: string
          installment_count?: number | null
          installment_value?: number | null
          installments_without_interest?: boolean | null
          last_seen_at?: string | null
          marketplace_id?: string | null
          ml_id: string
          original_price?: number | null
          pix_price?: number | null
          product_url?: string
          rating_count?: number | null
          rating_stars?: number | null
          thumbnail_url?: string | null
          title: string
          variations?: Json | null
        }
        Update: {
          badge_id?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          current_price?: number
          deleted_at?: string | null
          discount_percent?: number | null
          discount_type?: string | null
          first_seen_at?: string | null
          free_shipping?: boolean | null
          full_shipping?: boolean | null
          gender?: string | null
          id?: string
          installment_count?: number | null
          installment_value?: number | null
          installments_without_interest?: boolean | null
          last_seen_at?: string | null
          marketplace_id?: string | null
          ml_id?: string
          original_price?: number | null
          pix_price?: number | null
          product_url?: string
          rating_count?: number | null
          rating_stars?: number | null
          thumbnail_url?: string | null
          title?: string
          variations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "products_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scored_offer_transitions: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_status: string | null
          id: string
          notes: string | null
          scored_offer_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          scored_offer_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          scored_offer_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scored_offer_transitions_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "scored_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scored_offer_transitions_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["scored_offer_id"]
          },
        ]
      }
      scored_offers: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          custom_title: string | null
          extra_notes: string | null
          final_score: number
          id: string
          offer_body: string | null
          product_id: string
          queue_priority: number | null
          rule_score: number
          score_breakdown: Json | null
          score_override: number | null
          scored_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          custom_title?: string | null
          extra_notes?: string | null
          final_score: number
          id?: string
          offer_body?: string | null
          product_id: string
          queue_priority?: number | null
          rule_score: number
          score_breakdown?: Json | null
          score_override?: number | null
          scored_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          custom_title?: string | null
          extra_notes?: string | null
          final_score?: number
          id?: string
          offer_body?: string | null
          product_id?: string
          queue_priority?: number | null
          rule_score?: number
          score_breakdown?: Json | null
          score_override?: number | null
          scored_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scored_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scored_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "scored_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "vw_top_deals"
            referencedColumns: ["product_id"]
          },
        ]
      }
      sent_offers: {
        Row: {
          channel: string
          id: string
          scored_offer_id: string
          sent_at: string | null
          triggered_by: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          id?: string
          scored_offer_id: string
          sent_at?: string | null
          triggered_by?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          id?: string
          scored_offer_id?: string
          sent_at?: string | null
          triggered_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sent_offers_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "scored_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_offers_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["scored_offer_id"]
          },
          {
            foreignKeyName: "sent_offers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      title_examples: {
        Row: {
          action: string
          category_id: string | null
          created_at: string | null
          final_title: string
          generated_title: string
          id: string
          scored_offer_id: string | null
        }
        Insert: {
          action: string
          category_id?: string | null
          created_at?: string | null
          final_title: string
          generated_title: string
          id?: string
          scored_offer_id?: string | null
        }
        Update: {
          action?: string
          category_id?: string | null
          created_at?: string | null
          final_title?: string
          generated_title?: string
          id?: string
          scored_offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "title_examples_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_examples_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "scored_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_examples_scored_offer_id_fkey"
            columns: ["scored_offer_id"]
            isOneToOne: false
            referencedRelation: "vw_approved_unsent"
            referencedColumns: ["scored_offer_id"]
          },
        ]
      }
      user_secrets: {
        Row: {
          created_at: string | null
          id: string
          ml_cookies: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ml_cookies?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ml_cookies?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          affiliate_tag: string
          created_at: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          affiliate_tag: string
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          affiliate_tag?: string
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      mv_last_24h_summary: {
        Row: {
          avg_score: number | null
          max_discount_pct: number | null
          offers_approved: number | null
          offers_scored: number | null
          offers_sent: number | null
          products_scraped: number | null
        }
        Relationships: []
      }
      vw_approved_unsent: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          badge: string | null
          brand: string | null
          category: string | null
          current_price: number | null
          custom_title: string | null
          discount_percent: number | null
          discount_type: string | null
          extra_notes: string | null
          final_score: number | null
          free_shipping: boolean | null
          full_shipping: boolean | null
          installment_count: number | null
          installment_value: number | null
          installments_without_interest: boolean | null
          ml_id: string | null
          offer_body: string | null
          original_price: number | null
          pix_price: number | null
          product_id: string | null
          product_url: string | null
          queue_priority: number | null
          rating_count: number | null
          rating_stars: number | null
          score_breakdown: Json | null
          score_override: number | null
          scored_at: string | null
          scored_offer_id: string | null
          thumbnail_url: string | null
          title: string | null
        }
        Relationships: []
      }
      vw_top_deals: {
        Row: {
          badge: string | null
          brand: string | null
          category: string | null
          current_price: number | null
          discount_percent: number | null
          discount_type: string | null
          final_score: number | null
          free_shipping: boolean | null
          full_shipping: boolean | null
          installment_count: number | null
          installment_value: number | null
          ml_id: string | null
          original_price: number | null
          pix_price: number | null
          product_id: string | null
          product_url: string | null
          thumbnail_url: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_admin_offers_listing: {
        Args: {
          p_category_id?: string
          p_date_from?: string
          p_date_to?: string
          p_max_price?: number
          p_min_discount?: number
          p_min_price?: number
          p_min_score?: number
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: Json
      }
      fn_cleanup_old_system_logs: { Args: never; Returns: number }
      fn_conversion_funnel: {
        Args: { hours_back?: number }
        Returns: {
          approved: number
          scored: number
          scraped: number
          sent: number
        }[]
      }
      fn_create_price_history_partition: { Args: never; Returns: undefined }
      fn_daily_metrics: {
        Args: { days_back?: number }
        Returns: {
          avg_discount: number
          avg_score: number
          day: string
          offers_approved: number
          offers_scored: number
          offers_sent: number
          products_scraped: number
        }[]
      }
      fn_hourly_sends: {
        Args: { target_date?: string }
        Returns: {
          count: number
          hour: number
        }[]
      }
      fn_product_lowest_price: {
        Args: { p_product_id: string }
        Returns: number
      }
      fn_refresh_mv_summary: { Args: never; Returns: undefined }
      fn_score_distribution: {
        Args: { hours_back?: number }
        Returns: {
          count: number
          score_bucket: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
