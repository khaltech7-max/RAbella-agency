import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Palette,
  Home,
  Users,
  CreditCard,
  Bell,
  Mail,
  FileText,
  Receipt,
  Wrench,
  UserCog,
  Shield,
  Database,
  Plug,
  Search,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Download,
  Send,
  Eye,
  Lock,
  Sun,
  Moon,
  Monitor,
  Sliders,
  ArrowRight,
  ExternalLink,
  KeyRound,
  Activity,
  Phone,
  Globe,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  UserSession,
  UserRole,
  PropertyRecord,
  TenantProfile,
  RentPaymentRecord,
  SecurityAuditLogRecord,
  BrandedEmailRecord,
  EmailNotificationSettings,
  SmsLogRecord,
  SmsNotificationSettings,
  SystemSettingsRecord,
  UserAppearancePreferences,
  PayHeroPaybillMapping,
  PayHeroTransactionRecord,
  IntegrationStatusSummary,
  getRoleDisplayLabel,
  getRolePermissionsSummary,
  getAllowedPagesForRole,
  NavPageId,
} from '../data/rentalData';
import {
  settingsApi,
  emailApi,
  smsApi,
  getCachedSettingsBundle,
} from '../lib/apiClient';
import {
  setSystemBrandingForInvoices,
  setPayHeroInvoiceContext,
} from '../lib/invoiceGenerator';

export type SettingsCategoryId =
  | 'general'
  | 'appearance'
  | 'property'
  | 'tenant'
  | 'notifications'
  | 'email'
  | 'lease'
  | 'invoice'
  | 'maintenance'
  | 'users'
  | 'security'
  | 'database'
  | 'integrations';

interface SettingsPageProps {
  currentUser: UserSession;
  users: UserSession[];
  properties: PropertyRecord[];
  tenants: TenantProfile[];
  payments: RentPaymentRecord[];
  securityLogs: SecurityAuditLogRecord[];
  brandedEmails: BrandedEmailRecord[];
  smsLogs: SmsLogRecord[];
  smsSettings: SmsNotificationSettings | null;
  systemSettings: SystemSettingsRecord | null;
  userPreferences: UserAppearancePreferences | null;
  onSystemSettingsChange: (next: SystemSettingsRecord) => void;
  onUserPreferencesChange: (next: UserAppearancePreferences) => void;
  onSmsSettingsChange?: (next: SmsNotificationSettings) => void;
  onBrandedEmailsChange?: React.Dispatch<React.SetStateAction<BrandedEmailRecord[]>>;
  onPaymentsRefresh?: () => Promise<void>;
  onNavigate: (page: NavPageId) => void;
  globalSearch?: string;
  onGlobalSearchChange?: (val: string) => void;
}

const SETTINGS_CATEGORIES: {
  id: SettingsCategoryId;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
  keywords: string;
  adminOrManagerOnly?: boolean;
}[] = [
  {
    id: 'general',
    label: 'General Settings',
    shortDesc: 'Company profile, contact, KES currency & Africa/Nairobi timezone',
    icon: Globe,
    keywords: 'company business name logo favicon address phone currency kes timezone nairobi date time language',
  },
  {
    id: 'appearance',
    label: 'Appearance & Themes',
    shortDesc: 'Personal light/dark mode, accent colors, density & layout',
    icon: Palette,
    keywords: 'theme light dark mode system color lime emerald sidebar compact comfortable font branding layout',
  },
  {
    id: 'property',
    label: 'Property Settings',
    shortDesc: 'Unit numbering, default rental charges & property categories',
    icon: Building2,
    keywords: 'property unit numbering prefix rent utility maintenance parking categories occupancy manager',
  },
  {
    id: 'tenant',
    label: 'Tenant Settings',
    shortDesc: 'Onboarding requirements, A-001 references & tenant portal rules',
    icon: Users,
    keywords: 'tenant registration reference a-001 id email phone portal onboarding welcome notifications tier',
  },
  {
    id: 'notifications',
    label: 'Notifications Settings',
    shortDesc: 'Rent reminders, overdue schedules, lease expiry & quiet hours',
    icon: Bell,
    keywords: 'notifications sms email rent reminders overdue payment confirmation lease expiry maintenance schedule',
  },
  {
    id: 'email',
    label: 'Email Settings (Resend)',
    shortDesc: 'Resend API configuration, sender identity, templates & delivery logs',
    icon: Mail,
    keywords: 'email resend api sender name templates delivery logs test email smtp',
  },
  {
    id: 'lease',
    label: 'Lease & Agreement Settings',
    shortDesc: 'Default lease duration, renewals, security deposits & notice periods',
    icon: FileText,
    keywords: 'lease agreement duration renewal security deposit notice period template numbering terms',
  },
  {
    id: 'invoice',
    label: 'Invoice & Receipt Settings',
    shortDesc: 'INV/PAY numbering, due dates, VAT tax rules & receipt branding',
    icon: Receipt,
    keywords: 'invoice receipt numbering prefix due date tax vat branding pdf footer',
  },
  {
    id: 'maintenance',
    label: 'Maintenance Settings',
    shortDesc: 'Repair categories, priority levels, approval thresholds & vendors',
    icon: Wrench,
    keywords: 'maintenance categories priority approval workflow threshold service providers technicians',
  },
  {
    id: 'users',
    label: 'User & Role Management',
    shortDesc: 'Staff accounts, role permissions matrix & access controls',
    icon: UserCog,
    keywords: 'users roles permissions super admin property manager accountant caretaker staff access',
  },
  {
    id: 'security',
    label: 'Security Settings',
    shortDesc: 'Password policies, session timeouts, 2FA & security audit logs',
    icon: Shield,
    keywords: 'security password policy session login activity 2fa two-factor audit logs lockout alerts',
  },
  {
    id: 'database',
    label: 'Database & Backup Settings',
    shortDesc: 'Supabase/PostgreSQL health, backup configuration & JSON snapshot export',
    icon: Database,
    keywords: 'database supabase postgresql health backup export restore snapshot rls',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    shortDesc: 'Live connection status for Resend, Sozuri SMS & Supabase',
    icon: Plug,
    keywords: 'integrations resend sozuri sms supabase status webhook',
  },
];

const LOCAL_APPEARANCE_CACHE_KEY = 'rms_user_appearance_cache_v1';
let systemColorSchemeMediaQuery: MediaQueryList | null = null;
let lastAppliedPrefs: UserAppearancePreferences | null = null;
let lastAppliedSysDefaults: SystemSettingsRecord | null = null;

export function getCachedUserPreferences(userId?: string): UserAppearancePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_APPEARANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserAppearancePreferences;
    if (userId && parsed.userId && parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedUserPreferences(prefs: UserAppearancePreferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_APPEARANCE_CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota issues
  }
}

export function applyAppearanceToDocument(
  prefs?: UserAppearancePreferences | null,
  sysDefaults?: SystemSettingsRecord | null
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const effectivePrefs = prefs || lastAppliedPrefs || getCachedUserPreferences();
  const effectiveSys = sysDefaults || lastAppliedSysDefaults;

  if (prefs) {
    lastAppliedPrefs = prefs;
    setCachedUserPreferences(prefs);
  }
  if (sysDefaults) {
    lastAppliedSysDefaults = sysDefaults;
  }

  const themeMode =
    effectivePrefs?.themeMode ||
    effectiveSys?.appearanceDefaults?.defaultTheme ||
    'light';

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = themeMode === 'dark' || (themeMode === 'system' && prefersDark);

  if (isDark) {
    root.classList.add('dark');
    document.body?.classList.add('dark');
  } else {
    root.classList.remove('dark');
    document.body?.classList.remove('dark');
  }

  root.setAttribute('data-theme-mode', themeMode);
  root.setAttribute('data-resolved-theme', isDark ? 'dark' : 'light');

  const accentTheme = effectivePrefs?.accentTheme || 'lime';
  root.setAttribute('data-accent-theme', accentTheme);

  const density =
    effectivePrefs?.layoutDensity ||
    effectiveSys?.appearanceDefaults?.layoutDensity ||
    'comfortable';
  root.setAttribute('data-density', density);

  const fontScale = effectivePrefs?.fontScale || 'normal';
  root.setAttribute('data-font-scale', fontScale);

  const fontFamily =
    effectivePrefs?.fontFamily ||
    effectiveSys?.appearanceDefaults?.fontFamily ||
    'Plus Jakarta Sans';
  root.style.setProperty(
    '--rms-font-family',
    `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`
  );

  const accentColor =
    effectivePrefs?.accentColor ||
    effectiveSys?.appearanceDefaults?.accentColor ||
    '#D5F267';
  const primaryColor =
    effectivePrefs?.primaryColor ||
    effectiveSys?.appearanceDefaults?.primaryColor ||
    '#17231E';
  if (isDark) {
    root.style.removeProperty('--rms-accent');
    root.style.removeProperty('--rms-primary');
  } else {
    root.style.setProperty('--rms-accent', accentColor);
    root.style.setProperty('--rms-primary', primaryColor);
  }
  setSystemBrandingForInvoices(effectiveSys, effectivePrefs);

  // Attach live OS prefers-color-scheme listener once so "system" mode updates automatically
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !systemColorSchemeMediaQuery
  ) {
    systemColorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOsThemeChange = () => {
      const currentThemeMode =
        lastAppliedPrefs?.themeMode ||
        getCachedUserPreferences()?.themeMode ||
        lastAppliedSysDefaults?.appearanceDefaults?.defaultTheme ||
        'light';
      if (currentThemeMode === 'system') {
        applyAppearanceToDocument(lastAppliedPrefs, lastAppliedSysDefaults);
      }
    };
    if (typeof systemColorSchemeMediaQuery.addEventListener === 'function') {
      systemColorSchemeMediaQuery.addEventListener('change', handleOsThemeChange);
    }
  }
}

function createDefaultSystemSettings(): SystemSettingsRecord {
  return {
    id: 'default',
    general: {
      companyName: 'ARabella agency',
      companyTagline: 'Rental Management System',
      companyLogoUrl: '',
      faviconUrl: '',
      businessEmail: 'ochiengpeterson507@gmail.com',
      businessPhone: '+254 700 000 000',
      businessAddress: 'Westlands Commercial Center, Nairobi, Kenya',
      city: 'Nairobi',
      county: 'Nairobi County',
      country: 'Kenya',
      defaultCurrency: 'KES',
      currencySymbol: 'KSh',
      timezone: 'Africa/Nairobi',
      dateFormat: 'MMM DD, YYYY',
      timeFormat: '12h',
      language: 'en-KE',
      fiscalYearStart: 'January',
    },
    appearanceDefaults: {
      defaultTheme: 'light',
      primaryColor: '#17231E',
      accentColor: '#D5F267',
      secondaryAccentColor: '#156943',
      sidebarDefaultExpanded: false,
      layoutDensity: 'comfortable',
      fontFamily: 'Plus Jakarta Sans',
      showDashboardRatings: true,
      showDashboardTasks: true,
      enableAnimations: true,
    },
    property: {
      autoGenerateCodePrefix: true,
      unitNumberingFormat: 'Unit 101',
      defaultUnitVariant: 'deluxe',
      defaultMonthlyRent: 35000,
      defaultUtilityPackage: 2500,
      defaultMaintenanceFee: 1500,
      defaultParkingFee: 1000,
      propertyCategories: [
        'Residential Apartments',
        'Gated Community',
        'Commercial & Mixed-Use',
        'Executive Suites',
        'Student Housing',
      ],
      autoSyncOccupancy: true,
      requireManagerAssignment: true,
    },
    tenant: {
      autoReferenceFormat: 'PREFIX-001',
      requireNationalId: true,
      requireEmail: true,
      requirePhone: true,
      requireEmergencyContact: false,
      requireVehicleInfo: false,
      enableTenantPortal: true,
      allowTenantMaintenanceRequests: true,
      allowTenantReceiptDownload: true,
      autoWelcomeSms: true,
      autoWelcomeEmail: true,
      defaultTenantTier: 'Verified Tenant',
    },
    payment: {
      provider: 'PayHero',
      environment: 'production',
      accountId: 'PH-KE-88412',
      channelId: 'CH-101',
      defaultPaybillNumber: '4098871',
      accountReferenceFormat: 'TENANT_REF',
      accountReferencePrefix: '',
      callbackUrl: '/api/webhooks/payhero',
      enableManualC2bNotification: true,
      autoReconcileExactReference: true,
      autoConfirmOnCallback: true,
      allowPartialPayments: true,
      autoReceiptOnConfirm: true,
      failedPaymentRetryNotify: true,
      gracePeriodDays: 5,
      lateFeePercentage: 0,
      apiCredentialsConfigured: false,
      maskedApiUsername: 'Server-Managed API Key',
    },
    notifications: {
      enableEmailNotifications: true,
      enableSmsNotifications: true,
      rentUpcomingDaysBefore: 3,
      sendOnDueDate: true,
      overdueReminderFrequencyDays: 3,
      sendPaymentConfirmation: true,
      leaseExpiryNoticeDays: [30, 7],
      notifyManagerOnMaintenance: true,
      notifyTenantOnMaintenanceUpdate: true,
      preferredSendHourEat: '08:00',
      quietHoursStart: '21:00',
      quietHoursEnd: '06:30',
    },
    lease: {
      defaultLeaseDurationMonths: 12,
      autoRenewalEnabled: false,
      renewalNoticeDays: 30,
      defaultSecurityDepositMonths: 1,
      vacateNoticePeriodDays: 30,
      agreementNumberPrefix: 'LS-',
      defaultPaymentMethod: 'M-Pesa Paybill / Bank Transfer',
      standardLeaseTerms:
        'Rent is payable monthly in advance on or before the agreed due date quoting the assigned Tenant Reference Code (e.g., A-001).',
    },
    invoice: {
      invoicePrefix: 'INV-',
      receiptPrefix: 'PAY-',
      defaultDueDayOfMonth: 5,
      enableVat: false,
      vatRatePercentage: 16,
      taxPinNumber: 'P051889234K',
      receiptFooterNote:
        'Thank you for choosing ARabella agency. This is an officially verified digital rent receipt.',
      showCompanyLogoOnReceipt: true,
      showVerificationQrBadge: true,
      autoGenerateMonthlyInvoices: true,
    },
    maintenance: {
      categories: [
        'Plumbing & Water',
        'Electrical & Power',
        'HVAC & Ventilation',
        'Structural & Carpentry',
        'Appliances',
        'Painting & Masonry',
        'Security & Locks',
        'General Inspection',
      ],
      defaultPriority: 'Medium',
      autoApproveThresholdKes: 5000,
      requireManagerApprovalAboveThreshold: true,
      notifyAssignedTechnician: true,
      notifyTenantOnCompletion: true,
      serviceProviders: [
        { name: 'In-House Facilities Team', specialty: 'General & Plumbing', phone: '+254 711 000 111' },
        { name: 'Metro Electrical Services', specialty: 'Electrical & Backup Power', phone: '+254 722 000 222' },
      ],
    },
    security: {
      minPasswordLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      sessionTimeoutMinutes: 480,
      maxFailedLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      enforce2faForAdmins: true,
      logAllLoginAttempts: true,
      logAllSettingsChanges: true,
      securityAlertEmail: 'ochiengpeterson507@gmail.com',
    },
    backup: {
      autoBackupSchedule: 'daily',
      backupRetentionDays: 30,
      includeAuditLogs: true,
      includePaymentHistory: true,
      lastBackupAt: null,
      lastBackupBy: null,
    },
    updatedBy: 'System Default',
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultUserPreferences(user: UserSession): UserAppearancePreferences {
  return {
    userId: user.id,
    userEmail: user.email,
    themeMode: 'light',
    accentTheme: 'lime',
    primaryColor: '#17231E',
    accentColor: '#D5F267',
    layoutDensity: 'comfortable',
    sidebarMode: 'collapsed',
    fontScale: 'normal',
    fontFamily: 'Plus Jakarta Sans',
    compactTables: false,
    reducedMotion: false,
    dashboardLayout: {
      showRatings: true,
      showTasks: true,
      showActivities: true,
      defaultChartRange: '6M',
    },
    updatedAt: new Date().toISOString(),
  };
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  users,
  properties,
  tenants,
  payments,
  securityLogs,
  brandedEmails,
  smsLogs,
  smsSettings,
  systemSettings,
  userPreferences,
  onSystemSettingsChange,
  onUserPreferencesChange,
  onSmsSettingsChange,
  onBrandedEmailsChange,
  onPaymentsRefresh,
  onNavigate,
  globalSearch = '',
  onGlobalSearchChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('general');
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Seed drafts synchronously from props -> local cache -> sensible defaults so UI renders immediately in 0ms
  const initialCachedBundle = useMemo(
    () => getCachedSettingsBundle(currentUser.id),
    [currentUser.id]
  );

  const [sysDraft, setSysDraft] = useState<SystemSettingsRecord>(
    () => systemSettings || initialCachedBundle?.systemSettings || createDefaultSystemSettings()
  );
  const [prefDraft, setPrefDraft] = useState<UserAppearancePreferences>(
    () =>
      userPreferences ||
      getCachedUserPreferences(currentUser.id) ||
      initialCachedBundle?.userPreferences ||
      createDefaultUserPreferences(currentUser)
  );
  const [paybills, setPaybills] = useState<PayHeroPaybillMapping[]>(
    () => initialCachedBundle?.paybills || []
  );
  const [payheroTxs, setPayheroTxs] = useState<PayHeroTransactionRecord[]>(
    () => initialCachedBundle?.transactions || []
  );
  const [emailSettingsDraft, setEmailSettingsDraft] = useState<EmailNotificationSettings>(
    () =>
      initialCachedBundle?.emailSettings || {
        masterEnabled: true,
        autoRentUpcoming3d: true,
        autoRentDueToday: true,
        autoRentOverdue: true,
        autoPaymentConfirmed: true,
        autoLeaseExpiry30d: true,
        autoLeaseExpiry7d: true,
        senderName: 'ARabella agency',
        fromEmail: 'ARabella agency <onboarding@resend.dev>',
        paymentInstructions:
          'Remit payment via M-Pesa Paybill or Bank Transfer quoting your Tenant Account Reference (e.g., A-001) as the account number.',
        preventDuplicatesHours: 24,
        apiKeyConfigured: true,
      }
  );
  const [smsSettingsDraft, setSmsSettingsDraft] = useState<SmsNotificationSettings>(() => ({
    environment:
      smsSettings?.environment ||
      initialCachedBundle?.smsSettings?.environment ||
      'sandbox',
    senderId:
      smsSettings?.senderId ||
      initialCachedBundle?.smsSettings?.senderId ||
      'ARABELLA',
    username:
      smsSettings?.username ||
      initialCachedBundle?.smsSettings?.username ||
      'ARAbella agency',
    provider:
      smsSettings?.provider ||
      initialCachedBundle?.smsSettings?.provider ||
      'Sozuri SMS Gateway',
    apiKeyConfigured:
      smsSettings?.apiKeyConfigured ??
      initialCachedBundle?.smsSettings?.apiKeyConfigured ??
      false,
    masterEnabled:
      smsSettings?.masterEnabled ??
      initialCachedBundle?.smsSettings?.masterEnabled ??
      true,
    autoTenantRegistered:
      smsSettings?.autoTenantRegistered ??
      initialCachedBundle?.smsSettings?.autoTenantRegistered ??
      true,
    autoRentDueSoon:
      smsSettings?.autoRentDueSoon ??
      initialCachedBundle?.smsSettings?.autoRentDueSoon ??
      true,
    autoRentOverdue:
      smsSettings?.autoRentOverdue ??
      initialCachedBundle?.smsSettings?.autoRentOverdue ??
      true,
    autoPaymentConfirmed:
      smsSettings?.autoPaymentConfirmed ??
      initialCachedBundle?.smsSettings?.autoPaymentConfirmed ??
      true,
    autoAdminAnnouncement:
      smsSettings?.autoAdminAnnouncement ??
      initialCachedBundle?.smsSettings?.autoAdminAnnouncement ??
      true,
    preventDuplicatesHours:
      smsSettings?.preventDuplicatesHours ??
      initialCachedBundle?.smsSettings?.preventDuplicatesHours ??
      24,
  }));
  const [integrations, setIntegrations] = useState<IntegrationStatusSummary | null>(
    () => initialCachedBundle?.integrations || null
  );

  // PayHero credentials inputs (write-only to backend, never echoed back in plain text)
  const [payheroApiUsername, setPayheroApiUsername] = useState('');
  const [payheroApiPassword, setPayheroApiPassword] = useState('');
  const [payheroBasicAuthToken, setPayheroBasicAuthToken] = useState('');
  const [payheroWebhookSecret, setPayheroWebhookSecret] = useState('');

  // PayHero New/Edit PayBill Mapping Modal/Form State
  const [editingPaybill, setEditingPaybill] = useState<Partial<PayHeroPaybillMapping> | null>(null);
  const [savingPaybill, setSavingPaybill] = useState(false);

  // PayHero Manual C2B Notification Form State
  const [c2bPaybillNumber, setC2bPaybillNumber] = useState('4098871');
  const [c2bAccountReference, setC2bAccountReference] = useState('A-001');
  const [c2bAmount, setC2bAmount] = useState<number>(35000);
  const [c2bReceiptNumber, setC2bReceiptNumber] = useState('');
  const [c2bPayerPhone, setC2bPayerPhone] = useState('+254799884308');
  const [c2bPayerName, setC2bPayerName] = useState('');
  const [c2bNotes, setC2bNotes] = useState('');
  const [submittingC2b, setSubmittingC2b] = useState(false);

  // New Property Category / Maintenance Category / Service Provider inputs
  const [newPropCategory, setNewPropCategory] = useState('');
  const [newMaintCategory, setNewMaintCategory] = useState('');
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderSpecialty, setNewProviderSpecialty] = useState('');
  const [newProviderPhone, setNewProviderPhone] = useState('');

  // Resend Test Email & Preview
  const [testEmailRecipient, setTestEmailRecipient] = useState(
    currentUser.email || 'ochiengpeterson507@gmail.com'
  );
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<BrandedEmailRecord | null>(null);

  // Database Export state
  const [exportingDb, setExportingDb] = useState(false);
  const [lastExportResult, setLastExportResult] = useState<{
    exportedAt: string;
    counts: Record<string, number>;
  } | null>(null);

  const isAdmin =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'owner' ||
    currentUser.role === 'administrator';
  const canEditGlobal =
    isAdmin ||
    currentUser.role === 'property_manager' ||
    currentUser.role === 'accountant';

  const showNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    setSearchQuery(globalSearch || '');
  }, [globalSearch]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    onGlobalSearchChange?.(val);
  };

  const syncSettingsFromServer = async (forceRefresh = false) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await settingsApi.getAllSettings({ forceRefresh });
      if (res.systemSettings) {
        setSysDraft(res.systemSettings);
        onSystemSettingsChange(res.systemSettings);
      }
      if (res.userPreferences) {
        const cached = getCachedUserPreferences(currentUser.id);
        const resolvedPrefs = cached
          ? { ...res.userPreferences, ...cached, userId: currentUser.id, userEmail: currentUser.email }
          : res.userPreferences;
        setPrefDraft(resolvedPrefs);
        onUserPreferencesChange(resolvedPrefs);
        applyAppearanceToDocument(resolvedPrefs, res.systemSettings);
      }
      if (Array.isArray(res.paybills)) {
        setPaybills(res.paybills);
        setPayHeroInvoiceContext(res.paybills, res.transactions);
        const defPb = res.paybills.find((p) => p.isDefault) || res.paybills[0];
        if (defPb) setC2bPaybillNumber(defPb.paybillNumber);
      }
      if (Array.isArray(res.transactions)) {
        setPayheroTxs(res.transactions);
        setPayHeroInvoiceContext(res.paybills, res.transactions);
      }
      if (res.emailSettings) {
        setEmailSettingsDraft(res.emailSettings);
      }
      if (res.smsSettings) {
        setSmsSettingsDraft(res.smsSettings);
        onSmsSettingsChange?.(res.smsSettings);
      }
      if (res.integrations) {
        setIntegrations(res.integrations);
      }
    } catch (err: any) {
      setSyncError(err?.message || 'Could not sync latest settings from server.');
    } finally {
      setSyncing(false);
    }
  };

  // Refresh settings bundle in background without blocking initial render
  useEffect(() => {
    void syncSettingsFromServer(false);
  }, []);

  useEffect(() => {
    if (systemSettings) setSysDraft(systemSettings);
  }, [systemSettings]);

  useEffect(() => {
    if (userPreferences) setPrefDraft(userPreferences);
  }, [userPreferences]);

  const combinedSearch = (searchQuery || globalSearch).trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!combinedSearch) return SETTINGS_CATEGORIES;
    return SETTINGS_CATEGORIES.filter(
      (cat) =>
        cat.label.toLowerCase().includes(combinedSearch) ||
        cat.shortDesc.toLowerCase().includes(combinedSearch) ||
        cat.keywords.toLowerCase().includes(combinedSearch)
    );
  }, [combinedSearch]);

  // Automatically switch to first matching category if current category doesn't match search
  useEffect(() => {
    if (
      combinedSearch &&
      filteredCategories.length > 0 &&
      !filteredCategories.some((c) => c.id === activeCategory)
    ) {
      setActiveCategory(filteredCategories[0].id);
    }
  }, [combinedSearch, filteredCategories, activeCategory]);

  // Save a global system settings section
  const handleSaveSystemSection = async (
    section:
      | 'general'
      | 'appearanceDefaults'
      | 'property'
      | 'tenant'
      | 'payment'
      | 'notifications'
      | 'lease'
      | 'invoice'
      | 'maintenance'
      | 'security'
      | 'backup',
    extraData?: Record<string, any>
  ) => {
    if (!sysDraft) return;
    setSavingSection(section);
    try {
      const payload = {
        ...(sysDraft[section] as Record<string, any>),
        ...(extraData || {}),
      };
      const res = await settingsApi.updateSystemSettingsSection(section, payload);
      if (res.systemSettings) {
        setSysDraft(res.systemSettings);
        onSystemSettingsChange(res.systemSettings);
        applyAppearanceToDocument(prefDraft, res.systemSettings);
      }
      if (section === 'payment') {
        setPayheroApiUsername('');
        setPayheroApiPassword('');
        setPayheroBasicAuthToken('');
        setPayheroWebhookSecret('');
      }
      showNotice(res.message || 'Settings saved to database.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to save settings.', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  // Save user-specific appearance preferences
  const handleSaveUserPreferences = async (nextPrefs?: Partial<UserAppearancePreferences>) => {
    const merged: UserAppearancePreferences = {
      userId: currentUser.id,
      userEmail: currentUser.email,
      themeMode: prefDraft?.themeMode || 'light',
      accentTheme: prefDraft?.accentTheme || 'lime',
      primaryColor: prefDraft?.primaryColor || '#17231E',
      accentColor: prefDraft?.accentColor || '#D5F267',
      layoutDensity: prefDraft?.layoutDensity || 'comfortable',
      sidebarMode: prefDraft?.sidebarMode || 'collapsed',
      fontScale: prefDraft?.fontScale || 'normal',
      fontFamily: prefDraft?.fontFamily || 'Plus Jakarta Sans',
      compactTables: prefDraft?.compactTables ?? false,
      reducedMotion: prefDraft?.reducedMotion ?? false,
      dashboardLayout: prefDraft?.dashboardLayout || {
        showRatings: true,
        showTasks: true,
        showActivities: true,
        defaultChartRange: '6M',
      },
      ...(nextPrefs || {}),
    };
    setPrefDraft(merged);
    onUserPreferencesChange(merged);
    setCachedUserPreferences(merged);
    applyAppearanceToDocument(merged, sysDraft);
    setSavingSection('userPreferences');
    try {
      const res = await settingsApi.updateUserPreferences(merged);
      if (res.userPreferences) {
        const finalPrefs = { ...res.userPreferences, ...merged };
        setPrefDraft(finalPrefs);
        onUserPreferencesChange(finalPrefs);
        setCachedUserPreferences(finalPrefs);
        applyAppearanceToDocument(finalPrefs, sysDraft);
      }
      showNotice(res.message || 'Personal appearance preferences saved.');
    } catch (err: any) {
      showNotice(err?.message || 'Saved locally to browser preferences.');
    } finally {
      setSavingSection(null);
    }
  };

  // Save PayHero PayBill mapping
  const handleSavePaybillMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPaybill?.paybillNumber) {
      showNotice('Please enter a valid PayBill or Till number.', 'error');
      return;
    }
    setSavingPaybill(true);
    try {
      const matchedProp = properties.find((p) => p.id === editingPaybill.propertyId);
      const res = await settingsApi.upsertPayHeroPaybill({
        ...editingPaybill,
        propertyName: matchedProp ? matchedProp.name : editingPaybill.propertyName || 'All Properties',
        codePrefix: matchedProp ? matchedProp.codePrefix : editingPaybill.codePrefix || '',
      });
      if (Array.isArray(res.paybills)) {
        setPaybills(res.paybills);
        setPayHeroInvoiceContext(res.paybills, null);
      }
      setEditingPaybill(null);
      showNotice(res.message || 'PayHero PayBill mapping saved.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to save PayBill mapping.', 'error');
    } finally {
      setSavingPaybill(false);
    }
  };

  const handleDeletePaybill = async (id: string) => {
    try {
      const res = await settingsApi.deletePayHeroPaybill(id);
      if (Array.isArray(res.paybills)) {
        setPaybills(res.paybills);
        setPayHeroInvoiceContext(res.paybills, null);
      }
      showNotice(res.message || 'PayBill mapping deleted.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to delete PayBill mapping.', 'error');
    }
  };

  // Record Manual C2B Notification & Reconcile
  const handleRecordManualC2B = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c2bAccountReference.trim() || c2bAmount <= 0) {
      showNotice('Account Reference (e.g., A-001) and a positive amount are required.', 'error');
      return;
    }
    setSubmittingC2b(true);
    try {
      const matchedPb = paybills.find((p) => p.paybillNumber === c2bPaybillNumber);
      const res = await settingsApi.recordManualPayHeroC2B({
        paybillNumber: c2bPaybillNumber,
        channelId: matchedPb?.channelId || sysDraft?.payment?.channelId || 'CH-101',
        accountReference: c2bAccountReference.trim().toUpperCase(),
        amount: Number(c2bAmount),
        mpesaReceiptNumber: c2bReceiptNumber.trim() || undefined,
        payerPhone: c2bPayerPhone.trim() || undefined,
        payerName: c2bPayerName.trim() || undefined,
        notes: c2bNotes.trim() || undefined,
      });
      if (Array.isArray(res.transactions)) {
        setPayheroTxs(res.transactions);
        setPayHeroInvoiceContext(null, res.transactions);
      }
      setC2bReceiptNumber('');
      setC2bNotes('');
      if (onPaymentsRefresh) {
        await onPaymentsRefresh();
      }
      showNotice(res.message || 'Manual C2B payment recorded and reconciled.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to process C2B notification.', 'error');
    } finally {
      setSubmittingC2b(false);
    }
  };

  // Save Resend Email Settings
  const handleSaveResendSettings = async () => {
    setSavingSection('email');
    try {
      const res = await emailApi.updateEmailSettings(emailSettingsDraft);
      if (res.settings) {
        setEmailSettingsDraft(res.settings);
      }
      showNotice(res.message || 'Resend email configuration saved.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to save Resend settings.', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  // Send Resend Test Email
  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) {
      showNotice('Please enter a recipient email address.', 'error');
      return;
    }
    setSendingTestEmail(true);
    try {
      const res = await emailApi.testEmail({ recipientEmail: testEmailRecipient.trim() });
      if (res.log && onBrandedEmailsChange) {
        onBrandedEmailsChange((prev) => [res.log!, ...prev.filter((e) => e.id !== res.log!.id)]);
      }
      showNotice(res.message || `Test email sent to ${testEmailRecipient.trim()} via Resend.`);
    } catch (err: any) {
      showNotice(err?.message || 'Failed to send test email.', 'error');
    } finally {
      setSendingTestEmail(false);
    }
  };

  // Save SMS Gateway Settings
  const handleSaveSmsGatewaySettings = async () => {
    setSavingSection('sms');
    try {
      const res = await smsApi.updateSmsSettings(smsSettingsDraft);
      if (res.settings) {
        setSmsSettingsDraft(res.settings);
        onSmsSettingsChange?.(res.settings);
      }
      showNotice(res.message || 'SMS notification settings saved.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to save SMS settings.', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  // Export Database JSON Snapshot
  const handleExportDatabase = async () => {
    setExportingDb(true);
    try {
      const snapshot = await settingsApi.exportDatabaseSnapshot();
      setLastExportResult({
        exportedAt: snapshot.exportedAt,
        counts: snapshot.counts,
      });
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arabella-rms-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotice('Full database backup snapshot downloaded as JSON.');
    } catch (err: any) {
      showNotice(err?.message || 'Database export failed.', 'error');
    } finally {
      setExportingDb(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Settings Header Bar */}
      <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[18px] font-extrabold text-[#17231E] tracking-tight">
              System Configuration & Preferences
            </h2>
            <span className="text-[11.5px] text-[#5A6762]">
              · {sysDraft.general.companyName} ({sysDraft.general.defaultCurrency} · {sysDraft.general.timezone})
            </span>
            {syncing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#156943] bg-[#F4F8F6] px-2 py-0.5 rounded-lg border border-[#E4ECE8]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing…
              </span>
            )}
            {!syncing && syncError && (
              <button
                type="button"
                onClick={() => void syncSettingsFromServer(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 rounded-lg border border-[#FECACA] hover:bg-[#FECACA]/60 cursor-pointer"
                title={syncError}
              >
                <RefreshCw className="w-3 h-3" />
                Retry sync
              </button>
            )}
          </div>
          <p className="text-[12px] text-[#6E7A75] mt-0.5">
            Configure global portfolio rules, personal theme preferences, Resend email automation, SMS notifications, and security policies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search across all settings sections */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search settings (theme, Resend, lease, security...)"
              className="pl-8 pr-7 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267] w-64 sm:w-72"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88948F] hover:text-[#17231E] cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Theme Switcher */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]">
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const active = prefDraft.themeMode === mode;
              const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSaveUserPreferences({ themeMode: mode })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#D5F267] text-[#17231E]'
                      : 'text-[#5A6762] hover:text-[#17231E]'
                  }`}
                  title={`Switch to ${mode} mode`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="capitalize">{mode}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {toast && (
        <div
          className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 text-[12.5px] font-semibold ${
            toast.type === 'error'
              ? 'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]'
              : 'bg-[#E9F8EF] border-[#B6E6CE] text-[#156943]'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Two-Column Settings Workspace: Left Vertical Category Nav + Right Configuration Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Sidebar Category Selector */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-3 border border-[#E4ECE8] space-y-1">
          <div className="px-2.5 py-1.5 text-[11px] font-bold text-[#7A8681] uppercase tracking-wider">
            Configuration Categories ({filteredCategories.length})
          </div>
          {filteredCategories.length === 0 ? (
            <div className="p-4 text-center text-[12px] text-[#7A8681]">
              No settings categories match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredCategories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start gap-2.5 cursor-pointer ${
                    isActive
                      ? 'bg-[#D5F267] text-[#17231E] font-bold'
                      : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E] font-semibold'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] leading-snug truncate">{cat.label}</div>
                    <div
                      className={`text-[10.5px] leading-tight mt-0.5 line-clamp-1 ${
                        isActive ? 'text-[#2C3E35] font-medium' : 'text-[#84918B] font-normal'
                      }`}
                    >
                      {cat.shortDesc}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Configuration Panel */}
        <div className="lg:col-span-9 space-y-4">
          {/* =================================================================
              A. GENERAL SETTINGS
             ================================================================= */}
          {activeCategory === 'general' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    A. General & Organization Settings
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Company identity, contact details, default currency (KES), and regional timezone (Africa/Nairobi).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'general'}
                  onClick={() => handleSaveSystemSection('general')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {savingSection === 'general' ? 'Saving...' : 'Save General Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Company / Agency Name *
                  </label>
                  <input
                    type="text"
                    value={sysDraft.general.companyName}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, companyName: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-medium focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Business Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={sysDraft.general.companyTagline}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, companyTagline: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Official Business Email
                  </label>
                  <input
                    type="email"
                    value={sysDraft.general.businessEmail}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, businessEmail: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Business Contact Phone
                  </label>
                  <input
                    type="text"
                    value={sysDraft.general.businessPhone}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, businessPhone: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Headquarters Street Address
                  </label>
                  <input
                    type="text"
                    value={sysDraft.general.businessAddress}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, businessAddress: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Company Logo URL (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/logo.png"
                    value={sysDraft.general.companyLogoUrl}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, companyLogoUrl: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Favicon URL (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/favicon.ico"
                    value={sysDraft.general.faviconUrl}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, faviconUrl: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Currency
                  </label>
                  <select
                    value={sysDraft.general.defaultCurrency}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: {
                          ...sysDraft.general,
                          defaultCurrency: e.target.value,
                          currencySymbol: e.target.value === 'KES' ? 'KSh' : '$',
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold focus:outline-none"
                  >
                    <option value="KES">KES — Kenyan Shilling (KSh)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Operational Timezone
                  </label>
                  <select
                    value={sysDraft.general.timezone}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, timezone: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold focus:outline-none"
                  >
                    <option value="Africa/Nairobi">Africa/Nairobi (EAT — UTC+03:00)</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Date Display Format
                  </label>
                  <select
                    value={sysDraft.general.dateFormat}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        general: { ...sysDraft.general, dateFormat: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none"
                  >
                    <option value="MMM DD, YYYY">MMM DD, YYYY (Nov 21, 2026)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (21/11/2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-11-21)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Time Format & Language
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={sysDraft.general.timeFormat}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          general: {
                            ...sysDraft.general,
                            timeFormat: e.target.value as '12h' | '24h',
                          },
                        })
                      }
                      className="px-3 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none"
                    >
                      <option value="12h">12-Hour (AM/PM)</option>
                      <option value="24h">24-Hour (EAT)</option>
                    </select>
                    <select
                      value={sysDraft.general.language}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          general: { ...sysDraft.general, language: e.target.value },
                        })
                      }
                      className="px-3 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] focus:outline-none"
                    >
                      <option value="en-KE">English (Kenya)</option>
                      <option value="sw-KE">Kiswahili (Kenya)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              B. APPEARANCE & THEMES (Personal Per-User + Global Defaults)
             ================================================================= */}
          {activeCategory === 'appearance' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    B. Appearance, Theme & Layout Preferences
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Saved individually for your account ({currentUser.email}) without altering other staff members&rsquo; preferences.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingSection === 'userPreferences'}
                  onClick={() => handleSaveUserPreferences()}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer whitespace-nowrap"
                >
                  {savingSection === 'userPreferences'
                    ? 'Saving...'
                    : 'Save My Appearance Preferences'}
                </button>
              </div>

              {/* Theme Mode Cards */}
              <div>
                <label className="block text-[12.5px] font-bold text-[#17231E] mb-2">
                  Color Theme Mode (Applies Across Entire Website)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'light' as const,
                      title: 'Light Mode (Pale Sage)',
                      desc: 'Default crisp sage canvas (#EEF3F0) with deep forest typography',
                      icon: Sun,
                    },
                    {
                      id: 'dark' as const,
                      title: 'Dark Mode (Charcoal #191919)',
                      desc: 'Deep neutral charcoal canvas (#191919) paired with elevated slate cards and soft botanical lime glow',
                      icon: Moon,
                    },
                    {
                      id: 'system' as const,
                      title: 'System Default',
                      desc: 'Automatically follows your operating system light or dark preference',
                      icon: Monitor,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = prefDraft.themeMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSaveUserPreferences({ themeMode: item.id })}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#F4FAF6] border-[#17231E] ring-2 ring-[#D5F267]'
                            : 'bg-[#F8FAF9] border-[#E4ECE8] hover:border-[#B6E6CE]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-bold text-[#17231E] flex items-center gap-1.5">
                            <Icon className="w-4 h-4 text-[#156943]" />
                            {item.title}
                          </span>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#156943]" />}
                        </div>
                        <p className="text-[11px] text-[#6E7A75] leading-relaxed">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent Palette & Typography */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1.5">
                    Brand Accent Theme
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'lime' as const, label: 'Signature Lime', hex: '#D5F267', primary: '#17231E' },
                      { id: 'emerald' as const, label: 'Forest Mint', hex: '#A7F3D0', primary: '#145338' },
                      { id: 'teal' as const, label: 'Coastal Teal', hex: '#99F6E4', primary: '#134E4A' },
                      { id: 'amber' as const, label: 'Warm Gold', hex: '#FDE68A', primary: '#451A03' },
                      { id: 'terracotta' as const, label: 'Terracotta (#E87A3D)', hex: '#E87A3D', primary: '#431407' },
                      { id: 'sienna' as const, label: 'Burnt Sienna (#CC5D24)', hex: '#CC5D24', primary: '#3B1506' },
                      { id: 'navy' as const, label: 'Navy Blue', hex: '#1E3A8A', primary: '#0F172A' },
                      { id: 'beige' as const, label: 'Beige', hex: '#E6D7C3', primary: '#3D3226' },
                      { id: 'camel' as const, label: 'Camel', hex: '#C69C6D', primary: '#3B2814' },
                      { id: 'olive' as const, label: 'Sage Olive Green', hex: '#849B74', primary: '#1F2E16' },
                      { id: 'charcoal' as const, label: 'Charcoal Gray', hex: '#374151', primary: '#1F242B' },
                      { id: 'brown' as const, label: 'Brown', hex: '#6B4423', primary: '#3B2311' },
                      { id: 'white' as const, label: 'Pure White', hex: '#FFFFFF', primary: '#17231E' },
                    ].map((acc) => {
                      const active = prefDraft.accentTheme === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() =>
                            handleSaveUserPreferences({
                              accentTheme: acc.id,
                              accentColor: acc.hex,
                              primaryColor: acc.primary,
                            })
                          }
                          className={`px-3 py-2 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                            active
                              ? 'border-[#17231E] bg-[#F4F8F6] font-bold'
                              : 'border-[#E4ECE8] bg-white'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                            style={{ backgroundColor: acc.hex }}
                          />
                          <span className="text-[12px] text-[#17231E] truncate">{acc.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1.5">
                    Interface Font Family
                  </label>
                  <select
                    value={prefDraft.fontFamily}
                    onChange={(e) =>
                      handleSaveUserPreferences({
                        fontFamily: e.target.value as UserAppearancePreferences['fontFamily'],
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold focus:outline-none"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans (System Default)</option>
                    <option value="DM Sans">DM Sans (Clean Geometric)</option>
                    <option value="Manrope">Manrope (Modern Financial)</option>
                    <option value="Outfit">Outfit (Architectural Display)</option>
                    <option value="Inter">Inter (Crisp UI Standard)</option>
                    <option value="Roboto">Roboto (Clean Neutral)</option>
                    <option value="IBM Plex Sans">IBM Plex Sans (Technical Precision)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1.5">
                    Table & Layout Density
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['comfortable', 'compact'] as const).map((dens) => (
                      <button
                        key={dens}
                        type="button"
                        onClick={() =>
                          handleSaveUserPreferences({
                            layoutDensity: dens,
                            compactTables: dens === 'compact',
                          })
                        }
                        className={`px-3 py-2 rounded-xl border text-[12px] font-bold capitalize cursor-pointer ${
                          prefDraft.layoutDensity === dens
                            ? 'bg-[#D5F267] text-[#17231E] border-[#17231E]'
                            : 'bg-[#F4F8F6] text-[#5A6762] border-[#E4ECE8]'
                        }`}
                      >
                        {dens} Layout
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1.5">
                    Sidebar & Font Scale
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={prefDraft.sidebarMode}
                      onChange={(e) =>
                        handleSaveUserPreferences({
                          sidebarMode: e.target.value as 'collapsed' | 'expanded',
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold focus:outline-none"
                    >
                      <option value="collapsed">Sidebar: Icon Rail</option>
                      <option value="expanded">Sidebar: Expanded</option>
                    </select>
                    <select
                      value={prefDraft.fontScale}
                      onChange={(e) =>
                        handleSaveUserPreferences({
                          fontScale: e.target.value as 'small' | 'normal' | 'large',
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold focus:outline-none"
                    >
                      <option value="small">Text: Compact</option>
                      <option value="normal">Text: Standard</option>
                      <option value="large">Text: Large</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dashboard Widget Visibility */}
              <div className="pt-3 border-t border-[#EEF3F0]">
                <p className="text-[12.5px] font-bold text-[#17231E] mb-2.5">
                  Dashboard Appearance & Widgets
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                  {[
                    {
                      key: 'showRatings' as const,
                      label: 'Show Overall Property Rating Card',
                    },
                    {
                      key: 'showTasks' as const,
                      label: 'Show Upcoming Property Tasks Widget',
                    },
                    {
                      key: 'showActivities' as const,
                      label: 'Show Live Database Activity Feed',
                    },
                  ].map((w) => (
                    <label
                      key={w.key}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                    >
                      <span className="font-semibold text-[#17231E]">{w.label}</span>
                      <input
                        type="checkbox"
                        checked={prefDraft.dashboardLayout[w.key]}
                        onChange={(e) =>
                          handleSaveUserPreferences({
                            dashboardLayout: {
                              ...prefDraft.dashboardLayout,
                              [w.key]: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-[#156943]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              C. PROPERTY SETTINGS
             ================================================================= */}
          {activeCategory === 'property' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    C. Property & Unit Configuration Settings
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure alphabetical property prefixes (A, B, C...), default rental charges, unit numbering, and property categories.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'property'}
                  onClick={() => handleSaveSystemSection('property')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingSection === 'property' ? 'Saving...' : 'Save Property Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Unit Numbering Format
                  </label>
                  <input
                    type="text"
                    value={sysDraft.property.unitNumberingFormat}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: { ...sysDraft.property, unitNumberingFormat: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Unit Tier Variant
                  </label>
                  <select
                    value={sysDraft.property.defaultUnitVariant}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: {
                          ...sysDraft.property,
                          defaultUnitVariant: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold"
                  >
                    <option value="standard">Standard</option>
                    <option value="deluxe">Deluxe</option>
                    <option value="suite">Suite</option>
                    <option value="family">Family</option>
                    <option value="single">Single</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Base Monthly Rent (KES)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.property.defaultMonthlyRent}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: {
                          ...sysDraft.property,
                          defaultMonthlyRent: Number(e.target.value || 0),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] tabular-nums font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Utility Package (KES)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.property.defaultUtilityPackage}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: {
                          ...sysDraft.property,
                          defaultUtilityPackage: Number(e.target.value || 0),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Service / Maintenance Fee (KES)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.property.defaultMaintenanceFee}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: {
                          ...sysDraft.property,
                          defaultMaintenanceFee: Number(e.target.value || 0),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Resident Parking Fee (KES)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.property.defaultParkingFee}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        property: {
                          ...sysDraft.property,
                          defaultParkingFee: Number(e.target.value || 0),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                {[
                  {
                    key: 'autoGenerateCodePrefix' as const,
                    label: 'Auto-Assign Alphabetical Code Prefix (A, B, C...)',
                  },
                  {
                    key: 'autoSyncOccupancy' as const,
                    label: 'Auto-Recalculate Property Occupancy from Active Leases',
                  },
                  {
                    key: 'requireManagerAssignment' as const,
                    label: 'Require Property Manager Assignment on Creation',
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                  >
                    <span className="font-semibold text-[#17231E]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={sysDraft.property[opt.key]}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          property: {
                            ...sysDraft.property,
                            [opt.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                ))}
              </div>

              {/* Property Categories Manager */}
              <div className="pt-3 border-t border-[#EEF3F0]">
                <label className="block text-[12.5px] font-bold text-[#17231E] mb-2">
                  Property Categories
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {sysDraft.property.propertyCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px] font-semibold text-[#17231E]"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSysDraft({
                            ...sysDraft,
                            property: {
                              ...sysDraft.property,
                              propertyCategories: sysDraft.property.propertyCategories.filter(
                                (c) => c !== cat
                              ),
                            },
                          })
                        }
                        className="text-[#88948F] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="Add new property category..."
                    value={newPropCategory}
                    onChange={(e) => setNewPropCategory(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newPropCategory.trim();
                      if (!clean) return;
                      if (!sysDraft.property.propertyCategories.includes(clean)) {
                        setSysDraft({
                          ...sysDraft,
                          property: {
                            ...sysDraft.property,
                            propertyCategories: [...sysDraft.property.propertyCategories, clean],
                          },
                        });
                      }
                      setNewPropCategory('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#17231E] text-[#D5F267] text-[12px] font-bold cursor-pointer"
                  >
                    Add Category
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              D. TENANT SETTINGS
             ================================================================= */}
          {activeCategory === 'tenant' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    D. Tenant Onboarding, Portal & Reference Settings
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure automatic PostgreSQL tenant reference generation (A-001, B-001), mandatory KYC fields, and Tenant Portal access.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'tenant'}
                  onClick={() => handleSaveSystemSection('tenant')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingSection === 'tenant' ? 'Saving...' : 'Save Tenant Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Tenant Payment Reference Pattern
                  </label>
                  <select
                    value={sysDraft.tenant.autoReferenceFormat}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        tenant: { ...sysDraft.tenant, autoReferenceFormat: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold"
                  >
                    <option value="PREFIX-001">PREFIX-001 (e.g., A-001, A-002, B-001)</option>
                    <option value="PROP-UNIT">PROPERTY-UNIT (e.g., POTRO-101)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Onboarding Resident Tier
                  </label>
                  <select
                    value={sysDraft.tenant.defaultTenantTier}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        tenant: {
                          ...sysDraft.tenant,
                          defaultTenantTier: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-semibold"
                  >
                    <option value="Verified Tenant">Verified Tenant</option>
                    <option value="New Resident">New Resident</option>
                    <option value="Platinum Tenant">Platinum Tenant</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                {[
                  { key: 'requireEmail' as const, label: 'Require Tenant Email Address (* Mandatory for Resend)' },
                  { key: 'requirePhone' as const, label: 'Require Kenyan Mobile Number (* Mandatory for SMS/M-Pesa)' },
                  { key: 'requireNationalId' as const, label: 'Require National ID / Passport Number on Registration' },
                  { key: 'requireVehicleInfo' as const, label: 'Require Resident Vehicle Registration Details' },
                  { key: 'enableTenantPortal' as const, label: 'Enable Self-Service Tenant Portal Login' },
                  { key: 'allowTenantMaintenanceRequests' as const, label: 'Allow Tenants to Submit Maintenance Requests' },
                  { key: 'allowTenantReceiptDownload' as const, label: 'Allow Tenants to Download Official Rent Receipts' },
                  { key: 'autoWelcomeSms' as const, label: 'Send Welcome SMS with A-001 Payment Account on Onboarding' },
                  { key: 'autoWelcomeEmail' as const, label: 'Send Welcome Email via Resend on Onboarding' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                  >
                    <span className="font-semibold text-[#17231E]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={sysDraft.tenant[opt.key]}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          tenant: {
                            ...sysDraft.tenant,
                            [opt.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* =================================================================
              F. NOTIFICATIONS SETTINGS
             ================================================================= */}
          {activeCategory === 'notifications' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    F. Automated Rent, Lease & Maintenance Notification Schedules
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Synchronized with the automated Africa/Nairobi (EAT) daily reminder scheduler for both Resend Email and Sozuri SMS.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveSystemSection('notifications');
                      handleSaveSmsGatewaySettings();
                    }}
                    disabled={!canEditGlobal || savingSection === 'notifications'}
                    className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer"
                  >
                    {savingSection === 'notifications'
                      ? 'Saving...'
                      : 'Save Notification Settings'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Upcoming Rent Reminder (Days Before Due)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={sysDraft.notifications.rentUpcomingDaysBefore}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        notifications: {
                          ...sysDraft.notifications,
                          rentUpcomingDaysBefore: Number(e.target.value || 3),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Overdue Arrears Follow-Up Frequency (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={sysDraft.notifications.overdueReminderFrequencyDays}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        notifications: {
                          ...sysDraft.notifications,
                          overdueReminderFrequencyDays: Number(e.target.value || 3),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Preferred Daily Dispatch Time (EAT)
                  </label>
                  <input
                    type="time"
                    value={sysDraft.notifications.preferredSendHourEat}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        notifications: {
                          ...sysDraft.notifications,
                          preferredSendHourEat: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    SMS Sender ID
                  </label>
                  <input
                    type="text"
                    value={smsSettingsDraft.senderId}
                    onChange={(e) =>
                      setSmsSettingsDraft({ ...smsSettingsDraft, senderId: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    SMS Environment
                  </label>
                  <select
                    value={smsSettingsDraft.environment}
                    onChange={(e) =>
                      setSmsSettingsDraft({
                        ...smsSettingsDraft,
                        environment: e.target.value as 'sandbox' | 'production',
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-semibold"
                  >
                    <option value="sandbox">Sandbox / Testing</option>
                    <option value="production">Production Live</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Duplicate Prevention Window (Hours)
                  </label>
                  <input
                    type="number"
                    value={smsSettingsDraft.preventDuplicatesHours}
                    onChange={(e) =>
                      setSmsSettingsDraft({
                        ...smsSettingsDraft,
                        preventDuplicatesHours: Number(e.target.value || 24),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                {[
                  {
                    key: 'enableEmailNotifications' as const,
                    label: 'Master Switch: Enable Resend Email Notifications',
                  },
                  {
                    key: 'enableSmsNotifications' as const,
                    label: 'Master Switch: Enable SMS Rent & Arrears Notifications',
                  },
                  {
                    key: 'sendOnDueDate' as const,
                    label: 'Send Rent Due Today Reminder on Exact Due Date',
                  },
                  {
                    key: 'sendPaymentConfirmation' as const,
                    label: 'Send Instant Payment Confirmation Receipt (SMS & Email)',
                  },
                  {
                    key: 'notifyManagerOnMaintenance' as const,
                    label: 'Notify Property Manager When Maintenance Request is Logged',
                  },
                  {
                    key: 'notifyTenantOnMaintenanceUpdate' as const,
                    label: 'Notify Resident When Work Order Status Changes',
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                  >
                    <span className="font-semibold text-[#17231E]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(sysDraft.notifications[opt.key])}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          notifications: {
                            ...sysDraft.notifications,
                            [opt.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* =================================================================
              G. EMAIL SETTINGS (RESEND INTEGRATION)
             ================================================================= */}
          {activeCategory === 'email' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-bold text-[#17231E]">
                      G. Resend Transactional Email Settings & Delivery Logs
                    </h3>
                    <span className="text-[11px] font-bold text-[#156943]">
                      · {emailSettingsDraft.apiKeyConfigured ? 'Resend API Connected' : 'Sandbox Mode'}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#7A8681]">
                    Reuses your existing Resend integration for staff invitations, rent reminders, payment receipts, and lease expiry alerts.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'email'}
                  onClick={handleSaveResendSettings}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  {savingSection === 'email' ? 'Saving...' : 'Save Resend Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Sender Display Name
                  </label>
                  <input
                    type="text"
                    value={emailSettingsDraft.senderName}
                    onChange={(e) =>
                      setEmailSettingsDraft({ ...emailSettingsDraft, senderName: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Resend From Address
                  </label>
                  <input
                    type="text"
                    value={emailSettingsDraft.fromEmail}
                    onChange={(e) =>
                      setEmailSettingsDraft({ ...emailSettingsDraft, fromEmail: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E] font-mono text-[12px]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Payment Instructions Included in Rent Emails
                  </label>
                  <textarea
                    rows={2}
                    value={emailSettingsDraft.paymentInstructions}
                    onChange={(e) =>
                      setEmailSettingsDraft({
                        ...emailSettingsDraft,
                        paymentInstructions: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[#17231E]"
                  />
                </div>
              </div>

              {/* Automated Email Template Triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                {[
                  { key: 'autoRentUpcoming3d' as const, label: 'Upcoming Rent (3 Days Before)' },
                  { key: 'autoRentDueToday' as const, label: 'Rent Due Today Alert' },
                  { key: 'autoRentOverdue' as const, label: 'Overdue Rent Arrears Notice' },
                  { key: 'autoPaymentConfirmed' as const, label: 'Payment Confirmed Receipt' },
                  { key: 'autoLeaseExpiry30d' as const, label: 'Lease Expiry Notice (30 Days)' },
                  { key: 'autoLeaseExpiry7d' as const, label: 'Lease Expiry Notice (7 Days)' },
                ].map((t) => (
                  <label
                    key={t.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                  >
                    <span className="font-semibold text-[#17231E]">{t.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(emailSettingsDraft[t.key])}
                      onChange={(e) =>
                        setEmailSettingsDraft({
                          ...emailSettingsDraft,
                          [t.key]: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                ))}
              </div>

              {/* Live Test Email Bar */}
              <div className="p-4 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-[12.5px] font-bold text-[#17231E]">
                    Send Live Resend Test Email
                  </p>
                  <p className="text-[11px] text-[#6E7A75]">
                    Dispatches a branded ARabella agency transactional test email via your configured server-side RESEND_API_KEY.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={testEmailRecipient}
                    onChange={(e) => setTestEmailRecipient(e.target.value)}
                    placeholder="recipient@example.com"
                    className="px-3 py-2 rounded-xl bg-white border border-[#E4ECE8] text-[12px] w-56"
                  />
                  <button
                    type="button"
                    disabled={sendingTestEmail}
                    onClick={handleSendTestEmail}
                    className="px-3.5 py-2 rounded-xl bg-[#17231E] text-[#D5F267] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingTestEmail ? 'Sending...' : 'Send Test Email'}
                  </button>
                </div>
              </div>

              {/* Recent Email Delivery Logs */}
              <div>
                <h4 className="text-[13.5px] font-bold text-[#17231E] mb-2">
                  Recent Resend Email Delivery Logs ({brandedEmails.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase">
                        <th className="py-2 px-3">Timestamp</th>
                        <th className="py-2 px-3">Template</th>
                        <th className="py-2 px-3">Recipient</th>
                        <th className="py-2 px-3">Subject</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]">
                      {brandedEmails.slice(0, 8).map((em) => (
                        <tr key={em.id} className="hover:bg-[#F9FBFA]">
                          <td className="py-2.5 px-3 text-[11px] text-[#6E7A75] tabular-nums whitespace-nowrap">
                            {new Date(em.createdAt).toLocaleString('en-KE')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#17231E] capitalize">
                            {em.templateType.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-[#17231E]">{em.recipientName}</span>
                            <span className="block text-[11px] text-[#6E7A75]">
                              {em.recipientEmail}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#17231E] truncate max-w-xs">
                            {em.subject}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#156943]">{em.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              H. LEASE & AGREEMENT SETTINGS
             ================================================================= */}
          {activeCategory === 'lease' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    H. Lease & Tenancy Agreement Settings
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure default lease durations, security deposit multipliers, notice periods, and agreement numbering.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'lease'}
                  onClick={() => handleSaveSystemSection('lease')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  {savingSection === 'lease' ? 'Saving...' : 'Save Lease Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Lease Duration (Months)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.lease.defaultLeaseDurationMonths}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: {
                          ...sysDraft.lease,
                          defaultLeaseDurationMonths: Number(e.target.value || 12),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Security Deposit (Months of Rent)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.lease.defaultSecurityDepositMonths}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: {
                          ...sysDraft.lease,
                          defaultSecurityDepositMonths: Number(e.target.value || 1),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Vacate Notice Period (Days)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.lease.vacateNoticePeriodDays}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: {
                          ...sysDraft.lease,
                          vacateNoticePeriodDays: Number(e.target.value || 30),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Agreement Code Prefix
                  </label>
                  <input
                    type="text"
                    value={sysDraft.lease.agreementNumberPrefix}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: { ...sysDraft.lease, agreementNumberPrefix: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Lease Payment Method Label
                  </label>
                  <input
                    type="text"
                    value={sysDraft.lease.defaultPaymentMethod}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: { ...sysDraft.lease, defaultPaymentMethod: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Standard Lease Agreement Clause / Terms Template
                  </label>
                  <textarea
                    rows={3}
                    value={sysDraft.lease.standardLeaseTerms}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        lease: { ...sysDraft.lease, standardLeaseTerms: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              I. INVOICE & RECEIPT SETTINGS
             ================================================================= */}
          {activeCategory === 'invoice' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    I. Invoice, Digital Receipt & Tax Configuration
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure invoice numbering (INV-), payment receipt codes (PAY-), default monthly rent due day, and KRA PIN / VAT display.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'invoice'}
                  onClick={() => handleSaveSystemSection('invoice')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  {savingSection === 'invoice' ? 'Saving...' : 'Save Invoice & Receipt Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Invoice Number Prefix
                  </label>
                  <input
                    type="text"
                    value={sysDraft.invoice.invoicePrefix}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: { ...sysDraft.invoice, invoicePrefix: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Payment Receipt Prefix
                  </label>
                  <input
                    type="text"
                    value={sysDraft.invoice.receiptPrefix}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: { ...sysDraft.invoice, receiptPrefix: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Monthly Rent Due Day (1–28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={sysDraft.invoice.defaultDueDayOfMonth}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: {
                          ...sysDraft.invoice,
                          defaultDueDayOfMonth: Number(e.target.value || 5),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    KRA Tax PIN / Registration Number
                  </label>
                  <input
                    type="text"
                    value={sysDraft.invoice.taxPinNumber}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: { ...sysDraft.invoice, taxPinNumber: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    VAT Rate (%)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.invoice.vatRatePercentage}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: {
                          ...sysDraft.invoice,
                          vatRatePercentage: Number(e.target.value || 16),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>

                <div className="flex items-end">
                  <label className="w-full flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer">
                    <span className="font-semibold text-[#17231E]">Apply VAT on Commercial Units</span>
                    <input
                      type="checkbox"
                      checked={sysDraft.invoice.enableVat}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          invoice: { ...sysDraft.invoice, enableVat: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Official Digital Receipt Footer Note
                  </label>
                  <textarea
                    rows={2}
                    value={sysDraft.invoice.receiptFooterNote}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        invoice: { ...sysDraft.invoice, receiptFooterNote: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              J. MAINTENANCE SETTINGS
             ================================================================= */}
          {activeCategory === 'maintenance' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    J. Maintenance Workflows & Service Providers
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure maintenance categories, default priority levels, cost approval thresholds, and approved contractors.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEditGlobal || savingSection === 'maintenance'}
                  onClick={() => handleSaveSystemSection('maintenance')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  {savingSection === 'maintenance' ? 'Saving...' : 'Save Maintenance Settings'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Default Work Order Priority
                  </label>
                  <select
                    value={sysDraft.maintenance.defaultPriority}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        maintenance: {
                          ...sysDraft.maintenance,
                          defaultPriority: e.target.value as 'Low' | 'Medium' | 'High',
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-semibold"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority (Urgent)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Auto-Approval Repair Cost Threshold (KES)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.maintenance.autoApproveThresholdKes}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        maintenance: {
                          ...sysDraft.maintenance,
                          autoApproveThresholdKes: Number(e.target.value || 0),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>
              </div>

              {/* Maintenance Categories */}
              <div>
                <label className="block text-[12.5px] font-bold text-[#17231E] mb-2">
                  Maintenance Issue Categories
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {sysDraft.maintenance.categories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px] font-semibold text-[#17231E]"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSysDraft({
                            ...sysDraft,
                            maintenance: {
                              ...sysDraft.maintenance,
                              categories: sysDraft.maintenance.categories.filter((c) => c !== cat),
                            },
                          })
                        }
                        className="text-[#88948F] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="Add maintenance category..."
                    value={newMaintCategory}
                    onChange={(e) => setNewMaintCategory(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newMaintCategory.trim();
                      if (!clean) return;
                      setSysDraft({
                        ...sysDraft,
                        maintenance: {
                          ...sysDraft.maintenance,
                          categories: [...sysDraft.maintenance.categories, clean],
                        },
                      });
                      setNewMaintCategory('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#17231E] text-[#D5F267] text-[12px] font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Approved Service Providers */}
              <div className="pt-3 border-t border-[#EEF3F0]">
                <label className="block text-[12.5px] font-bold text-[#17231E] mb-2">
                  Approved Contractors & Service Providers
                </label>
                <div className="space-y-2 mb-3">
                  {sysDraft.maintenance.serviceProviders.map((sp, idx) => (
                    <div
                      key={`${sp.name}-${idx}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[12px]"
                    >
                      <div>
                        <span className="font-bold text-[#17231E]">{sp.name}</span>
                        <span className="text-[#6E7A75]"> · {sp.specialty} · </span>
                        <span className="font-mono-num text-[#156943]">{sp.phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSysDraft({
                            ...sysDraft,
                            maintenance: {
                              ...sysDraft.maintenance,
                              serviceProviders: sysDraft.maintenance.serviceProviders.filter(
                                (_, i) => i !== idx
                              ),
                            },
                          })
                        }
                        className="text-[#B91C1C] hover:underline text-[11px] font-bold cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[12px]">
                  <input
                    type="text"
                    placeholder="Provider Name"
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                  <input
                    type="text"
                    placeholder="Specialty (e.g. Plumbing)"
                    value={newProviderSpecialty}
                    onChange={(e) => setNewProviderSpecialty(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                  <input
                    type="text"
                    placeholder="Phone (+254...)"
                    value={newProviderPhone}
                    onChange={(e) => setNewProviderPhone(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newProviderName.trim()) return;
                      setSysDraft({
                        ...sysDraft,
                        maintenance: {
                          ...sysDraft.maintenance,
                          serviceProviders: [
                            ...sysDraft.maintenance.serviceProviders,
                            {
                              name: newProviderName.trim(),
                              specialty: newProviderSpecialty.trim() || 'General Repairs',
                              phone: newProviderPhone.trim() || 'On file',
                            },
                          ],
                        },
                      });
                      setNewProviderName('');
                      setNewProviderSpecialty('');
                      setNewProviderPhone('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#17231E] text-[#D5F267] font-bold cursor-pointer"
                  >
                    Add Vendor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              K. USER & ROLE MANAGEMENT
             ================================================================= */}
          {activeCategory === 'users' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    K. User Accounts & Role-Based Access Control (RBAC)
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Enforced independently on both frontend navigation and backend API routes (`requireRole`).
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onNavigate('staff')}
                    className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    Open Full Staff & Invitations Directory
                  </button>
                )}
              </div>

              {/* Active Accounts Summary Table */}
              <div>
                <h4 className="text-[13.5px] font-bold text-[#17231E] mb-2">
                  Active Management & Portal Accounts ({users.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase">
                        <th className="py-2.5 px-3">Full Name</th>
                        <th className="py-2.5 px-3">Email</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Property Scope</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F9FBFA]">
                          <td className="py-2.5 px-3 font-bold text-[#17231E]">{u.fullName}</td>
                          <td className="py-2.5 px-3 font-mono text-[11.5px] text-[#5A6762]">
                            {u.email}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#17231E]">
                            {getRoleDisplayLabel(u.role, u.tenantRef)}
                          </td>
                          <td className="py-2.5 px-3 text-[#5A6762]">
                            {u.assignedPropertyName || 'All Properties'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#156943]">
                            {u.status || 'Active'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Role Permissions Matrix */}
              <div className="pt-3 border-t border-[#EEF3F0]">
                <h4 className="text-[13.5px] font-bold text-[#17231E] mb-2.5">
                  Role Authorization & Module Matrix
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(
                    [
                      'super_admin',
                      'administrator',
                      'property_manager',
                      'accountant',
                      'caretaker',
                      'maintenance_staff',
                      'tenant',
                    ] as UserRole[]
                  ).map((r) => {
                    const allowed = getAllowedPagesForRole(r);
                    const perms = getRolePermissionsSummary(r);
                    return (
                      <div
                        key={r}
                        className="p-3.5 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-[#17231E]">
                            {getRoleDisplayLabel(r)}
                          </span>
                          <span className="text-[11px] font-semibold text-[#156943] tabular-nums">
                            {allowed.length} Authorized Modules
                          </span>
                        </div>
                        <ul className="space-y-1 text-[11.5px] text-[#5A6762]">
                          {perms.map((p, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Check className="w-3.5 h-3.5 text-[#156943] shrink-0 mt-0.5" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              L. SECURITY SETTINGS
             ================================================================= */}
          {activeCategory === 'security' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    L. Security Policies, Session Controls & Audit Trail
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Configure password strength rules, session expiration, failed login lockout, and inspect immutable security events.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin || savingSection === 'security'}
                  onClick={() => handleSaveSystemSection('security')}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e957] text-[#17231E] text-[12px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingSection === 'security' ? 'Saving...' : 'Save Security Policies'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Minimum Password Length
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={32}
                    value={sysDraft.security.minPasswordLength}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        security: {
                          ...sysDraft.security,
                          minPasswordLength: Number(e.target.value || 8),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Session Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.security.sessionTimeoutMinutes}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        security: {
                          ...sysDraft.security,
                          sessionTimeoutMinutes: Number(e.target.value || 480),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Max Failed Login Attempts Before Lockout
                  </label>
                  <input
                    type="number"
                    value={sysDraft.security.maxFailedLoginAttempts}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        security: {
                          ...sysDraft.security,
                          maxFailedLoginAttempts: Number(e.target.value || 5),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                {[
                  { key: 'requireUppercase' as const, label: 'Require Uppercase Letters in Passwords' },
                  { key: 'requireNumbers' as const, label: 'Require Numeric Digits in Passwords' },
                  { key: 'enforce2faForAdmins' as const, label: 'Enforce 2FA Verification for Super Admins & Administrators' },
                  { key: 'logAllLoginAttempts' as const, label: 'Record All Successful & Failed Sign-In Attempts in Audit Trail' },
                  { key: 'logAllSettingsChanges' as const, label: 'Record All Global Configuration Updates in Audit Trail' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] cursor-pointer"
                  >
                    <span className="font-semibold text-[#17231E]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(sysDraft.security[opt.key])}
                      onChange={(e) =>
                        setSysDraft({
                          ...sysDraft,
                          security: {
                            ...sysDraft.security,
                            [opt.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#156943]"
                    />
                  </label>
                ))}
              </div>

              {/* Recent Security Audit Logs */}
              <div className="pt-3 border-t border-[#EEF3F0]">
                <h4 className="text-[13.5px] font-bold text-[#17231E] mb-2">
                  Recent Login & Security Audit Events ({securityLogs.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase">
                        <th className="py-2 px-3">Timestamp</th>
                        <th className="py-2 px-3">Event</th>
                        <th className="py-2 px-3">Actor</th>
                        <th className="py-2 px-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]">
                      {securityLogs.slice(0, 8).map((log) => (
                        <tr key={log.id} className="hover:bg-[#F9FBFA]">
                          <td className="py-2 px-3 text-[11px] text-[#6E7A75] tabular-nums whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-KE')}
                          </td>
                          <td className="py-2 px-3 font-bold text-[#17231E] capitalize">
                            {log.eventType.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2 px-3 text-[#17231E]">
                            {log.actorName || log.actorEmail || 'System'}
                          </td>
                          <td className="py-2 px-3 text-[#5A6762]">{log.details || log.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              M. DATABASE & BACKUP SETTINGS
             ================================================================= */}
          {activeCategory === 'database' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EEF3F0] pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-[#17231E]">
                    M. Database Connection Health, Backup & Export
                  </h3>
                  <p className="text-[12px] text-[#7A8681]">
                    Monitor live PostgreSQL / Supabase health, configure automated backup retention, and export complete JSON database snapshots.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!isAdmin || exportingDb}
                    onClick={handleExportDatabase}
                    className="px-4 py-2 rounded-xl bg-[#17231E] text-[#D5F267] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exportingDb ? 'Exporting Snapshot...' : 'Export Full Backup (JSON)'}
                  </button>
                  <button
                    type="button"
                    disabled={!isAdmin || savingSection === 'backup'}
                    onClick={() => handleSaveSystemSection('backup')}
                    className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    {savingSection === 'backup' ? 'Saving...' : 'Save Backup Rules'}
                  </button>
                </div>
              </div>

              {/* Live Database Health Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]">
                  <p className="text-[11px] font-bold text-[#6E7A75] uppercase">Database Engine</p>
                  <p className="text-[13.5px] font-extrabold text-[#17231E] mt-0.5">
                    {integrations?.database.engine || 'PostgreSQL / Supabase'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]">
                  <p className="text-[11px] font-bold text-[#6E7A75] uppercase">Connection Status</p>
                  <p className="text-[13.5px] font-extrabold text-[#156943] mt-0.5">
                    {integrations?.database.status || 'Healthy'} · RLS Active
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]">
                  <p className="text-[11px] font-bold text-[#6E7A75] uppercase">Active Records</p>
                  <p className="text-[13.5px] font-extrabold text-[#17231E] mt-0.5 tabular-nums">
                    {properties.length} Properties · {tenants.length} Tenants · {payments.length} Payments
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8]">
                  <p className="text-[11px] font-bold text-[#6E7A75] uppercase">Last Backup Export</p>
                  <p className="text-[12.5px] font-bold text-[#17231E] mt-0.5 tabular-nums">
                    {lastExportResult?.exportedAt
                      ? new Date(lastExportResult.exportedAt).toLocaleString('en-KE')
                      : sysDraft.backup.lastBackupAt
                      ? new Date(sysDraft.backup.lastBackupAt).toLocaleString('en-KE')
                      : 'Ready to export'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Automated Backup Schedule
                  </label>
                  <select
                    value={sysDraft.backup.autoBackupSchedule}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        backup: {
                          ...sysDraft.backup,
                          autoBackupSchedule: e.target.value as 'daily' | 'weekly' | 'manual',
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-semibold"
                  >
                    <option value="daily">Daily Automated Snapshot (02:00 EAT)</option>
                    <option value="weekly">Weekly Snapshot</option>
                    <option value="manual">Manual On-Demand Export Only</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Backup Retention Period (Days)
                  </label>
                  <input
                    type="number"
                    value={sysDraft.backup.backupRetentionDays}
                    onChange={(e) =>
                      setSysDraft({
                        ...sysDraft,
                        backup: {
                          ...sysDraft.backup,
                          backupRetentionDays: Number(e.target.value || 30),
                        },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] font-mono-num"
                  />
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              N. INTEGRATIONS OVERVIEW
             ================================================================= */}
          {activeCategory === 'integrations' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
              <div className="border-b border-[#EEF3F0] pb-4">
                <h3 className="text-[16px] font-bold text-[#17231E]">
                  N. Connected Platform Integrations
                </h3>
                <p className="text-[12px] text-[#7A8681]">
                  Live connection health for all external services integrated into your Rental Management System.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Resend Transactional Email */}
                <div className="p-4 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold text-[#17231E]">
                        Resend Transactional Email API
                      </span>
                      <span className="text-[11.5px] font-bold text-[#156943]">
                        {emailSettingsDraft.masterEnabled ? 'Active' : 'Paused'} · {brandedEmails.length} Sent
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#6E7A75] mt-1">
                      Delivers staff 72-hour invitation links, 3-day upcoming rent reminders, due-today alerts, overdue notices, payment receipts, and lease expiry emails.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4ECE8] text-[11.5px]">
                    <span className="text-[#5A6762] truncate max-w-[210px]">
                      From: {emailSettingsDraft.fromEmail}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveCategory('email')}
                      className="font-bold text-[#156943] hover:underline cursor-pointer"
                    >
                      Configure Resend →
                    </button>
                  </div>
                </div>

                {/* 3. Sozuri SMS Gateway */}
                <div className="p-4 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold text-[#17231E]">
                        Sozuri SMS Gateway
                      </span>
                      <span className="text-[11.5px] font-bold text-[#156943]">
                        Sender ID: {smsSettingsDraft.senderId} · {smsLogs.length} Logged
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#6E7A75] mt-1">
                      Automated Kenyan mobile SMS notifications (+254) for tenant onboarding, rent due alerts, bulk property announcements, and delivery receipt webhooks.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4ECE8] text-[11.5px]">
                    <span className="font-mono-num text-[#5A6762]">
                      Webhook: /api/webhooks/sms-delivery
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveCategory('notifications')}
                      className="font-bold text-[#156943] hover:underline cursor-pointer"
                    >
                      Configure SMS →
                    </button>
                  </div>
                </div>

                {/* 4. Supabase PostgreSQL & Auth */}
                <div className="p-4 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold text-[#17231E]">
                        Supabase PostgreSQL, RLS & Realtime
                      </span>
                      <span className="text-[11.5px] font-bold text-[#156943]">
                        Healthy · 19 Tables
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#6E7A75] mt-1">
                      Primary relational database with PostgreSQL triggers for automatic A-001 tenant reference codes, cross-table edit synchronization, and Row-Level Security.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E4ECE8] text-[11.5px]">
                    <span className="text-[#5A6762]">
                      Engine: {integrations?.database.engine || 'PostgreSQL'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveCategory('database')}
                      className="font-bold text-[#156943] hover:underline cursor-pointer"
                    >
                      Database & Backups →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
