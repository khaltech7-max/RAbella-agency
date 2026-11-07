-- ============================================================================
-- MIGRATION 003: AFRICA'S TALKING SMS INTEGRATION, LOGS & AUTOMATION SETTINGS
-- ============================================================================

-- 1. SMS Notification Settings Table (Singleton configuration row)
CREATE TABLE IF NOT EXISTS public.sms_notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  sender_id TEXT DEFAULT '',
  master_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_tenant_registered BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rent_due_soon BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rent_overdue BOOLEAN NOT NULL DEFAULT TRUE,
  auto_payment_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  auto_admin_announcement BOOLEAN NOT NULL DEFAULT TRUE,
  prevent_duplicates_hours INTEGER NOT NULL DEFAULT 24,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.sms_notification_settings (
  id,
  environment,
  sender_id,
  master_enabled,
  auto_tenant_registered,
  auto_rent_due_soon,
  auto_rent_overdue,
  auto_payment_confirmed,
  auto_admin_announcement,
  prevent_duplicates_hours
) VALUES (
  'default',
  'sandbox',
  'RENTIFY',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  24
) ON CONFLICT (id) DO NOTHING;

-- 2. SMS Logs Table (Records every SMS attempt, Africa's Talking response, and deduplication key)
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  tenant_ref TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  property_name TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN (
      'tenant_registered',
      'rent_due_soon',
      'rent_overdue',
      'payment_confirmed',
      'admin_announcement',
      'individual_sms',
      'bulk_sms'
    )
  ),
  message_body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('Delivered', 'Sent', 'Queued', 'Failed', 'Duplicate Skipped', 'Disabled')
  ),
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  provider TEXT NOT NULL DEFAULT 'AfricasTalking',
  provider_message_id TEXT,
  provider_status_code INTEGER,
  provider_cost TEXT DEFAULT 'KES 0.80',
  api_response JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  dedupe_key TEXT,
  payment_id TEXT,
  sent_by TEXT DEFAULT 'System Automation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_tenant_ref ON public.sms_logs (tenant_ref);
CREATE INDEX IF NOT EXISTS idx_sms_logs_dedupe_key ON public.sms_logs (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs (status);

-- 3. Row-Level Security (RLS) Policies (Safe for both Supabase & local PGlite)
DO $$
BEGIN
  ALTER TABLE public.sms_notification_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Allow authenticated read sms_notification_settings" ON public.sms_notification_settings;
  CREATE POLICY "Allow authenticated read sms_notification_settings"
    ON public.sms_notification_settings
    FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Allow admin update sms_notification_settings" ON public.sms_notification_settings;
  CREATE POLICY "Allow admin update sms_notification_settings"
    ON public.sms_notification_settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow authenticated read sms_logs" ON public.sms_logs;
  CREATE POLICY "Allow authenticated read sms_logs"
    ON public.sms_logs
    FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Allow server insert sms_logs" ON public.sms_logs;
  CREATE POLICY "Allow server insert sms_logs"
    ON public.sms_logs
    FOR INSERT
    WITH CHECK (true);
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
