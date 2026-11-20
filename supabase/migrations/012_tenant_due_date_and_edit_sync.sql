-- ============================================================================
-- 012: TENANT DUE DATE, REQUIRED EMAIL & AUTOMATIC DATABASE EDIT SYNC TRIGGERS
-- Safe, non-destructive migration: preserves 100% of existing records while
-- ensuring any tenant/lease/payment edit automatically updates across
-- public.tenants, public.leases, public.rent_payments, and public.chat_threads.
-- ============================================================================

-- 1. Add due_date and synchronized lease/unit columns to public.tenants & public.leases
ALTER TABLE IF EXISTS public.tenants
  ADD COLUMN IF NOT EXISTS due_date TEXT,
  ADD COLUMN IF NOT EXISTS unit_number TEXT,
  ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'Deluxe',
  ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS public.leases
  ADD COLUMN IF NOT EXISTS due_date TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS public.rent_payments
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Backfill existing tenants and leases with their current due_date, unit, and rent
UPDATE public.leases l
SET due_date = COALESCE(
  l.due_date,
  (
    SELECT rp.due_date
    FROM public.rent_payments rp
    WHERE (rp.tenant_id = l.tenant_id OR UPPER(rp.tenant_ref) = UPPER(l.tenant_ref))
    ORDER BY CASE WHEN rp.status <> 'Paid' THEN 0 ELSE 1 END, rp.created_at DESC
    LIMIT 1
  ),
  l.lease_start
)
WHERE l.due_date IS NULL OR l.due_date = '';

UPDATE public.tenants t
SET
  due_date = COALESCE(
    t.due_date,
    (
      SELECT rp.due_date
      FROM public.rent_payments rp
      WHERE (rp.tenant_id = t.id OR UPPER(rp.tenant_ref) = UPPER(t.tenant_ref))
      ORDER BY CASE WHEN rp.status <> 'Paid' THEN 0 ELSE 1 END, rp.created_at DESC
      LIMIT 1
    ),
    (
      SELECT l.due_date
      FROM public.leases l
      WHERE (l.tenant_id = t.id OR UPPER(l.tenant_ref) = UPPER(t.tenant_ref))
      LIMIT 1
    )
  ),
  unit_number = COALESCE(
    t.unit_number,
    (
      SELECT l.unit_number
      FROM public.leases l
      WHERE (l.tenant_id = t.id OR UPPER(l.tenant_ref) = UPPER(t.tenant_ref))
      LIMIT 1
    )
  ),
  unit_type = COALESCE(
    t.unit_type,
    (
      SELECT l.unit_type
      FROM public.leases l
      WHERE (l.tenant_id = t.id OR UPPER(l.tenant_ref) = UPPER(t.tenant_ref))
      LIMIT 1
    ),
    'Deluxe'
  ),
  monthly_rent = CASE
    WHEN COALESCE(t.monthly_rent, 0) > 0 THEN t.monthly_rent
    ELSE COALESCE(
      (
        SELECT l.monthly_rent
        FROM public.leases l
        WHERE (l.tenant_id = t.id OR UPPER(l.tenant_ref) = UPPER(t.tenant_ref))
        LIMIT 1
      ),
      t.security_deposit,
      0
    )
  END;

-- 3. Trigger Function: When a tenant is created or edited in public.tenants,
--    automatically propagate changes to public.leases, public.rent_payments, and public.chat_threads
CREATE OR REPLACE FUNCTION public.sync_tenant_changes_across_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  -- Sync to public.leases
  UPDATE public.leases
  SET
    property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
    unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
    unit_type     = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
    monthly_rent  = CASE WHEN COALESCE(NEW.monthly_rent, 0) > 0 THEN NEW.monthly_rent ELSE monthly_rent END,
    due_date      = COALESCE(NULLIF(TRIM(NEW.due_date), ''), due_date),
    updated_at    = NOW()
  WHERE tenant_id = NEW.id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);

  -- Sync tenant details to all matching rent_payments
  UPDATE public.rent_payments
  SET
    tenant_name   = COALESCE(NULLIF(TRIM(NEW.full_name), ''), tenant_name),
    property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
    unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
    unit_type     = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
    due_date      = CASE
                      WHEN status <> 'Paid' AND NULLIF(TRIM(NEW.due_date), '') IS NOT NULL
                        THEN TRIM(NEW.due_date)
                      ELSE due_date
                    END,
    amount        = CASE
                      WHEN status <> 'Paid' AND COALESCE(NEW.monthly_rent, 0) > 0
                        THEN NEW.monthly_rent
                      ELSE amount
                    END,
    amount_due    = CASE
                      WHEN status <> 'Paid' AND COALESCE(NEW.monthly_rent, 0) > 0
                        THEN NEW.monthly_rent
                      ELSE amount_due
                    END,
    updated_at    = NOW()
  WHERE tenant_id = NEW.id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);

  -- Sync to public.chat_threads if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_threads'
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

-- 4. Trigger Function: When a lease is inserted or edited in public.leases,
--    automatically propagate changes to public.tenants and unpaid public.rent_payments
CREATE OR REPLACE FUNCTION public.sync_lease_changes_across_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  UPDATE public.tenants
  SET
    property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
    unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
    unit_type     = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
    monthly_rent  = CASE WHEN COALESCE(NEW.monthly_rent, 0) > 0 THEN NEW.monthly_rent ELSE monthly_rent END,
    due_date      = COALESCE(NULLIF(TRIM(NEW.due_date), ''), due_date),
    updated_at    = NOW()
  WHERE id = NEW.tenant_id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);

  UPDATE public.rent_payments
  SET
    property_name = COALESCE(NULLIF(TRIM(NEW.property_name), ''), property_name),
    unit_number   = COALESCE(NULLIF(TRIM(NEW.unit_number), ''), unit_number),
    unit_type     = COALESCE(NULLIF(TRIM(NEW.unit_type), ''), unit_type),
    due_date      = CASE
                      WHEN status <> 'Paid' AND NULLIF(TRIM(NEW.due_date), '') IS NOT NULL
                        THEN TRIM(NEW.due_date)
                      ELSE due_date
                    END,
    amount        = CASE
                      WHEN status <> 'Paid' AND COALESCE(NEW.monthly_rent, 0) > 0
                        THEN NEW.monthly_rent
                      ELSE amount
                    END,
    amount_due    = CASE
                      WHEN status <> 'Paid' AND COALESCE(NEW.monthly_rent, 0) > 0
                        THEN NEW.monthly_rent
                      ELSE amount_due
                    END,
    updated_at    = NOW()
  WHERE tenant_id = NEW.tenant_id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lease_changes ON public.leases;
CREATE TRIGGER trg_sync_lease_changes
BEFORE INSERT OR UPDATE ON public.leases
FOR EACH ROW
EXECUTE FUNCTION public.sync_lease_changes_across_tables();

-- 5. Trigger Function: When due_date is edited on public.rent_payments,
--    keep public.tenants.due_date and public.leases.due_date synchronized
CREATE OR REPLACE FUNCTION public.sync_payment_due_date_to_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  IF NULLIF(TRIM(NEW.due_date), '') IS NOT NULL THEN
    UPDATE public.tenants
    SET due_date = TRIM(NEW.due_date), updated_at = NOW()
    WHERE id = NEW.tenant_id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);

    UPDATE public.leases
    SET due_date = TRIM(NEW.due_date), updated_at = NOW()
    WHERE tenant_id = NEW.tenant_id OR UPPER(tenant_ref) = UPPER(NEW.tenant_ref);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_due_date ON public.rent_payments;
CREATE TRIGGER trg_sync_payment_due_date
BEFORE INSERT OR UPDATE OF due_date ON public.rent_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_due_date_to_tenant();
