-- =============================================================================
-- MIGRATION 009: RESEND AUTOMATIC TENANT EMAIL REMINDERS & LOGGING
-- =============================================================================
-- Non-destructively extends public.branded_emails and creates
-- public.email_notification_settings for automated Resend tenant reminders.

CREATE TABLE IF NOT EXISTS public.branded_emails (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  template_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  tenant_id TEXT,
  tenant_ref TEXT,
  property_name TEXT,
  unit_number TEXT,
  amount_due NUMERIC(12,2),
  due_date TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Dispatched',
  resend_id TEXT,
  delivery_status TEXT DEFAULT 'Dispatched',
  error_message TEXT,
  dedupe_key TEXT,
  payment_id TEXT,
  lease_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retried_at TIMESTAMPTZ,
  sent_by TEXT DEFAULT 'Automated Email Scheduler',
  payload_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS property_name TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS unit_number TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2);
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS due_date TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS payment_id TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS lease_id TEXT;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS last_retried_at TIMESTAMPTZ;
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS sent_by TEXT DEFAULT 'Automated Email Scheduler';
  ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS payload_json JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_branded_emails_dedupe_key ON public.branded_emails (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_branded_emails_tenant_ref ON public.branded_emails (tenant_ref);
CREATE INDEX IF NOT EXISTS idx_branded_emails_created_at ON public.branded_emails (created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  master_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rent_upcoming_3d BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rent_due_today BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rent_overdue BOOLEAN NOT NULL DEFAULT TRUE,
  auto_payment_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  auto_lease_expiry_30d BOOLEAN NOT NULL DEFAULT TRUE,
  auto_lease_expiry_7d BOOLEAN NOT NULL DEFAULT TRUE,
  sender_name TEXT NOT NULL DEFAULT 'ARabella agency',
  from_email TEXT NOT NULL DEFAULT 'ARabella agency <onboarding@resend.dev>',
  payment_instructions TEXT NOT NULL DEFAULT 'Remit payment via M-Pesa Paybill or Bank Transfer quoting your Tenant Account Reference (e.g., A-001) as the account number.',
  prevent_duplicates_hours INTEGER NOT NULL DEFAULT 24,
  updated_by TEXT NOT NULL DEFAULT 'System Default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
