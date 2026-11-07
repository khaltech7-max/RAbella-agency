-- =============================================================================
-- MIGRATION 006: RESEND STAFF INVITATION LIFECYCLE & DELIVERY TRACKING
-- =============================================================================
-- Extends profiles, staff_invitations, and branded_emails to track Resend
-- delivery IDs, invitation statuses (Pending, Accepted, Expired, Failed),
-- delivery timestamps, error messages, and invited_by attribution.

DO $$
BEGIN
  -- 1. Extend profiles with invitation lifecycle and Resend tracking columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title TEXT DEFAULT '';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'Active';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_property_id TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_property_name TEXT DEFAULT 'All Properties';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_property_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_token TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_used BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_revoked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_by TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invitation_status TEXT DEFAULT 'Pending';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resend_id TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invitation_delivered_at TIMESTAMPTZ;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invitation_error TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_set BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- 2. Extend staff_invitations table with Resend delivery metrics
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_invitations') THEN
    ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS resend_id TEXT;
    ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'Pending';
    ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS invite_url TEXT;
  ELSE
    CREATE TABLE IF NOT EXISTS public.staff_invitations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      staff_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      job_title TEXT DEFAULT '',
      assigned_property_id TEXT,
      assigned_property_name TEXT DEFAULT 'All Properties',
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      invited_by TEXT,
      resend_id TEXT,
      delivery_status TEXT DEFAULT 'Pending',
      delivered_at TIMESTAMPTZ,
      error_message TEXT,
      invite_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  -- 3. Extend branded_emails table with Resend ID and delivery tracking
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branded_emails') THEN
    ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS resend_id TEXT;
    ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'Dispatched';
    ALTER TABLE public.branded_emails ADD COLUMN IF NOT EXISTS error_message TEXT;
  ELSE
    CREATE TABLE IF NOT EXISTS public.branded_emails (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      template_type TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Dispatched',
      resend_id TEXT,
      delivery_status TEXT DEFAULT 'Dispatched',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_email_lower ON public.staff_invitations (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations (status);
CREATE INDEX IF NOT EXISTS idx_branded_emails_resend_id ON public.branded_emails (resend_id);
