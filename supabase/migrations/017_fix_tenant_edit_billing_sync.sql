-- ============================================================================
-- 017: FIX TENANT EDITING & BILLING DATE SYNCHRONIZATION TRIGGERS
-- Safe, non-destructive, idempotent migration:
--   - Preserves 100% of existing tenants, leases, and rent_payments records.
--   - Stops tenant/lease profile edits from overwriting due_date, billing
--     periods, or amounts on historical or current rent_payments invoices.
--   - Prevents individual rent_payments.due_date writes from overwriting
--     tenants.due_date / leases.due_date and bouncing back across invoices.
--   - Keeps non-billing tenant/lease metadata synchronized safely only when
--     the underlying fields actually change.
-- ============================================================================

-- Ensure expected columns exist idempotently before referencing them in triggers
ALTER TABLE IF EXISTS public.tenants
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS billing_anniversary_day INTEGER,
  ADD COLUMN IF NOT EXISTS next_billing_date TEXT;

ALTER TABLE IF EXISTS public.leases
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS billing_anniversary_day INTEGER,
  ADD COLUMN IF NOT EXISTS next_billing_date TEXT;

ALTER TABLE IF EXISTS public.rent_payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 1. Replace sync_tenant_changes_across_tables():
--    Only syncs property/unit/rent summary fields to leases when changed,
--    and contact/unit display fields to chat_threads when changed.
--    NEVER modifies public.rent_payments due dates, billing periods, or amounts.
CREATE OR REPLACE FUNCTION public.sync_tenant_changes_across_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  -- Sync property/unit/rent metadata to public.leases ONLY if those fields changed
  IF (
    NEW.property_name IS DISTINCT FROM OLD.property_name OR
    NEW.unit_number IS DISTINCT FROM OLD.unit_number OR
    NEW.unit_type IS DISTINCT FROM OLD.unit_type OR
    NEW.monthly_rent IS DISTINCT FROM OLD.monthly_rent
  ) THEN
    UPDATE public.leases
    SET
      property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
      unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
      unit_type     = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
      monthly_rent  = CASE WHEN COALESCE(NEW.monthly_rent, 0) > 0 THEN NEW.monthly_rent ELSE monthly_rent END,
      updated_at    = NOW()
    WHERE tenant_id = NEW.id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);
  END IF;

  -- Sync display details to public.chat_threads ONLY if display fields changed
  IF (
    NEW.full_name IS DISTINCT FROM OLD.full_name OR
    NEW.property_name IS DISTINCT FROM OLD.property_name OR
    NEW.unit_number IS DISTINCT FROM OLD.unit_number
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_threads' AND column_name = 'tenant_name'
  ) THEN
    UPDATE public.chat_threads
    SET
      tenant_name   = COALESCE(NULLIF(TRIM(NEW.full_name), ''), tenant_name),
      property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
      unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number)
    WHERE UPPER(tenant_ref) = UPPER(NEW.tenant_ref);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_changes ON public.tenants;
CREATE TRIGGER trg_sync_tenant_changes
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_changes_across_tables();

-- 2. Replace sync_lease_changes_across_tables():
--    Keeps non-billing summary fields (property/unit/rent/anniversary metadata)
--    synchronized on public.tenants when explicitly inserted/changed on leases.
--    NEVER modifies tenants.due_date or public.rent_payments invoices.
CREATE OR REPLACE FUNCTION public.sync_lease_changes_across_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  IF (
    TG_OP = 'INSERT' OR
    NEW.property_name IS DISTINCT FROM OLD.property_name OR
    NEW.unit_number IS DISTINCT FROM OLD.unit_number OR
    NEW.unit_type IS DISTINCT FROM OLD.unit_type OR
    NEW.monthly_rent IS DISTINCT FROM OLD.monthly_rent OR
    NEW.billing_anniversary_day IS DISTINCT FROM OLD.billing_anniversary_day OR
    NEW.next_billing_date IS DISTINCT FROM OLD.next_billing_date
  ) THEN
    UPDATE public.tenants
    SET
      property_name           = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
      unit_number             = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
      unit_type               = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
      monthly_rent            = CASE WHEN COALESCE(NEW.monthly_rent, 0) > 0 THEN NEW.monthly_rent ELSE monthly_rent END,
      billing_anniversary_day = COALESCE(NEW.billing_anniversary_day, billing_anniversary_day),
      next_billing_date       = COALESCE(NULLIF(TRIM(NEW.next_billing_date), ''), next_billing_date),
      updated_at              = NOW()
    WHERE id = NEW.tenant_id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lease_changes ON public.leases;
CREATE TRIGGER trg_sync_lease_changes
BEFORE INSERT OR UPDATE ON public.leases
FOR EACH ROW
EXECUTE FUNCTION public.sync_lease_changes_across_tables();

-- 3. Restrict sync_payment_due_date_to_tenant():
--    Stamps updated_at on the rent_payments row only. Does NOT overwrite
--    public.tenants.due_date or public.leases.due_date so individual invoice
--    due dates never corrupt tenant/lease records or other billing cycles.
CREATE OR REPLACE FUNCTION public.sync_payment_due_date_to_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_due_date ON public.rent_payments;
CREATE TRIGGER trg_sync_payment_due_date
BEFORE INSERT OR UPDATE OF due_date ON public.rent_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_due_date_to_tenant();
