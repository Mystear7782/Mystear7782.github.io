
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "body_weight_logs": {
                  Row: {
                    "created_at": string,"id": string,"log_date": string,"user_id": string,"weight_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"log_date": string,"user_id"?: string,"weight_kg": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"log_date"?: string,"user_id"?: string,"weight_kg"?: number
                  }
                  Relationships: [
                    
                  ]
                },"cardio_logs": {
                  Row: {
                    "avg_spd_kmh": number | null,"cal_kcal": number | null,"dist_km": number | null,"hr_bpm": number | null,"max_spd_kmh": number | null,"session_id": string,"time_min": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_spd_kmh"?: number | null,"cal_kcal"?: number | null,"dist_km"?: number | null,"hr_bpm"?: number | null,"max_spd_kmh"?: number | null,"session_id": string,"time_min"?: number | null
                  }
                  Update: {
                    "avg_spd_kmh"?: number | null,"cal_kcal"?: number | null,"dist_km"?: number | null,"hr_bpm"?: number | null,"max_spd_kmh"?: number | null,"session_id"?: string,"time_min"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cardio_logs_session_id_fkey"
      columns: ["session_id"]
isOneToOne: true
      referencedRelation: "workout_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "archived": boolean,"category": string,"created_at": string,"id": string,"name": string,"sort_order": number,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"category": string,"created_at"?: string,"id": string,"name": string,"sort_order"?: number,"type": string,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"category"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meal_logs": {
                  Row: {
                    "calories_kcal": number | null,"carb_g": number,"created_at": string,"fat_g": number,"id": string,"log_date": string,"meal_type": string,"protein_g": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calories_kcal"?: never,"carb_g": number,"created_at"?: string,"fat_g": number,"id"?: string,"log_date": string,"meal_type": string,"protein_g": number,"user_id"?: string
                  }
                  Update: {
                    "calories_kcal"?: never,"carb_g"?: number,"created_at"?: string,"fat_g"?: number,"id"?: string,"log_date"?: string,"meal_type"?: string,"protein_g"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"menu_set_items": {
                  Row: {
                    "exercise_id": string,"menu_set_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"menu_set_id": string,"position"?: number
                  }
                  Update: {
                    "exercise_id"?: string,"menu_set_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_set_items_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_set_items_menu_set_id_fkey"
      columns: ["menu_set_id"]
isOneToOne: false
      referencedRelation: "menu_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_sets": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sets": {
                  Row: {
                    "created_at": string,"id": string,"reps": number,"session_id": string,"set_no": number,"weight_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"reps": number,"session_id": string,"set_no": number,"weight_kg": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"reps"?: number,"session_id"?: string,"set_no"?: number,"weight_kg"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sets_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "workout_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_sessions": {
                  Row: {
                    "created_at": string,"exercise_id": string,"id": string,"session_date": string,"session_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exercise_id": string,"id"?: string,"session_date": string,"session_time"?: string
                  }
                  Update: {
                    "created_at"?: string,"exercise_id"?: string,"id"?: string,"session_date"?: string,"session_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_sessions_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "get_body_weight_range":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "created_at": string,"id": string,"log_date": string,"weight_kg": number
            }[]
                           },
"get_exercise_history":
{ Args: { "p_exercise_id": string,"p_from"?: string,"p_limit"?: number }; Returns: {
              "avg_spd_kmh": number,"cal_kcal": number,"dist_km": number,"hr_bpm": number,"max_spd_kmh": number,"reps": number,"session_date": string,"session_id": string,"session_time": string,"set_no": number,"time_min": number,"weight_kg": number
            }[]
                           },
"get_meal_daily_totals":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "calories_kcal": number,"carb_g": number,"fat_g": number,"log_date": string,"meal_count": number,"protein_g": number
            }[]
                           },
"get_my_body_weight_logs":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"log_date": string,"weight_kg": number
            }[]
                           },
"get_my_exercises":
{ Args: Record<PropertyKey, never>; Returns: {
              "archived": boolean,"category": string,"id": string,"name": string,"sort_order": number,"type": string
            }[]
                           },
"get_my_meal_logs":
{ Args: Record<PropertyKey, never>; Returns: {
              "calories_kcal": number,"carb_g": number,"created_at": string,"fat_g": number,"id": string,"log_date": string,"meal_type": string,"protein_g": number
            }[]
                           },
"get_my_sessions_full":
{ Args: Record<PropertyKey, never>; Returns: {
              "cardio": Json,"exercise_id": string,"session_date": string,"session_id": string,"session_time": string,"sets": Json
            }[]
                           },
"record_set":
{ Args: { "p_date": string,"p_exercise_id": string,"p_new_session"?: boolean,"p_reps": number,"p_session_id"?: string,"p_time": string,"p_weight_kg": number }; Returns: {
              "id": string,"reps": number,"session_created": boolean,"session_id": string,"set_no": number,"weight_kg": number
            }[]
                           },
"save_menu_set":
{ Args: { "p_exercise_ids": (string)[],"p_id": string,"p_name": string }; Returns: string
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
