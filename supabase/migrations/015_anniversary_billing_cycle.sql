-- ============================================================================
-- Migration 015: Anniversary-Based Rental Billing & Configurable Advance Reminders
-- Idempotent, non-destructive upgrade preserving all historical invoices,
-- PayHero transactions, M-Pesa payments, and property configurations.
-- ============================================================================

-- 1. Extend rent_payments with explicit billing cycle metadata and duplicate guard
ALTER TABLE public.rent_payments
  ADD COLUMN IF NOT EXISTS billing_period_start TEXT,
  ADD COLUMN IF NOT EXISTS billing_period_end TEXT,
  ADD COLUMN IF NOT EXISTS billing_period_key TEXT,
  ADD COLUMN IF NOT EXISTS billing_anniversary_day INTEGER,
  ADD COLUMN IF NOT EXISTS invoice_date TEXT;

-- Partial unique index prevents duplicate invoices for the same tenancy & billing period
-- while preserving all existing historical records where billing_period_key is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_payments_unique_billing_period
  ON public.rent_payments (billing_period_key)
  WHERE billing_period_key IS NOT NULL AND billing_period_key <> '';

CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant_due
  ON public.rent_payments (tenant_ref, due_date);

-- 2. Extend leases and tenants with derived anniversary day & next billing date
ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS billing_anniversary_day INTEGER,
  ADD COLUMN IF NOT EXISTS next_billing_date TEXT;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_anniversary_day INTEGER,
  ADD COLUMN IF NOT EXISTS next_billing_date TEXT;

-- 3. Add configurable advance reminder lead days to email_notification_settings (default 3 days)
ALTER TABLE public.email_notification_settings
  ADD COLUMN IF NOT EXISTS advance_reminder_days INTEGER NOT NULL DEFAULT 3;
