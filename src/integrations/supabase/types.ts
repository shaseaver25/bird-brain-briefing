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
      agent_builds: {
        Row: {
          created_at: string | null
          description: string
          edge_function_code: string | null
          id: string
          migration_ran_at: string | null
          name: string
          notes: string | null
          requested_by: string | null
          sql_migration: string | null
          status: string | null
          system_prompt: string | null
          updated_at: string | null
          widget_code: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          edge_function_code?: string | null
          id?: string
          migration_ran_at?: string | null
          name: string
          notes?: string | null
          requested_by?: string | null
          sql_migration?: string | null
          status?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          widget_code?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          edge_function_code?: string | null
          id?: string
          migration_ran_at?: string | null
          name?: string
          notes?: string | null
          requested_by?: string | null
          sql_migration?: string | null
          status?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          widget_code?: string | null
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          agent_id: string
          confidence: number
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          memory_type: Database["public"]["Enums"]["memory_type"]
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          confidence?: number
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          memory_type?: Database["public"]["Enums"]["memory_type"]
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          confidence?: number
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          memory_type?: Database["public"]["Enums"]["memory_type"]
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_notes: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_profiles: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_active: boolean
          max_tokens: number
          mcp_tools: Json
          metadata: Json
          model: string
          system_prompt: string
          temperature: number
          tool_permissions: Json
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          mcp_tools?: Json
          metadata?: Json
          model?: string
          system_prompt?: string
          temperature?: number
          tool_permissions?: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          mcp_tools?: Json
          metadata?: Json
          model?: string
          system_prompt?: string
          temperature?: number
          tool_permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_profiles_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_id: string
          created_at: string
          description: string
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_widgets: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
          widget_type: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id: string
          widget_type?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          api_url: string | null
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          role: string
          status: string
          system_prompt_preview: string | null
          updated_at: string
        }
        Insert: {
          api_url?: string | null
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          role: string
          status?: string
          system_prompt_preview?: string | null
          updated_at?: string
        }
        Update: {
          api_url?: string | null
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          role?: string
          status?: string
          system_prompt_preview?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          agents: Json
          anthropic_key: string | null
          api_key: string
          updated_at: string
          use_mcp_backend: boolean
          user_id: string
        }
        Insert: {
          agents?: Json
          anthropic_key?: string | null
          api_key?: string
          updated_at?: string
          use_mcp_backend?: boolean
          user_id: string
        }
        Update: {
          agents?: Json
          anthropic_key?: string | null
          api_key?: string
          updated_at?: string
          use_mcp_backend?: boolean
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          session_id: string
          token_count: number | null
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["message_role"]
          session_id?: string
          token_count?: number | null
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          session_id?: string
          token_count?: number | null
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_configs: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_published: boolean
          layout_config: Json
          theme: string
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          layout_config?: Json
          theme?: string
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          layout_config?: Json
          theme?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      kiro_intel: {
        Row: {
          business: string | null
          expires_at: string
          found_at: string | null
          id: string
          relevance: string | null
          source: string | null
          summary: string | null
          title: string
          topic_id: string
          topic_label: string
          url: string
        }
        Insert: {
          business?: string | null
          expires_at: string
          found_at?: string | null
          id?: string
          relevance?: string | null
          source?: string | null
          summary?: string | null
          title: string
          topic_id: string
          topic_label: string
          url: string
        }
        Update: {
          business?: string | null
          expires_at?: string
          found_at?: string | null
          id?: string
          relevance?: string | null
          source?: string | null
          summary?: string | null
          title?: string
          topic_id?: string
          topic_label?: string
          url?: string
        }
        Relationships: []
      }
      legislation_items: {
        Row: {
          bill_id: string | null
          id: string
          jurisdiction: string
          last_action: string | null
          last_action_date: string | null
          level: string
          scanned_at: string
          source: string | null
          status: string | null
          summary: string | null
          title: string
          topic: string
          url: string | null
        }
        Insert: {
          bill_id?: string | null
          id?: string
          jurisdiction: string
          last_action?: string | null
          last_action_date?: string | null
          level: string
          scanned_at?: string
          source?: string | null
          status?: string | null
          summary?: string | null
          title: string
          topic: string
          url?: string | null
        }
        Update: {
          bill_id?: string | null
          id?: string
          jurisdiction?: string
          last_action?: string | null
          last_action_date?: string | null
          level?: string
          scanned_at?: string
          source?: string | null
          status?: string | null
          summary?: string | null
          title?: string
          topic?: string
          url?: string | null
        }
        Relationships: []
      }
      mcp_tools: {
        Row: {
          auth_config: Json
          auth_type: string
          category: string
          created_at: string
          display_name: string
          health_status: string
          id: string
          is_enabled: boolean
          last_health_check: string | null
          name: string
          updated_at: string
        }
        Insert: {
          auth_config?: Json
          auth_type?: string
          category?: string
          created_at?: string
          display_name: string
          health_status?: string
          id?: string
          is_enabled?: boolean
          last_health_check?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          auth_config?: Json
          auth_type?: string
          category?: string
          created_at?: string
          display_name?: string
          health_status?: string
          id?: string
          is_enabled?: boolean
          last_health_check?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      owl_topics: {
        Row: {
          active: boolean
          created_at: string
          id: string
          topic: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          topic: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          assignee: string | null
          blocker: string | null
          created_at: string | null
          due_date: string | null
          id: string
          project_id: string | null
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          blocker?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          blocker?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          completion_pct: number | null
          created_at: string | null
          deadline: string | null
          description: string | null
          id: string
          name: string
          owner: string | null
          priority: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completion_pct?: number | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name: string
          owner?: string | null
          priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completion_pct?: number | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name?: string
          owner?: string | null
          priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      saleshawk_networking_queue: {
        Row: {
          ai_reasoning: string | null
          ai_suggested_business: string | null
          attendee_company: string | null
          attendee_email: string | null
          attendee_name: string
          attendee_title: string | null
          confirmed_business: string | null
          created_at: string
          crm_action: string | null
          crm_error: string | null
          granola_meeting_id: string | null
          id: string
          meeting_date: string | null
          meeting_notes: string | null
          meeting_title: string | null
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_suggested_business?: string | null
          attendee_company?: string | null
          attendee_email?: string | null
          attendee_name: string
          attendee_title?: string | null
          confirmed_business?: string | null
          created_at?: string
          crm_action?: string | null
          crm_error?: string | null
          granola_meeting_id?: string | null
          id?: string
          meeting_date?: string | null
          meeting_notes?: string | null
          meeting_title?: string | null
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_suggested_business?: string | null
          attendee_company?: string | null
          attendee_email?: string | null
          attendee_name?: string
          attendee_title?: string | null
          confirmed_business?: string | null
          created_at?: string
          crm_action?: string | null
          crm_error?: string | null
          granola_meeting_id?: string | null
          id?: string
          meeting_date?: string | null
          meeting_notes?: string | null
          meeting_title?: string | null
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      saleshawk_scan_state: {
        Row: {
          last_scan_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_scan_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_scan_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_context: {
        Row: {
          content: string
          context_key: string
          created_at: string
          created_by_agent: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          metadata: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          context_key: string
          created_at?: string
          created_by_agent?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          context_key?: string
          created_at?: string
          created_by_agent?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_context_created_by_agent_fkey"
            columns: ["created_by_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_data: {
        Row: {
          agent_id: string
          data: Json
          expires_at: string | null
          id: string
          updated_at: string
          widget_key: string
        }
        Insert: {
          agent_id: string
          data: Json
          expires_at?: string | null
          id?: string
          updated_at?: string
          widget_key: string
        }
        Update: {
          agent_id?: string
          data?: Json
          expires_at?: string | null
          id?: string
          updated_at?: string
          widget_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exec_agent_migration: { Args: { _build_id: string }; Returns: Json }
      purge_old_conversations: { Args: never; Returns: undefined }
    }
    Enums: {
      memory_type: "fact" | "preference" | "learned" | "instruction"
      message_role: "user" | "assistant" | "system"
      task_priority: "low" | "medium" | "high"
      task_status: "todo" | "in_progress" | "done"
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
      memory_type: ["fact", "preference", "learned", "instruction"],
      message_role: ["user", "assistant", "system"],
      task_priority: ["low", "medium", "high"],
      task_status: ["todo", "in_progress", "done"],
    },
  },
} as const
