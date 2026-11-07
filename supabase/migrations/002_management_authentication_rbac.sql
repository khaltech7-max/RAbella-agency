-- ============================================================================
-- RENTIFY MANAGEMENT AUTHENTICATION, INVITATION LIFECYCLE & RBAC MIGRATION
-- ============================================================================
-- Safe, non-destructive migration preserving all existing users, properties,
-- units, tenants, leases, payments, expenses, and UUID relationships.

-- 1. EXTEND public.profiles WITH MANAGEMENT AUTHENTICATION & SECURITY COLUMNS
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS assigned_property_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_property_name TEXT DEFAULT 'All Properties',
  ADD COLUMN IF NOT EXISTS assigned_property_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invite_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offboard_notes TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles (account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_property ON public.profiles (assigned_property_id);

-- 2. MANAGEMENT INVITATIONS TABLE (SINGLE-USE, EXPIRING, REVOCABLE)
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  staff_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  job_title TEXT DEFAULT '',
  assigned_property_id TEXT,
  assigned_property_name TEXT DEFAULT 'All Properties',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending Invitation',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations (status);

-- 3. SECURITY & LOGIN AUDIT LOGS TABLE (NO SECRETS OR TOKENS LOGGED)
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  target_email TEXT,
  role_label TEXT NOT NULL,
  portal TEXT DEFAULT 'management',
  ip_address TEXT DEFAULT '127.0.0.1',
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON public.security_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_event_type ON public.security_audit_logs (event_type);

-- 4. BRANDED RENTIFY EMAIL OUTBOX TABLE
CREATE TABLE IF NOT EXISTS public.branded_emails (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  template_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Dispatched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE POSTGRESQL
DO $$
BEGIN
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.branded_emails ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
