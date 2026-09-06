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
    PostgrestVersion: "12.2.1 (d3f7cba)"
  }
  ai_transcriber: {
    Tables: {
      chat_attachments: {
        Row: {
          created_at: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          name?: string
          size?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_branch_state: {
        Row: {
          active_index: number
          id: string
          session_id: string
          signature: string | null
          signatures: string[] | null
          updated_at: string
          user_message_id: string
        }
        Insert: {
          active_index?: number
          id?: string
          session_id: string
          signature?: string | null
          signatures?: string[] | null
          updated_at?: string
          user_message_id: string
        }
        Update: {
          active_index?: number
          id?: string
          session_id?: string
          signature?: string | null
          signatures?: string[] | null
          updated_at?: string
          user_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_branch_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_branch_state_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json | null
          content: string
          context: Json | null
          created_at: string
          function_result: Json | null
          id: string
          parent_id: string | null
          reasoning: string | null
          role: Database["ai_transcriber"]["Enums"]["chat_role"]
          root_user_message_id: string | null
          seq: number
          session_id: string
          variant_group_id: string | null
          variant_index: number
        }
        Insert: {
          citations?: Json | null
          content?: string
          context?: Json | null
          created_at?: string
          function_result?: Json | null
          id?: string
          parent_id?: string | null
          reasoning?: string | null
          role: Database["ai_transcriber"]["Enums"]["chat_role"]
          root_user_message_id?: string | null
          seq?: never
          session_id: string
          variant_group_id?: string | null
          variant_index?: number
        }
        Update: {
          citations?: Json | null
          content?: string
          context?: Json | null
          created_at?: string
          function_result?: Json | null
          id?: string
          parent_id?: string | null
          reasoning?: string | null
          role?: Database["ai_transcriber"]["Enums"]["chat_role"]
          root_user_message_id?: string | null
          seq?: never
          session_id?: string
          variant_group_id?: string | null
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_root_user_message_id_fkey"
            columns: ["root_user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_suggested_actions: {
        Row: {
          created_at: string
          id: string
          label: string
          message_id: string
          payload: Json
          type: Database["ai_transcriber"]["Enums"]["chat_action_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          message_id: string
          payload: Json
          type: Database["ai_transcriber"]["Enums"]["chat_action_type"]
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          message_id?: string
          payload?: Json
          type?: Database["ai_transcriber"]["Enums"]["chat_action_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_suggested_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_tool_calls: {
        Row: {
          arguments: Json
          created_at: string
          id: string
          message_id: string
          name: string
          reasoning: string | null
          result: Json | null
        }
        Insert: {
          arguments: Json
          created_at?: string
          id?: string
          message_id: string
          name: string
          reasoning?: string | null
          result?: Json | null
        }
        Update: {
          arguments?: Json
          created_at?: string
          id?: string
          message_id?: string
          name?: string
          reasoning?: string | null
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          note_id: string
          user_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          note_id: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          note_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          notes: string | null
          primary_email: string | null
          primary_phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meeting_attendees: {
        Row: {
          attendance_status: string | null
          contact_id: string
          created_at: string | null
          id: string
          invitation_status: string | null
          invited_at: string | null
          meeting_id: string
          notes: string | null
          responded_at: string | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendance_status?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          invitation_status?: string | null
          invited_at?: string | null
          meeting_id: string
          notes?: string | null
          responded_at?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          attendance_status?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          invitation_status?: string | null
          invited_at?: string | null
          meeting_id?: string
          notes?: string | null
          responded_at?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          created_at: string | null
          id: string
          meeting_id: string
          note_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meeting_id: string
          note_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meeting_id?: string
          note_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_recurrences: {
        Row: {
          created_at: string
          end_date: string | null
          end_type: Database["ai_transcriber"]["Enums"]["meeting_recurrence_end_type"]
          frequency: Database["ai_transcriber"]["Enums"]["meeting_recurrence_frequency"]
          id: string
          interval: number
          meeting_id: string
          monthly_day_of_month: number | null
          monthly_option:
            | Database["ai_transcriber"]["Enums"]["meeting_recurrence_monthly_option"]
            | null
          monthly_weekday: string | null
          monthly_weekday_position: number | null
          occurrence_count: number | null
          starts_at: string
          timezone: string
          updated_at: string
          weekdays: string[] | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          end_type?: Database["ai_transcriber"]["Enums"]["meeting_recurrence_end_type"]
          frequency: Database["ai_transcriber"]["Enums"]["meeting_recurrence_frequency"]
          id?: string
          interval?: number
          meeting_id: string
          monthly_day_of_month?: number | null
          monthly_option?:
            | Database["ai_transcriber"]["Enums"]["meeting_recurrence_monthly_option"]
            | null
          monthly_weekday?: string | null
          monthly_weekday_position?: number | null
          occurrence_count?: number | null
          starts_at: string
          timezone?: string
          updated_at?: string
          weekdays?: string[] | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          end_type?: Database["ai_transcriber"]["Enums"]["meeting_recurrence_end_type"]
          frequency?: Database["ai_transcriber"]["Enums"]["meeting_recurrence_frequency"]
          id?: string
          interval?: number
          meeting_id?: string
          monthly_day_of_month?: number | null
          monthly_option?:
            | Database["ai_transcriber"]["Enums"]["meeting_recurrence_monthly_option"]
            | null
          monthly_weekday?: string | null
          monthly_weekday_position?: number | null
          occurrence_count?: number | null
          starts_at?: string
          timezone?: string
          updated_at?: string
          weekdays?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_speakers: {
        Row: {
          confidence_score: number | null
          contact_id: string | null
          created_at: string | null
          id: string
          identified_at: string | null
          is_primary_speaker: boolean | null
          meeting_id: string
          role: string | null
          speaker_index: number
          speaker_name: string | null
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          identified_at?: string | null
          is_primary_speaker?: boolean | null
          meeting_id: string
          role?: string | null
          speaker_index: number
          speaker_name?: string | null
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          identified_at?: string | null
          is_primary_speaker?: boolean | null
          meeting_id?: string
          role?: string | null
          speaker_index?: number
          speaker_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_speakers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_speakers_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_speakers_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_tags: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          tag_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_tags_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_tags_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audio_file_path: string | null
          created_at: string | null
          formatted_transcript: Json | null
          id: string
          location: string | null
          meeting_at: string | null
          meeting_end_at: string | null
          meeting_reviewed: boolean | null
          openai_response: Json | null
          original_file_name: string | null
          recurrence_instance_index: number | null
          recurrence_parent_id: string | null
          speaker_names: Json | null
          summary: string | null
          summary_jsonb: Json | null
          title: string | null
          transcription: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          audio_file_path?: string | null
          created_at?: string | null
          formatted_transcript?: Json | null
          id?: string
          location?: string | null
          meeting_at?: string | null
          meeting_end_at?: string | null
          meeting_reviewed?: boolean | null
          openai_response?: Json | null
          original_file_name?: string | null
          recurrence_instance_index?: number | null
          recurrence_parent_id?: string | null
          speaker_names?: Json | null
          summary?: string | null
          summary_jsonb?: Json | null
          title?: string | null
          transcription?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          audio_file_path?: string | null
          created_at?: string | null
          formatted_transcript?: Json | null
          id?: string
          location?: string | null
          meeting_at?: string | null
          meeting_end_at?: string | null
          meeting_reviewed?: boolean | null
          openai_response?: Json | null
          original_file_name?: string | null
          recurrence_instance_index?: number | null
          recurrence_parent_id?: string | null
          speaker_names?: Json | null
          summary?: string | null
          summary_jsonb?: Json | null
          title?: string | null
          transcription?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      new_companies: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      new_contact_emails: {
        Row: {
          contact_id: string | null
          created_at: string | null
          display_order: number | null
          email: string
          id: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          display_order?: number | null
          email: string
          id?: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          display_order?: number | null
          email?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      new_contact_phones: {
        Row: {
          contact_id: string | null
          created_at: string | null
          display_order: number | null
          id: string
          phone: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          phone: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          phone?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      new_contacts: {
        Row: {
          city: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          first_name: string | null
          id: string
          is_favorite: boolean | null
          job_title: string | null
          last_name: string | null
          linkedin: string | null
          state: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          first_name?: string | null
          id?: string
          is_favorite?: boolean | null
          job_title?: string | null
          last_name?: string | null
          linkedin?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          first_name?: string | null
          id?: string
          is_favorite?: boolean | null
          job_title?: string | null
          last_name?: string | null
          linkedin?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "new_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          state: Json
          table_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          state?: Json
          table_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          state?: Json
          table_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          task_id: string
          user_id?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_meetings: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          task_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_meetings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_meetings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_meetings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          created_at: string
          id: string
          note_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_id: string
          task_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          note_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notes_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          task_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          owner_contact_id: string | null
          priority: Database["ai_transcriber"]["Enums"]["task_priority"]
          start_at: string | null
          status: Database["ai_transcriber"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          owner_contact_id?: string | null
          priority?: Database["ai_transcriber"]["Enums"]["task_priority"]
          start_at?: string | null
          status?: Database["ai_transcriber"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          owner_contact_id?: string | null
          priority?: Database["ai_transcriber"]["Enums"]["task_priority"]
          start_at?: string | null
          status?: Database["ai_transcriber"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meeting_attendees_with_contacts: {
        Row: {
          attendance_status: string | null
          company: string | null
          contact_id: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string | null
          invitation_status: string | null
          invited_at: string | null
          job_title: string | null
          last_name: string | null
          meeting_id: string | null
          notes: string | null
          primary_email: string | null
          primary_phone: string | null
          responded_at: string | null
          role: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "new_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings_with_attendee_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings_with_attendee_summary: {
        Row: {
          absent_count: number | null
          accepted_count: number | null
          audio_file_path: string | null
          created_at: string | null
          declined_count: number | null
          formatted_transcript: Json | null
          id: string | null
          meeting_at: string | null
          meeting_reviewed: boolean | null
          no_response_count: number | null
          openai_response: Json | null
          original_file_name: string | null
          present_count: number | null
          speaker_names: Json | null
          summary: string | null
          summary_jsonb: Json | null
          tentative_count: number | null
          title: string | null
          total_invited: number | null
          transcription: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_message_owner: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      is_session_owner: {
        Args: { p_session_id: string }
        Returns: boolean
      }
    }
    Enums: {
      chat_action_type:
        | "filter"
        | "sort"
        | "navigate"
        | "create"
        | "function_call"
      chat_role: "user" | "assistant" | "system"
      meeting_recurrence_end_type: "never" | "on" | "after"
      meeting_recurrence_frequency: "day" | "week" | "month" | "year"
      meeting_recurrence_monthly_option: "day" | "weekday"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "todo"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  tech_stack_2026: {
    Tables: {
      chat_attachments: {
        Row: {
          created_at: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          name?: string
          size?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_branch_state: {
        Row: {
          active_index: number
          id: string
          session_id: string
          signature: string | null
          signatures: string[] | null
          updated_at: string
          user_message_id: string
        }
        Insert: {
          active_index?: number
          id?: string
          session_id: string
          signature?: string | null
          signatures?: string[] | null
          updated_at?: string
          user_message_id: string
        }
        Update: {
          active_index?: number
          id?: string
          session_id?: string
          signature?: string | null
          signatures?: string[] | null
          updated_at?: string
          user_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_branch_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_branch_state_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json | null
          content: string
          context: Json | null
          created_at: string
          function_result: Json | null
          id: string
          parent_id: string | null
          reasoning: string | null
          role: Database["tech_stack_2026"]["Enums"]["chat_role"]
          root_user_message_id: string | null
          seq: number
          session_id: string
          variant_group_id: string | null
          variant_index: number
          turn_id: string | null
          model: string | null
          settings: Json
          status: "pending" | "streaming" | "completed" | "failed" | "cancelled"
        }
        Insert: {
          citations?: Json | null
          content?: string
          context?: Json | null
          created_at?: string
          function_result?: Json | null
          id?: string
          parent_id?: string | null
          reasoning?: string | null
          role: Database["tech_stack_2026"]["Enums"]["chat_role"]
          root_user_message_id?: string | null
          seq?: never
          session_id: string
          variant_group_id?: string | null
          variant_index?: number
          turn_id?: string | null
          model?: string | null
          settings?: Json
          status?: "pending" | "streaming" | "completed" | "failed" | "cancelled"
        }
        Update: {
          citations?: Json | null
          content?: string
          context?: Json | null
          created_at?: string
          function_result?: Json | null
          id?: string
          parent_id?: string | null
          reasoning?: string | null
          role?: Database["tech_stack_2026"]["Enums"]["chat_role"]
          root_user_message_id?: string | null
          seq?: never
          session_id?: string
          variant_group_id?: string | null
          variant_index?: number
          turn_id?: string | null
          model?: string | null
          settings?: Json
          status?: "pending" | "streaming" | "completed" | "failed" | "cancelled"
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_root_user_message_id_fkey"
            columns: ["root_user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_turns: {
        Row: {
          id: string
          session_id: string
          mode: "new" | "edit" | "retry"
          target_message_id: string | null
          user_message_id: string | null
          assistant_message_id: string | null
          model: string
          settings: Json
          status: "pending" | "streaming" | "completed" | "failed" | "cancelled"
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          session_id: string
          mode: "new" | "edit" | "retry"
          target_message_id?: string | null
          user_message_id?: string | null
          assistant_message_id?: string | null
          model?: string
          settings?: Json
          status?: "pending" | "streaming" | "completed" | "failed" | "cancelled"
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          mode?: "new" | "edit" | "retry"
          target_message_id?: string | null
          user_message_id?: string | null
          assistant_message_id?: string | null
          model?: string
          settings?: Json
          status?: "pending" | "streaming" | "completed" | "failed" | "cancelled"
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          active_leaf_id: string | null
          context: Json | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_leaf_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active_leaf_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_suggested_actions: {
        Row: {
          created_at: string
          id: string
          label: string
          message_id: string
          payload: Json
          type: Database["tech_stack_2026"]["Enums"]["chat_action_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          message_id: string
          payload: Json
          type: Database["tech_stack_2026"]["Enums"]["chat_action_type"]
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          message_id?: string
          payload?: Json
          type?: Database["tech_stack_2026"]["Enums"]["chat_action_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_suggested_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_tool_calls: {
        Row: {
          arguments: Json
          created_at: string
          id: string
          message_id: string
          name: string
          reasoning: string | null
          result: Json | null
        }
        Insert: {
          arguments: Json
          created_at?: string
          id?: string
          message_id: string
          name: string
          reasoning?: string | null
          result?: Json | null
        }
        Update: {
          arguments?: Json
          created_at?: string
          id?: string
          message_id?: string
          name?: string
          reasoning?: string | null
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          state: Json
          table_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          state?: Json
          table_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          state?: Json
          table_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_chat_session_owner: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      begin_chat_turn: {
        Args: {
          p_session_id: string
          p_content: string
          p_mode: string
          p_target_message_id?: string | null
          p_model?: string | null
          p_settings?: Json
          p_turn_id?: string | null
          p_context?: Json | null
          p_attachments?: Json
        }
        Returns: Json
      }
      complete_chat_turn: {
        Args: {
          p_session_id: string
          p_turn_id: string
          p_assistant_message_id: string
          p_content: string
          p_reasoning?: string | null
          p_citations?: Json | null
          p_function_result?: Json | null
          p_tool_calls?: Json
          p_actions?: Json
        }
        Returns: Json
      }
      select_chat_branch: {
        Args: { p_session_id: string; p_message_id: string }
        Returns: Json
      }
      clear_chat_conversation: {
        Args: { p_session_id: string }
        Returns: Json
      }
      fail_chat_turn: {
        Args: {
          p_session_id: string
          p_turn_id: string
          p_assistant_message_id: string
          p_status: string
          p_error?: string | null
        }
        Returns: Json
      }
    }
    Enums: {
      chat_action_type:
        | "filter"
        | "sort"
        | "navigate"
        | "create"
        | "function_call"
      chat_role: "user" | "assistant" | "system"
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
  ai_transcriber: {
    Enums: {
      chat_action_type: [
        "filter",
        "sort",
        "navigate",
        "create",
        "function_call",
      ],
      chat_role: ["user", "assistant", "system"],
      meeting_recurrence_end_type: ["never", "on", "after"],
      meeting_recurrence_frequency: ["day", "week", "month", "year"],
      meeting_recurrence_monthly_option: ["day", "weekday"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "blocked", "completed", "cancelled"],
    },
  },
  tech_stack_2026: {
    Enums: {
      chat_action_type: [
        "filter",
        "sort",
        "navigate",
        "create",
        "function_call",
      ],
      chat_role: ["user", "assistant", "system"],
    },
  },
} as const
