-- ============================================================================
-- 011: REMOVE CELCOM AFRICA INTEGRATION AND CLEAN UP SMS TABLES
-- ============================================================================

-- 1. Drop Celcom-specific indexes if they exist
DROP INDEX IF EXISTS public.idx_sms_logs_celcom_msg_id;

-- 2. Drop Celcom-specific columns from sms_logs
ALTER TABLE IF EXISTS public.sms_logs
  DROP COLUMN IF EXISTS celcom_message_id;

-- 3. Drop Celcom-specific columns from sms_notification_settings
ALTER TABLE IF EXISTS public.sms_notification_settings
  DROP COLUMN IF EXISTS celcom_partner_id,
  DROP COLUMN IF EXISTS celcom_sender_id;

-- 4. Update default provider in settings to Standard SMS Gateway
UPDATE public.sms_notification_settings
SET provider = 'Standard SMS Gateway'
WHERE provider = 'Celcom Africa' OR provider IS NULL OR provider = '';

-- 5. Update historical SMS logs provider label
UPDATE public.sms_logs
SET provider = 'Standard SMS Gateway'
WHERE provider = 'Celcom Africa';
