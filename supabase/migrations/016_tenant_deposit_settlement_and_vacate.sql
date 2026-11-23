-- Migration 016: Tenant Deposit Settlement, Damage Deduction & Vacate Workflow
-- Adds manual deposit tracking, vacate status, and damage expense settlement audit fields.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenancy_status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS vacated_at TEXT,
  ADD COLUMN IF NOT EXISTS deposit_status TEXT NOT NULL DEFAULT 'Held',
  ADD COLUMN IF NOT EXISTS deposit_returned_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS deposit_deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS deposit_damage_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS deposit_settled_at TEXT,
  ADD COLUMN IF NOT EXISTS deposit_settled_by TEXT;

UPDATE public.tenants
SET deposit_status = CASE
  WHEN COALESCE(security_deposit, 0) > 0 THEN 'Held'
  ELSE 'Not Paid'
END
WHERE deposit_status IS NULL;
