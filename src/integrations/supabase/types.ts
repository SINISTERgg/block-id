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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_type: string
          created_at: string
          granted: boolean
          id: string
          purpose: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          created_at?: string
          granted?: boolean
          id?: string
          purpose?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          purpose?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credential_schemas: {
        Row: {
          created_at: string
          credential_type: string
          fields: Json
          id: string
          is_latest: boolean
          issuer_id: string
          name: string
          parent_schema_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          credential_type?: string
          fields?: Json
          id?: string
          is_latest?: boolean
          issuer_id: string
          name: string
          parent_schema_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          credential_type?: string
          fields?: Json
          id?: string
          is_latest?: boolean
          issuer_id?: string
          name?: string
          parent_schema_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "credential_schemas_parent_schema_id_fkey"
            columns: ["parent_schema_id"]
            isOneToOne: false
            referencedRelation: "credential_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_shares: {
        Row: {
          created_at: string
          credential_id: string
          disclosed_fields: Json | null
          expires_at: string
          holder_id: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          disclosed_fields?: Json | null
          expires_at: string
          holder_id: string
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          disclosed_fields?: Json | null
          expires_at?: string
          holder_id?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_shares_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          blockchain_anchor: string | null
          credential_data: Json
          credential_hash: string
          expires_at: string | null
          holder_did: string
          holder_id: string | null
          id: string
          issued_at: string
          issuer_id: string
          issuer_signature: string | null
          prev_hash: string | null
          revoked_at: string | null
          schema_id: string | null
          signer_address: string | null
          status: string
          status_list_id: string | null
          status_list_index: number | null
        }
        Insert: {
          blockchain_anchor?: string | null
          credential_data?: Json
          credential_hash: string
          expires_at?: string | null
          holder_did: string
          holder_id?: string | null
          id?: string
          issued_at?: string
          issuer_id: string
          issuer_signature?: string | null
          prev_hash?: string | null
          revoked_at?: string | null
          schema_id?: string | null
          signer_address?: string | null
          status?: string
          status_list_id?: string | null
          status_list_index?: number | null
        }
        Update: {
          blockchain_anchor?: string | null
          credential_data?: Json
          credential_hash?: string
          expires_at?: string | null
          holder_did?: string
          holder_id?: string | null
          id?: string
          issued_at?: string
          issuer_id?: string
          issuer_signature?: string | null
          prev_hash?: string | null
          revoked_at?: string | null
          schema_id?: string | null
          signer_address?: string | null
          status?: string
          status_list_id?: string | null
          status_list_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credentials_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "credential_schemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_status_list_id_fkey"
            columns: ["status_list_id"]
            isOneToOne: false
            referencedRelation: "status_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          credential_id: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id?: string | null
          id?: string
          message?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      oid4vc_sessions: {
        Row: {
          created_at: string
          credential_data: Json | null
          expires_at: string
          id: string
          metadata: Json | null
          pre_authorized_code: string | null
          presentation_definition: Json | null
          response_data: Json | null
          schema_id: string | null
          session_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_data?: Json | null
          expires_at: string
          id?: string
          metadata?: Json | null
          pre_authorized_code?: string | null
          presentation_definition?: Json | null
          response_data?: Json | null
          schema_id?: string | null
          session_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_data?: Json | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          pre_authorized_code?: string | null
          presentation_definition?: Json | null
          response_data?: Json | null
          schema_id?: string | null
          session_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oid4vc_sessions_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "credential_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          biometric_registered: boolean | null
          created_at: string
          did: string | null
          face_registered: boolean | null
          full_name: string
          id: string
          organization: string | null
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          biometric_registered?: boolean | null
          created_at?: string
          did?: string | null
          face_registered?: boolean | null
          full_name?: string
          id?: string
          organization?: string | null
          updated_at?: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          biometric_registered?: boolean | null
          created_at?: string
          did?: string | null
          face_registered?: boolean | null
          full_name?: string
          id?: string
          organization?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      status_lists: {
        Row: {
          created_at: string
          encoded_list: string
          id: string
          issuer_id: string
          next_index: number
          purpose: string
          status_size: number
          total_entries: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          encoded_list?: string
          id?: string
          issuer_id: string
          next_index?: number
          purpose?: string
          status_size?: number
          total_entries?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          encoded_list?: string
          id?: string
          issuer_id?: string
          next_index?: number
          purpose?: string
          status_size?: number
          total_entries?: number
          updated_at?: string
        }
        Relationships: []
      }
      trusted_issuers: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          issuer_did: string
          issuer_user_id: string | null
          metadata: Json | null
          organization_name: string
          trust_level: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          issuer_did: string
          issuer_user_id?: string | null
          metadata?: Json | null
          organization_name: string
          trust_level?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          issuer_did?: string
          issuer_user_id?: string | null
          metadata?: Json | null
          organization_name?: string
          trust_level?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          ai_analysis: Json | null
          created_at: string
          credential_id: string | null
          credential_type: string | null
          holder_did: string | null
          id: string
          purpose: string | null
          status: string
          verified_at: string | null
          verifier_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          created_at?: string
          credential_id?: string | null
          credential_type?: string | null
          holder_did?: string | null
          id?: string
          purpose?: string | null
          status?: string
          verified_at?: string | null
          verifier_id: string
        }
        Update: {
          ai_analysis?: Json | null
          created_at?: string
          credential_id?: string | null
          credential_type?: string | null
          holder_did?: string | null
          id?: string
          purpose?: string | null
          status?: string
          verified_at?: string | null
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_did: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "issuer" | "holder" | "verifier"
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
      app_role: ["issuer", "holder", "verifier"],
    },
  },
} as const
