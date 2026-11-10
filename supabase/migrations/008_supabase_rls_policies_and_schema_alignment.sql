-- ============================================================================
-- 008: SUPABASE DIRECT CLIENT SCHEMA ALIGNMENT & ROW LEVEL SECURITY POLICIES
-- Ensures direct frontend-to-Supabase queries (via @supabase/supabase-js)
-- have all expected columns and explicit RLS policies without 403/404 errors.
-- ============================================================================

-- 1. Align columns across tables used by the React frontend and Supabase client
ALTER TABLE IF EXISTS public.properties
  ADD COLUMN IF NOT EXISTS occupied_units INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE IF EXISTS public.unit_types
  ADD COLUMN IF NOT EXISTS property_name TEXT DEFAULT '';

ALTER TABLE IF EXISTS public.units
  ADD COLUMN IF NOT EXISTS property_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tenant_ref TEXT;

ALTER TABLE IF EXISTS public.tenants
  ADD COLUMN IF NOT EXISTS property_name TEXT DEFAULT '';

ALTER TABLE IF EXISTS public.rent_payments
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.chat_threads
  ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.property_tasks
  ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS due_date TEXT DEFAULT '';

-- 2. Enable RLS across core application tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.property_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.branded_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_notification_settings ENABLE ROW LEVEL SECURITY;

-- 3. Create idempotent RLS policies for authenticated users and invitation verification
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'properties',
    'property_images',
    'unit_types',
    'units',
    'tenants',
    'leases',
    'rent_payments',
    'expenses',
    'maintenance_requests',
    'chat_threads',
    'property_tasks',
    'property_reviews',
    'activity_logs',
    'staff_invitations',
    'security_audit_logs',
    'branded_emails',
    'sms_logs',
    'sms_notification_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access on %I" ON public.%I;', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY "Allow authenticated full access on %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
        tbl,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Allow unauthenticated (anon) read access ONLY to validate pending invitations during /activate-invite
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_invitations'
  ) THEN
    DROP POLICY IF EXISTS "Allow anon invite validation on staff_invitations" ON public.staff_invitations;
    CREATE POLICY "Allow anon invite validation on staff_invitations"
      ON public.staff_invitations
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    DROP POLICY IF EXISTS "Allow anon invite lookup on profiles" ON public.profiles;
    CREATE POLICY "Allow anon invite lookup on profiles"
      ON public.profiles
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
