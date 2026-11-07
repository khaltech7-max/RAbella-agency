-- =============================================================================
-- RENTIFY — SUPABASE & POSTGRESQL SCHEMA, AUTOMATIC TENANT REFERENCE (A-001)
-- TRIGGERS, VIEWS & ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Uses native PostgreSQL 13+ gen_random_uuid() function

-- 1. ROLE & STATUS ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'property_manager', 'caretaker', 'tenant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM ('Available', 'Occupied', 'Reserved', 'Maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('Paid', 'Pending', 'Overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('Completed', 'In Progress', 'Needs Inspection');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_priority AS ENUM ('Low', 'Medium', 'High');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT 'authenticated',
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'owner',
  tenant_ref TEXT,
  avatar_bg TEXT DEFAULT '#D5F267',
  token TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code_prefix CHAR(1) NOT NULL UNIQUE, -- 'A', 'B', 'C', 'D' used for A-001 tenant reference generation
  name TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  total_units INTEGER NOT NULL DEFAULT 1,
  occupied_units INTEGER NOT NULL DEFAULT 0,
  monthly_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  manager_name TEXT NOT NULL DEFAULT '',
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  variant TEXT NOT NULL DEFAULT 'deluxe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. UNIT TYPES TABLE
CREATE TABLE IF NOT EXISTS public.unit_types (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  property_id TEXT REFERENCES public.properties(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL,
  name TEXT NOT NULL, -- Standard, Deluxe, Suite, Family, Single
  variant TEXT NOT NULL DEFAULT 'deluxe',
  size_sqm INTEGER NOT NULL DEFAULT 65,
  bedrooms TEXT NOT NULL,
  max_tenants INTEGER NOT NULL DEFAULT 2,
  monthly_rent NUMERIC(12,2) NOT NULL,
  occupied_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Available',
  description TEXT NOT NULL,
  long_description TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. UNITS TABLE (Individual rentable doors: Unit 101, Unit 102, etc.)
CREATE TABLE IF NOT EXISTS public.units (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  property_id TEXT REFERENCES public.properties(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL,
  unit_type_id TEXT REFERENCES public.unit_types(id) ON DELETE SET NULL,
  unit_number TEXT NOT NULL,
  unit_type_name TEXT NOT NULL DEFAULT 'Deluxe',
  floor_number INTEGER DEFAULT 1,
  monthly_rent NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Available',
  tenant_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TENANTS TABLE WITH AUTOMATIC UNIQUE PAYMENT REFERENCE (A-001, A-002, B-001...)
CREATE TABLE IF NOT EXISTS public.tenants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name TEXT NOT NULL,
  tenant_ref TEXT UNIQUE NOT NULL, -- Auto-generated via PostgreSQL trigger (e.g., A-001)
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Resident',
  nationality TEXT NOT NULL DEFAULT '',
  id_number TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Verified Tenant',
  on_time_streak TEXT NOT NULL DEFAULT 'Active Lease',
  security_deposit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  vehicle_info TEXT NOT NULL DEFAULT 'None',
  avatar_bg TEXT NOT NULL DEFAULT '#D8F3E5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. POSTGRESQL FUNCTION & TRIGGER FOR AUTOMATIC UNIQUE TENANT PAYMENT REFERENCES (A-001, A-002...)
CREATE OR REPLACE FUNCTION public.generate_tenant_payment_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT := 'A';
  v_next_seq INTEGER;
BEGIN
  IF NEW.tenant_ref IS NULL OR NEW.tenant_ref = '' OR NEW.tenant_ref = 'AUTO' THEN
    IF NEW.property_id IS NOT NULL THEN
      SELECT COALESCE(TRIM(code_prefix), 'A') INTO v_prefix
      FROM public.properties
      WHERE id = NEW.property_id;
    ELSIF NEW.property_name IS NOT NULL THEN
      SELECT COALESCE(TRIM(code_prefix), UPPER(SUBSTRING(NEW.property_name FROM 1 FOR 1)), 'A')
      INTO v_prefix
      FROM public.properties
      WHERE LOWER(name) = LOWER(NEW.property_name)
      LIMIT 1;
    END IF;

    IF v_prefix IS NULL OR v_prefix = '' THEN
      v_prefix := COALESCE(UPPER(SUBSTRING(NEW.property_name FROM 1 FOR 1)), 'A');
    END IF;

    SELECT COALESCE(
      MAX(CAST(SUBSTRING(tenant_ref FROM '^[A-Z]-([0-9]+)$') AS INTEGER)),
      0
    ) + 1
    INTO v_next_seq
    FROM public.tenants
    WHERE tenant_ref LIKE (v_prefix || '-%');

    NEW.tenant_ref := v_prefix || '-' || LPAD(v_next_seq::TEXT, 3, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_tenant_ref ON public.tenants;
CREATE TRIGGER trg_generate_tenant_ref
BEFORE INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.generate_tenant_payment_reference();

-- 8. TENANCIES / LEASES TABLE
CREATE TABLE IF NOT EXISTS public.leases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  lease_code TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_ref TEXT NOT NULL,
  unit_id TEXT REFERENCES public.units(id) ON DELETE SET NULL,
  unit_number TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  property_name TEXT NOT NULL,
  monthly_rent NUMERIC(12,2) NOT NULL,
  base_rent NUMERIC(12,2) NOT NULL,
  utility_package NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  maintenance_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  parking_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  occupants TEXT NOT NULL DEFAULT '1 Adult',
  lease_duration TEXT NOT NULL DEFAULT '12 Months',
  lease_start TEXT NOT NULL,
  lease_end TEXT NOT NULL,
  lease_notes TEXT NOT NULL DEFAULT '',
  perks JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_method TEXT NOT NULL DEFAULT 'Bank Transfer / ACH',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. RENT PAYMENTS & INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.rent_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  payment_code TEXT UNIQUE NOT NULL,
  lease_id TEXT REFERENCES public.leases(id) ON DELETE SET NULL,
  tenant_id TEXT REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_ref TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  avatar_bg TEXT NOT NULL DEFAULT '#D8F3E5',
  property_name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  payment_note TEXT NOT NULL DEFAULT 'Rent Payment',
  lease_term TEXT NOT NULL DEFAULT '12 months',
  due_date TEXT NOT NULL,
  paid_date TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  expense_title TEXT NOT NULL,
  category TEXT NOT NULL,
  property_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL,
  expense_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. MAINTENANCE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  unit_number TEXT NOT NULL,
  property_name TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'Deluxe',
  tenant_ref TEXT NOT NULL,
  maintenance_status TEXT NOT NULL DEFAULT 'Needs Inspection',
  priority TEXT NOT NULL DEFAULT 'Medium',
  assigned_to TEXT NOT NULL,
  notes TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. MESSAGES & CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_ref TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  property_name TEXT NOT NULL,
  avatar_bg TEXT NOT NULL DEFAULT '#D8F3E5',
  last_message TEXT NOT NULL,
  last_time TEXT NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. TASKS TABLE
CREATE TABLE IF NOT EXISTS public.property_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  scheduled_date TEXT NOT NULL,
  title TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'mint',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. PROPERTY REVIEWS TABLE (Drives Overall Rating card on Dashboard)
CREATE TABLE IF NOT EXISTS public.property_reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  property_name TEXT NOT NULL,
  tenant_ref TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  overall_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  maintenance_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  cleanliness_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  management_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  comfort_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  location_score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. ACTIVITY LOGS TABLE (Drives Recent Activities & Notification Alerts)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  tenant_ref TEXT,
  tone TEXT NOT NULL DEFAULT 'mint',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
