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
      alert_rules: {
        Row: {
          camera_id: string | null
          channels: string[]
          created_at: string
          enabled: boolean
          entity: Database["public"]["Enums"]["entity_type"] | null
          id: string
          min_confidence: number
          name: string
          notify_emails: string[]
          notify_phones: string[]
          severity: Database["public"]["Enums"]["severity"]
          subtype: string | null
          tenant_id: string
        }
        Insert: {
          camera_id?: string | null
          channels?: string[]
          created_at?: string
          enabled?: boolean
          entity?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          min_confidence?: number
          name: string
          notify_emails?: string[]
          notify_phones?: string[]
          severity?: Database["public"]["Enums"]["severity"]
          subtype?: string | null
          tenant_id: string
        }
        Update: {
          camera_id?: string | null
          channels?: string[]
          created_at?: string
          enabled?: boolean
          entity?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          min_confidence?: number
          name?: string
          notify_emails?: string[]
          notify_phones?: string[]
          severity?: Database["public"]["Enums"]["severity"]
          subtype?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          assigned_to: string | null
          created_at: string
          event_id: string | null
          id: string
          rule_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          rule_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          rule_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_access: {
        Row: {
          camera_id: string
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          camera_id: string
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          camera_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_access_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_health: {
        Row: {
          camera_id: string
          checked_at: string
          id: string
          latency_ms: number | null
          message: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          camera_id: string
          checked_at?: string
          id?: string
          latency_ms?: number | null
          message?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          camera_id?: string
          checked_at?: string
          id?: string
          latency_ms?: number | null
          message?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_health_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_health_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cameras: {
        Row: {
          created_at: string
          id: string
          is_live: boolean
          last_error: string | null
          last_seen_at: string | null
          location: string | null
          name: string
          poll_interval_seconds: number
          rtsp_url: string | null
          source_type: string
          status: string
          stream_status: string
          tenant_id: string
          zone: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_live?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          location?: string | null
          name: string
          poll_interval_seconds?: number
          rtsp_url?: string | null
          source_type?: string
          status?: string
          stream_status?: string
          tenant_id: string
          zone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_live?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          location?: string | null
          name?: string
          poll_interval_seconds?: number
          rtsp_url?: string | null
          source_type?: string
          status?: string
          stream_status?: string
          tenant_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cameras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          camera_id: string | null
          confidence: number
          created_at: string
          description: string | null
          details: Json
          entity: Database["public"]["Enums"]["entity_type"]
          footage_id: string | null
          id: string
          occurred_at: string
          offset_seconds: number | null
          severity: Database["public"]["Enums"]["severity"]
          snapshot_path: string | null
          subtype: string | null
          tenant_id: string
        }
        Insert: {
          camera_id?: string | null
          confidence?: number
          created_at?: string
          description?: string | null
          details?: Json
          entity: Database["public"]["Enums"]["entity_type"]
          footage_id?: string | null
          id?: string
          occurred_at?: string
          offset_seconds?: number | null
          severity?: Database["public"]["Enums"]["severity"]
          snapshot_path?: string | null
          subtype?: string | null
          tenant_id: string
        }
        Update: {
          camera_id?: string | null
          confidence?: number
          created_at?: string
          description?: string | null
          details?: Json
          entity?: Database["public"]["Enums"]["entity_type"]
          footage_id?: string | null
          id?: string
          occurred_at?: string
          offset_seconds?: number | null
          severity?: Database["public"]["Enums"]["severity"]
          snapshot_path?: string | null
          subtype?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_footage_id_fkey"
            columns: ["footage_id"]
            isOneToOne: false
            referencedRelation: "footage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      footage: {
        Row: {
          camera_id: string | null
          created_at: string
          duration_seconds: number | null
          file_name: string
          id: string
          size_bytes: number | null
          status: string
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          camera_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          id?: string
          size_bytes?: number | null
          status?: string
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          camera_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "footage_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "footage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          tenant_id: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          channel: string
          created_at: string
          destination: string
          error: string | null
          id: string
          rule_id: string | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          alert_id?: string | null
          channel: string
          created_at?: string
          destination: string
          error?: string | null
          id?: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          alert_id?: string | null
          channel?: string
          created_at?: string
          destination?: string
          error?: string | null
          id?: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_catalog: {
        Row: {
          camera_limit: number
          label: string
          onprem_enabled: boolean
          price_eur_month: number
          rtsp_enabled: boolean
          seat_limit: number
          sort_order: number
          storage_gb: number
          tier: Database["public"]["Enums"]["plan_tier"]
        }
        Insert: {
          camera_limit: number
          label: string
          onprem_enabled?: boolean
          price_eur_month: number
          rtsp_enabled?: boolean
          seat_limit: number
          sort_order?: number
          storage_gb: number
          tier: Database["public"]["Enums"]["plan_tier"]
        }
        Update: {
          camera_limit?: number
          label?: string
          onprem_enabled?: boolean
          price_eur_month?: number
          rtsp_enabled?: boolean
          seat_limit?: number
          sort_order?: number
          storage_gb?: number
          tier?: Database["public"]["Enums"]["plan_tier"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          amount_eur: number
          created_at: string
          created_by: string | null
          from_tier: Database["public"]["Enums"]["plan_tier"] | null
          id: string
          note: string | null
          tenant_id: string
          to_tier: Database["public"]["Enums"]["plan_tier"]
        }
        Insert: {
          amount_eur?: number
          created_at?: string
          created_by?: string | null
          from_tier?: Database["public"]["Enums"]["plan_tier"] | null
          id?: string
          note?: string | null
          tenant_id: string
          to_tier: Database["public"]["Enums"]["plan_tier"]
        }
        Update: {
          amount_eur?: number
          created_at?: string
          created_by?: string | null
          from_tier?: Database["public"]["Enums"]["plan_tier"] | null
          id?: string
          note?: string | null
          tenant_id?: string
          to_tier?: Database["public"]["Enums"]["plan_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          billing_email: string | null
          camera_limit: number
          created_at: string
          current_period_end: string | null
          id: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          seat_limit: number
          slug: string
          storage_gb: number
          subscription_status: string
          trial_ends_at: string
        }
        Insert: {
          active?: boolean
          billing_email?: string | null
          camera_limit?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          seat_limit?: number
          slug: string
          storage_gb?: number
          subscription_status?: string
          trial_ends_at?: string
        }
        Update: {
          active?: boolean
          billing_email?: string | null
          camera_limit?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          seat_limit?: number
          slug?: string
          storage_gb?: number
          subscription_status?: string
          trial_ends_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_camera: { Args: { _camera_id: string }; Returns: boolean }
      current_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "agent" | "viewer"
      entity_type: "person" | "vehicle" | "animal" | "object"
      plan_tier: "starter" | "pro" | "enterprise" | "on_prem"
      severity: "info" | "warning" | "critical"
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
      app_role: ["super_admin", "admin", "agent", "viewer"],
      entity_type: ["person", "vehicle", "animal", "object"],
      plan_tier: ["starter", "pro", "enterprise", "on_prem"],
      severity: ["info", "warning", "critical"],
    },
  },
} as const
