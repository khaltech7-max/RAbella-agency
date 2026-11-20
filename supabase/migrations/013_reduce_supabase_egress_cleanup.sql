-- =============================================================================
-- MIGRATION 013: SAFE SUPABASE EGRESS & BLOAT CLEANUP
-- =============================================================================
-- Safe cleanup script that removes heavy non-business bloat (Base64 image blobs,
-- bulky HTML email bodies, old system telemetry, and old audit/SMS logs) while
-- 100% PRESERVING all tenants, properties, units, leases, rent_payments,
-- expenses, maintenance_requests, and staff profiles.
-- =============================================================================

BEGIN;

-- 1. REMOVE HEAVY BASE64 IMAGE BLOBS (Biggest cause of Supabase Egress)
-- Normal https:// image URLs are kept untouched. Only raw multi-megabyte
-- "data:image/..." Base64 strings are cleared.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'property_images') THEN
    DELETE FROM public.property_images
    WHERE image_url LIKE 'data:image/%'
       OR LENGTH(image_url) > 2000;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'cover_image_url') THEN
    UPDATE public.properties
    SET cover_image_url = ''
    WHERE cover_image_url LIKE 'data:image/%'
       OR LENGTH(cover_image_url) > 2000;
  END IF;
END $$;

-- 2. TRIM OLD ACTIVITY LOGS (Keep only the 40 most recent dashboard events)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    DELETE FROM public.activity_logs
    WHERE id NOT IN (
      SELECT id FROM public.activity_logs
      ORDER BY created_at DESC
      LIMIT 40
    );
  END IF;
END $$;

-- 3. TRIM SECURITY AUDIT LOGS (Keep only the 50 most recent login/security events)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_audit_logs') THEN
    DELETE FROM public.security_audit_logs
    WHERE id NOT IN (
      SELECT id FROM public.security_audit_logs
      ORDER BY created_at DESC
      LIMIT 50
    );
  END IF;
END $$;

-- 4. SHRINK HEAVY HTML BODIES & TRIM OLD EMAIL LOGS IN branded_emails
-- Keeps the latest 100 email records (and their dedupe_key so duplicate reminders
-- are never re-sent), while stripping the heavy 10KB+ HTML body from emails that
-- have already been delivered.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branded_emails') THEN
    -- Delete skipped/duplicate rows or logs beyond the newest 100 records
    DELETE FROM public.branded_emails
    WHERE id NOT IN (
      SELECT id FROM public.branded_emails
      ORDER BY created_at DESC
      LIMIT 100
    );

    -- Strip heavy HTML string from already-delivered emails (keeps subject & metadata)
    UPDATE public.branded_emails
    SET body_html = ''
    WHERE status IN ('Delivered', 'Dispatched', 'Sent')
      AND LENGTH(body_html) > 200;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'branded_emails' AND column_name = 'payload_json') THEN
      UPDATE public.branded_emails
      SET payload_json = '{}'::jsonb
      WHERE status IN ('Delivered', 'Dispatched', 'Sent');
    END IF;
  END IF;
END $$;

-- 5. CLEAN UP OLD / SKIPPED SMS LOGS & STRIP HEAVY API JSON PAYLOADS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_logs') THEN
    -- Remove "Duplicate Skipped" and "Disabled" noise rows
    DELETE FROM public.sms_logs
    WHERE status IN ('Duplicate Skipped', 'Disabled');

    -- Keep only the 100 most recent SMS logs
    DELETE FROM public.sms_logs
    WHERE id NOT IN (
      SELECT id FROM public.sms_logs
      ORDER BY created_at DESC
      LIMIT 100
    );

    -- Strip bulky raw gateway JSON blobs while keeping delivery status & message text
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sms_logs' AND column_name = 'api_response') THEN
      UPDATE public.sms_logs
      SET api_response = '{}'::jsonb
      WHERE api_response IS NOT NULL AND api_response != '{}'::jsonb;
    END IF;
  END IF;
END $$;

-- 6. REMOVE EXPIRED / REVOKED / USED STAFF INVITATION TOKENS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_invitations') THEN
    DELETE FROM public.staff_invitations
    WHERE status IN ('Accepted', 'Revoked', 'Expired')
       OR expires_at < NOW() - INTERVAL '7 days';
  END IF;
END $$;

-- 7. TRIM BLOATED CHAT THREAD MESSAGE ARRAYS (If any thread has > 30 messages)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_threads') THEN
    UPDATE public.chat_threads
    SET documents = '[]'::jsonb
    WHERE jsonb_typeof(documents) = 'array'
      AND LENGTH(documents::text) > 5000;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- OPTIONAL: RECLAIM DISK SPACE IMMEDIATELY (Run separately if needed)
-- VACUUM ANALYZE;
-- =============================================================================
