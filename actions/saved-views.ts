"use server"

import { APP_SCHEMA } from "@/lib/supabase/app-schema"
import { createClient } from "@/lib/supabase/server"
import type { DataTableState } from "@/lib/data-table"

export interface SavedViewRecord {
  id: string
  name: string
  description?: string | null
  state?: DataTableState | null
  tableKey: string
  userId: string
  createdAt: string
  updatedAt: string
}

interface SaveViewParams {
  tableKey: string
  name: string
  description?: string
  state: DataTableState
  viewId?: string
}

export async function listSavedViews(
  tableKey: string
): Promise<{ success: boolean; data?: SavedViewRecord[]; error?: string }> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Unauthorized" }
    }

    const { data, error } = await supabase
      .schema(APP_SCHEMA)
      .from("saved_views")
      .select("*")
      .eq("table_key", tableKey)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error listing saved views:", error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data:
        data?.map((view) => ({
          id: view.id,
          name: view.name,
          description: view.description,
          state: view.state as DataTableState | null,
          tableKey: view.table_key,
          userId: view.user_id,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        })) ?? [],
    }
  } catch (error) {
    console.error("Unexpected error listing saved views:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function saveView(
  params: SaveViewParams
): Promise<{ success: boolean; data?: SavedViewRecord; error?: string }> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Unauthorized" }
    }

    const { tableKey, name, description, state, viewId } = params

    if (viewId) {
      // Update existing view
      const { data, error } = await supabase
        .schema(APP_SCHEMA)
        .from("saved_views")
        .update({
          name,
          description: description || null,
          state: state as unknown,
          updated_at: new Date().toISOString(),
        })
        .eq("id", viewId)
        .eq("user_id", user.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating saved view:", error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          description: data.description,
          state: data.state as DataTableState | null,
          tableKey: data.table_key,
          userId: data.user_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      }
    } else {
      // Create new view
      const { data, error } = await supabase
        .schema(APP_SCHEMA)
        .from("saved_views")
        .insert({
          table_key: tableKey,
          user_id: user.id,
          name,
          description: description || null,
          state: state as unknown,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating saved view:", error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          description: data.description,
          state: data.state as DataTableState | null,
          tableKey: data.table_key,
          userId: data.user_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      }
    }
  } catch (error) {
    console.error("Unexpected error saving view:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function deleteView(
  viewId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Unauthorized" }
    }

    const { error } = await supabase
      .schema(APP_SCHEMA)
      .from("saved_views")
      .delete()
      .eq("id", viewId)
      .eq("user_id", user.id)

    if (error) {
      console.error("Error deleting saved view:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error deleting view:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
