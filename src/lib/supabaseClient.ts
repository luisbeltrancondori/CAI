import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let supabase: SupabaseClient<Database> | undefined

export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabase) {
    return supabase
  }

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env.',
    )
  }

  supabase = createClient<Database>(url, anonKey)
  return supabase
}
