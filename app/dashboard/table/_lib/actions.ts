"use server"

import { APP_SCHEMA } from "@/lib/supabase/app-schema"
import { createClient } from "@/lib/supabase/server"

export async function deleteContacts(ids: string[]): Promise<{
  success: boolean
  error?: string
  deletedCount?: number
}> {
  const contactIds = ids.filter(Boolean)

  if (contactIds.length === 0) {
    return { success: false, error: "No contacts selected." }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .schema(APP_SCHEMA)
    .from("registry_contacts")
    .delete({ count: "exact" })
    .in("id", contactIds)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, deletedCount: count ?? contactIds.length }
}
