const DEFAULT_APP_SCHEMA = "tech_stack_2026";

function resolveAppSchema() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA?.trim();
  return value && value.length > 0 ? value : DEFAULT_APP_SCHEMA;
}

export const APP_SCHEMA = resolveAppSchema();
