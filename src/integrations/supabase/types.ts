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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_bootstrap_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
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
          amount_minor: number
          base_quantity: number
          boq_version_id: string | null
          catalog_item_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          element_id: string | null
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
          takeoff_line_id: string | null
          unit: string
          unit_rate_minor: number
          updated_at: string
          wastage_pct: number
        }
        Insert: {
          amount_minor?: number
          base_quantity?: number
          boq_version_id?: string | null
          catalog_item_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          element_id?: string | null
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
          takeoff_line_id?: string | null
          unit?: string
          unit_rate_minor?: number
          updated_at?: string
          wastage_pct?: number
        }
        Update: {
          amount_minor?: number
          base_quantity?: number
          boq_version_id?: string | null
          catalog_item_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          element_id?: string | null
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
          takeoff_line_id?: string | null
          unit?: string
          unit_rate_minor?: number
          updated_at?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "boq_lines_boq_version_id_fkey"
            columns: ["boq_version_id"]
            isOneToOne: false
            referencedRelation: "boq_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_lines_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "elements"
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
          {
            foreignKeyName: "boq_lines_takeoff_line_id_fkey"
            columns: ["takeoff_line_id"]
            isOneToOne: false
            referencedRelation: "takeoff_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_versions: {
        Row: {
          contingency_minor: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          grand_total_minor: number
          id: string
          net_minor: number
          notes: string | null
          preliminaries_minor: number
          price_basis_date: string
          project_id: string
          reference: string | null
          status: string
          updated_at: string
          vat_minor: number
          version_no: number
        }
        Insert: {
          contingency_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          grand_total_minor?: number
          id?: string
          net_minor?: number
          notes?: string | null
          preliminaries_minor?: number
          price_basis_date?: string
          project_id: string
          reference?: string | null
          status?: string
          updated_at?: string
          vat_minor?: number
          version_no: number
        }
        Update: {
          contingency_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          grand_total_minor?: number
          id?: string
          net_minor?: number
          notes?: string | null
          preliminaries_minor?: number
          price_basis_date?: string
          project_id?: string
          reference?: string | null
          status?: string
          updated_at?: string
          vat_minor?: number
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "boq_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          lead_time_days: number | null
          name: string
          origin_country: string | null
          price: number
          price_date: string
          price_source: Database["public"]["Enums"]["price_source"]
          supplier: string | null
          supplier_id: string | null
          unit: string
          unit_cost_minor: number
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
          lead_time_days?: number | null
          name: string
          origin_country?: string | null
          price?: number
          price_date?: string
          price_source?: Database["public"]["Enums"]["price_source"]
          supplier?: string | null
          supplier_id?: string | null
          unit?: string
          unit_cost_minor?: number
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
          lead_time_days?: number | null
          name?: string
          origin_country?: string | null
          price?: number
          price_date?: string
          price_source?: Database["public"]["Enums"]["price_source"]
          supplier?: string | null
          supplier_id?: string | null
          unit?: string
          unit_cost_minor?: number
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
          {
            foreignKeyName: "catalog_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          note: string | null
          price: number
          price_date: string
          price_minor: number
          price_source: Database["public"]["Enums"]["price_source"]
          supplier_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          item_id: string
          note?: string | null
          price: number
          price_date: string
          price_minor?: number
          price_source: Database["public"]["Enums"]["price_source"]
          supplier_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          item_id?: string
          note?: string | null
          price?: number
          price_date?: string
          price_minor?: number
          price_source?: Database["public"]["Enums"]["price_source"]
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_email: string | null
          city: string | null
          client_code: string | null
          company_registration: string | null
          contact_name: string | null
          country: string
          created_at: string
          created_by: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          decision_maker_role: string | null
          email: string | null
          id: string
          intake_completed_at: string | null
          name: string
          notes: string | null
          phone: string | null
          preferred_language: string
          sector: string | null
          source_note: string | null
          tin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_email?: string | null
          city?: string | null
          client_code?: string | null
          company_registration?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          decision_maker_role?: string | null
          email?: string | null
          id?: string
          intake_completed_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          sector?: string | null
          source_note?: string | null
          tin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_email?: string | null
          city?: string | null
          client_code?: string | null
          company_registration?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          decision_maker_role?: string | null
          email?: string | null
          id?: string
          intake_completed_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          sector?: string | null
          source_note?: string | null
          tin?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coordination_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          purpose: string | null
          scope: string
          status: string
          thread_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          purpose?: string | null
          scope?: string
          status?: string
          thread_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          purpose?: string | null
          scope?: string
          status?: string
          thread_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordination_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          expected_at: string | null
          id: string
          project_id: string
          proof_path: string | null
          purchase_order_id: string
          received_by: string | null
          receiver_name: string | null
          site_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          expected_at?: string | null
          id?: string
          project_id: string
          proof_path?: string | null
          purchase_order_id: string
          received_by?: string | null
          receiver_name?: string | null
          site_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          expected_at?: string | null
          id?: string
          project_id?: string
          proof_path?: string | null
          purchase_order_id?: string
          received_by?: string | null
          receiver_name?: string | null
          site_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_speckle_models: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_id: string
          embed_url: string | null
          id: string
          ingestion_error: string | null
          ingestion_status: string
          latest_file_id: string | null
          latest_ingestion_id: string | null
          latest_version_id: string | null
          project_id: string
          speckle_model_id: string
          speckle_model_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_id: string
          embed_url?: string | null
          id?: string
          ingestion_error?: string | null
          ingestion_status?: string
          latest_file_id?: string | null
          latest_ingestion_id?: string | null
          latest_version_id?: string | null
          project_id: string
          speckle_model_id: string
          speckle_model_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_id?: string
          embed_url?: string | null
          id?: string
          ingestion_error?: string | null
          ingestion_status?: string
          latest_file_id?: string | null
          latest_ingestion_id?: string | null
          latest_version_id?: string | null
          project_id?: string
          speckle_model_id?: string
          speckle_model_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_speckle_models_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: true
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_speckle_models_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawings: {
        Row: {
          created_at: string
          degraded: boolean
          document_kind: string
          error: string | null
          extraction: Json | null
          file_name: string
          file_type: string | null
          human_takeoff_reason: string | null
          id: string
          project_id: string
          read_method: string | null
          requires_human_takeoff: boolean
          size_bytes: number | null
          status: Database["public"]["Enums"]["extraction_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          degraded?: boolean
          document_kind?: string
          error?: string | null
          extraction?: Json | null
          file_name: string
          file_type?: string | null
          human_takeoff_reason?: string | null
          id?: string
          project_id: string
          read_method?: string | null
          requires_human_takeoff?: boolean
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["extraction_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          degraded?: boolean
          document_kind?: string
          error?: string | null
          extraction?: Json | null
          file_name?: string
          file_type?: string | null
          human_takeoff_reason?: string | null
          id?: string
          project_id?: string
          read_method?: string | null
          requires_human_takeoff?: boolean
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
      elements: {
        Row: {
          created_at: string
          element_type: string | null
          id: string
          name: string
          notes: string | null
          project_id: string
          quantity: number
          room_id: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          element_type?: string | null
          id?: string
          name: string
          notes?: string | null
          project_id: string
          quantity?: number
          room_id: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          element_type?: string | null
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          quantity?: number
          room_id?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elements_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
      fx_rates: {
        Row: {
          as_of: string
          base_currency: string
          fetched_at: string
          id: string
          quote_currency: string
          rate: number
          source: string
        }
        Insert: {
          as_of: string
          base_currency: string
          fetched_at?: string
          id?: string
          quote_currency: string
          rate: number
          source: string
        }
        Update: {
          as_of?: string
          base_currency?: string
          fetched_at?: string
          id?: string
          quote_currency?: string
          rate?: number
          source?: string
        }
        Relationships: []
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
      package_attachments: {
        Row: {
          caption: string | null
          created_at: string
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          package_id: string
          project_id: string
          requirement_key: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_name: string
          id?: string
          kind?: string
          mime_type?: string | null
          package_id: string
          project_id: string
          requirement_key?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          package_id?: string
          project_id?: string
          requirement_key?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_attachments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "product_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      package_manufacturers: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          deposit_amount_minor: number | null
          deposit_currency: Database["public"]["Enums"]["currency_code"]
          deposit_paid_at: string | null
          expected_ship_date: string | null
          id: string
          note: string | null
          package_id: string
          production_started_at: string | null
          project_id: string
          status: string
          supplier_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount_minor?: number | null
          deposit_currency?: Database["public"]["Enums"]["currency_code"]
          deposit_paid_at?: string | null
          expected_ship_date?: string | null
          id?: string
          note?: string | null
          package_id: string
          production_started_at?: string | null
          project_id: string
          status?: string
          supplier_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount_minor?: number | null
          deposit_currency?: Database["public"]["Enums"]["currency_code"]
          deposit_paid_at?: string | null
          expected_ship_date?: string | null
          id?: string
          note?: string | null
          package_id?: string
          production_started_at?: string | null
          project_id?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_manufacturers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "product_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_manufacturers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_manufacturers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      package_requirements: {
        Row: {
          created_at: string
          id: string
          note: string | null
          owner_party: string
          package_id: string
          project_id: string
          requirement_key: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          owner_party?: string
          package_id: string
          project_id: string
          requirement_key: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          owner_party?: string
          package_id?: string
          project_id?: string
          requirement_key?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_requirements_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "product_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_entries: {
        Row: {
          client_consented: boolean
          client_display_name: string | null
          country: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          gallery_urls: string[]
          id: string
          is_published: boolean
          location: string | null
          product_families: string[]
          project_id: string | null
          project_type: string
          quality_tier: string | null
          scope: string
          slug: string
          sort_order: number
          status: string
          summary: string
          title: string
          updated_at: string
          year: number | null
        }
        Insert: {
          client_consented?: boolean
          client_display_name?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          gallery_urls?: string[]
          id?: string
          is_published?: boolean
          location?: string | null
          product_families?: string[]
          project_id?: string | null
          project_type?: string
          quality_tier?: string | null
          scope?: string
          slug: string
          sort_order?: number
          status?: string
          summary?: string
          title: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          client_consented?: boolean
          client_display_name?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          gallery_urls?: string[]
          id?: string
          is_published?: boolean
          location?: string | null
          product_families?: string[]
          project_id?: string | null
          project_type?: string
          quality_tier?: string | null
          scope?: string
          slug?: string
          sort_order?: number
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      product_packages: {
        Row: {
          budget_currency: Database["public"]["Enums"]["currency_code"]
          category: string
          colour_note: string | null
          created_at: string
          created_by: string | null
          finish_note: string | null
          id: string
          package_code: string | null
          pattern_note: string | null
          performance_note: string | null
          phase: number
          phase_note: string | null
          priority: number
          project_id: string
          quality_tier: string
          required_delivery_date: string | null
          scope_note: string | null
          seq: number
          shape_note: string | null
          status: string
          style_note: string | null
          target_budget_minor: number | null
          texture_note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          budget_currency?: Database["public"]["Enums"]["currency_code"]
          category: string
          colour_note?: string | null
          created_at?: string
          created_by?: string | null
          finish_note?: string | null
          id?: string
          package_code?: string | null
          pattern_note?: string | null
          performance_note?: string | null
          phase?: number
          phase_note?: string | null
          priority?: number
          project_id: string
          quality_tier?: string
          required_delivery_date?: string | null
          scope_note?: string | null
          seq?: number
          shape_note?: string | null
          status?: string
          style_note?: string | null
          target_budget_minor?: number | null
          texture_note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          budget_currency?: Database["public"]["Enums"]["currency_code"]
          category?: string
          colour_note?: string | null
          created_at?: string
          created_by?: string | null
          finish_note?: string | null
          id?: string
          package_code?: string | null
          pattern_note?: string | null
          performance_note?: string | null
          phase?: number
          phase_note?: string | null
          priority?: number
          project_id?: string
          quality_tier?: string
          required_delivery_date?: string | null
          scope_note?: string | null
          seq?: number
          shape_note?: string | null
          status?: string
          style_note?: string | null
          target_budget_minor?: number | null
          texture_note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_packages_project_id_fkey"
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
      proforma_lines: {
        Row: {
          created_at: string
          description: string
          description_source: string | null
          id: string
          proforma_id: string
          project_id: string
          quantity: number
          sort_order: number
          specification: string | null
          unit: string
          unit_price_rmb_minor: number
          unit_price_usd_minor: number
        }
        Insert: {
          created_at?: string
          description: string
          description_source?: string | null
          id?: string
          proforma_id: string
          project_id: string
          quantity?: number
          sort_order?: number
          specification?: string | null
          unit?: string
          unit_price_rmb_minor?: number
          unit_price_usd_minor?: number
        }
        Update: {
          created_at?: string
          description?: string
          description_source?: string | null
          id?: string
          proforma_id?: string
          project_id?: string
          quantity?: number
          sort_order?: number
          specification?: string | null
          unit?: string
          unit_price_rmb_minor?: number
          unit_price_usd_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_lines_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          fx_rmb_per_usd: number
          id: string
          incoterm: string | null
          issued_at: string | null
          lead_time_note: string | null
          notes: string | null
          payment_terms: string | null
          project_id: string
          reference: string
          signed_at: string | null
          signed_by_name: string | null
          signed_by_title: string | null
          status: string
          title: string
          updated_at: string
          validity_days: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          fx_rmb_per_usd?: number
          id?: string
          incoterm?: string | null
          issued_at?: string | null
          lead_time_note?: string | null
          notes?: string | null
          payment_terms?: string | null
          project_id: string
          reference: string
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_title?: string | null
          status?: string
          title: string
          updated_at?: string
          validity_days?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          fx_rmb_per_usd?: number
          id?: string
          incoterm?: string | null
          issued_at?: string | null
          lead_time_note?: string | null
          notes?: string | null
          payment_terms?: string | null
          project_id?: string
          reference?: string
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_title?: string | null
          status?: string
          title?: string
          updated_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "proformas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_discovery: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          blocks_procurement: boolean
          client_answer: string | null
          client_visible: boolean
          confidence: string
          created_at: string
          guidance: string | null
          id: string
          internal_note: string | null
          owner_role: Database["public"]["Enums"]["app_role"] | null
          project_id: string
          question: string
          question_key: string
          section: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          blocks_procurement?: boolean
          client_answer?: string | null
          client_visible?: boolean
          confidence?: string
          created_at?: string
          guidance?: string | null
          id?: string
          internal_note?: string | null
          owner_role?: Database["public"]["Enums"]["app_role"] | null
          project_id: string
          question: string
          question_key: string
          section: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          blocks_procurement?: boolean
          client_answer?: string | null
          client_visible?: boolean
          confidence?: string
          created_at?: string
          guidance?: string | null
          id?: string
          internal_note?: string | null
          owner_role?: Database["public"]["Enums"]["app_role"] | null
          project_id?: string
          question?: string
          question_key?: string
          section?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_discovery_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_enquiries: {
        Row: {
          brief: string
          budget_band: string | null
          company: string | null
          contact_name: string
          created_at: string
          email: string
          id: string
          location: string | null
          phone: string | null
          project_type: string
          quality_tier: string | null
          scale: string | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          brief?: string
          budget_band?: string | null
          company?: string | null
          contact_name: string
          created_at?: string
          email: string
          id?: string
          location?: string | null
          phone?: string | null
          project_type?: string
          quality_tier?: string | null
          scale?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          brief?: string
          budget_band?: string | null
          company?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          location?: string | null
          phone?: string | null
          project_type?: string
          quality_tier?: string | null
          scale?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      project_speckle_projects: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          speckle_project_id: string
          speckle_server_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          speckle_project_id: string
          speckle_server_url?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          speckle_project_id?: string
          speckle_server_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_speckle_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stage_events: {
        Row: {
          entered_at: string
          entered_by: string | null
          id: string
          note: string | null
          project_id: string
          stage: string
        }
        Insert: {
          entered_at?: string
          entered_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          stage: string
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_band: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          current_stage: string
          id: string
          location: string | null
          name: string
          owner_id: string
          project_code: string | null
          status: string
          target_completion: string | null
          theme_notes: string | null
          updated_at: string
        }
        Insert: {
          budget_band?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          current_stage?: string
          id?: string
          location?: string | null
          name: string
          owner_id: string
          project_code?: string | null
          status?: string
          target_completion?: string | null
          theme_notes?: string | null
          updated_at?: string
        }
        Update: {
          budget_band?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          current_stage?: string
          id?: string
          location?: string | null
          name?: string
          owner_id?: string
          project_code?: string | null
          status?: string
          target_completion?: string | null
          theme_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          boq_version_id: string | null
          client_price_minor: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          issued_at: string | null
          project_id: string
          scope_notes: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          boq_version_id?: string | null
          client_price_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          issued_at?: string | null
          project_id: string
          scope_notes?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          boq_version_id?: string | null
          client_price_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          issued_at?: string | null
          project_id?: string
          scope_notes?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_boq_version_id_fkey"
            columns: ["boq_version_id"]
            isOneToOne: false
            referencedRelation: "boq_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          description: string
          id: string
          project_id: string
          purchase_order_id: string
          quantity: number
          unit: string
          unit_cost_minor: number
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          project_id: string
          purchase_order_id: string
          quantity?: number
          unit: string
          unit_cost_minor?: number
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          purchase_order_id?: string
          quantity?: number
          unit?: string
          unit_cost_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          expected_at: string | null
          id: string
          issued_at: string | null
          notes: string | null
          po_number: string
          project_id: string
          rfq_id: string | null
          status: string
          supplier_id: string
          total_minor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          expected_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          po_number: string
          project_id: string
          rfq_id?: string | null
          status?: string
          supplier_id: string
          total_minor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          expected_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          po_number?: string
          project_id?: string
          rfq_id?: string | null
          status?: string
          supplier_id?: string
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_lines: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          description: string
          id: string
          project_id: string
          quantity: number
          requisition_id: string
          unit: string
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          project_id: string
          quantity?: number
          requisition_id: string
          unit: string
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          quantity?: number
          requisition_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_lines_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          boq_version_id: string | null
          created_at: string
          id: string
          needed_by: string | null
          notes: string | null
          project_id: string
          reference: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          boq_version_id?: string | null
          created_at?: string
          id?: string
          needed_by?: string | null
          notes?: string | null
          project_id: string
          reference?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          boq_version_id?: string | null
          created_at?: string
          id?: string
          needed_by?: string | null
          notes?: string | null
          project_id?: string
          reference?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_boq_version_id_fkey"
            columns: ["boq_version_id"]
            isOneToOne: false
            referencedRelation: "boq_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_lines: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          id: string
          lead_time_days: number | null
          project_id: string
          quantity: number
          quoted_unit_cost_minor: number | null
          requisition_line_id: string | null
          rfq_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          id?: string
          lead_time_days?: number | null
          project_id: string
          quantity?: number
          quoted_unit_cost_minor?: number | null
          requisition_line_id?: string | null
          rfq_id: string
          unit: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          id?: string
          lead_time_days?: number | null
          project_id?: string
          quantity?: number
          quoted_unit_cost_minor?: number | null
          requisition_line_id?: string | null
          rfq_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_lines_requisition_line_id_fkey"
            columns: ["requisition_line_id"]
            isOneToOne: false
            referencedRelation: "requisition_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_lines_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          notes: string | null
          project_id: string
          requisition_id: string
          sent_at: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          project_id: string
          requisition_id: string
          sent_at?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          requisition_id?: string
          sent_at?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      supplier_categories: {
        Row: {
          category: string
          created_at: string
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          note: string | null
          quality_tier: string
          supplier_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          note?: string | null
          quality_tier?: string
          supplier_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          note?: string | null
          quality_tier?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_categories_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      takeoff_corrections: {
        Row: {
          after_json: Json | null
          after_value: number | null
          before_json: Json | null
          before_value: number | null
          corrected_by: string | null
          created_at: string
          field: string
          id: string
          material_category: string | null
          project_id: string
          reason: string
          role_tag: Database["public"]["Enums"]["app_role"] | null
          takeoff_line_id: string | null
        }
        Insert: {
          after_json?: Json | null
          after_value?: number | null
          before_json?: Json | null
          before_value?: number | null
          corrected_by?: string | null
          created_at?: string
          field?: string
          id?: string
          material_category?: string | null
          project_id: string
          reason: string
          role_tag?: Database["public"]["Enums"]["app_role"] | null
          takeoff_line_id?: string | null
        }
        Update: {
          after_json?: Json | null
          after_value?: number | null
          before_json?: Json | null
          before_value?: number | null
          corrected_by?: string | null
          created_at?: string
          field?: string
          id?: string
          material_category?: string | null
          project_id?: string
          reason?: string
          role_tag?: Database["public"]["Enums"]["app_role"] | null
          takeoff_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_corrections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_corrections_takeoff_line_id_fkey"
            columns: ["takeoff_line_id"]
            isOneToOne: false
            referencedRelation: "takeoff_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_lines: {
        Row: {
          ai_confidence: number | null
          ai_quantity: number | null
          ai_rationale: string | null
          ai_source: string | null
          catalog_item_id: string | null
          created_at: string
          description: string
          drawing_id: string | null
          element_id: string | null
          human_quantity: number | null
          id: string
          material_category: string | null
          measurement_method: string
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          sort_order: number
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_quantity?: number | null
          ai_rationale?: string | null
          ai_source?: string | null
          catalog_item_id?: string | null
          created_at?: string
          description: string
          drawing_id?: string | null
          element_id?: string | null
          human_quantity?: number | null
          id?: string
          material_category?: string | null
          measurement_method?: string
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          sort_order?: number
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_quantity?: number | null
          ai_rationale?: string | null
          ai_source?: string | null
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          drawing_id?: string | null
          element_id?: string | null
          human_quantity?: number | null
          id?: string
          material_category?: string | null
          measurement_method?: string
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          sort_order?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_lines_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_lines_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_lines_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          project_id: string
          source_language: string
          thread_id: string
          translated_body: string | null
          translated_language: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          project_id: string
          source_language?: string
          thread_id: string
          translated_body?: string | null
          translated_language?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          source_language?: string
          thread_id?: string
          translated_body?: string | null
          translated_language?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coordination_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          can_write: boolean
          created_at: string
          display_name: string
          email: string | null
          id: string
          organisation: string | null
          party_type: string
          project_id: string
          thread_id: string
          user_id: string | null
        }
        Insert: {
          can_write?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          organisation?: string | null
          party_type?: string
          project_id: string
          thread_id: string
          user_id?: string | null
        }
        Update: {
          can_write?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          organisation?: string | null
          party_type?: string
          project_id?: string
          thread_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coordination_threads"
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
      can_manage_catalog: { Args: { _user_id: string }; Returns: boolean }
      can_see_costs: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_see_thread: {
        Args: { _project_id: string; _thread_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      internal_proforma_lines: {
        Args: { _proforma_id: string }
        Returns: {
          created_at: string
          description: string
          description_source: string | null
          id: string
          proforma_id: string
          project_id: string
          quantity: number
          sort_order: number
          specification: string | null
          unit: string
          unit_price_rmb_minor: number
          unit_price_usd_minor: number
        }[]
        SetofOptions: {
          from: "*"
          to: "proforma_lines"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_client_user: { Args: { _user_id: string }; Returns: boolean }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      is_thread_participant: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      stage_approvals_complete: {
        Args: { _project_id: string; _stage: string }
        Returns: boolean
      }
      stage_rank: { Args: { _stage: string }; Returns: number }
      stage_required_roles: {
        Args: { _stage: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      status_for_stage: { Args: { _stage: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "architect"
        | "qs"
        | "interior_designer"
        | "mep_engineer"
        | "client"
        | "procurement"
        | "project_manager"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "client",
        "procurement",
        "project_manager",
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
