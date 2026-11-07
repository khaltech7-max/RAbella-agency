-- =============================================================================
-- MIGRATION 005: DATABASE PERFORMANCE INDEXES FOR FAST QUERIES & MUTATIONS
-- =============================================================================
-- Adds composite and foreign-key B-tree indexes across all core Rentify tables
-- to eliminate sequential table scans during tenant, property, unit, lease,
-- payment, maintenance, expense, and reminder operations.
--
-- Safely ensures tenant_ref exists on tables created in earlier schema versions,
-- and uses safe index execution to prevent errors if any column or table is absent.

-- Step 1: Ensure tenant_ref exists on tables where it is referenced
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'units') THEN
    ALTER TABLE public.units ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leases') THEN
    ALTER TABLE public.leases ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rent_payments') THEN
    ALTER TABLE public.rent_payments ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_requests') THEN
    ALTER TABLE public.maintenance_requests ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_threads') THEN
    ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'property_reviews') THEN
    ALTER TABLE public.property_reviews ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_ref TEXT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 2: Helper function for safe, exception-tolerant index creation
CREATE OR REPLACE FUNCTION public.create_index_safe(p_index_sql text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_index_sql;
  EXCEPTION
    WHEN undefined_column THEN
      NULL; -- Column doesn't exist in this environment, skip safely
    WHEN undefined_table THEN
      NULL; -- Table doesn't exist, skip safely
    WHEN duplicate_table THEN
      NULL; -- Index already exists
    WHEN duplicate_object THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;
END;
$$;

-- 1. Properties lookup indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_properties_code_prefix ON public.properties (code_prefix)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_properties_name_lower ON public.properties (LOWER(name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_properties_created_at ON public.properties (created_at ASC)');

-- 2. Unit Types & Units lookup indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_unit_types_property_id ON public.unit_types (property_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_unit_types_property_name_lower ON public.unit_types (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_units_property_id ON public.units (property_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_units_property_unit_num ON public.units (property_id, LOWER(unit_number))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_units_status ON public.units (property_id, status)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_units_tenant_ref ON public.units (tenant_ref)');

-- 3. Tenants lookup indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON public.tenants (property_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_tenants_tenant_ref_upper ON public.tenants (UPPER(tenant_ref))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_tenants_email_lower ON public.tenants (LOWER(email))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON public.tenants (user_id)');

-- 4. Leases lookup indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON public.leases (tenant_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_leases_tenant_ref_upper ON public.leases (UPPER(tenant_ref))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_leases_unit_id ON public.leases (unit_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_leases_property_name_lower ON public.leases (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_leases_created_at ON public.leases (created_at DESC)');

-- 5. Rent Payments lookup indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant_id ON public.rent_payments (tenant_id)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant_ref_upper ON public.rent_payments (UPPER(tenant_ref))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_rent_payments_status ON public.rent_payments (status)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_rent_payments_property_status ON public.rent_payments (LOWER(property_name), status)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_rent_payments_created_at ON public.rent_payments (created_at DESC)');

-- 6. Maintenance, Expenses, Chat Threads, Tasks, Reviews & Activity Logs indexes
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_maintenance_property_name ON public.maintenance_requests (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_ref ON public.maintenance_requests (UPPER(tenant_ref))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_maintenance_status ON public.maintenance_requests (maintenance_status)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_maintenance_created_at ON public.maintenance_requests (created_at DESC)');

SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_expenses_property_name ON public.expenses (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses (created_at DESC)');

SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_chat_threads_tenant_ref_upper ON public.chat_threads (UPPER(tenant_ref))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_chat_threads_property_name ON public.chat_threads (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_chat_threads_created_at ON public.chat_threads (created_at DESC)');

SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_property_tasks_created_at ON public.property_tasks (created_at DESC)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_property_reviews_property_name ON public.property_reviews (LOWER(property_name))');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC)');
SELECT public.create_index_safe('CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email))');

-- Clean up helper function
DROP FUNCTION IF EXISTS public.create_index_safe(text);
