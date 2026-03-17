-- Create custom schema for tech-stack-2026 project
-- Uses tech_stack_2026 (underscores) for valid unquoted identifier.
-- If you already created a schema named "tech-stack-2026", create the table there
-- and update app/dashboard/table/_lib/queries.ts to use .schema('tech-stack-2026').

CREATE SCHEMA IF NOT EXISTS tech_stack_2026;

-- Duplicate registry_contacts from public: same structure and data
CREATE TABLE tech_stack_2026.registry_contacts (
  LIKE public.registry_contacts INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

-- Copy existing data from public
INSERT INTO tech_stack_2026.registry_contacts
SELECT * FROM public.registry_contacts;

-- Grant usage so anon/authenticated can access the schema
GRANT USAGE ON SCHEMA tech_stack_2026 TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tech_stack_2026 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tech_stack_2026 TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tech_stack_2026 GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tech_stack_2026 GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Expose schema to PostgREST (required for Supabase API access)
-- For shared Supabase projects, manage exposed schemas centrally in Dashboard:
-- Settings → API → Exposed schemas.
-- Do not overwrite pgrst.db_schemas from a template migration, or one project can hide another.
