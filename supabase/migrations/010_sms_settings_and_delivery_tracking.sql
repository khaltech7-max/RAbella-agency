-- ============================================================================
-- 010: STANDARD SMS SETTINGS, DELIVERY TRACKING & PERFORMANCE INDEXES
-- ============================================================================

-- 0. Ensure standard auth roles exist (safe for Supabase Cloud and local PGlite)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 1. Align sms_notification_settings for Standard SMS Gateway
ALTER TABLE IF EXISTS public.sms_notification_settings
  ADD COLUMN IF NOT EXISTS sender_id TEXT DEFAULT 'ARABELLA',
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'Standard SMS Gateway';

UPDATE public.sms_notification_settings
SET provider = 'Standard SMS Gateway'
WHERE provider IS NULL OR provider = '' OR provider != 'Standard SMS Gateway';

-- 2. Align sms_logs for delivery status & timestamp
ALTER TABLE IF EXISTS public.sms_logs
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cost_kes NUMERIC(8,4) DEFAULT 0.8000;

-- 3. Create indexes for fast delivery status polling and message tracking
CREATE INDEX IF NOT EXISTS idx_sms_logs_provider_msg_id ON public.sms_logs (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_delivery_status ON public.sms_logs (delivery_status);

-- 4. Enable RLS and verify policies
ALTER TABLE IF EXISTS public.sms_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read sms_notification_settings" ON public.sms_notification_settings;
CREATE POLICY "Allow authenticated read sms_notification_settings"
  ON public.sms_notification_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin update sms_notification_settings" ON public.sms_notification_settings;
CREATE POLICY "Allow admin update sms_notification_settings"
  ON public.sms_notification_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access on sms_logs" ON public.sms_logs;
CREATE POLICY "Allow authenticated full access on sms_logs"
  ON public.sms_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
