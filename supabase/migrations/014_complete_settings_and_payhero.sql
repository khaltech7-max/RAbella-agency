-- =============================================================================
-- MIGRATION 014: COMPLETE SETTINGS MODULE, PAYHERO MULTI-PAYBILL,
-- USER PREFERENCES & SYSTEM CONFIGURATIONS
-- =============================================================================

-- 0. Ensure standard auth roles exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 1. Global System Settings Table (Singleton id = 'default')
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  general_json JSONB NOT NULL DEFAULT '{
    "companyName": "ARabella agency",
    "companyTagline": "Rental Management System",
    "companyLogoUrl": "",
    "faviconUrl": "",
    "businessEmail": "ochiengpeterson507@gmail.com",
    "businessPhone": "+254 700 000 000",
    "businessAddress": "Westlands Commercial Center, Nairobi, Kenya",
    "city": "Nairobi",
    "county": "Nairobi County",
    "country": "Kenya",
    "defaultCurrency": "KES",
    "currencySymbol": "KSh",
    "timezone": "Africa/Nairobi",
    "dateFormat": "MMM DD, YYYY",
    "timeFormat": "12h",
    "language": "en-KE",
    "fiscalYearStart": "January"
  }'::jsonb,
  appearance_defaults_json JSONB NOT NULL DEFAULT '{
    "defaultTheme": "light",
    "primaryColor": "#17231E",
    "accentColor": "#D5F267",
    "secondaryAccentColor": "#156943",
    "sidebarDefaultExpanded": false,
    "layoutDensity": "comfortable",
    "fontFamily": "Plus Jakarta Sans",
    "showDashboardRatings": true,
    "showDashboardTasks": true,
    "enableAnimations": true
  }'::jsonb,
  property_json JSONB NOT NULL DEFAULT '{
    "autoGenerateCodePrefix": true,
    "unitNumberingFormat": "Unit 101",
    "defaultUnitVariant": "deluxe",
    "defaultMonthlyRent": 35000,
    "defaultUtilityPackage": 2500,
    "defaultMaintenanceFee": 1500,
    "defaultParkingFee": 1000,
    "propertyCategories": ["Residential Apartments", "Gated Community", "Commercial & Mixed-Use", "Executive Suites", "Student Housing"],
    "autoSyncOccupancy": true,
    "requireManagerAssignment": true
  }'::jsonb,
  tenant_json JSONB NOT NULL DEFAULT '{
    "autoReferenceFormat": "PREFIX-001",
    "requireNationalId": true,
    "requireEmail": true,
    "requirePhone": true,
    "requireEmergencyContact": false,
    "requireVehicleInfo": false,
    "enableTenantPortal": true,
    "allowTenantMaintenanceRequests": true,
    "allowTenantReceiptDownload": true,
    "autoWelcomeSms": true,
    "autoWelcomeEmail": true,
    "defaultTenantTier": "Verified Tenant"
  }'::jsonb,
  payment_json JSONB NOT NULL DEFAULT '{
    "provider": "PayHero",
    "environment": "production",
    "accountId": "",
    "channelId": "",
    "defaultPaybillNumber": "4098871",
    "accountReferenceFormat": "TENANT_REF",
    "accountReferencePrefix": "",
    "callbackUrl": "/api/webhooks/payhero",
    "enableManualC2bNotification": true,
    "autoReconcileExactReference": true,
    "autoConfirmOnCallback": true,
    "allowPartialPayments": true,
    "autoReceiptOnConfirm": true,
    "failedPaymentRetryNotify": true,
    "gracePeriodDays": 5,
    "lateFeePercentage": 0
  }'::jsonb,
  notifications_json JSONB NOT NULL DEFAULT '{
    "enableEmailNotifications": true,
    "enableSmsNotifications": true,
    "rentUpcomingDaysBefore": 3,
    "sendOnDueDate": true,
    "overdueReminderFrequencyDays": 3,
    "sendPaymentConfirmation": true,
    "leaseExpiryNoticeDays": [30, 7],
    "notifyManagerOnMaintenance": true,
    "notifyTenantOnMaintenanceUpdate": true,
    "preferredSendHourEat": "08:00",
    "quietHoursStart": "21:00",
    "quietHoursEnd": "06:30"
  }'::jsonb,
  lease_json JSONB NOT NULL DEFAULT '{
    "defaultLeaseDurationMonths": 12,
    "autoRenewalEnabled": false,
    "renewalNoticeDays": 30,
    "defaultSecurityDepositMonths": 1,
    "vacateNoticePeriodDays": 30,
    "agreementNumberPrefix": "LS-",
    "defaultPaymentMethod": "M-Pesa Paybill / Bank Transfer",
    "standardLeaseTerms": "Rent is payable monthly in advance on or before the agreed due date quoting the assigned Tenant Reference Code (e.g., A-001)."
  }'::jsonb,
  invoice_json JSONB NOT NULL DEFAULT '{
    "invoicePrefix": "INV-",
    "receiptPrefix": "PAY-",
    "defaultDueDayOfMonth": 5,
    "enableVat": false,
    "vatRatePercentage": 16,
    "taxPinNumber": "",
    "receiptFooterNote": "Thank you for choosing ARabella agency. This is an officially verified digital rent receipt.",
    "showCompanyLogoOnReceipt": true,
    "showVerificationQrBadge": true,
    "autoGenerateMonthlyInvoices": true
  }'::jsonb,
  maintenance_json JSONB NOT NULL DEFAULT '{
    "categories": ["Plumbing & Water", "Electrical & Power", "HVAC & Ventilation", "Structural & Carpentry", "Appliances", "Painting & Masonry", "Security & Locks", "General Inspection"],
    "defaultPriority": "Medium",
    "autoApproveThresholdKes": 5000,
    "requireManagerApprovalAboveThreshold": true,
    "notifyAssignedTechnician": true,
    "notifyTenantOnCompletion": true,
    "serviceProviders": [
      {"name": "In-House Facilities Team", "specialty": "General & Plumbing", "phone": "+254 711 000 111"},
      {"name": "Metro Electrical Services", "specialty": "Electrical & Backup Power", "phone": "+254 722 000 222"}
    ]
  }'::jsonb,
  security_json JSONB NOT NULL DEFAULT '{
    "minPasswordLength": 8,
    "requireUppercase": true,
    "requireNumbers": true,
    "requireSpecialChars": false,
    "sessionTimeoutMinutes": 480,
    "maxFailedLoginAttempts": 5,
    "lockoutDurationMinutes": 15,
    "enforce2faForAdmins": true,
    "logAllLoginAttempts": true,
    "logAllSettingsChanges": true,
    "securityAlertEmail": "ochiengpeterson507@gmail.com"
  }'::jsonb,
  backup_json JSONB NOT NULL DEFAULT '{
    "autoBackupSchedule": "daily",
    "backupRetentionDays": 30,
    "includeAuditLogs": true,
    "includePaymentHistory": true,
    "lastBackupAt": null,
    "lastBackupBy": null
  }'::jsonb,
  updated_by TEXT NOT NULL DEFAULT 'System Default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 2. User-Specific Preferences Table (Personal theme, layout, density, sidebar)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id TEXT PRIMARY KEY,
  user_email TEXT,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  accent_theme TEXT NOT NULL DEFAULT 'lime',
  primary_color TEXT NOT NULL DEFAULT '#17231E',
  accent_color TEXT NOT NULL DEFAULT '#D5F267',
  layout_density TEXT NOT NULL DEFAULT 'comfortable',
  sidebar_mode TEXT NOT NULL DEFAULT 'collapsed',
  font_scale TEXT NOT NULL DEFAULT 'normal',
  font_family TEXT NOT NULL DEFAULT 'Plus Jakarta Sans',
  compact_tables BOOLEAN NOT NULL DEFAULT FALSE,
  reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
  dashboard_layout JSONB NOT NULL DEFAULT '{"showRatings": true, "showTasks": true, "showActivities": true, "defaultChartRange": "6M"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_email ON public.user_preferences (LOWER(user_email));

-- 3. PayHero Multi-PayBill & Property Mapping Table (Single PayHero API key -> Multiple PayBills)
CREATE TABLE IF NOT EXISTS public.payhero_paybills (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  paybill_number TEXT NOT NULL,
  paybill_name TEXT NOT NULL,
  channel_id TEXT DEFAULT '',
  account_type TEXT NOT NULL DEFAULT 'PayBill',
  property_id TEXT,
  property_name TEXT DEFAULT 'All Properties',
  code_prefix TEXT DEFAULT '',
  account_reference_format TEXT NOT NULL DEFAULT 'TENANT_REF',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payhero_paybills_number ON public.payhero_paybills (paybill_number);
CREATE INDEX IF NOT EXISTS idx_payhero_paybills_property ON public.payhero_paybills (property_id);

-- 4. PayHero C2B & Callback Transaction Logs Table
CREATE TABLE IF NOT EXISTS public.payhero_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  transaction_reference TEXT NOT NULL,
  mpesa_receipt_number TEXT DEFAULT '',
  paybill_number TEXT NOT NULL,
  channel_id TEXT DEFAULT '',
  account_reference TEXT NOT NULL,
  tenant_ref TEXT DEFAULT '',
  tenant_name TEXT DEFAULT '',
  property_name TEXT DEFAULT '',
  unit_number TEXT DEFAULT '',
  payer_phone TEXT DEFAULT '',
  payer_name TEXT DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Completed',
  reconciliation_status TEXT NOT NULL DEFAULT 'Reconciled',
  source TEXT NOT NULL DEFAULT 'C2B Callback',
  payment_id TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  notes TEXT DEFAULT '',
  processed_by TEXT DEFAULT 'PayHero Webhook Engine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payhero_tx_created_at ON public.payhero_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payhero_tx_account_ref ON public.payhero_transactions (UPPER(account_reference));
CREATE INDEX IF NOT EXISTS idx_payhero_tx_receipt ON public.payhero_transactions (mpesa_receipt_number);

-- 5. Enable Row Level Security (RLS)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'system_settings',
    'user_preferences',
    'payhero_paybills',
    'payhero_transactions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access on %I" ON public.%I;', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY "Allow authenticated full access on %I" ON public.%I FOR ALL TO authenticated, anon, service_role USING (true) WITH CHECK (true);',
        tbl,
        tbl
      );
    END IF;
  END LOOP;
END $$;
