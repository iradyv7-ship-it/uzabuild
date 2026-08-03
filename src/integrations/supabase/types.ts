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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          approved_at: string
          approved_by: string
          approver_name: string | null
          boq_version: number
          id: string
          notes: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          stage: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          approver_name?: string | null
          boq_version?: number
          id?: string
          notes?: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          stage: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          approver_name?: string | null
          boq_version?: number
          id?: string
          notes?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_lines: {
        Row: {
          base_quantity: number
          catalog_item_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          floor_id: string | null
          house_id: string | null
          id: string
          measurement_method: string
          measurement_note: string | null
          pinned_rate: number | null
          project_id: string
          quantity: number
          room_id: string | null
          sort_order: number
          source: string
          unit: string
          updated_at: string
          wastage_pct: number
        }
        Insert: {
          base_quantity?: number
          catalog_item_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          floor_id?: string | null
          house_id?: string | null
          id?: string
          measurement_method?: string
          measurement_note?: string | null
          pinned_rate?: number | null
          project_id: string
          quantity?: number
          room_id?: string | null
          sort_order?: number
          source?: string
          unit?: string
          updated_at?: string
          wastage_pct?: number
        }
        Update: {
          base_quantity?: number
          catalog_item_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          floor_id?: string | null
          house_id?: string | null
          id?: string
          measurement_method?: string
          measurement_note?: string | null
          pinned_rate?: number | null
          project_id?: string
          quantity?: number
          room_id?: string | null
          sort_order?: number
          source?: string
          unit?: string
          updated_at?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "boq_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          category: string
          confidence: string
          id: string
          key: string
          label: string
          notes: string | null
          unit: string | null
          updated_at: string
          value: number
        }
        Insert: {
          category?: string
          confidence?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          category?: string
          confidence?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      catalog_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          attributes: Json
          category_id: string
          code: string | null
          coverage_per_unit: number | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          default_wastage_pct: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          price_date: string
          price_source: Database["public"]["Enums"]["price_source"]
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category_id: string
          code?: string | null
          coverage_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          default_wastage_pct?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          price_date?: string
          price_source?: Database["public"]["Enums"]["price_source"]
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category_id?: string
          code?: string | null
          coverage_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          default_wastage_pct?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          price_date?: string
          price_source?: Database["public"]["Enums"]["price_source"]
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_price_history: {
        Row: {
          changed_by: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          item_id: string
          price: number
          price_date: string
          price_source: Database["public"]["Enums"]["price_source"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          item_id: string
          price: number
          price_date: string
          price_source: Database["public"]["Enums"]["price_source"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          item_id?: string
          price?: number
          price_date?: string
          price_source?: Database["public"]["Enums"]["price_source"]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      drawings: {
        Row: {
          created_at: string
          error: string | null
          extraction: Json | null
          file_name: string
          file_type: string | null
          id: string
          project_id: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["extraction_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          extraction?: Json | null
          file_name: string
          file_type?: string | null
          id?: string
          project_id: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["extraction_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          extraction?: Json | null
          file_name?: string
          file_type?: string | null
          id?: string
          project_id?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["extraction_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          created_at: string
          house_id: string
          id: string
          level: number
          name: string
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          level?: number
          name: string
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          level?: number
          name?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "floors_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          created_at: string
          house_type: string | null
          id: string
          name: string
          project_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          house_type?: string | null
          id?: string
          name: string
          project_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          house_type?: string | null
          id?: string
          name?: string
          project_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "houses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          location: string | null
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          location?: string | null
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          location?: string | null
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          ceiling_height_m: number
          created_at: string
          floor_area_m2: number
          floor_id: string
          id: string
          name: string
          notes: string | null
          perimeter_m: number
          project_id: string
          room_type: string | null
          sort_order: number
          wall_area_m2: number
        }
        Insert: {
          ceiling_height_m?: number
          created_at?: string
          floor_area_m2?: number
          floor_id: string
          id?: string
          name: string
          notes?: string | null
          perimeter_m?: number
          project_id: string
          room_type?: string | null
          sort_order?: number
          wall_area_m2?: number
        }
        Update: {
          ceiling_height_m?: number
          created_at?: string
          floor_area_m2?: number
          floor_id?: string
          id?: string
          name?: string
          notes?: string | null
          perimeter_m?: number
          project_id?: string
          room_type?: string | null
          sort_order?: number
          wall_area_m2?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_proposal_lines: {
        Row: {
          catalog_item_id: string
          created_at: string
          id: string
          project_id: string
          proposal_id: string
          quantity: number
        }
        Insert: {
          catalog_item_id: string
          created_at?: string
          id?: string
          project_id: string
          proposal_id: string
          quantity?: number
        }
        Update: {
          catalog_item_id?: string
          created_at?: string
          id?: string
          project_id?: string
          proposal_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "solar_proposal_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_proposal_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_proposal_lines_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "solar_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_proposals: {
        Row: {
          array_kwp: number
          battery_kwh: number
          created_at: string
          daily_load_kwh: number
          grid_share_pct: number
          id: string
          inverter_kw: number
          is_selected: boolean
          peak_load_kw: number
          project_id: string
          solar_share_pct: number
        }
        Insert: {
          array_kwp?: number
          battery_kwh?: number
          created_at?: string
          daily_load_kwh?: number
          grid_share_pct: number
          id?: string
          inverter_kw?: number
          is_selected?: boolean
          peak_load_kw?: number
          project_id: string
          solar_share_pct: number
        }
        Update: {
          array_kwp?: number
          battery_kwh?: number
          created_at?: string
          daily_load_kwh?: number
          grid_share_pct?: number
          id?: string
          inverter_kw?: number
          is_selected?: boolean
          peak_load_kw?: number
          project_id?: string
          solar_share_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "solar_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      training_records: {
        Row: {
          ai_draft: Json | null
          captured_by: string | null
          created_at: string
          diff: Json | null
          human_final: Json | null
          id: string
          project_id: string
          role_tag: Database["public"]["Enums"]["app_role"] | null
          stage: string
        }
        Insert: {
          ai_draft?: Json | null
          captured_by?: string | null
          created_at?: string
          diff?: Json | null
          human_final?: Json | null
          id?: string
          project_id: string
          role_tag?: Database["public"]["Enums"]["app_role"] | null
          stage: string
        }
        Update: {
          ai_draft?: Json | null
          captured_by?: string | null
          created_at?: string
          diff?: Json | null
          human_final?: Json | null
          id?: string
          project_id?: string
          role_tag?: Database["public"]["Enums"]["app_role"] | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "architect"
        | "qs"
        | "interior_designer"
        | "mep_engineer"
      currency_code: "RWF" | "USD" | "CNY"
      extraction_status:
        | "pending"
        | "processing"
        | "extracted"
        | "failed"
        | "validated"
      price_source: "manual" | "supplier" | "manufacturer"
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
    Enums: {
      app_role: [
        "admin",
        "architect",
        "qs",
        "interior_designer",
        "mep_engineer",
      ],
      currency_code: ["RWF", "USD", "CNY"],
      extraction_status: [
        "pending",
        "processing",
        "extracted",
        "failed",
        "validated",
      ],
      price_source: ["manual", "supplier", "manufacturer"],
    },
  },
} as const
