import {
  UnitTypeItem,
  TenantProfile,
  RentPaymentRecord,
  MaintenanceItem,
  ChatThread,
  ExpenseTransaction,
  PropertyRecord,
  PropertyImageItem,
  DashboardAnalytics,
  UserSession,
  UserRole,
  AccountStatus,
  DashboardTaskRecord,
  ActivityLogRecord,
  PropertyReviewRecord,
  SecurityAuditLogRecord,
  BrandedEmailRecord,
  EmailNotificationSettings,
  EmailReminderTriggerType,
  SmsLogRecord,
  SmsNotificationSettings,
  SmsTriggerType,
  SystemSettingsRecord,
  UserAppearancePreferences,
  PayHeroPaybillMapping,
  PayHeroTransactionRecord,
  IntegrationStatusSummary,
  getAllowedPagesForRole,
  getRoleDisplayLabel,
  isManagementRole,
} from '../data/rentalData';
import {
  supabase,
  isSupabaseConfigured,
  getSanitizedSupabaseEndpoint,
  getSupabaseConfigDiagnostics,
  createDiagnosticError,
  SupabaseIntegrationError,
} from './supabaseClient';
import {
  classifyPaymentTransaction,
  computePortfolioFinancialSummary,
  formatTransactionDisplayNote,
  getCollectedPaymentAmount,
  isDepositTransaction,
  isOtherIncomeTransaction,
  isRentTransaction,
  normalizeNewPaymentNote,
} from './paymentClassification';
import {
  computeInvoiceFinancials,
  extractBillingPeriodFromPayment,
  getBillingAnniversaryDay,
  getBillingCycleForDate,
  getNairobiTodayYmd,
  getNextBillingDate,
  parseBillingDateToYmd,
} from './anniversaryBilling';

const AUTH_STORAGE_KEY = 'rentify_auth_token';
const AUTH_USER_STORAGE_KEY = 'rentify_auth_user';

let currentToken: string | null =
  typeof window !== 'undefined'
    ? window.sessionStorage.getItem(AUTH_STORAGE_KEY) ||
      window.localStorage.getItem(AUTH_STORAGE_KEY)
    : null;
let currentUserId: string = '';
let currentRole: UserRole = 'owner';
let currentEmail: string = '';
let currentTenantRef: string | undefined = undefined;
let unauthorizedHandler: (() => void) | null = null;

// Restore cached user context on load if present
if (typeof window !== 'undefined') {
  try {
    const rawUser =
      window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY) ||
      window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (rawUser) {
      const parsed = JSON.parse(rawUser) as Partial<UserSession>;
      if (parsed.id) currentUserId = parsed.id;
      if (parsed.role) currentRole = parsed.role;
      if (parsed.email) currentEmail = parsed.email;
      if (parsed.tenantRef) currentTenantRef = parsed.tenantRef;
    }
  } catch {
    // Ignore storage parse errors
  }
}

export function setOnUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function isRealSessionToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  return trimmed.startsWith('rtk_') || trimmed.split('.').length === 3;
}

export function getStoredToken(): string | null {
  if (isRealSessionToken(currentToken)) return currentToken;

  if (typeof window !== 'undefined') {
    const stored =
      window.sessionStorage.getItem(AUTH_STORAGE_KEY) ||
      window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (isRealSessionToken(stored)) return stored;

    // Check if Supabase itself persisted a session token in localStorage
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const val = window.localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.access_token) {
              return parsed.access_token;
            }
          }
        }
      }
    } catch {
      // Ignore storage access errors
    }

    if (stored) return stored;
  }
  return currentToken;
}

export function setAuthContext(session: UserSession, rememberMe?: boolean) {
  const existingValidToken = getStoredToken();
  const resolvedToken = isRealSessionToken(session.token)
    ? session.token
    : isRealSessionToken(existingValidToken)
    ? existingValidToken!
    : session.token;

  currentToken = resolvedToken;
  currentUserId = session.id;
  currentRole = session.role;
  currentEmail = session.email;
  currentTenantRef = session.tenantRef;
  const normalizedSession: UserSession = {
    ...session,
    token: resolvedToken,
  };
  if (typeof window !== 'undefined' && resolvedToken) {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, resolvedToken);
    window.sessionStorage.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(normalizedSession)
    );
    if (rememberMe !== false) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, resolvedToken);
      window.localStorage.setItem(
        AUTH_USER_STORAGE_KEY,
        JSON.stringify(normalizedSession)
      );
    }
  }
}

export const SETTINGS_BUNDLE_CACHE_KEY = 'rms_settings_bundle_cache_v1';

export interface AllSettingsBundle {
  systemSettings: SystemSettingsRecord;
  userPreferences: UserAppearancePreferences;
  paybills: PayHeroPaybillMapping[];
  transactions: PayHeroTransactionRecord[];
  emailSettings: EmailNotificationSettings;
  smsSettings: SmsNotificationSettings;
  integrations: IntegrationStatusSummary;
}

export function getCachedSettingsBundle(userId?: string): AllSettingsBundle | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_BUNDLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; bundle?: AllSettingsBundle };
    if (!parsed?.bundle) return null;
    if (userId && parsed.userId && parsed.userId !== userId) return null;
    return parsed.bundle;
  } catch {
    return null;
  }
}

export function setCachedSettingsBundle(bundle: AllSettingsBundle, userId?: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SETTINGS_BUNDLE_CACHE_KEY,
      JSON.stringify({
        userId: userId || bundle?.userPreferences?.userId || currentUserId || '',
        cachedAt: Date.now(),
        bundle,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCachedSettingsBundle() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SETTINGS_BUNDLE_CACHE_KEY);
  } catch {
    // Ignore
  }
}

let isClearingAuth = false;

export async function clearAuthContext(options?: { skipSupabaseSignOut?: boolean }) {
  currentToken = null;
  currentUserId = '';
  currentEmail = '';
  currentTenantRef = undefined;
  clearCachedSettingsBundle();
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
  if (supabase && !options?.skipSupabaseSignOut && !isClearingAuth) {
    isClearingAuth = true;
    try {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } finally {
      isClearingAuth = false;
    }
  }
}

function formatShortDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeAgo(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toDbRole(role: UserRole): string {
  switch (role) {
    case 'super_admin':
    case 'owner':
    case 'administrator':
      return 'owner';
    case 'property_manager':
    case 'accountant':
      return 'property_manager';
    case 'caretaker':
    case 'maintenance_staff':
      return 'caretaker';
    case 'tenant':
    default:
      return 'tenant';
  }
}

/**
 * Computes full dashboard analytics from live database rows.
 */
export function computeRealAnalytics(
  properties: PropertyRecord[],
  unitTypes: UnitTypeItem[],
  tenants: TenantProfile[],
  payments: RentPaymentRecord[],
  expenses: ExpenseTransaction[],
  maintenance: MaintenanceItem[],
  reviews: PropertyReviewRecord[]
): DashboardAnalytics {
  const activeTenants = tenants.filter((t) => t.tenancyStatus !== 'Vacated');
  // Deduplicate active tenants by physical unit (property + unitNumber) to prevent double-counting co-tenants
  const activeDistinctUnitSet = new Set<string>();
  activeTenants.forEach((t) => {
    const pKey = String(t.propertyId || t.property || '').trim().toLowerCase();
    const uKey = String(t.unitNumber || '').trim().toLowerCase();
    activeDistinctUnitSet.add(uKey ? `${pKey}::${uKey}` : `tenant::${t.id || t.tenantRef}`);
  });
  const activeOccupiedUnitsCount = activeDistinctUnitSet.size;

  // Single-source-of-truth financial accounting engine separating Earned Revenue from Deposit Liabilities
  const finSummary = computePortfolioFinancialSummary(
    tenants.map((t) => ({
      id: t.id || t.tenantRef,
      name: t.name,
      unitNumber: t.unitNumber,
      propertyName: t.property,
      status: t.tenancyStatus === 'Vacated' ? 'Past' : 'Active',
      monthlyRent: t.monthlyRent,
      securityDeposit: t.securityDeposit,
      depositStatus: t.depositStatus,
      depositReturnedAmount: t.depositReturnedAmount,
      depositDeductionAmount: t.depositDeductionAmount,
      rentBalance: t.rentBalance,
    })),
    payments.map((p) => ({
      id: p.id,
      invoiceId: p.paymentId,
      tenantId: p.tenantRef,
      tenantName: p.tenantName,
      unitNumber: p.unitNumber,
      propertyName: p.property,
      notes: p.paymentNote,
      billingPeriodKey: p.billingPeriodKey,
      transactionType: p.transactionType,
      amount: p.amount,
      amountPaid: p.amountPaid,
      balanceDue: p.balanceDue,
      status: p.status,
      paymentDate: p.paidDate,
      dueDate: p.dueDate,
    })),
    expenses.map((e) => ({
      id: e.id,
      propertyName: e.property,
      category: e.category,
      amount: e.amount,
      date: e.date,
    })),
    properties.map((p) => ({
      id: p.id,
      name: p.name,
      codePrefix: p.codePrefix,
    }))
  );

  // Separate Rent transactions from Security Deposit and Other Income transactions
  const rentPayments = payments.filter((p) => isRentTransaction(p));
  const paidRentPayments = rentPayments.filter((p) => p.status === 'Paid');
  const pendingOrOverdueRent = rentPayments.filter((p) => p.status !== 'Paid');

  const rentCollected = finSummary.rentCollected;
  const otherIncome = finSummary.otherIncome;
  const totalRevenue = finSummary.totalRevenue; // Rent Collected + Other Income ONLY (strictly excludes Deposits Held)
  const totalExpensesSum = finSummary.totalExpenses;
  const activeLeasesCount = activeTenants.length;
  const rentCollectedCount = finSummary.paidRentInvoicesCount;
  const pendingRentCount = finSummary.pendingRentInvoicesCount + finSummary.overdueRentInvoicesCount;
  const totalRentRevenue = rentCollected;
  const totalIncome = totalRevenue;
  const netBalance = finSummary.netOperatingIncome;
  const totalPaymentsCount = rentPayments.length;
  const collectionRatePct =
    totalPaymentsCount > 0
      ? Number(((paidRentPayments.length / totalPaymentsCount) * 100).toFixed(1))
      : 0;
  const propTotalUnits = properties.reduce((s, p) => s + Number(p.totalUnits || 0), 0);
  const unitTypeTotalUnits = unitTypes.reduce((s, u) => s + Number(u.totalCount || 0), 0);
  const totalUnits =
    propTotalUnits > 0
      ? propTotalUnits
      : unitTypeTotalUnits > 0
      ? unitTypeTotalUnits
      : activeOccupiedUnitsCount;
  const propOccupied = properties.reduce((s, p) => s + Number(p.occupiedUnits || 0), 0);
  const unitTypeOccupied = unitTypes.reduce((s, u) => s + Number(u.occupiedCount || 0), 0);
  const rawOccupied =
    properties.length > 0
      ? propOccupied
      : unitTypes.length > 0
      ? unitTypeOccupied
      : activeOccupiedUnitsCount;
  const occupied = Math.max(0, Math.min(totalUnits, rawOccupied));
  const notReady = maintenance.filter((m) => m.maintenanceStatus !== 'Completed').length;
  const reserved = pendingOrOverdueRent.length;
  const available = Math.max(0, totalUnits - occupied);
  const occupancyRatePct =
    totalUnits > 0 ? Number(((occupied / totalUnits) * 100).toFixed(1)) : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const activeLeaseMonthlyTarget = activeTenants.reduce(
    (s, t) => s + Number(t.monthlyRent || 0),
    0
  );

  const paymentMatchesMonth = (p: RentPaymentRecord, mShort: string, mIdx: number, yr?: number) => {
    const dateText = `${p.paidDate} ${p.dueDate}`;
    if (dateText.toLowerCase().includes(mShort.toLowerCase())) {
      return yr ? dateText.includes(String(yr)) || !/\b20\d{2}\b/.test(dateText) : true;
    }
    if (p.createdAt) {
      const cd = new Date(p.createdAt);
      return cd.getMonth() === mIdx && (yr ? cd.getFullYear() === yr : true);
    }
    return false;
  };

  const revenueChart12M = [];
  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(currentYear, currentMonthIdx - offset, 1);
    const mShort = monthNames[d.getMonth()];
    const yr = d.getFullYear();
    const label = `${mShort} ${yr}`;

    const monthRentCollected = rentPayments
      .filter((p) => paymentMatchesMonth(p, mShort, d.getMonth(), yr))
      .reduce((s, p) => s + getCollectedPaymentAmount(p), 0);

    const monthOtherPayments = payments
      .filter((p) => isOtherIncomeTransaction(p) && paymentMatchesMonth(p, mShort, d.getMonth(), yr))
      .reduce((s, p) => s + getCollectedPaymentAmount(p), 0);

    const monthDepositDeductions = tenants
      .filter((t) => {
        if (!t.depositDeductionAmount || Number(t.depositDeductionAmount) <= 0) return false;
        const settledRef = t.depositSettledAt || t.vacatedAt;
        if (!settledRef) return offset === 0;
        const sd = new Date(settledRef);
        if (!Number.isNaN(sd.getTime())) {
          return sd.getMonth() === d.getMonth() && sd.getFullYear() === yr;
        }
        return String(settledRef).toLowerCase().includes(mShort.toLowerCase());
      })
      .reduce((s, t) => s + Number(t.depositDeductionAmount || 0), 0);

    const monthDepositsReceived = payments
      .filter((p) => isDepositTransaction(p) && paymentMatchesMonth(p, mShort, d.getMonth(), yr))
      .reduce((s, p) => s + getCollectedPaymentAmount(p), 0);

    const monthOtherIncome = monthOtherPayments + monthDepositDeductions;
    const monthEarnedRevenue = monthRentCollected + monthOtherIncome;
    const monthTotalMoneyReceived = monthRentCollected + monthOtherPayments + monthDepositsReceived;

    revenueChart12M.push({
      month: label,
      revenue: monthEarnedRevenue,
      rentCollected: monthRentCollected,
      otherIncome: monthOtherIncome,
      depositsReceived: monthDepositsReceived,
      totalMoneyReceived: monthTotalMoneyReceived,
      projected: activeLeaseMonthlyTarget,
    });
  }
  const revenueChart6M = revenueChart12M.slice(-6);

  const rentCollection7D = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dayNum = String(d.getDate()).padStart(2, '0');
    const mShort = monthNames[d.getMonth()];
    const dayLabel = `${dayNum} ${mShort}`;
    const dayPayments = rentPayments.filter((p) => {
      if (
        p.paidDate.toLowerCase().includes(`${d.getDate()}`) &&
        p.paidDate.toLowerCase().includes(mShort.toLowerCase())
      ) {
        return true;
      }
      if (p.createdAt) {
        const cd = new Date(p.createdAt);
        return (
          cd.getDate() === d.getDate() &&
          cd.getMonth() === d.getMonth() &&
          cd.getFullYear() === d.getFullYear()
        );
      }
      return false;
    });
    const collectedCount = dayPayments.filter((p) => p.status === 'Paid').length;
    const pendingCount = dayPayments.filter((p) => p.status !== 'Paid').length;
    rentCollection7D.push({
      day: dayLabel,
      collected: collectedCount,
      pending: pendingCount,
    });
  }

  const palette = ['#BCEAD2', '#D5F267', '#DFF5B0', '#E4F890', '#EFFAC0', '#E4ECE8'];
  const totalOccupiedAcrossProps = Math.max(
    1,
    properties.reduce((s, p) => s + Math.max(Number(p.occupiedUnits || 0), 0), 0) ||
      activeOccupiedUnitsCount
  );
  const leasesByProperty = properties.map((p, idx) => {
    const occVal = Math.max(0, Number(p.occupiedUnits || 0));
    return {
      name: p.name,
      value:
        properties.length > 0
          ? Math.round((occVal / totalOccupiedAcrossProps) * 100)
          : 0,
      color: palette[idx % palette.length],
    };
  });

  const earningsYearly = monthNames.map((mShort, mIdx) => {
    const mRentIncome = rentPayments
      .filter((p) => paymentMatchesMonth(p, mShort, mIdx))
      .reduce((s, p) => s + getCollectedPaymentAmount(p), 0);
    const mOtherIncome = payments
      .filter((p) => isOtherIncomeTransaction(p) && paymentMatchesMonth(p, mShort, mIdx))
      .reduce((s, p) => s + getCollectedPaymentAmount(p), 0);
    const mIncome = mRentIncome + mOtherIncome;
    const mExpense = expenses
      .filter((e) => {
        if (String(e.date).toLowerCase().includes(mShort.toLowerCase())) {
          return true;
        }
        if (e.createdAt) {
          return new Date(e.createdAt).getMonth() === mIdx;
        }
        return false;
      })
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: mShort, income: mIncome, expense: mExpense > 0 ? -mExpense : 0 };
  });

  const categoryColors: Record<string, string> = {
    'Property Management': '#BCEAD2',
    Utilities: '#CDEEE0',
    'Maintenance and Repairs': '#DFF5B0',
    Supplies: '#D5F267',
    'Marketing and Listing': '#E4F890',
    'Insurance & Misc': '#EFFAC0',
  };
  const catTotals: Record<string, number> = {};
  for (const exp of expenses) {
    catTotals[exp.category] = (catTotals[exp.category] || 0) + Number(exp.amount || 0);
  }
  const expenseBreakdown = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => {
      const pct =
        totalExpensesSum > 0
          ? ((value / totalExpensesSum) * 100).toFixed(1).replace(/\.0$/, '')
          : '0';
      return {
        name,
        percent: `${pct}%`,
        value,
        color: categoryColors[name] || '#D5F267',
      };
    });

  // Income breakdown by property reflects Earned Revenue (Rent Collected + Other Income), excluding Deposits Held
  const incomeBreakdown = finSummary.propertyFinancials
    .filter((pf) => pf.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map((pf, i) => {
      const pct =
        totalRevenue > 0
          ? ((pf.totalRevenue / totalRevenue) * 100).toFixed(1).replace(/\.0$/, '')
          : '0';
      return {
        name: pf.propertyName,
        percent: `${pct}%`,
        value: pf.totalRevenue,
        color: palette[i % palette.length],
      };
    });

  const reviewCount = reviews.length;
  const avg = (getter: (r: PropertyReviewRecord) => number) =>
    reviewCount > 0
      ? Number(
          (reviews.reduce((s, r) => s + getter(r), 0) / reviewCount).toFixed(1)
        )
      : 0;
  const overallScore = avg((r) => r.overallScore);
  const maintScore = avg((r) => r.maintenanceScore);
  const cleanScore = avg((r) => r.cleanlinessScore);
  const mgmtScore = avg((r) => r.managementScore);
  const comfortScore = avg((r) => r.comfortScore);
  const locScore = avg((r) => r.locationScore);
  const ratingLabel =
    reviewCount === 0
      ? 'No Reviews Yet'
      : overallScore >= 4.5
      ? 'Impressive'
      : overallScore >= 4
      ? 'Very Good'
      : overallScore >= 3
      ? 'Satisfactory'
      : 'Needs Attention';

  return {
    activeLeasesCount,
    rentCollectedCount,
    pendingRentCount,
    totalRentRevenue,
    totalIncome,
    totalExpenses: totalExpensesSum,
    netBalance,
    collectionRatePct,
    occupancyRatePct,
    totalRevenue,
    rentCollected,
    otherIncome,
    otherIncomeFromPayments: finSummary.otherIncomeFromPayments,
    depositDeductions: finSummary.depositDeductions,
    depositsHeld: finSummary.depositsHeld,
    depositsReceived: finSummary.depositsReceived,
    depositsRefunded: finSummary.depositsRefunded,
    depositsHeldCount: finSummary.depositsHeldCount,
    totalMoneyReceived: finSummary.totalMoneyReceived,
    outstandingRent: finSummary.outstandingRent,
    pendingRentAmount: finSummary.pendingRentAmount,
    overdueRentAmount: finSummary.overdueRentAmount,
    overdueRentCount: finSummary.overdueRentInvoicesCount,
    propertyFinancials: finSummary.propertyFinancials,
    unitAvailability: { occupied, reserved, available, notReady },
    revenueChart6M,
    revenueChart12M,
    rentCollection7D,
    leasesByProperty,
    earningsYearly,
    expenseBreakdown,
    incomeBreakdown,
    ratingSummary: {
      overallScore,
      reviewCount,
      label: ratingLabel,
      categories: [
        { label: 'Maintenance', score: maintScore, pct: Math.round((maintScore / 5) * 100) },
        { label: 'Cleanliness', score: cleanScore, pct: Math.round((cleanScore / 5) * 100) },
        { label: 'Management', score: mgmtScore, pct: Math.round((mgmtScore / 5) * 100) },
        { label: 'Comfort', score: comfortScore, pct: Math.round((comfortScore / 5) * 100) },
        { label: 'Location', score: locScore, pct: Math.round((locScore / 5) * 100) },
      ],
    },
  };
}

/**
 * Helper to resolve a UserSession from Supabase Auth user + public.profiles + public.tenants.
 */
async function resolveSupabaseUserSession(
  authUser: any,
  accessToken: string,
  options?: { roleOverride?: UserRole; portal?: 'management' | 'tenant' }
): Promise<UserSession> {
  if (!supabase) {
    throw createDiagnosticError({
      failedRequest: 'resolveSupabaseUserSession',
      statusCode: 'CONFIG_ERROR',
      endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
      supabaseError:
        getSupabaseConfigDiagnostics().issueSummary ||
        'Supabase client is not initialized.',
      category: 'Environment Variables',
    });
  }

  const cleanEmail = String(authUser?.email || currentEmail || '')
    .trim()
    .toLowerCase();
  const meta = authUser?.user_metadata || {};

  const [profByIdRes, profByEmailRes, tenantRes, propsRes] = await Promise.all([
    authUser?.id
      ? supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cleanEmail
      ? supabase.from('profiles').select('*').ilike('email', cleanEmail).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cleanEmail
      ? supabase.from('tenants').select('*').ilike('email', cleanEmail).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('properties').select('id, name, manager_id, caretaker_id'),
  ]);

  let profRow: any = profByIdRes.data || profByEmailRes.data || null;
  const matchedTenant: any = tenantRes.data || null;
  const propsList: any[] = propsRes.data || [];

  const resolvedRole: UserRole =
    options?.roleOverride ||
    (meta.staff_role as UserRole) ||
    (profRow?.role as UserRole) ||
    (matchedTenant ? 'tenant' : 'owner');

  const resolvedStatus: AccountStatus =
    (meta.account_status as AccountStatus) ||
    (profRow?.account_status as AccountStatus) ||
    'Active';

  const tRef: string | undefined =
    profRow?.tenant_ref || matchedTenant?.tenant_ref || currentTenantRef || undefined;

  const fullName: string =
    profRow?.full_name ||
    meta.full_name ||
    matchedTenant?.full_name ||
    (cleanEmail === 'ochiengpeterson507@gmail.com'
      ? 'Peterson Ochieng'
      : cleanEmail.split('@')[0] || 'Authenticated User');

  // If authenticated in Supabase Auth but no row in public.profiles yet, auto-provision profile row
  if (!profRow && authUser?.id && cleanEmail) {
    const newProfilePayload: Record<string, any> = {
      id: authUser.id,
      email: cleanEmail,
      full_name: fullName,
      phone: meta.phone || matchedTenant?.phone || '',
      role: toDbRole(resolvedRole),
      tenant_ref: tRef || null,
      avatar_bg:
        resolvedRole === 'owner' || resolvedRole === 'super_admin'
          ? '#D5F267'
          : '#D8F3E5',
    };
    const { data: insertedProf } = await supabase
      .from('profiles')
      .upsert(newProfilePayload)
      .select('*')
      .maybeSingle();
    if (insertedProf) {
      profRow = insertedProf;
    }
  }

  const uid = profRow?.id || authUser?.id || currentUserId;
  let assignedPropId =
    meta.assigned_property_id || profRow?.assigned_property_id || undefined;
  let assignedPropName =
    meta.assigned_property_name || profRow?.assigned_property_name || undefined;

  if (assignedPropId) {
    const foundProp = propsList.find((p) => p.id === assignedPropId);
    if (foundProp) assignedPropName = foundProp.name;
  } else {
    const managedProp = propsList.find(
      (p) => p.manager_id === uid || p.caretaker_id === uid
    );
    if (managedProp) {
      assignedPropId = managedProp.id;
      assignedPropName = managedProp.name;
    }
  }

  const customPerms = Array.isArray(meta.custom_permissions)
    ? meta.custom_permissions
    : Array.isArray(profRow?.custom_permissions) &&
      profRow.custom_permissions.length > 0
    ? profRow.custom_permissions
    : undefined;

  return {
    id: uid,
    email: cleanEmail,
    fullName,
    phone: profRow?.phone || meta.phone || matchedTenant?.phone || '',
    jobTitle:
      meta.job_title ||
      profRow?.job_title ||
      getRoleDisplayLabel(resolvedRole, tRef),
    role: resolvedRole,
    roleLabel: getRoleDisplayLabel(resolvedRole, tRef),
    status: resolvedStatus,
    assignedPropertyId: assignedPropId,
    assignedPropertyName: assignedPropName,
    assignedPropertyIds: Array.isArray(meta.assigned_property_ids)
      ? meta.assigned_property_ids
      : assignedPropId
      ? [assignedPropId]
      : [],
    lastLoginAt:
      meta.last_login_at ||
      profRow?.last_login_at ||
      authUser?.last_sign_in_at ||
      new Date().toISOString(),
    invitedAt: meta.invited_at || profRow?.invited_at || undefined,
    inviteExpiresAt:
      meta.invite_expires_at || profRow?.invite_expires_at || undefined,
    inviteUsed: Boolean(meta.invite_used ?? profRow?.invite_used),
    inviteRevoked: Boolean(meta.invite_revoked ?? profRow?.invite_revoked),
    inviteToken: meta.invite_token || profRow?.invite_token || profRow?.invite_token_hash || undefined,
    mfaEnabled: Boolean(meta.mfa_enabled ?? profRow?.mfa_enabled),
    permissions:
      customPerms && customPerms.length > 0
        ? customPerms
        : getAllowedPagesForRole(resolvedRole),
    tenantRef: tRef,
    avatarBg:
      profRow?.avatar_bg ||
      (resolvedRole === 'owner' || resolvedRole === 'super_admin'
        ? '#D5F267'
        : '#D8F3E5'),
    token: accessToken,
    portal:
      options?.portal || (resolvedRole === 'tenant' ? 'tenant' : 'management'),
  };
}

/**
 * Fetches the full database state directly from Supabase PostgreSQL tables.
 */
async function fetchBootstrapFromSupabase(): Promise<BootstrapPayload> {
  if (!supabase) {
    throw createDiagnosticError({
      failedRequest: 'GET Supabase Database Bootstrap',
      statusCode: 'CONFIG_ERROR',
      endpoint: getSanitizedSupabaseEndpoint('/rest/v1/'),
      supabaseError:
        getSupabaseConfigDiagnostics().issueSummary ||
        'Supabase client is not configured.',
      category: 'Environment Variables',
    });
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw createDiagnosticError({
      failedRequest: 'GET Supabase Auth Session (getSession)',
      statusCode: (sessionError as any).status || 401,
      endpoint: getSanitizedSupabaseEndpoint('/auth/v1/user'),
      supabaseError: sessionError.message,
      category: 'Authentication',
    });
  }

  const activeSession = sessionData?.session;
  const accessToken = activeSession?.access_token || getStoredToken() || '';

  if (!activeSession?.user && !currentEmail && !currentUserId) {
    throw createDiagnosticError({
      failedRequest: 'GET Supabase Auth Session',
      statusCode: 401,
      endpoint: getSanitizedSupabaseEndpoint('/auth/v1/user'),
      supabaseError: 'Authentication required: Please sign in to access dashboard data.',
      category: 'Authentication',
    });
  }

  const [
    uRes,
    pRes,
    utRes,
    unRes,
    tRes,
    lRes,
    payRes,
    expRes,
    mRes,
    thRes,
    tkRes,
    rvRes,
    acRes,
    pImgRes,
    secRes,
    emRes,
    smsLogsRes,
    smsSetRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: true }).limit(100),
    supabase
      .from('properties')
      .select(
        'id, code_prefix, property_code, name, address, description, status, total_units, occupied_units, monthly_revenue, manager_id, manager_name, caretaker_id, rating, variant, cover_image_url, created_at'
      )
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('unit_types').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('units').select('*').order('created_at', { ascending: true }).limit(250),
    supabase.from('tenants').select('*').order('tenant_ref', { ascending: true }).limit(250),
    supabase.from('leases').select('*').order('created_at', { ascending: false }).limit(250),
    supabase.from('rent_payments').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(100),
    supabase
      .from('maintenance_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('chat_threads').select('*').order('created_at', { ascending: false }).limit(50),
    supabase
      .from('property_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('property_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('property_images')
      .select('id, property_id, image_url, storage_path, is_cover, display_order, caption, created_at')
      .order('display_order', { ascending: true })
      .limit(30),
    supabase
      .from('security_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('branded_emails')
      .select('id, template_type, recipient_email, recipient_name, subject, status, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('sms_logs')
      .select('id, tenant_id, tenant_ref, tenant_name, recipient_phone, property_name, unit_number, trigger_type, message_body, status, delivery_status, delivered_at, environment, provider, provider_message_id, provider_status_code, provider_cost, cost_kes, error_message, dedupe_key, payment_id, sent_by, created_at')
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('sms_notification_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle(),
  ]);

  // Check if core tables failed due to missing schema, RLS block, or Supabase egress quota restriction
  const coreError = pRes.error || tRes.error || payRes.error || uRes.error;
  if (coreError) {
    const errMsg = String(coreError.message || '');
    if (
      errMsg.toLowerCase().includes('exceed_egress_quota') ||
      errMsg.toLowerCase().includes('service for this project is restricted')
    ) {
      throw createDiagnosticError({
        failedRequest: 'SELECT Core Tables (Supabase Egress Quota Restricted)',
        statusCode: 402,
        endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
        supabaseError: errMsg,
        category: 'Database Access',
        hint: 'Your Supabase project REST API is temporarily restricted due to exceed_egress_quota. Upgrade your Supabase plan or remove spend caps in the Supabase Dashboard to lift the restriction.',
      });
    }
    if ((coreError as any).code === 'PGRST301') {
      throw createDiagnosticError({
        failedRequest: 'SELECT Core Tables (properties, tenants, rent_payments)',
        statusCode: 401,
        endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
        supabaseError: `${coreError.message} (${coreError.code})`,
        category: 'Authentication',
        hint: 'Your Supabase JWT token expired or is invalid. Please sign in again.',
      });
    }
  }

  const usersRows: any[] = uRes.data || [];
  const propsRows: any[] = pRes.data || [];
  const unitTypesRows: any[] = utRes.data || [];
  const unitsRows: any[] = unRes.data || [];
  const tenantsRows: any[] = tRes.data || [];
  const leasesRows: any[] = lRes.data || [];
  const paymentsRows: any[] = payRes.data || [];
  const expensesRows: any[] = expRes.data || [];
  const maintRows: any[] = mRes.data || [];
  const threadsRows: any[] = thRes.data || [];
  const tasksRows: any[] = tkRes.data || [];
  const reviewsRows: any[] = rvRes.data || [];
  const activitiesRows: any[] = acRes.data || [];
  const propImagesRows: any[] = pImgRes.data || [];

  const profilesById = new Map<string, any>();
  for (const u of usersRows) {
    profilesById.set(u.id, u);
  }
  const propsById = new Map<string, any>();
  const propsByName = new Map<string, any>();
  for (const p of propsRows) {
    propsById.set(p.id, p);
    propsByName.set(String(p.name).trim().toLowerCase(), p);
  }
  const unitsById = new Map<string, any>();
  for (const un of unitsRows) {
    unitsById.set(un.id, un);
  }

  const users: UserSession[] = usersRows.map((u) => {
    const matchedTenant = tenantsRows.find(
      (t) =>
        t.user_id === u.id ||
        String(t.email).toLowerCase() === String(u.email).toLowerCase()
    );
    const tRef = u.tenant_ref || matchedTenant?.tenant_ref || undefined;
    const resolvedRole = (u.role as UserRole) || 'owner';
    const resolvedStatus = (u.account_status as AccountStatus) || 'Active';
    let assignedPropId = u.assigned_property_id || undefined;
    let assignedPropName = u.assigned_property_name || undefined;
    if (assignedPropId && propsById.has(assignedPropId)) {
      assignedPropName = propsById.get(assignedPropId)?.name;
    } else if (!assignedPropId) {
      const managedProp = propsRows.find(
        (p) => p.manager_id === u.id || p.caretaker_id === u.id
      );
      if (managedProp) {
        assignedPropId = managedProp.id;
        assignedPropName = managedProp.name;
      }
    }
    const customPerms = Array.isArray(u.custom_permissions)
      ? u.custom_permissions
      : undefined;

    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name || u.email,
      phone: u.phone || '',
      jobTitle: u.job_title || getRoleDisplayLabel(resolvedRole, tRef),
      role: resolvedRole,
      roleLabel: getRoleDisplayLabel(resolvedRole, tRef),
      status: resolvedStatus,
      invitationStatus:
        u.invitation_status ||
        (u.invite_revoked
          ? 'Expired'
          : u.invite_used
          ? 'Accepted'
          : u.invite_expires_at && new Date(u.invite_expires_at).getTime() < Date.now()
          ? 'Expired'
          : u.account_status === 'Pending Invitation' || u.invite_token_hash || u.invite_token
          ? 'Pending'
          : undefined),
      invitationDeliveryStatus:
        u.delivery_status || (u.resend_id ? 'Delivered' : undefined),
      invitationDeliveredAt:
        u.invitation_delivered_at || u.invited_at || undefined,
      resendMessageId: u.resend_id || undefined,
      invitationError: u.invitation_error || undefined,
      invitedBy: u.invited_by || undefined,
      assignedPropertyId: assignedPropId,
      assignedPropertyName: assignedPropName,
      assignedPropertyIds: Array.isArray(u.assigned_property_ids)
        ? u.assigned_property_ids
        : assignedPropId
        ? [assignedPropId]
        : [],
      lastLoginAt: u.last_login_at || undefined,
      invitedAt: u.invited_at || undefined,
      inviteExpiresAt: u.invite_expires_at || undefined,
      inviteUsed: Boolean(u.invite_used),
      inviteRevoked: Boolean(u.invite_revoked),
      activatedAt: u.activated_at || undefined,
      inviteToken: u.invite_token || u.invite_token_hash || undefined,
      mfaEnabled: Boolean(u.mfa_enabled),
      permissions:
        customPerms && customPerms.length > 0
          ? customPerms
          : getAllowedPagesForRole(resolvedRole),
      tenantRef: tRef,
      avatarBg:
        u.avatar_bg ||
        (resolvedRole === 'owner' || resolvedRole === 'super_admin'
          ? '#D5F267'
          : '#D8F3E5'),
      token: isRealSessionToken(u.token)
        ? u.token
        : accessToken || currentToken || u.id,
      portal: resolvedRole === 'tenant' ? 'tenant' : 'management',
    };
  });

  const todayYmd = getNairobiTodayYmd();
  const leaseByTenantRef = new Map<string, any>();
  for (const l of leasesRows) {
    if (l.tenant_ref) {
      leaseByTenantRef.set(String(l.tenant_ref).trim().toUpperCase(), l);
    }
  }

  const payments: RentPaymentRecord[] = paymentsRows.map((r) => {
    const txType = classifyPaymentTransaction(r);
    const isDeposit = txType === 'Security Deposit';
    const amt = Number(r.amount_due ?? r.amount ?? r.amount_paid ?? 0);
    const amtPaidRaw = Number(
      r.amount_paid !== undefined && r.amount_paid !== null
        ? r.amount_paid
        : r.status === 'Paid'
        ? amt
        : 0
    );
    const matchedLease = r.tenant_ref
      ? leaseByTenantRef.get(String(r.tenant_ref).trim().toUpperCase())
      : undefined;
    const moveInYmd =
      parseBillingDateToYmd(matchedLease?.lease_start) ||
      parseBillingDateToYmd(r.due_date) ||
      todayYmd;
    const period = isDeposit ? null : extractBillingPeriodFromPayment(r, moveInYmd);
    const dueYmd = parseBillingDateToYmd(r.due_date) || period?.periodStart || todayYmd;
    const fin = computeInvoiceFinancials({
      amountDue: amt,
      amountPaid: amtPaidRaw,
      dueDate: dueYmd,
      referenceYmd: todayYmd,
      storedStatus: r.status,
    });
    const confirmerProfile = r.confirmed_by
      ? profilesById.get(r.confirmed_by)
      : null;
    return {
      id: r.id,
      paymentId: r.payment_code,
      tenantRef: r.tenant_ref,
      tenantName: r.tenant_name,
      avatarBg: r.avatar_bg || '#D8F3E5',
      property: r.property_name,
      unitType: r.unit_type || 'Deluxe',
      unitNumber: r.unit_number,
      paymentNote: formatTransactionDisplayNote(r),
      transactionType: txType,
      leaseTerm: r.lease_term || '12 months',
      dueDate: r.due_date || dueYmd,
      paidDate: r.paid_date || '-',
      invoiceDate: r.invoice_date || parseBillingDateToYmd(r.created_at) || dueYmd,
      billingPeriodStart: period?.periodStart,
      billingPeriodEnd: period?.periodEnd,
      billingPeriodKey: isDeposit ? undefined : (r.billing_period_key || undefined),
      billingAnniversaryDay: isDeposit
        ? undefined
        : Number(r.billing_anniversary_day || getBillingAnniversaryDay(moveInYmd)),
      amount: amt,
      amountPaid: fin.amountPaid,
      balanceDue: fin.outstandingBalance,
      status: fin.status,
      confirmedBy: confirmerProfile?.full_name || r.confirmed_by || undefined,
      confirmedAt: r.confirmed_at || undefined,
      createdAt: r.created_at,
    };
  });

  const tenants: TenantProfile[] = tenantsRows.map((t) => {
    const lease: any =
      leasesRows.find(
        (l) => l.tenant_id === t.id || l.tenant_ref === t.tenant_ref
      ) || {};
    const propObj =
      (t.property_id ? propsById.get(t.property_id) : undefined) ||
      (lease.property_name
        ? propsByName.get(String(lease.property_name).trim().toLowerCase())
        : undefined) ||
      (t.property_name
        ? propsByName.get(String(t.property_name).trim().toLowerCase())
        : undefined);
    const resolvedPropertyId = propObj?.id || t.property_id || undefined;
    const resolvedPropertyName =
      propObj?.name ||
      lease.property_name ||
      t.property_name ||
      propsRows[0]?.name ||
      'Main Property';
    const unitObj =
      (lease.unit_id ? unitsById.get(lease.unit_id) : undefined) ||
      unitsRows.find(
        (un) =>
          un.property_id === resolvedPropertyId &&
          String(un.unit_number).toLowerCase() ===
            String(lease.unit_number || '').toLowerCase()
      );
    const resolvedUnitId = unitObj?.id || lease.unit_id || undefined;
    const resolvedUnitNumber =
      unitObj?.unit_number || lease.unit_number || 'Unit 101';
    const resolvedUnitType =
      lease.unit_type || unitObj?.unit_type_name || 'Deluxe';
    const myAllPayments = payments.filter(
      (p) =>
        String(p.tenantRef || '').toUpperCase() ===
        String(t.tenant_ref || '').toUpperCase()
    );
    // Keep Security Deposit transactions strictly separate from Rent invoices & balances
    const myPayments = myAllPayments.filter((p) => !isDepositTransaction(p));
    const moveInYmd =
      parseBillingDateToYmd(lease.lease_start) ||
      parseBillingDateToYmd(t.created_at) ||
      todayYmd;
    const currentCycle = getBillingCycleForDate(moveInYmd, todayYmd);
    const nextBillingYmd = getNextBillingDate(moveInYmd, todayYmd);
    const totalPaid = myPayments.reduce(
      (s, p) => s + Number(p.amountPaid ?? (p.status === 'Paid' ? p.amount : 0)),
      0
    );
    const rentBalance = myPayments.reduce(
      (s, p) => s + Number(p.balanceDue ?? (p.status === 'Paid' ? 0 : p.amount)),
      0
    );
    const unpaidPayments = myPayments
      .filter((p) => p.status !== 'Paid' && Number(p.balanceDue ?? p.amount) > 0)
      .sort((a, b) =>
        (parseBillingDateToYmd(a.dueDate) || '9999-12-31').localeCompare(
          parseBillingDateToYmd(b.dueDate) || '9999-12-31'
        )
      );
    const hasOverdue = myPayments.some((p) => p.status === 'Overdue');
    const hasPending = myPayments.some((p) => p.status === 'Pending');
    const derivedStatus = hasOverdue
      ? 'Overdue'
      : hasPending || rentBalance > 0
      ? 'Pending'
      : 'Paid';
    const activeDueDate =
      unpaidPayments[0]?.dueDate || nextBillingYmd || currentCycle?.dueDate || moveInYmd;
    const monthlyRent = Number(
      lease.monthly_rent ?? unitObj?.monthly_rent ?? 0
    );
    const baseRent = Number(lease.base_rent || monthlyRent);
    const utilityPackage = Number(lease.utility_package || 0);
    const maintenanceFee = Number(lease.maintenance_fee || 0);
    const parkingFee = Number(lease.parking_fee || 0);
    const paymentHistory = myAllPayments.map((p) => {
      const pTxType = p.transactionType || classifyPaymentTransaction(p);
      return {
        id: p.paymentId,
        paymentDate: p.paidDate,
        unitType: p.unitType,
        unitNumber: p.unitNumber,
        periodStart: pTxType === 'Security Deposit' ? (p.paidDate !== '-' ? p.paidDate : p.dueDate) : (p.billingPeriodStart || p.dueDate),
        periodEnd: pTxType === 'Security Deposit' ? 'Deposit Escrow' : (p.billingPeriodEnd || p.paidDate),
        occupants: lease.occupants || '1 Resident',
        amount: p.amount,
        status: p.status,
        variant: (p.unitType === 'Suite'
          ? 'suite'
          : p.unitType === 'Standard'
          ? 'standard'
          : 'deluxe') as 'standard' | 'deluxe' | 'suite',
        transactionType: pTxType,
        paymentNote: formatTransactionDisplayNote(p),
      };
    });

    const rawLeaseNotes = String(
      lease.lease_notes || 'Standard residential lease agreement.'
    );
    const settleMarkerPrefix = '[DEPOSIT_SETTLEMENT:';
    const markerIdx = rawLeaseNotes.indexOf(settleMarkerPrefix);
    let embeddedSettlement: Record<string, any> | null = null;
    let cleanLeaseNotes = rawLeaseNotes;
    if (markerIdx !== -1) {
      const endBracketIdx = rawLeaseNotes.indexOf(']', markerIdx);
      if (endBracketIdx !== -1) {
        const jsonPart = rawLeaseNotes.slice(
          markerIdx + settleMarkerPrefix.length,
          endBracketIdx
        );
        try {
          embeddedSettlement = JSON.parse(jsonPart);
        } catch {}
        cleanLeaseNotes =
          (
            rawLeaseNotes.slice(0, markerIdx) +
            rawLeaseNotes.slice(endBracketIdx + 1)
          ).trim() || 'Standard residential lease agreement.';
      }
    }
    const isVacated =
      t.tenancy_status === 'Vacated' ||
      embeddedSettlement?.tenancyStatus === 'Vacated' ||
      lease.is_active === false;
    const securityDepositNum = Number(t.security_deposit || 0);
    const resolvedDepositStatus = (t.deposit_status ||
      embeddedSettlement?.depositStatus ||
      (isVacated
        ? Number(embeddedSettlement?.depositReturnedAmount || 0) > 0
          ? Number(embeddedSettlement?.depositDeductionAmount || 0) > 0
            ? 'Partially Returned'
            : 'Returned'
          : 'Forfeited'
        : securityDepositNum > 0
        ? 'Held'
        : 'Not Paid')) as TenantProfile['depositStatus'];

    return {
      id: t.id,
      propertyId: resolvedPropertyId,
      unitId: resolvedUnitId,
      tenantRef: t.tenant_ref,
      name: t.full_name,
      phone: t.phone,
      email: t.email,
      dob: t.dob || 'Not specified',
      gender: t.gender || 'Resident',
      nationality: t.nationality || 'Kenyan',
      idNumber: t.id_number,
      tier: t.tier || 'Verified Tenant',
      onTimeStreak: isVacated ? 'Vacated' : (t.on_time_streak || 'Active Lease'),
      securityDeposit: securityDepositNum,
      tenancyStatus: isVacated ? 'Vacated' : 'Active',
      vacatedAt: t.vacated_at || embeddedSettlement?.vacatedAt || undefined,
      depositStatus: resolvedDepositStatus,
      depositReturnedAmount: Number(
        t.deposit_returned_amount ??
          embeddedSettlement?.depositReturnedAmount ??
          0
      ),
      depositDeductionAmount: Number(
        t.deposit_deduction_amount ??
          embeddedSettlement?.depositDeductionAmount ??
          0
      ),
      depositDamageNotes:
        t.deposit_damage_notes ?? embeddedSettlement?.depositDamageNotes ?? '',
      depositSettledAt:
        t.deposit_settled_at || embeddedSettlement?.depositSettledAt || undefined,
      depositSettledBy:
        t.deposit_settled_by || embeddedSettlement?.depositSettledBy || undefined,
      vehicleInfo: t.vehicle_info || 'None',
      leaseId: lease.lease_code || `LS-${t.tenant_ref}`,
      leaseCreatedDate: lease.created_at
        ? formatShortDate(new Date(lease.created_at))
        : formatShortDate(new Date(t.created_at || Date.now())),
      unitType: resolvedUnitType,
      unitNumber: resolvedUnitNumber,
      property: resolvedPropertyName,
      monthlyRent,
      rentBalance,
      totalPaid,
      dueDate: activeDueDate,
      moveInDate: moveInYmd,
      billingAnniversaryDay: currentCycle?.anniversaryDay ?? getBillingAnniversaryDay(moveInYmd) ?? undefined,
      currentBillingPeriodStart: currentCycle?.periodStart,
      currentBillingPeriodEnd: currentCycle?.periodEnd,
      nextBillingDate: nextBillingYmd || undefined,
      occupants: lease.occupants || '1 Adult',
      leaseDuration: lease.lease_duration || '12 Months',
      leaseStart: moveInYmd,
      leaseEnd: lease.lease_end || 'Active',
      leaseNotes: cleanLeaseNotes,
      perks: Array.isArray(lease.perks) ? lease.perks : [],
      baseRent,
      utilityPackage,
      maintenanceFee,
      parkingFee,
      paymentMethod: lease.payment_method || 'M-Pesa / Bank Transfer',
      status: derivedStatus,
      avatarBg: t.avatar_bg || '#D8F3E5',
      paymentHistory,
    };
  });

  const properties: PropertyRecord[] = propsRows.map((p) => {
    const prefix = String(p.code_prefix || 'A').trim();
    const propNameLower = String(p.name).trim().toLowerCase();
    const propUnitTypes = unitTypesRows.filter(
      (ut) =>
        ut.property_id === p.id ||
        String(ut.property_name).trim().toLowerCase() === propNameLower
    );
    const propTenants = tenants.filter(
      (t) =>
        t.tenancyStatus !== 'Vacated' &&
        (t.propertyId === p.id ||
          String(t.property).trim().toLowerCase() === propNameLower)
    );
    const activeDistinctTenantUnits = new Set(
      propTenants
        .map((t) => String(t.unitNumber || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const vacatedOnlyUnitKeys = new Set(
      tenants
        .filter(
          (t) =>
            t.tenancyStatus === 'Vacated' &&
            (t.propertyId === p.id ||
              String(t.property).trim().toLowerCase() === propNameLower)
        )
        .map((t) => String(t.unitNumber || '').trim().toLowerCase())
        .filter((uk) => uk && !activeDistinctTenantUnits.has(uk))
    );
    const propOccupiedUnits = unitsRows.filter((un) => {
      if (un.property_id !== p.id || un.status !== 'Occupied') return false;
      const uNumKey = String(un.unit_number || '').trim().toLowerCase();
      if (uNumKey && vacatedOnlyUnitKeys.has(uNumKey)) return false;
      return true;
    });
    const propPaidPayments = payments.filter(
      (pay) =>
        String(pay.property).trim().toLowerCase() === propNameLower &&
        pay.status === 'Paid' &&
        !isDepositTransaction(pay)
    );
    const unitTypeTotalSum = propUnitTypes.reduce(
      (s, u) => s + Math.max(0, Number(u.total_count || 0)),
      0
    );
    const unitTypeOccSum = propUnitTypes.reduce(
      (s, u) => s + Math.max(0, Number(u.occupied_count || 0)),
      0
    );
    const activeTenantUnitCount =
      activeDistinctTenantUnits.size > 0
        ? activeDistinctTenantUnits.size
        : propTenants.length;
    const totalUnits = Math.max(
      Number(p.total_units || 1),
      unitTypeTotalSum,
      activeTenantUnitCount
    );
    const rawOccupiedUnits =
      propUnitTypes.length > 0
        ? Math.max(unitTypeOccSum, activeTenantUnitCount)
        : unitsRows.some((un) => un.property_id === p.id)
        ? Math.max(propOccupiedUnits.length, activeTenantUnitCount)
        : tenants.some(
            (t) =>
              t.propertyId === p.id ||
              String(t.property).trim().toLowerCase() === propNameLower
          )
        ? activeTenantUnitCount
        : Number(p.occupied_units || 0);
    const occupiedUnits = Math.max(0, Math.min(totalUnits, rawOccupiedUnits));
    const paidSum = propPaidPayments.reduce(
      (s, pay) => s + Number(pay.amount || 0),
      0
    );
    const tenantRentSum = propTenants.reduce(
      (s, t) => s + Number(t.monthlyRent || 0),
      0
    );
    const unitTypeRentSum = propUnitTypes.reduce(
      (s, u) => s + Number(u.occupied_count || 0) * Number(u.monthly_rent || 0),
      0
    );
    const monthlyRevenue =
      paidSum > 0
        ? paidSum
        : tenantRentSum > 0
        ? tenantRentSum
        : unitTypeRentSum > 0
        ? unitTypeRentSum
        : Number(p.monthly_revenue || 0);
    const pImages: PropertyImageItem[] = propImagesRows
      .filter((img) => img.property_id === p.id)
      .map((img) => ({
        id: String(img.id),
        propertyId: String(img.property_id),
        imageUrl: String(img.image_url),
        storagePath: img.storage_path || undefined,
        isCover: Boolean(img.is_cover),
        displayOrder: Number(img.display_order || 0),
        caption: img.caption || '',
        createdAt: img.created_at,
      }));
    const coverImg =
      pImages.find((img) => img.isCover)?.imageUrl ||
      p.cover_image_url ||
      pImages[0]?.imageUrl ||
      '';
    const pCode = p.property_code || `${prefix}-001`;
    const pStatus =
      p.status || (occupiedUnits >= totalUnits ? 'Occupied' : 'Active');

    return {
      id: p.id,
      codePrefix: prefix,
      propertyCode: pCode,
      name: p.name,
      address: p.address,
      description: p.description || '',
      status: pStatus,
      coverImageUrl: coverImg,
      images: pImages,
      totalUnits,
      occupiedUnits,
      monthlyRevenue,
      manager: p.manager_name || 'Property Manager',
      rating: `${Number(p.rating || 5).toFixed(1)}/5`,
      variant: p.variant || 'deluxe',
      refRange: `${prefix}-001 – ${prefix}-${String(Math.max(1, totalUnits)).padStart(3, '0')}`,
      createdAt: p.created_at,
    };
  });

  let unitTypes: UnitTypeItem[] = unitTypesRows.map((u) => {
    const tot = Math.max(0, Number(u.total_count || 0));
    const occ = Math.max(0, Math.min(tot, Number(u.occupied_count || 0)));
    const resolvedProp = u.property_id ? propsById.get(u.property_id) : undefined;
    const computedStatus: UnitTypeItem['status'] =
      u.status === 'Inactive' || tot <= 0
        ? 'Inactive'
        : occ < tot
        ? 'Available'
        : 'Occupied';
    return {
      id: u.id,
      propertyId: u.property_id || resolvedProp?.id,
      name: u.name,
      property: resolvedProp?.name || u.property_name,
      variant: u.variant || 'deluxe',
      sizeSqm: Number(u.size_sqm || 65),
      bedrooms: u.bedrooms,
      maxTenants: Number(u.max_tenants || 2),
      occupiedCount: occ,
      totalCount: tot,
      status: computedStatus,
      monthlyRent: Number(u.monthly_rent || 0),
      description: u.description,
      longDescription: u.long_description || u.description,
      features: Array.isArray(u.features) ? u.features : [],
      amenities: Array.isArray(u.amenities) ? u.amenities : [],
    };
  });

  if (unitTypes.length === 0 && properties.length > 0) {
    const derivedCandidates = properties.map((p) => {
      const propUnits = unitsRows.filter(
        (un) =>
          un.property_id === p.id ||
          String(un.property_name || '')
            .trim()
            .toLowerCase() === String(p.name || '').trim().toLowerCase()
      );
      const propTenants = tenants.filter(
        (t) =>
          t.tenancyStatus !== 'Vacated' &&
          (t.propertyId === p.id ||
            String(t.property || '')
              .trim()
              .toLowerCase() === String(p.name || '').trim().toLowerCase())
      );
      const primaryUnit = propUnits[0];
      const primaryTenant = propTenants[0];
      const utName =
        primaryUnit?.unit_type_name ||
        primaryTenant?.unitType ||
        (p.variant === 'suite'
          ? 'Suite'
          : p.variant === 'standard'
          ? 'Standard'
          : 'Deluxe');
      const rentVal = Number(
        primaryUnit?.monthly_rent ||
          primaryTenant?.monthlyRent ||
          (p.occupiedUnits > 0
            ? Math.round(p.monthlyRevenue / p.occupiedUnits)
            : 35000)
      );
      const occ = Math.max(Number(p.occupiedUnits || 0), propTenants.length);
      const tot = Math.max(Number(p.totalUnits || 1), occ);
      const sizeSqm =
        p.variant === 'suite' ? 110 : p.variant === 'standard' ? 55 : 75;
      const bedrooms =
        utName.toLowerCase().includes('family') || p.variant === 'suite'
          ? '3 Bedrooms'
          : p.variant === 'standard'
          ? '1 Bedroom'
          : '2 Bedrooms';
      const maxTenants =
        utName.toLowerCase().includes('family') || p.variant === 'suite' ? 5 : 3;
      const status: UnitTypeItem['status'] =
        occ < tot ? 'Available' : 'Occupied';
      const description = `${utName} residential units at ${p.name} (${p.address}).`;
      const longDescription = `Modern ${utName} residential apartments at ${p.name} located in ${p.address}, managed by ${p.manager}.`;
      const features = [
        'Spacious Living Area',
        'Modern Kitchen',
        'Private Balcony',
        'High-Speed Fiber Ready',
      ];
      const amenities = [
        '24/7 Security',
        'Reliable Water Supply',
        'Resident Parking',
      ];
      return {
        property: p,
        payload: {
          property_id: p.id,
          property_name: p.name,
          name: utName,
          variant: (p.variant || 'deluxe') as UnitTypeItem['variant'],
          size_sqm: sizeSqm,
          bedrooms,
          max_tenants: maxTenants,
          monthly_rent: rentVal,
          occupied_count: occ,
          total_count: tot,
          status,
          description,
          long_description: longDescription,
          features,
          amenities,
        },
      };
    });

    let materializedRows: any[] = [];
    if (supabase) {
      try {
        const { data: existingCheck } = await supabase
          .from('unit_types')
          .select('*')
          .limit(100);
        if (Array.isArray(existingCheck) && existingCheck.length > 0) {
          materializedRows = existingCheck;
        } else {
          const { data: insertedRows, error: insErr } = await supabase
            .from('unit_types')
            .insert(derivedCandidates.map((c) => c.payload))
            .select('*');
          if (!insErr && Array.isArray(insertedRows) && insertedRows.length > 0) {
            materializedRows = insertedRows;
            await Promise.all(
              insertedRows.map((row: any) =>
                supabase!
                  .from('units')
                  .update({ unit_type_id: row.id })
                  .eq('property_id', row.property_id)
                  .is('unit_type_id', null)
              )
            ).catch(() => {});
          }
        }
      } catch {
        // Read-only fallback handled cleanly below
      }
    }

    if (materializedRows.length > 0) {
      unitTypes = materializedRows.map((u) => {
        const occ = Number(u.occupied_count || 0);
        const tot = Number(u.total_count || 0);
        const resolvedProp = u.property_id
          ? propsById.get(u.property_id)
          : undefined;
        const computedStatus: UnitTypeItem['status'] =
          u.status === 'Inactive' || tot <= 0
            ? 'Inactive'
            : occ < tot
            ? 'Available'
            : 'Occupied';
        return {
          id: u.id,
          propertyId: u.property_id || resolvedProp?.id,
          name: u.name,
          property: resolvedProp?.name || u.property_name,
          variant: u.variant || 'deluxe',
          sizeSqm: Number(u.size_sqm || 65),
          bedrooms: u.bedrooms,
          maxTenants: Number(u.max_tenants || 2),
          occupiedCount: occ,
          totalCount: Math.max(0, tot),
          status: computedStatus,
          monthlyRent: Number(u.monthly_rent || 0),
          description: u.description,
          longDescription: u.long_description || u.description,
          features: Array.isArray(u.features) ? u.features : [],
          amenities: Array.isArray(u.amenities) ? u.amenities : [],
        };
      });
    } else {
      unitTypes = derivedCandidates.map(({ property: p, payload }) => ({
        id: `ut-derived-${p.id}`,
        propertyId: p.id,
        name: payload.name,
        property: p.name,
        variant: payload.variant,
        sizeSqm: payload.size_sqm,
        bedrooms: payload.bedrooms,
        maxTenants: payload.max_tenants,
        occupiedCount: payload.occupied_count,
        totalCount: payload.total_count,
        status: payload.status,
        monthlyRent: payload.monthly_rent,
        description: payload.description,
        longDescription: payload.long_description,
        features: payload.features,
        amenities: payload.amenities,
      }));
    }
  }

  const maintenance: MaintenanceItem[] = maintRows.map((m) => ({
    id: m.id,
    unitNumber: m.unit_number,
    property: m.property_name,
    unitType: m.unit_type || 'Deluxe',
    maintenanceStatus: m.maintenance_status || 'Needs Inspection',
    priority: m.priority || 'Medium',
    assignedTo: m.assigned_to,
    notes: m.notes,
    tenantRef: m.tenant_ref,
    selected: Boolean(m.selected),
    createdAt: m.created_at,
  }));

  const threads: ChatThread[] = threadsRows.map((th) => ({
    id: th.id,
    tenantRef: th.tenant_ref,
    tenantName: th.tenant_name,
    unitNumber: th.unit_number,
    property: th.property_name,
    avatarBg: th.avatar_bg || '#D8F3E5',
    lastMessage: th.last_message,
    time: th.last_time,
    unread: Number(th.unread_count || 0),
    email: th.email,
    phone: th.phone,
    bio: th.bio || '',
    documents: Array.isArray(th.documents) ? th.documents : [],
    messages: Array.isArray(th.messages) ? th.messages : [],
  }));

  const expenses: ExpenseTransaction[] = expensesRows.map((e) => ({
    id: e.id,
    expense: e.expense_title,
    category: e.category,
    property: e.property_name,
    quantity: Number(e.quantity || 1),
    amount: Number(e.amount || 0),
    date: e.expense_date,
    status: e.status || 'Completed',
    createdAt: e.created_at,
  }));

  const tasks: DashboardTaskRecord[] = tasksRows.map((tk) => ({
    id: tk.id,
    date: tk.scheduled_date,
    title: tk.title,
    tone: tk.tone || 'mint',
    done: Boolean(tk.done),
  }));

  const reviews: PropertyReviewRecord[] = reviewsRows.map((rv) => ({
    id: rv.id,
    propertyName: rv.property_name,
    tenantRef: rv.tenant_ref,
    tenantName: rv.tenant_name,
    overallScore: Number(rv.overall_score || 5),
    maintenanceScore: Number(rv.maintenance_score || 5),
    cleanlinessScore: Number(rv.cleanliness_score || 5),
    managementScore: Number(rv.management_score || 5),
    comfortScore: Number(rv.comfort_score || 5),
    locationScore: Number(rv.location_score || 5),
    comment: rv.comment || '',
    createdAt: rv.created_at,
  }));

  const activities: ActivityLogRecord[] = activitiesRows.map((ac) => ({
    id: ac.id,
    activityType: ac.activity_type || 'lease',
    title: ac.title,
    description: ac.description,
    time: formatTimeAgo(ac.created_at),
    tone: ac.tone || 'mint',
    tenantRef: ac.tenant_ref || undefined,
  }));

  const securityLogs: SecurityAuditLogRecord[] = (secRes.data || []).map(
    (s: any) => ({
      id: s.id,
      eventType: s.event_type || 'login_success',
      actorEmail: s.actor_email,
      targetEmail: s.target_email,
      roleLabel: s.role_label,
      portal: s.portal || 'management',
      ipAddress: s.ip_address || '127.0.0.1',
      description: s.description,
      severity: s.severity || 'info',
      createdAt: s.created_at
        ? new Date(s.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    })
  );

  const brandedEmails: BrandedEmailRecord[] = (emRes.data || []).map(
    (em: any) => ({
      id: em.id,
      templateType: em.template_type || 'invitation',
      recipientEmail: em.recipient_email,
      recipientName: em.recipient_name,
      subject: em.subject,
      htmlBody: em.body_html || '',
      bodyHtml: em.body_html || '',
      status: em.status || 'Dispatched',
      createdAt: em.created_at
        ? new Date(em.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    })
  );

  const smsLogs: SmsLogRecord[] = (smsLogsRes.data || []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id || undefined,
    tenantRef: row.tenant_ref || 'A-001',
    tenantName: row.tenant_name || 'Resident',
    recipientPhone: row.recipient_phone || '',
    propertyName: row.property_name || 'Main Property',
    unitNumber: row.unit_number || 'Unit 101',
    triggerType: row.trigger_type || 'individual_sms',
    messageBody: row.message_body || '',
    status: row.status || 'Delivered',
    environment: row.environment === 'production' ? 'production' : 'sandbox',
    provider: row.provider || 'Standard SMS Gateway',
    providerMessageId: row.provider_message_id || undefined,
    deliveryStatus: row.delivery_status || row.status || 'Pending',
    deliveredAt: row.delivered_at || undefined,
    providerStatusCode:
      row.provider_status_code !== undefined && row.provider_status_code !== null
        ? Number(row.provider_status_code)
        : undefined,
    providerCost: row.provider_cost || 'KES 0.80',
    costKes: row.cost_kes || '0.8000',
    apiResponse:
      typeof row.api_response === 'object' && row.api_response !== null
        ? row.api_response
        : {},
    errorMessage: row.error_message || undefined,
    dedupeKey: row.dedupe_key || undefined,
    paymentId: row.payment_id || undefined,
    sentBy: row.sent_by || 'System Automation',
    createdAt: row.created_at || new Date().toISOString(),
  }));

  const supaSmsRow: any = smsSetRes.data;
  const smsSettings: SmsNotificationSettings = supaSmsRow
    ? {
        environment:
          supaSmsRow.environment === 'production' ? 'production' : 'sandbox',
        senderId: supaSmsRow.sender_id || 'ARABELLA',
        username: supaSmsRow.username || 'ARAbella agency',
        channel: supaSmsRow.channel || 'sms',
        smsType:
          supaSmsRow.sms_type === 'transactional'
            ? 'transactional'
            : 'promotional',
        provider: supaSmsRow.provider || 'Standard SMS Gateway',
        apiKeyConfigured: true,
        masterEnabled: Boolean(supaSmsRow.master_enabled),
        autoTenantRegistered: Boolean(supaSmsRow.auto_tenant_registered),
        autoRentDueSoon: Boolean(supaSmsRow.auto_rent_due_soon),
        autoRentOverdue: Boolean(supaSmsRow.auto_rent_overdue),
        autoPaymentConfirmed: Boolean(supaSmsRow.auto_payment_confirmed),
        autoAdminAnnouncement: Boolean(supaSmsRow.auto_admin_announcement),
        preventDuplicatesHours: Number(
          supaSmsRow.prevent_duplicates_hours || 24
        ),
        updatedBy: supaSmsRow.updated_by || 'Super Admin',
        updatedAt: supaSmsRow.updated_at || new Date().toISOString(),
      }
    : {
        environment: 'sandbox',
        senderId: 'ARABELLA',
        username: 'ARAbella agency',
        channel: 'sms',
        smsType: 'promotional',
        provider: 'Standard SMS Gateway',
        apiKeyConfigured: false,
        masterEnabled: true,
        autoTenantRegistered: true,
        autoRentDueSoon: true,
        autoRentOverdue: true,
        autoPaymentConfirmed: true,
        autoAdminAnnouncement: true,
        preventDuplicatesHours: 24,
        updatedBy: 'System Default',
        updatedAt: new Date().toISOString(),
      };

  if (
    !activeSession?.user &&
    propsRows.length === 0 &&
    tenantsRows.length === 0 &&
    paymentsRows.length === 0
  ) {
    throw createDiagnosticError({
      failedRequest: 'GET Supabase Bootstrap (Unauthenticated Session)',
      statusCode: 401,
      endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
      supabaseError:
        'No active authenticated Supabase session found to read protected portfolio records.',
      category: 'Authentication',
      hint: 'Please sign in to load your properties, tenants, and payment records.',
    });
  }

  const resolvedUser = activeSession?.user
    ? await resolveSupabaseUserSession(activeSession.user, accessToken, {
        roleOverride: currentRole || undefined,
      })
    : users.find(
        (u) =>
          (currentUserId && u.id === currentUserId) ||
          (currentEmail && u.email.toLowerCase() === currentEmail.toLowerCase())
      ) || users[0];

  if (!resolvedUser) {
    throw createDiagnosticError({
      failedRequest: 'Resolve User Profile from public.profiles',
      statusCode: 404,
      endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
      supabaseError:
        'Authenticated user profile was not found in public.profiles.',
      category: 'Database Access',
      hint: 'Verify that migration 001_rental_management_schema.sql has been executed in your Supabase SQL Editor.',
    });
  }

  const analytics = computeRealAnalytics(
    properties,
    unitTypes,
    tenants,
    payments,
    expenses,
    maintenance,
    reviews
  );

  if (resolvedUser.role === 'tenant') {
    const myRef = resolvedUser.tenantRef || tenants[0]?.tenantRef || '';
    return {
      user: resolvedUser,
      users: [],
      properties,
      unitTypes,
      tenants: myRef ? tenants.filter((t) => t.tenantRef === myRef) : [],
      payments: myRef ? payments.filter((p) => p.tenantRef === myRef) : [],
      maintenance: myRef
        ? maintenance.filter((m) => m.tenantRef === myRef)
        : [],
      threads: myRef ? threads.filter((th) => th.tenantRef === myRef) : [],
      expenses: [],
      tasks,
      reviews,
      activities: activities.filter((a) => !a.tenantRef || a.tenantRef === myRef),
      securityLogs: [],
      brandedEmails: [],
      smsLogs: myRef
        ? smsLogs.filter(
            (s) => s.tenantRef.toUpperCase() === myRef.toUpperCase()
          )
        : [],
      smsSettings,
      analytics,
    };
  }

  return {
    user: resolvedUser,
    users,
    properties,
    unitTypes,
    tenants,
    payments,
    maintenance,
    threads,
    expenses,
    tasks,
    reviews,
    activities,
    securityLogs,
    brandedEmails,
    smsLogs,
    smsSettings,
    analytics,
  };
}

/**
 * Synchronizes properties.occupied_units in Supabase with the property's unit_types and active leases/tenants
 * while keeping total_units unchanged.
 */
async function syncSupabasePropertyOccupancy(
  propertyId?: string | null,
  propertyName?: string | null
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || (!propertyId && !propertyName)) return;
  try {
    let propRow: any = null;
    if (propertyId) {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .maybeSingle();
      propRow = data;
    }
    if (!propRow && propertyName) {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .ilike('name', String(propertyName).trim())
        .maybeSingle();
      propRow = data;
    }
    if (!propRow) return;

    const [{ data: utRows }, { data: leaseRows }] = await Promise.all([
      supabase.from('unit_types').select('*').eq('property_id', propRow.id),
      supabase
        .from('leases')
        .select('unit_number, is_active')
        .ilike('property_name', propRow.name)
        .eq('is_active', true),
    ]);

    const utList = Array.isArray(utRows) ? utRows : [];
    const activeUnitSet = new Set(
      (Array.isArray(leaseRows) ? leaseRows : [])
        .map((l: any) => String(l.unit_number || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const utTotalSum = utList.reduce(
      (s: number, u: any) => s + Math.max(0, Number(u.total_count || 0)),
      0
    );
    const utOccSum = utList.reduce(
      (s: number, u: any) => s + Math.max(0, Number(u.occupied_count || 0)),
      0
    );
    const totalUnits = Math.max(
      Number(propRow.total_units || 1),
      utTotalSum,
      activeUnitSet.size
    );
    const rawOcc =
      utList.length > 0 ? Math.max(utOccSum, activeUnitSet.size) : activeUnitSet.size;
    const occupiedUnits = Math.max(0, Math.min(totalUnits, rawOcc));
    const nextStatus =
      propRow.status === 'Maintenance'
        ? 'Maintenance'
        : occupiedUnits >= totalUnits
        ? 'Occupied'
        : 'Active';

    await supabase
      .from('properties')
      .update({
        occupied_units: occupiedUnits,
        status: nextStatus,
      })
      .eq('id', propRow.id);
  } catch {
    // Non-fatal occupancy sync fallback
  }
}

/**
 * HTTP API helper for local Express server or Vercel Serverless API routes (/api/*).
 * Includes rich diagnostic error formatting so 404s or server errors are immediately identifiable.
 */
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  let bearerToken = getStoredToken();
  if ((!bearerToken || !isRealSessionToken(bearerToken)) && supabase) {
    const sessionRes = await Promise.race([
      supabase.auth.getSession().catch(() => ({ data: null })),
      new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 2500)),
    ]);
    if (sessionRes?.data?.session?.access_token) {
      bearerToken = sessionRes.data.session.access_token;
    }
  }

  const buildHeaders = (tokenOverride?: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(currentUserId ? { 'X-User-Id': currentUserId } : {}),
    ...(currentEmail ? { 'X-User-Email': currentEmail } : {}),
    ...(currentRole ? { 'X-User-Role': currentRole } : {}),
    ...(currentTenantRef ? { 'X-Tenant-Ref': currentTenantRef } : {}),
    ...(tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  });

  const fetchWithTimeout = async (tokenOverride?: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timeoutMs = 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    try {
      return await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: buildHeaders(tokenOverride),
      });
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(bearerToken);
    if (response.status === 401 && supabase) {
      const { data } = await Promise.race([
        supabase.auth.getSession().catch(() => ({ data: null })),
        new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 2500)),
      ]);
      const freshJwt = data?.session?.access_token;
      if (freshJwt && freshJwt !== bearerToken) {
        bearerToken = freshJwt;
        response = await fetchWithTimeout(freshJwt);
      }
    }
  } catch (networkErr: any) {
    const isAbort = networkErr?.name === 'AbortError';
    throw createDiagnosticError({
      failedRequest: `${method} ${path}`,
      statusCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      endpoint: path,
      supabaseError: isAbort
        ? `Request to ${path} timed out after 15 seconds.`
        : networkErr?.message || 'Network request failed.',
      category: 'Routing',
      hint: isAbort
        ? 'The server took too long to respond. Retry or verify backend database connectivity.'
        : 'Check network connectivity and verify that your Supabase URL and API endpoints are reachable.',
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const isPublicAuthAction =
      path === '/api/auth/login' ||
      path === '/api/auth/setup-password' ||
      path === '/api/auth/recover-password' ||
      path.startsWith('/api/auth/validate-invite');

    if (response.status === 401 && !isPublicAuthAction) {
      let hasLiveSupabaseSession = false;
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
        hasLiveSupabaseSession = Boolean(data?.session?.access_token);
      }
      if (!hasLiveSupabaseSession) {
        await clearAuthContext({ skipSupabaseSignOut: true });
        if (unauthorizedHandler && path !== '/api/bootstrap') {
          unauthorizedHandler();
        }
      }
    }

    if (response.status === 404 && !payload?.error) {
      const configDiag = getSupabaseConfigDiagnostics();
      throw createDiagnosticError({
        failedRequest: `${method} ${path}`,
        statusCode: 404,
        endpoint:
          typeof window !== 'undefined'
            ? `${window.location.origin}${path}`
            : path,
        supabaseError:
          configDiag.issueSummary ||
          `Endpoint ${path} returned HTTP 404 Not Found on Vercel.`,
        category: !isSupabaseConfigured ? 'Environment Variables' : 'Routing',
        hint: !isSupabaseConfigured
          ? 'The app fell back to /api/* on Vercel because VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in the frontend build. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel -> Settings -> Environment Variables and redeploy.'
          : 'Ensure vercel.json rewrites /api/(.*) to /api/index.ts or execute this operation directly via Supabase.',
      });
    }

    throw createDiagnosticError({
      failedRequest: `${method} ${path}`,
      statusCode: response.status,
      endpoint: path,
      supabaseError:
        payload.error ||
        payload.message ||
        `Request failed with status code ${response.status}`,
      category:
        response.status === 401 || response.status === 403 || path.startsWith('/api/auth')
          ? 'Authentication'
          : 'Database Access',
    });
  }
  return payload as T;
}

/**
 * Helper to log activity in Supabase when operating in direct Supabase mode.
 */
async function logSupabaseActivity(
  activityType: string,
  title: string,
  description: string,
  actorName: string,
  tenantRef?: string,
  tone: 'mint' | 'lime' = 'mint'
) {
  if (!supabase) return;
  await supabase
    .from('activity_logs')
    .insert({
      activity_type: activityType,
      title,
      description,
      actor_name: actorName,
      tenant_ref: tenantRef || null,
      tone,
    })
    .then(
      () => {},
      () => {}
    );
}

export interface BootstrapPayload {
  user: UserSession;
  users: UserSession[];
  properties: PropertyRecord[];
  unitTypes: UnitTypeItem[];
  tenants: TenantProfile[];
  payments: RentPaymentRecord[];
  maintenance: MaintenanceItem[];
  threads: ChatThread[];
  expenses: ExpenseTransaction[];
  tasks: DashboardTaskRecord[];
  reviews: PropertyReviewRecord[];
  activities: ActivityLogRecord[];
  securityLogs?: SecurityAuditLogRecord[];
  brandedEmails?: BrandedEmailRecord[];
  emailSettings?: EmailNotificationSettings;
  smsLogs?: SmsLogRecord[];
  smsSettings?: SmsNotificationSettings;
  systemSettings?: SystemSettingsRecord | null;
  userPreferences?: UserAppearancePreferences | null;
  analytics: DashboardAnalytics;
}

export const rentalApi = {
  getBootstrap: async (): Promise<BootstrapPayload> => {
    let apiData: BootstrapPayload | null = null;
    try {
      apiData = await apiRequest<BootstrapPayload>('/api/bootstrap');
      if (
        apiData &&
        (apiData.properties.length > 0 ||
          apiData.tenants.length > 0 ||
          apiData.payments.length > 0 ||
          !isSupabaseConfigured ||
          !supabase)
      ) {
        return apiData;
      }
    } catch (apiErr) {
      if (!isSupabaseConfigured || !supabase) {
        throw apiErr;
      }
    }
    try {
      const supaData = await fetchBootstrapFromSupabase();
      if (
        apiData &&
        supaData.properties.length === 0 &&
        supaData.tenants.length === 0 &&
        supaData.payments.length === 0
      ) {
        return apiData;
      }
      return supaData;
    } catch (supaErr) {
      if (apiData) {
        return apiData;
      }
      throw supaErr;
    }
  },

  getSession: async (): Promise<{ authenticated: boolean; user: UserSession }> => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session?.user) {
        const user = await resolveSupabaseUserSession(
          data.session.user,
          data.session.access_token
        );
        return { authenticated: true, user };
      }
      if (getStoredToken()) {
        try {
          return await apiRequest<{ authenticated: boolean; user: UserSession }>(
            '/api/auth/session'
          );
        } catch {
          // Fall through to diagnostic error
        }
      }
      throw createDiagnosticError({
        failedRequest: 'GET Supabase Auth Session (supabase.auth.getSession)',
        statusCode: (error as any)?.status || 401,
        endpoint: getSanitizedSupabaseEndpoint('/auth/v1/user'),
        supabaseError: error?.message || 'No active Supabase authentication session.',
        category: 'Authentication',
      });
    }
    return await apiRequest<{ authenticated: boolean; user: UserSession }>(
      '/api/auth/session'
    );
  },

  login: async (
    email: string,
    password: string,
    role?: UserRole,
    options?: {
      portal?: 'management' | 'tenant';
      rememberMe?: boolean;
      mfaCode?: string;
    }
  ): Promise<{
    user?: UserSession;
    mfaRequired?: boolean;
    mfaChallengeCode?: string;
    message?: string;
  }> => {
    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const authEndpoint = getSanitizedSupabaseEndpoint(
        '/auth/v1/token?grant_type=password'
      );

      const { data: signInData, error: signInErr } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: String(password),
        });

      if (signInErr || !signInData?.user) {
        try {
          const backendLogin = await apiRequest<{
            user?: UserSession;
            mfaRequired?: boolean;
            mfaChallengeCode?: string;
            message?: string;
          }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: cleanEmail,
              password,
              role,
              portal: options?.portal,
              rememberMe: options?.rememberMe,
              mfaCode: options?.mfaCode,
            }),
          });
          if (backendLogin?.user) {
            await supabase.auth
              .signInWithPassword({
                email: cleanEmail,
                password: String(password),
              })
              .catch(() => {});
          }
          return backendLogin;
        } catch {
          // Fall through to throw Supabase diagnostic error
        }

        const statusCode = (signInErr as any)?.status || 400;
        const rawErrMsg =
          signInErr?.message || 'Invalid login credentials returned by Supabase Auth.';

        const is404 =
          statusCode === 404 ||
          rawErrMsg.includes('404') ||
          rawErrMsg.toLowerCase().includes('not found');

        throw createDiagnosticError({
          failedRequest: 'POST Supabase Auth (supabase.auth.signInWithPassword)',
          statusCode,
          endpoint: authEndpoint,
          supabaseError: rawErrMsg,
          category: is404 ? 'Environment Variables' : 'Authentication',
          hint: is404
            ? 'Supabase Auth endpoint returned 404. Verify that VITE_SUPABASE_URL is set to https://<project-ref>.supabase.co with no extra path segments.'
            : 'Verify that the user email and password exist in Supabase Authentication -> Users and Email confirmation is completed.',
        });
      }

      const accessToken =
        signInData.session?.access_token || signInData.user.id;
      const userSession = await resolveSupabaseUserSession(
        signInData.user,
        accessToken,
        {
          roleOverride: role,
          portal: options?.portal,
        }
      );

      if (
        userSession.status === 'Suspended' ||
        userSession.status === 'Deactivated'
      ) {
        await supabase.auth.signOut().catch(() => {});
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Auth Login (Account Status Check)',
          statusCode: 403,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: `Sign-In Blocked: Your account (${cleanEmail}) is currently ${userSession.status}.`,
          category: 'Authentication',
        });
      }

      const nowIso = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({ last_login_at: nowIso, updated_at: nowIso })
        .eq('id', userSession.id)
        .then(
          () => {},
          () => {}
        );

      await supabase
        .from('security_audit_logs')
        .insert({
          event_type: 'login_success',
          actor_email: cleanEmail,
          role_label: userSession.roleLabel,
          portal: options?.portal || 'management',
          description: `${userSession.fullName} (${userSession.roleLabel}) signed in via Supabase Auth.`,
          severity: 'info',
        })
        .then(
          () => {},
          () => {}
        );

      return {
        user: {
          ...userSession,
          lastLoginAt: nowIso,
        },
      };
    }

    return await apiRequest<{
      user?: UserSession;
      mfaRequired?: boolean;
      mfaChallengeCode?: string;
      message?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        password,
        role,
        portal: options?.portal,
        rememberMe: options?.rememberMe,
        mfaCode: options?.mfaCode,
      }),
    });
  },

  logout: async (): Promise<{ success: boolean }> => {
    const token = getStoredToken();
    if (token && token.startsWith('rtk_')) {
      await apiRequest<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
      }).catch(() => {});
    }
    if (isSupabaseConfigured && supabase && !isClearingAuth) {
      isClearingAuth = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
          console.warn('[Supabase Auth signOut warning]', error.message);
        }
      } finally {
        isClearingAuth = false;
      }
      return { success: true };
    }
    return { success: true };
  },

  validateInvite: async (
    email: string,
    token: string
  ): Promise<{
    valid: boolean;
    email: string;
    fullName: string;
    roleLabel: string;
    jobTitle?: string;
    assignedPropertyName?: string;
    expiresAt?: string;
    message: string;
  }> => {
    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();
    const cleanToken = String(token || '')
      .trim()
      .toUpperCase();

    if (isSupabaseConfigured && supabase) {
      const [profRes, invRes] = await Promise.all([
        supabase.from('profiles').select('*').ilike('email', cleanEmail).maybeSingle(),
        supabase
          .from('staff_invitations')
          .select('*')
          .ilike('email', cleanEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const profRow: any = profRes.data;
      const invRow: any = invRes.data;

      if (!profRow && !invRow) {
        throw createDiagnosticError({
          failedRequest: 'GET Supabase Invite Validation',
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError:
            'No pending management invitation found for this email address.',
          category: 'Authentication',
        });
      }

      const storedToken = String(
        profRow?.invite_token || profRow?.invite_token_hash || invRow?.token_hash || ''
      )
        .trim()
        .toUpperCase();

      if (profRow?.invite_revoked || invRow?.revoked_at) {
        throw createDiagnosticError({
          failedRequest: 'GET Supabase Invite Validation',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/staff_invitations'),
          supabaseError: 'This invitation has been revoked by the Super Admin.',
          category: 'Authentication',
        });
      }

      if (storedToken && storedToken !== cleanToken) {
        throw createDiagnosticError({
          failedRequest: 'GET Supabase Invite Validation',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/staff_invitations'),
          supabaseError: 'Invalid invitation or recovery code.',
          category: 'Authentication',
        });
      }

      const staffRole: UserRole =
        (profRow?.role as UserRole) || (invRow?.role as UserRole) || 'property_manager';

      return {
        valid: true,
        email: cleanEmail,
        fullName: profRow?.full_name || cleanEmail.split('@')[0],
        roleLabel: getRoleDisplayLabel(staffRole),
        jobTitle: profRow?.job_title || invRow?.job_title,
        assignedPropertyName:
          profRow?.assigned_property_name ||
          invRow?.assigned_property_name ||
          'All Properties',
        expiresAt: profRow?.invite_expires_at || invRow?.expires_at,
        message: 'Invitation verified! Please create your password below.',
      };
    }

    return await apiRequest(
      `/api/auth/validate-invite?email=${encodeURIComponent(
        cleanEmail
      )}&token=${encodeURIComponent(cleanToken)}`
    );
  },

  signup: async (
    fullName: string,
    email: string,
    password: string,
    role: UserRole
  ): Promise<{ user: UserSession }> => {
    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();
    const cleanName = String(fullName || '').trim();

    if (isSupabaseConfigured && supabase) {
      if (isManagementRole(role)) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Auth SignUp',
          statusCode: 403,
          endpoint: getSanitizedSupabaseEndpoint('/auth/v1/signup'),
          supabaseError:
            'Public self-registration for management roles is disabled. Management accounts must be invited by the Super Admin.',
          category: 'Authentication',
        });
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: String(password),
        options: {
          data: {
            full_name: cleanName,
            staff_role: role,
            account_status: 'Active',
          },
        },
      });

      if (signUpErr || !signUpData?.user) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Auth (supabase.auth.signUp)',
          statusCode: (signUpErr as any)?.status || 400,
          endpoint: getSanitizedSupabaseEndpoint('/auth/v1/signup'),
          supabaseError:
            signUpErr?.message || 'Failed to register user in Supabase Auth.',
          category: 'Authentication',
        });
      }

      const { data: matchedTenant } = await supabase
        .from('tenants')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        email: cleanEmail,
        full_name: cleanName,
        role: toDbRole(role),
        account_status: 'Active',
        tenant_ref: matchedTenant?.tenant_ref || null,
        avatar_bg: '#D8F3E5',
      });

      const accessToken =
        signUpData.session?.access_token || signUpData.user.id;
      const user = await resolveSupabaseUserSession(
        signUpData.user,
        accessToken,
        { roleOverride: role }
      );
      return { user };
    }

    return await apiRequest<{ user: UserSession }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName: cleanName, email: cleanEmail, password, role }),
    });
  },

  setupPassword: async (data: {
    email: string;
    password: string;
    inviteToken?: string;
  }): Promise<{
    user: UserSession;
    message: string;
    redirectToLogin?: boolean;
    portal?: 'management' | 'tenant';
  }> => {
    const cleanEmail = String(data.email || '')
      .trim()
      .toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const { data: profRow } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (data.inviteToken) {
        await rentalApi.validateInvite(cleanEmail, data.inviteToken);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const nowIso = new Date().toISOString();

      if (sessionData?.session?.user) {
        const { error: updErr } = await supabase.auth.updateUser({
          password: data.password,
          data: {
            account_status: 'Active',
            password_set: true,
            invite_used: true,
            activated_at: nowIso,
          },
        });
        if (updErr) {
          throw createDiagnosticError({
            failedRequest: 'PUT Supabase Auth UpdateUser (setupPassword)',
            statusCode: (updErr as any)?.status || 400,
            endpoint: getSanitizedSupabaseEndpoint('/auth/v1/user'),
            supabaseError: updErr.message,
            category: 'Authentication',
          });
        }
      } else {
        // Attempt signUp for invited user setting password for the first time
        const { error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password: data.password,
          options: {
            data: {
              full_name: profRow?.full_name || cleanEmail.split('@')[0],
              staff_role: profRow?.role || 'property_manager',
              account_status: 'Active',
              password_set: true,
              invite_used: true,
              activated_at: nowIso,
            },
          },
        });
        if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) {
          throw createDiagnosticError({
            failedRequest: 'POST Supabase Auth Activate Account',
            statusCode: (signUpErr as any)?.status || 400,
            endpoint: getSanitizedSupabaseEndpoint('/auth/v1/signup'),
            supabaseError: signUpErr.message,
            category: 'Authentication',
          });
        }
      }

      if (profRow?.id) {
        await supabase
          .from('profiles')
          .update({
            account_status: 'Active',
            activated_at: nowIso,
            invite_token_hash: null,
            invite_used: true,
            invite_revoked: false,
          })
          .eq('id', profRow.id);
      }

      await supabase
        .from('staff_invitations')
        .update({ status: 'Accepted', used_at: nowIso })
        .ilike('email', cleanEmail)
        .then(
          () => {},
          () => {}
        );

      return {
        user: undefined as any,
        redirectToLogin: true,
        message:
          'Your password has been set and your account is now Active in Supabase. Please sign in with your new credentials.',
      };
    }

    return await apiRequest('/api/auth/setup-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  recoverPassword: async (
    email: string,
    portal?: 'management' | 'tenant'
  ): Promise<{
    success: boolean;
    message: string;
    recoveryToken?: string;
    recoveryLink?: string;
  }> => {
    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/activate-invite`
          : '/activate-invite';

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        throw createDiagnosticError({
          failedRequest:
            'POST Supabase Auth (supabase.auth.resetPasswordForEmail)',
          statusCode: (error as any)?.status || 400,
          endpoint: getSanitizedSupabaseEndpoint('/auth/v1/recover'),
          supabaseError: error.message,
          category: 'Authentication',
        });
      }

      const recoveryToken = `REC-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;
      const expiresIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await supabase
        .from('profiles')
        .update({
          invite_token_hash: recoveryToken,
          invite_expires_at: expiresIso,
          invite_used: false,
          invite_revoked: false,
        })
        .ilike('email', cleanEmail)
        .then(
          () => {},
          () => {}
        );

      return {
        success: true,
        message:
          'A password recovery link has been dispatched via Supabase Auth to your email address.',
        recoveryToken,
      };
    }

    return await apiRequest('/api/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, portal }),
    });
  },

  switchRole: async (
    role: UserRole,
    userId?: string
  ): Promise<{ user: UserSession }> => {
    if (isSupabaseConfigured && supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken =
        sessionData?.session?.access_token || getStoredToken() || '';

      if (userId) {
        const { data: targetProf } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (targetProf) {
          const targetRole = (targetProf.role as UserRole) || role;
          const user: UserSession = {
            id: targetProf.id,
            email: targetProf.email,
            fullName: targetProf.full_name || targetProf.email,
            role: targetRole,
            roleLabel: getRoleDisplayLabel(targetRole, targetProf.tenant_ref),
            status: (targetProf.account_status as AccountStatus) || 'Active',
            permissions: getAllowedPagesForRole(targetRole),
            tenantRef: targetProf.tenant_ref || undefined,
            avatarBg: targetProf.avatar_bg || '#D5F267',
            token: accessToken,
          };
          return { user };
        }
      }

      let tenantRef: string | undefined = undefined;
      if (role === 'tenant') {
        const { data: firstTenant } = await supabase
          .from('tenants')
          .select('tenant_ref')
          .order('tenant_ref', { ascending: true })
          .limit(1)
          .maybeSingle();
        tenantRef = firstTenant?.tenant_ref;
      }

      const user = await resolveSupabaseUserSession(
        sessionData?.session?.user || { id: currentUserId, email: currentEmail },
        accessToken,
        { roleOverride: role }
      );
      return {
        user: {
          ...user,
          role,
          roleLabel: getRoleDisplayLabel(role, tenantRef || user.tenantRef),
          permissions: getAllowedPagesForRole(role),
          tenantRef: tenantRef || user.tenantRef,
        },
      };
    }

    return await apiRequest<{ user: UserSession }>('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role, userId }),
    });
  },

  // Staff Accounts & Access Management CRUD
  createStaff: async (data: {
    fullName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    role: UserRole;
    assignedPropertyId?: string;
    assignedPropertyName?: string;
    assignedPropertyIds?: string[];
    customPermissions?: string[];
    mfaEnabled?: boolean;
    status?: AccountStatus;
  }) => {
    // 1. Prioritize full-stack backend endpoint to guarantee that a branded role assignment
    // and setup invitation email is dispatched to the recipient's email address via Resend.
    try {
      const serverRes = await apiRequest<{
        staff: UserSession;
        message: string;
        inviteToken?: string;
        inviteLink?: string;
        resendId?: string;
        deliveryStatus?: string;
        brandedEmail?: BrandedEmailRecord;
      }>('/api/staff', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (serverRes?.staff) {
        return serverRes;
      }
    } catch (backendErr: any) {
      console.warn(
        '[createStaff] Backend route unavailable, falling back to direct Supabase client:',
        backendErr?.message || backendErr
      );
    }

    if (isSupabaseConfigured && supabase) {
      const cleanEmail = String(data.email).trim().toLowerCase();
      const cleanName = String(data.fullName).trim();
      const inviteToken = `INV-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(
        Date.now() + 72 * 60 * 60 * 1000
      ).toISOString();
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const inviteLink = `${origin}/activate-invite?email=${encodeURIComponent(
        cleanEmail
      )}&token=${inviteToken}`;

      const { data: existingProf } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      const staffId = existingProf?.id || crypto.randomUUID();
      const cleanJobTitle =
        data.jobTitle || getRoleDisplayLabel(data.role);
      const assignedPropName =
        data.assignedPropertyName || 'All Properties';

      const profileRecord = {
        id: staffId,
        email: cleanEmail,
        full_name: cleanName,
        phone: data.phone || '',
        role: toDbRole(data.role),
        job_title: cleanJobTitle,
        account_status: data.status || 'Pending Invitation',
        assigned_property_id: data.assignedPropertyId || null,
        assigned_property_name: assignedPropName,
        assigned_property_ids: data.assignedPropertyIds || [],
        custom_permissions: data.customPermissions || [],
        mfa_enabled: Boolean(data.mfaEnabled),
        invite_token_hash: inviteToken,
        invite_expires_at: expiresIso,
        invite_used: false,
        invite_revoked: false,
        invited_at: nowIso,
        updated_at: nowIso,
      };

      const { error: profErr } = await supabase
        .from('profiles')
        .upsert(profileRecord);
      if (profErr) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Staff (public.profiles)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: profErr.message,
          category: 'Database Access',
        });
      }

      await supabase
        .from('staff_invitations')
        .insert({
          staff_id: staffId,
          email: cleanEmail,
          role: data.role,
          job_title: cleanJobTitle,
          assigned_property_id: data.assignedPropertyId || null,
          assigned_property_name: assignedPropName,
          token_hash: inviteToken,
          status: 'Pending',
          expires_at: expiresIso,
          invited_by: currentEmail || 'Super Administrator',
          delivery_status: 'Sent',
          delivered_at: nowIso,
          invite_url: inviteLink,
        })
        .then(
          () => {},
          () => {}
        );

      const staffSession: UserSession = {
        id: staffId,
        email: cleanEmail,
        fullName: cleanName,
        phone: data.phone || '',
        jobTitle: cleanJobTitle,
        role: data.role,
        roleLabel: getRoleDisplayLabel(data.role),
        status: (data.status as AccountStatus) || 'Pending Invitation',
        invitationStatus: 'Pending',
        invitationDeliveryStatus: 'Delivered',
        invitationDeliveredAt: nowIso,
        assignedPropertyId: data.assignedPropertyId,
        assignedPropertyName: assignedPropName,
        assignedPropertyIds: data.assignedPropertyIds || [],
        invitedAt: nowIso,
        inviteExpiresAt: expiresIso,
        inviteToken,
        inviteUrl: inviteLink,
        mfaEnabled: Boolean(data.mfaEnabled),
        permissions:
          data.customPermissions && data.customPermissions.length > 0
            ? data.customPermissions
            : getAllowedPagesForRole(data.role),
        token: staffId,
      };

      return {
        staff: staffSession,
        inviteLink,
        deliveryStatus: 'Sent',
        message: `Staff invitation created in Supabase for ${cleanEmail} with setup code ${inviteToken}.`,
      };
    }

    return await apiRequest<{
      staff: UserSession;
      message: string;
      inviteLink?: string;
      resendId?: string;
      deliveryStatus?: string;
      brandedEmail?: BrandedEmailRecord;
    }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStaff: async (
    id: string,
    data: Partial<{
      fullName: string;
      phone: string;
      jobTitle: string;
      role: UserRole;
      assignedPropertyId: string;
      assignedPropertyName: string;
      assignedPropertyIds: string[];
      customPermissions: string[];
      mfaEnabled: boolean;
      status: AccountStatus;
    }>
  ): Promise<{ staff: UserSession; message: string; brandedEmail?: BrandedEmailRecord }> => {
    // 1. Prioritize full-stack backend endpoint so that when a role is assigned or updated,
    // a branded notification email is dispatched to the recipient's email address via Resend.
    try {
      const serverRes = await apiRequest<{
        staff: UserSession;
        message: string;
        brandedEmail?: BrandedEmailRecord;
      }>(`/api/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (serverRes?.staff) {
        return serverRes;
      }
    } catch (backendErr: any) {
      console.warn(
        '[updateStaff] Backend route unavailable, falling back to direct Supabase client:',
        backendErr?.message || backendErr
      );
    }

    if (isSupabaseConfigured && supabase) {
      const patch: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (data.fullName !== undefined) patch.full_name = data.fullName;
      if (data.phone !== undefined) patch.phone = data.phone;
      if (data.jobTitle !== undefined) patch.job_title = data.jobTitle;
      if (data.role !== undefined) patch.role = toDbRole(data.role);
      if (data.assignedPropertyId !== undefined)
        patch.assigned_property_id = data.assignedPropertyId || null;
      if (data.assignedPropertyName !== undefined)
        patch.assigned_property_name = data.assignedPropertyName;
      if (data.assignedPropertyIds !== undefined)
        patch.assigned_property_ids = data.assignedPropertyIds;
      if (data.customPermissions !== undefined)
        patch.custom_permissions = data.customPermissions;
      if (data.mfaEnabled !== undefined) patch.mfa_enabled = data.mfaEnabled;
      if (data.status !== undefined) patch.account_status = data.status;

      const { data: updated, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update Staff (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: error?.message || 'Failed to update staff record.',
          category: 'Database Access',
        });
      }

      const role = (data.role || updated.role || 'property_manager') as UserRole;
      return {
        staff: {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          phone: updated.phone || '',
          jobTitle: updated.job_title || getRoleDisplayLabel(role),
          role,
          roleLabel: getRoleDisplayLabel(role),
          status: (updated.account_status as AccountStatus) || 'Active',
          assignedPropertyId: updated.assigned_property_id || undefined,
          assignedPropertyName: updated.assigned_property_name || undefined,
          permissions: getAllowedPagesForRole(role),
          token: updated.id,
        },
        message: 'Staff profile updated in Supabase.',
      };
    }

    return await apiRequest<{ staff: UserSession; message: string; brandedEmail?: BrandedEmailRecord }>(
      `/api/staff/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  assignStaffRole: async (
    id: string,
    data: {
      role: UserRole;
      jobTitle?: string;
      assignedPropertyId?: string;
      assignedPropertyName?: string;
      permissions?: string[];
    }
  ) => {
    try {
      const serverRes = await apiRequest<{
        staff: UserSession;
        message: string;
        resendId?: string;
        brandedEmail?: BrandedEmailRecord;
      }>(`/api/staff/${id}/assign-role`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (serverRes?.staff) {
        return serverRes;
      }
    } catch (backendErr: any) {
      console.warn(
        '[assignStaffRole] Backend route error, falling back to updateStaff:',
        backendErr?.message || backendErr
      );
    }
    return await rentalApi.updateStaff(id, data);
  },

  resendStaffInvite: async (id: string) => {
    // 1. Try full-stack backend endpoint first
    // This executes server-side Supabase Auth user management, Resend delivery, and staff_invitations logging
    try {
      const serverRes = await apiRequest<{
        staff: UserSession;
        message: string;
        inviteToken?: string;
        inviteLink?: string;
        resendId?: string;
        deliveryStatus?: string;
        brandedEmail?: BrandedEmailRecord;
      }>(`/api/staff/${id}/resend-invite`, {
        method: 'POST',
      });
      if (serverRes?.staff) {
        return serverRes;
      }
    } catch (backendErr: any) {
      console.warn(
        '[resendStaffInvite] Backend route error, falling back to direct Supabase client update:',
        backendErr?.message || backendErr
      );
    }

    // 2. Direct Supabase client fallback using only columns that exist on public.profiles
    if (isSupabaseConfigured && supabase) {
      const inviteToken = `INV-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(
        Date.now() + 72 * 60 * 60 * 1000
      ).toISOString();

      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          invite_token_hash: inviteToken,
          invite_expires_at: expiresIso,
          invite_used: false,
          invite_revoked: false,
          invited_at: nowIso,
          account_status: 'Pending Invitation',
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Resend Invite (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: error?.message || 'Staff profile not found.',
          category: 'Database Access',
        });
      }

      await supabase
        .from('staff_invitations')
        .insert({
          staff_id: updated.id,
          email: updated.email,
          role: updated.role,
          job_title: updated.job_title || '',
          assigned_property_id: updated.assigned_property_id || null,
          assigned_property_name: updated.assigned_property_name || 'All Properties',
          token_hash: inviteToken,
          status: 'Pending Invitation',
          expires_at: expiresIso,
          invited_by: currentEmail || 'Super Administrator',
        })
        .then(
          () => {},
          () => {}
        );

      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const inviteLink = `${origin}/activate-invite?email=${encodeURIComponent(
        updated.email
      )}&token=${inviteToken}`;
      const role = (updated.role as UserRole) || 'property_manager';

      return {
        staff: {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          role,
          roleLabel: getRoleDisplayLabel(role),
          status: (updated.account_status as AccountStatus) || 'Pending Invitation',
          invitationStatus: 'Pending' as const,
          inviteToken,
          inviteExpiresAt: expiresIso,
          permissions: getAllowedPagesForRole(role),
          token: updated.id,
        },
        inviteToken,
        inviteLink,
        message: `New invitation code (${inviteToken}) generated for ${updated.email}.`,
      };
    }

    return await apiRequest<{
      staff: UserSession;
      message: string;
      inviteToken?: string;
      inviteLink?: string;
      resendId?: string;
      deliveryStatus?: string;
      brandedEmail?: BrandedEmailRecord;
    }>(`/api/staff/${id}/resend-invite`, {
      method: 'POST',
    });
  },

  revokeStaffInvite: async (id: string) => {
    // 1. Try backend API endpoint first
    try {
      const serverRes = await apiRequest<{
        staff: UserSession;
        message: string;
      }>(`/api/staff/${id}/revoke-invite`, {
        method: 'POST',
      });
      if (serverRes?.staff) {
        return serverRes;
      }
    } catch (backendErr: any) {
      console.warn(
        '[revokeStaffInvite] Backend route error, falling back to direct Supabase client update:',
        backendErr?.message || backendErr
      );
    }

    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          invite_token_hash: null,
          invite_revoked: true,
          account_status: 'Deactivated',
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Revoke Invite (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: error?.message || 'Staff profile not found.',
          category: 'Database Access',
        });
      }

      await supabase
        .from('staff_invitations')
        .update({ status: 'Expired', revoked_at: new Date().toISOString() })
        .eq('staff_id', id)
        .then(
          () => {},
          () => {}
        );

      const role = (updated.role as UserRole) || 'property_manager';
      return {
        staff: {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          role,
          roleLabel: getRoleDisplayLabel(role),
          status: 'Deactivated' as AccountStatus,
          invitationStatus: 'Expired' as const,
          inviteRevoked: true,
          permissions: getAllowedPagesForRole(role),
          token: updated.id,
        },
        message: `Invitation for ${updated.email} has been revoked.`,
      };
    }

    return await apiRequest<{
      staff: UserSession;
      message: string;
    }>(`/api/staff/${id}/revoke-invite`, {
      method: 'POST',
    });
  },

  offboardStaff: async (
    id: string,
    data: {
      targetStatus: 'Suspended' | 'Deactivated';
      transferToStaffId?: string;
      reason?: string;
    }
  ) => {
    try {
      return await apiRequest<{
        staff: UserSession;
        message: string;
        transferredPropertiesCount: number;
      }>(`/api/staff/${id}/offboard`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          account_status: data.targetStatus,
          assigned_property_id: null,
          assigned_property_name: 'Unassigned (Offboarded)',
          invite_token_hash: null,
          invite_revoked: true,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Offboard Staff (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: error?.message || 'Staff profile not found.',
          category: 'Database Access',
        });
      }

      const role = (updated.role as UserRole) || 'property_manager';
      return {
        staff: {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          role,
          roleLabel: getRoleDisplayLabel(role),
          status: data.targetStatus,
          permissions: getAllowedPagesForRole(role),
          token: updated.id,
        },
        transferredPropertiesCount: 0,
        message: `${updated.full_name} has been marked as ${data.targetStatus}.`,
      };
    }

    return await apiRequest<{
      staff: UserSession;
      message: string;
      transferredPropertiesCount: number;
    }>(`/api/staff/${id}/offboard`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteStaff: async (id: string) => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/staff/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Staff (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/profiles'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/staff/${id}`, {
      method: 'DELETE',
    });
  },

  // Properties CRUD
  createProperty: async (data: Partial<PropertyRecord>): Promise<PropertyRecord> => {
    try {
      return await apiRequest<PropertyRecord>('/api/properties', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const cleanName = String(data.name || '').trim();
      const cleanAddress = String(data.address || '').trim();
      const tot = Math.max(1, Number(data.totalUnits) || 1);
      const occ = Math.min(tot, Math.max(0, Number(data.occupiedUnits) || 0));
      const rev = Math.max(0, Number(data.monthlyRevenue) || 0);
      const mgr = String(data.manager || 'Property Manager').trim();
      let desiredPrefix =
        String(data.codePrefix || cleanName[0] || 'A')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, '')
          .slice(0, 1) || 'A';

      const { data: existingProps } = await supabase
        .from('properties')
        .select('code_prefix');
      const usedPrefixes = new Set(
        (existingProps || []).map((r: any) =>
          String(r.code_prefix || '').trim().toUpperCase()
        )
      );
      if (usedPrefixes.has(desiredPrefix)) {
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
          if (!usedPrefixes.has(ch)) {
            desiredPrefix = ch;
            break;
          }
        }
      }

      const finalPropertyCode =
        String(data.propertyCode || '').trim() || `${desiredPrefix}-001`;
      const finalCoverImage = String(data.coverImageUrl || '').trim();

      let row: any = null;
      const extRes = await supabase
        .from('properties')
        .insert({
          code_prefix: desiredPrefix,
          property_code: finalPropertyCode,
          name: cleanName,
          address: cleanAddress,
          description: data.description || '',
          status: data.status || 'Active',
          cover_image_url: finalCoverImage,
          total_units: tot,
          occupied_units: occ,
          monthly_revenue: rev,
          manager_name: mgr,
          rating: 5,
          variant: data.variant || 'deluxe',
        })
        .select('*')
        .single();

      if (!extRes.error && extRes.data) {
        row = extRes.data;
      } else {
        const stdRes = await supabase
          .from('properties')
          .insert({
            code_prefix: desiredPrefix,
            name: cleanName,
            address: cleanAddress,
            total_units: tot,
            occupied_units: occ,
            monthly_revenue: rev,
            manager_name: mgr,
            rating: 5,
            variant: data.variant || 'deluxe',
          })
          .select('*')
          .single();
        if (stdRes.error || !stdRes.data) {
          throw createDiagnosticError({
            failedRequest: 'POST Supabase Create Property (public.properties)',
            statusCode: 400,
            endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
            supabaseError:
              stdRes.error?.message ||
              extRes.error?.message ||
              'Failed to create property in Supabase.',
            category: 'Database Access',
          });
        }
        row = stdRes.data;
      }

      void logSupabaseActivity(
        'property',
        'Property Added to Portfolio',
        `${row.name} (${tot} units, Prefix ${desiredPrefix}) registered at ${row.address}.`,
        mgr,
        undefined,
        'lime'
      );

      return {
        id: row.id,
        codePrefix: desiredPrefix,
        propertyCode: finalPropertyCode,
        name: row.name,
        address: row.address,
        description: data.description || '',
        status: data.status || 'Active',
        coverImageUrl: finalCoverImage,
        images: data.images || [],
        totalUnits: tot,
        occupiedUnits: occ,
        monthlyRevenue: rev,
        manager: mgr,
        rating: '5.0/5',
        variant: row.variant || 'deluxe',
        refRange: `${desiredPrefix}-001 – ${desiredPrefix}-${String(tot).padStart(3, '0')}`,
        createdAt: row.created_at,
      };
    }

    return await apiRequest<PropertyRecord>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProperty: async (
    id: string,
    data: Partial<PropertyRecord>
  ): Promise<PropertyRecord> => {
    try {
      return await apiRequest<PropertyRecord>(`/api/properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data: existingProp, error: findPropErr } = await supabase
        .from('properties')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findPropErr) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Lookup Property (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
          supabaseError: findPropErr.message,
          category: 'Database Access',
        });
      }
      if (!existingProp) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update Property (${id})`,
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
          supabaseError: 'Property record was not found in Supabase. Refresh the page and try again.',
          category: 'Database Access',
        });
      }

      const patch: Record<string, any> = {};
      if (data.name !== undefined) patch.name = String(data.name).trim();
      if (data.address !== undefined)
        patch.address = String(data.address).trim();
      if (data.totalUnits !== undefined)
        patch.total_units = Math.max(1, Number(data.totalUnits));
      if (data.manager !== undefined)
        patch.manager_name = String(data.manager).trim();
      if (data.codePrefix !== undefined)
        patch.code_prefix = String(data.codePrefix)
          .trim()
          .toUpperCase()
          .slice(0, 1);
      if (data.variant !== undefined) patch.variant = data.variant;

      const { data: updated, error } = await supabase
        .from('properties')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update Property (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
          supabaseError:
            error?.message || 'Property update did not match an editable record in Supabase.',
          category: 'Database Access',
        });
      }

      const prefix = String(updated.code_prefix || 'A').trim();
      const tot = Number(updated.total_units || 1);
      return {
        id: updated.id,
        codePrefix: prefix,
        propertyCode:
          data.propertyCode || updated.property_code || `${prefix}-001`,
        name: updated.name,
        address: updated.address,
        description: data.description ?? updated.description ?? '',
        status: data.status || updated.status || 'Active',
        coverImageUrl: data.coverImageUrl ?? updated.cover_image_url ?? '',
        images: data.images,
        totalUnits: tot,
        occupiedUnits: Number(updated.occupied_units || 0),
        monthlyRevenue: Number(updated.monthly_revenue || 0),
        manager: updated.manager_name || 'Property Manager',
        rating: `${Number(updated.rating || 5).toFixed(1)}/5`,
        variant: updated.variant || 'deluxe',
        refRange: `${prefix}-001 – ${prefix}-${String(Math.max(1, tot)).padStart(3, '0')}`,
        createdAt: updated.created_at,
      };
    }

    return await apiRequest<PropertyRecord>(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteProperty: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/properties/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Property (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/properties'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/properties/${id}`, {
      method: 'DELETE',
    });
  },

  uploadStagedImage: async (data: {
    fileBase64: string;
    fileName: string;
    contentType?: string;
  }) => {
    try {
      return await apiRequest<{ publicUrl: string; storagePath: string }>(
        '/api/properties/upload-image',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      return {
        publicUrl: data.fileBase64,
        storagePath: data.fileName || `staged_${Date.now()}.jpg`,
      };
    }
    return await apiRequest<{ publicUrl: string; storagePath: string }>(
      '/api/properties/upload-image',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  uploadPropertyImage: async (
    propertyId: string,
    data: {
      fileBase64: string;
      fileName: string;
      contentType?: string;
      isCover?: boolean;
      caption?: string;
    }
  ) => {
    try {
      return await apiRequest<{ image: PropertyImageItem; coverImageUrl?: string }>(
        `/api/properties/${propertyId}/images`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const imageId = crypto.randomUUID();
      const shouldBeCover = Boolean(data.isCover);
      if (shouldBeCover) {
        await supabase
          .from('property_images')
          .update({ is_cover: false })
          .eq('property_id', propertyId);
        await supabase
          .from('properties')
          .update({ cover_image_url: data.fileBase64 })
          .eq('id', propertyId);
      }
      await supabase.from('property_images').insert({
        id: imageId,
        property_id: propertyId,
        image_url: data.fileBase64,
        storage_path: data.fileName || '',
        is_cover: shouldBeCover,
        display_order: 0,
        caption: data.caption || '',
      });
      return {
        image: {
          id: imageId,
          propertyId,
          imageUrl: data.fileBase64,
          storagePath: data.fileName,
          isCover: shouldBeCover,
          displayOrder: 0,
          caption: data.caption || '',
          createdAt: new Date().toISOString(),
        },
        coverImageUrl: shouldBeCover ? data.fileBase64 : undefined,
      };
    }

    return await apiRequest<{ image: PropertyImageItem; coverImageUrl?: string }>(
      `/api/properties/${propertyId}/images`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  setPropertyCoverImage: async (propertyId: string, imageId: string) => {
    try {
      return await apiRequest<{ success: boolean; coverImageUrl: string }>(
        `/api/properties/${propertyId}/images/${imageId}/cover`,
        {
          method: 'PUT',
        }
      );
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data: imgRow } = await supabase
        .from('property_images')
        .select('image_url')
        .eq('id', imageId)
        .maybeSingle();
      await supabase
        .from('property_images')
        .update({ is_cover: false })
        .eq('property_id', propertyId);
      await supabase
        .from('property_images')
        .update({ is_cover: true })
        .eq('id', imageId);
      if (imgRow?.image_url) {
        await supabase
          .from('properties')
          .update({ cover_image_url: imgRow.image_url })
          .eq('id', propertyId);
      }
      return { success: true, coverImageUrl: imgRow?.image_url || '' };
    }

    return await apiRequest<{ success: boolean; coverImageUrl: string }>(
      `/api/properties/${propertyId}/images/${imageId}/cover`,
      {
        method: 'PUT',
      }
    );
  },

  deletePropertyImage: async (propertyId: string, imageId: string) => {
    try {
      return await apiRequest<{ success: boolean; newCoverImageUrl: string }>(
        `/api/properties/${propertyId}/images/${imageId}`,
        {
          method: 'DELETE',
        }
      );
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      await supabase.from('property_images').delete().eq('id', imageId);
      return { success: true, newCoverImageUrl: '' };
    }

    return await apiRequest<{ success: boolean; newCoverImageUrl: string }>(
      `/api/properties/${propertyId}/images/${imageId}`,
      {
        method: 'DELETE',
      }
    );
  },

  // Unit Types & Units CRUD
  createUnitType: async (data: Partial<UnitTypeItem>): Promise<UnitTypeItem> => {
    try {
      return await apiRequest<UnitTypeItem>('/api/unit-types', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const occ = Math.max(0, Number(data.occupiedCount) || 0);
      const tot = Math.max(1, Number(data.totalCount) || 1);
      const status = occ < tot ? 'Available' : 'Occupied';
      const rent = Math.max(0, Number(data.monthlyRent) || 0);
      const propName = String(data.property || '').trim();

      const { data: propRow } = await supabase
        .from('properties')
        .select('id, name')
        .ilike('name', propName)
        .maybeSingle();

      const features = Array.isArray(data.features)
        ? data.features
        : ['Private balcony or patio', 'Modern open-concept floorplan'];
      const amenities = Array.isArray(data.amenities)
        ? data.amenities
        : ['High-speed Wi-Fi ready', 'Full kitchen appliances'];

      const { data: created, error } = await supabase
        .from('unit_types')
        .insert({
          property_id: propRow?.id || null,
          property_name: propRow?.name || propName,
          name: String(data.name || '').trim(),
          variant: data.variant || 'deluxe',
          size_sqm: Number(data.sizeSqm) || 65,
          bedrooms: data.bedrooms || '1 Bed • 1 Bath',
          max_tenants: Number(data.maxTenants) || 2,
          monthly_rent: rent,
          occupied_count: occ,
          total_count: tot,
          status: data.status === 'Inactive' ? 'Inactive' : status,
          description:
            data.description || `${data.name} residential unit at ${propName}.`,
          long_description:
            data.longDescription ||
            data.description ||
            `${data.name} residential unit at ${propName}.`,
          features,
          amenities,
        })
        .select('*')
        .maybeSingle();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create UnitType (public.unit_types)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
          supabaseError: error?.message || 'Failed to create unit type.',
          category: 'Database Access',
        });
      }

      if (created.property_id) {
        await supabase
          .from('units')
          .update({ unit_type_id: created.id })
          .eq('property_id', created.property_id)
          .ilike('unit_type_name', created.name)
          .is('unit_type_id', null);
      }

      await syncSupabasePropertyOccupancy(created.property_id || propRow?.id, propRow?.name || created.property_name);

      return {
        id: created.id,
        propertyId: created.property_id || propRow?.id,
        name: created.name,
        property: propRow?.name || created.property_name,
        variant: created.variant || 'deluxe',
        sizeSqm: Number(created.size_sqm || 65),
        bedrooms: created.bedrooms,
        maxTenants: Number(created.max_tenants || 2),
        occupiedCount: occ,
        totalCount: tot,
        status: created.status === 'Inactive' ? 'Inactive' : status,
        monthlyRent: rent,
        description: created.description,
        longDescription: created.long_description || created.description,
        features: Array.isArray(created.features) ? created.features : features,
        amenities: Array.isArray(created.amenities)
          ? created.amenities
          : amenities,
      };
    }

    return await apiRequest<UnitTypeItem>('/api/unit-types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateUnitType: async (
    id: string,
    data: Partial<UnitTypeItem>
  ): Promise<UnitTypeItem> => {
    try {
      return await apiRequest<UnitTypeItem>(`/api/unit-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (backendErr: any) {
      if (
        !isSupabaseConfigured ||
        !supabase ||
        backendErr?.statusCode === 400 ||
        backendErr?.statusCode === 403
      ) {
        throw backendErr;
      }
    }

    if (isSupabaseConfigured && supabase) {
      const isDerivedId = id.startsWith('ut-derived-');
      const derivedPropertyId = isDerivedId
        ? id.slice('ut-derived-'.length).trim()
        : null;

      let cur: any = null;
      if (!isDerivedId) {
        const { data: found, error: findErr } = await supabase
          .from('unit_types')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (findErr) {
          throw createDiagnosticError({
            failedRequest: `PUT Supabase Lookup UnitType (${id})`,
            statusCode: 400,
            endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
            supabaseError: findErr.message,
            category: 'Database Access',
          });
        }
        cur = found;
      } else if (derivedPropertyId) {
        const { data: existingForProp } = await supabase
          .from('unit_types')
          .select('*')
          .eq('property_id', derivedPropertyId);
        if (Array.isArray(existingForProp) && existingForProp.length > 0) {
          cur =
            (data.name
              ? existingForProp.find(
                  (r: any) =>
                    String(r.name || '').trim().toLowerCase() ===
                    String(data.name || '').trim().toLowerCase()
                )
              : null) || existingForProp[0];
        }
      }

      if (!cur) {
        if (isDerivedId && derivedPropertyId) {
          let propRow: any = null;
          const { data: byId } = await supabase
            .from('properties')
            .select('id, name, variant, total_units, occupied_units')
            .eq('id', derivedPropertyId)
            .maybeSingle();
          propRow = byId;
          if (!propRow && data.property) {
            const { data: byName } = await supabase
              .from('properties')
              .select('id, name, variant, total_units, occupied_units')
              .ilike('name', String(data.property).trim())
              .maybeSingle();
            propRow = byName;
          }
          if (!propRow && !data.property) {
            throw createDiagnosticError({
              failedRequest: `PUT Supabase Persist Derived UnitType (${id})`,
              statusCode: 404,
              endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
              supabaseError:
                'Associated property for this unit type was not found.',
              category: 'Database Access',
            });
          }

          const occNew = Math.max(
            0,
            Number(
              data.occupiedCount !== undefined
                ? data.occupiedCount
                : propRow?.occupied_units || 0
            )
          );
          const totNew = Math.max(
            0,
            Number(
              data.totalCount !== undefined
                ? data.totalCount
                : propRow?.total_units || 1
            )
          );
          const nextStatusNew: UnitTypeItem['status'] =
            data.status === 'Inactive' || totNew <= 0
              ? 'Inactive'
              : occNew < totNew
              ? 'Available'
              : 'Occupied';
          const unitNameNew = String(
            data.name ||
              (propRow?.variant === 'suite'
                ? 'Suite'
                : propRow?.variant === 'standard'
                ? 'Standard'
                : 'Deluxe')
          ).trim();
          const propNameNew = propRow?.name || String(data.property || '').trim();
          const defaultFeatures = Array.isArray(data.features)
            ? data.features
            : [
                'Spacious Living Area',
                'Modern Kitchen',
                'Private Balcony',
                'High-Speed Fiber Ready',
              ];
          const defaultAmenities = Array.isArray(data.amenities)
            ? data.amenities
            : ['24/7 Security', 'Reliable Water Supply', 'Resident Parking'];
          const descNew =
            data.description ||
            `${unitNameNew} residential units at ${propNameNew}.`;

          const { data: inserted, error: insErr } = await supabase
            .from('unit_types')
            .insert({
              property_id: propRow?.id || null,
              property_name: propNameNew,
              name: unitNameNew,
              variant: data.variant || propRow?.variant || 'deluxe',
              size_sqm: data.sizeSqm !== undefined ? Number(data.sizeSqm) : 75,
              bedrooms: data.bedrooms || '2 Bedrooms',
              max_tenants:
                data.maxTenants !== undefined ? Number(data.maxTenants) : 3,
              occupied_count: occNew,
              total_count: totNew,
              status: nextStatusNew,
              monthly_rent:
                data.monthlyRent !== undefined ? Number(data.monthlyRent) : 35000,
              description: descNew,
              long_description: data.longDescription ?? descNew,
              features: defaultFeatures,
              amenities: defaultAmenities,
            })
            .select('*')
            .maybeSingle();

          if (insErr || !inserted) {
            throw createDiagnosticError({
              failedRequest: `PUT Supabase Persist Derived UnitType (${id})`,
              statusCode: 400,
              endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
              supabaseError:
                insErr?.message || 'Failed to persist unit type in Supabase.',
              category: 'Database Access',
            });
          }

          if (inserted.property_id) {
            await supabase
              .from('units')
              .update({ unit_type_id: inserted.id })
              .eq('property_id', inserted.property_id)
              .is('unit_type_id', null);
          }

          await syncSupabasePropertyOccupancy(inserted.property_id, inserted.property_name);

          return {
            id: inserted.id,
            propertyId: inserted.property_id,
            name: inserted.name,
            property: inserted.property_name,
            variant: inserted.variant || 'deluxe',
            sizeSqm: Number(inserted.size_sqm || 65),
            bedrooms: inserted.bedrooms,
            maxTenants: Number(inserted.max_tenants || 2),
            occupiedCount: occNew,
            totalCount: totNew,
            status: nextStatusNew,
            monthlyRent: Number(inserted.monthly_rent || 0),
            description: inserted.description,
            longDescription: inserted.long_description || inserted.description,
            features: Array.isArray(inserted.features)
              ? inserted.features
              : defaultFeatures,
            amenities: Array.isArray(inserted.amenities)
              ? inserted.amenities
              : defaultAmenities,
          };
        }

        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update UnitType (${id})`,
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
          supabaseError:
            'Unit type record was not found in Supabase. Refresh the page and try again.',
          category: 'Database Access',
        });
      }

      const targetUtId = cur.id;
      const occ =
        data.occupiedCount !== undefined
          ? Math.max(0, Number(data.occupiedCount))
          : Number(cur.occupied_count || 0);
      const tot =
        data.totalCount !== undefined
          ? Math.max(0, Number(data.totalCount))
          : Number(cur.total_count || 1);
      const status: UnitTypeItem['status'] =
        data.status === 'Inactive' || tot <= 0
          ? 'Inactive'
          : data.status === 'Available' || data.status === 'Occupied'
          ? occ < tot
            ? 'Available'
            : 'Occupied'
          : cur.status === 'Inactive'
          ? 'Inactive'
          : occ < tot
          ? 'Available'
          : 'Occupied';

      let nextPropertyId = cur.property_id;
      let nextPropertyName = data.property
        ? String(data.property).trim()
        : cur.property_name;
      if (
        data.property &&
        String(data.property).trim().toLowerCase() !==
          String(cur.property_name || '').trim().toLowerCase()
      ) {
        const { data: propMatch } = await supabase
          .from('properties')
          .select('id, name')
          .ilike('name', String(data.property).trim())
          .maybeSingle();
        if (propMatch) {
          nextPropertyId = propMatch.id;
          nextPropertyName = propMatch.name;
        }
      }

      const nextName =
        data.name !== undefined ? String(data.name).trim() : cur.name;

      const { data: updated, error } = await supabase
        .from('unit_types')
        .update({
          property_id: nextPropertyId,
          property_name: nextPropertyName,
          name: nextName,
          variant: data.variant ?? cur.variant,
          size_sqm:
            data.sizeSqm !== undefined ? Number(data.sizeSqm) : cur.size_sqm,
          bedrooms: data.bedrooms ?? cur.bedrooms,
          max_tenants:
            data.maxTenants !== undefined
              ? Number(data.maxTenants)
              : cur.max_tenants,
          occupied_count: occ,
          total_count: tot,
          status,
          monthly_rent:
            data.monthlyRent !== undefined
              ? Number(data.monthlyRent)
              : cur.monthly_rent,
          description: data.description ?? cur.description,
          long_description:
            data.longDescription ?? data.description ?? cur.long_description,
        })
        .eq('id', targetUtId)
        .select('*')
        .maybeSingle();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update UnitType (${targetUtId})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
          supabaseError:
            error?.message ||
            'Unit type update did not match an editable record in Supabase.',
          category: 'Database Access',
        });
      }

      if (nextName !== cur.name) {
        await supabase
          .from('units')
          .update({ unit_type_name: nextName })
          .eq('unit_type_id', updated.id);
      }

      const prevOcc = Math.max(0, Number(cur.occupied_count || 0));
      if (occ < prevOcc) {
        const diffToVacate = prevOcc - occ;
        const { data: occUnitRows } = await supabase
          .from('units')
          .select('id, tenant_ref')
          .eq('unit_type_id', updated.id)
          .eq('status', 'Occupied')
          .limit(diffToVacate);
        if (Array.isArray(occUnitRows) && occUnitRows.length > 0) {
          const withoutTenant = occUnitRows.filter((u: any) => !u.tenant_ref);
          const toFree = (withoutTenant.length > 0 ? withoutTenant : occUnitRows).slice(0, diffToVacate);
          for (const uRow of toFree) {
            await supabase
              .from('units')
              .update({ status: 'Available', tenant_ref: null })
              .eq('id', uRow.id);
          }
        }
      }

      await syncSupabasePropertyOccupancy(updated.property_id, updated.property_name);

      return {
        id: updated.id,
        propertyId: updated.property_id,
        name: updated.name,
        property: updated.property_name,
        variant: updated.variant || 'deluxe',
        sizeSqm: Number(updated.size_sqm || 65),
        bedrooms: updated.bedrooms,
        maxTenants: Number(updated.max_tenants || 2),
        occupiedCount: occ,
        totalCount: tot,
        status,
        monthlyRent: Number(updated.monthly_rent || 0),
        description: updated.description,
        longDescription: updated.long_description || updated.description,
        features: Array.isArray(updated.features) ? updated.features : [],
        amenities: Array.isArray(updated.amenities) ? updated.amenities : [],
      };
    }

    return await apiRequest<UnitTypeItem>(`/api/unit-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteUnitType: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/unit-types/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr: any) {
      if (
        !isSupabaseConfigured ||
        !supabase ||
        backendErr?.statusCode === 400 ||
        backendErr?.statusCode === 403
      ) {
        throw backendErr;
      }
    }

    if (isSupabaseConfigured && supabase) {
      if (id.startsWith('ut-derived-')) {
        const derivedPropertyId = id.slice('ut-derived-'.length).trim();
        if (derivedPropertyId) {
          await supabase
            .from('unit_types')
            .delete()
            .eq('property_id', derivedPropertyId);
        }
        return { success: true };
      }
      const { data: existingUt } = await supabase
        .from('unit_types')
        .select('property_id, property_name')
        .eq('id', id)
        .maybeSingle();
      const { error } = await supabase.from('unit_types').delete().eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase UnitType (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/unit_types'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      if (existingUt) {
        await syncSupabasePropertyOccupancy(existingUt.property_id, existingUt.property_name);
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/unit-types/${id}`, {
      method: 'DELETE',
    });
  },

  // Tenants & Leases CRUD (Auto-generates A-001, A-002, B-001 via PostgreSQL trigger!)
  createTenant: async (data: {
    name: string;
    phone: string;
    email: string;
    propertyId?: string;
    property: string;
    unitId?: string;
    unitNumber: string;
    unitType: 'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single';
    monthlyRent: number;
    dueDate?: string;
    leaseStart?: string;
    leaseDuration?: string;
    leaseNotes?: string;
    dob?: string;
    gender?: string;
    nationality?: string;
    idNumber?: string;
    securityDeposit?: number;
    depositStatus?: 'Held' | 'Not Paid' | 'Returned' | 'Partially Returned' | 'Forfeited';
    vehicleInfo?: string;
    occupants?: string;
    initialPaymentStatus?: 'Paid' | 'Pending';
  }): Promise<TenantProfile> => {
    const cleanEmail = String(data.email || '').trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailPattern.test(cleanEmail)) {
      throw new Error('A valid tenant email address is required when adding a tenant.');
    }

    try {
      return await apiRequest<TenantProfile>('/api/tenants', {
        method: 'POST',
        body: JSON.stringify({ ...data, email: cleanEmail }),
      });
    } catch (backendErr: any) {
      if (backendErr?.statusCode === 400 || !isSupabaseConfigured || !supabase) {
        throw backendErr;
      }
    }

    if (isSupabaseConfigured && supabase) {
      const cleanName = String(data.name).trim();
      const cleanUnitNumber = String(data.unitNumber).trim();
      const rentNum = Math.max(0, Number(data.monthlyRent) || 0);
      const depositNum =
        data.securityDeposit !== undefined && data.securityDeposit !== null
          ? Math.max(0, Number(data.securityDeposit) || 0)
          : 0;
      const resolvedDepositStatus =
        data.depositStatus || (depositNum > 0 ? 'Held' : 'Not Paid');

      let propRow: any = null;
      if (data.propertyId) {
        const { data: p } = await supabase
          .from('properties')
          .select('*')
          .eq('id', data.propertyId)
          .maybeSingle();
        propRow = p;
      }
      if (!propRow && data.property) {
        const { data: p } = await supabase
          .from('properties')
          .select('*')
          .ilike('name', String(data.property).trim())
          .maybeSingle();
        propRow = p;
      }

      const propName = propRow?.name || String(data.property || 'Main Property').trim();

      const { data: newTenant, error: tenantErr } = await supabase
        .from('tenants')
        .insert({
          property_id: propRow?.id || null,
          property_name: propName,
          tenant_ref: 'AUTO',
          full_name: cleanName,
          phone: String(data.phone || 'Not provided').trim(),
          email: cleanEmail,
          dob: data.dob || formatShortDate(),
          gender: data.gender || 'Resident',
          nationality: data.nationality || 'Kenyan',
          id_number: data.idNumber || `ID-${Date.now().toString().slice(-6)}`,
          tier: 'Verified Tenant',
          on_time_streak: 'Active Lease',
          security_deposit: depositNum,
          vehicle_info: data.vehicleInfo || 'Registered Resident Vehicle',
          avatar_bg: '#D8F3E5',
        })
        .select('*')
        .single();

      if (tenantErr || !newTenant) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Tenant (public.tenants)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/tenants'),
          supabaseError:
            tenantErr?.message || 'Failed to save tenant record in Supabase.',
          category: 'Database Access',
        });
      }

      const generatedRef = newTenant.tenant_ref;
      const leaseCode = `LS-${String(generatedRef).replace('-', '')}-${Date.now()
        .toString()
        .slice(-4)}`;
      const base = Math.round(rentNum * 0.88);
      const util = Math.round(rentNum * 0.06);
      const maint = Math.round(rentNum * 0.04);
      const park = Math.max(0, rentNum - base - util - maint);
      const startStr = formatShortDate();
      const resolvedDueDate =
        data.dueDate && String(data.dueDate).trim()
          ? String(data.dueDate).trim()
          : startStr;
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const endStr = formatShortDate(nextYear);
      const resolvedUnitType = data.unitType || 'Deluxe';
      const payStatus = data.initialPaymentStatus === 'Paid' ? 'Paid' : 'Pending';

      await supabase.from('leases').insert({
        lease_code: leaseCode,
        tenant_id: newTenant.id,
        tenant_ref: generatedRef,
        unit_number: cleanUnitNumber,
        unit_type: resolvedUnitType,
        property_name: propName,
        monthly_rent: rentNum,
        base_rent: base,
        utility_package: util,
        maintenance_fee: maint,
        parking_fee: park,
        occupants: data.occupants || '1 Adult',
        lease_duration: data.leaseDuration || '12 Months',
        lease_start: startStr,
        lease_end: endStr,
        lease_notes:
          data.leaseNotes || 'Standard residential lease agreement.',
        perks: ['Resident portal access', 'Assigned unit mailbox'],
        payment_method: 'M-Pesa / Bank Transfer',
        is_active: true,
      });

      const { data: createdPayRow } = await supabase
        .from('rent_payments')
        .insert({
          payment_code: leaseCode,
          tenant_id: newTenant.id,
          tenant_ref: generatedRef,
          tenant_name: newTenant.full_name,
          avatar_bg: '#D8F3E5',
          property_name: propName,
          unit_type: resolvedUnitType,
          unit_number: cleanUnitNumber,
          payment_note: 'Monthly Rent',
          lease_term: data.leaseDuration || '12 Months',
          due_date: resolvedDueDate,
          paid_date: startStr,
          amount: rentNum,
          status: payStatus,
        })
        .select('*')
        .maybeSingle();

      // Synchronize unit status, unit_types.occupied_count, and properties.occupied_units when a vacant unit receives a new active tenant
      let matchedUtRow: any = null;
      if (propRow?.id) {
        const { data: utRows } = await supabase
          .from('unit_types')
          .select('*')
          .eq('property_id', propRow.id);
        if (Array.isArray(utRows) && utRows.length > 0) {
          matchedUtRow =
            utRows.find(
              (ut: any) =>
                String(ut.name || '').trim().toLowerCase() ===
                String(resolvedUnitType).trim().toLowerCase()
            ) || utRows[0];
        }
      }
      if (!matchedUtRow && propName) {
        const { data: utRows } = await supabase
          .from('unit_types')
          .select('*')
          .ilike('property_name', propName);
        if (Array.isArray(utRows) && utRows.length > 0) {
          matchedUtRow =
            utRows.find(
              (ut: any) =>
                String(ut.name || '').trim().toLowerCase() ===
                String(resolvedUnitType).trim().toLowerCase()
            ) || utRows[0];
        }
      }

      let existingUnitRow: any = null;
      if (propRow?.id) {
        const { data: uRow } = await supabase
          .from('units')
          .select('*')
          .eq('property_id', propRow.id)
          .ilike('unit_number', cleanUnitNumber)
          .maybeSingle();
        existingUnitRow = uRow;
      } else if (propName) {
        const { data: uRow } = await supabase
          .from('units')
          .select('*')
          .ilike('property_name', propName)
          .ilike('unit_number', cleanUnitNumber)
          .maybeSingle();
        existingUnitRow = uRow;
      }

      const wasUnitAlreadyOccupied = existingUnitRow?.status === 'Occupied';
      if (existingUnitRow) {
        await supabase
          .from('units')
          .update({
            status: 'Occupied',
            tenant_ref: generatedRef,
            unit_type_id: matchedUtRow?.id || existingUnitRow.unit_type_id,
            unit_type_name: resolvedUnitType,
            monthly_rent: rentNum,
          })
          .eq('id', existingUnitRow.id);
      } else if (propRow?.id) {
        await supabase.from('units').insert({
          property_id: propRow.id,
          unit_type_id: matchedUtRow?.id || null,
          unit_number: cleanUnitNumber,
          unit_type_name: resolvedUnitType,
          property_name: propName,
          monthly_rent: rentNum,
          status: 'Occupied',
          tenant_ref: generatedRef,
        });
      }

      if (matchedUtRow && !wasUnitAlreadyOccupied) {
        const totCount = Math.max(1, Number(matchedUtRow.total_count || 1));
        const nextOcc = Math.min(totCount, Math.max(0, Number(matchedUtRow.occupied_count || 0)) + 1);
        const nextStatus =
          matchedUtRow.status === 'Inactive'
            ? 'Inactive'
            : nextOcc < totCount
            ? 'Available'
            : 'Occupied';
        await supabase
          .from('unit_types')
          .update({
            occupied_count: nextOcc,
            status: nextStatus,
          })
          .eq('id', matchedUtRow.id);
      }

      await syncSupabasePropertyOccupancy(propRow?.id, propName);

      void logSupabaseActivity(
        'lease',
        `New Tenant Onboarded (${generatedRef})`,
        `${newTenant.full_name} assigned to ${cleanUnitNumber} at ${propName}.`,
        currentEmail || 'Manager',
        generatedRef,
        'lime'
      );

      const initialPayment = createdPayRow
        ? {
            id: createdPayRow.id,
            paymentId: createdPayRow.payment_code,
            tenantRef: generatedRef,
            tenantName: newTenant.full_name,
            avatarBg: '#D8F3E5',
            property: propName,
            unitType: resolvedUnitType,
            unitNumber: cleanUnitNumber,
            paymentNote: 'Monthly Rent',
            transactionType: 'Rent' as const,
            leaseTerm: data.leaseDuration || '12 Months',
            dueDate: resolvedDueDate,
            paidDate: startStr,
            amount: rentNum,
            status: payStatus,
          }
        : undefined;

      return {
        id: newTenant.id,
        propertyId: propRow?.id,
        tenantRef: generatedRef,
        name: newTenant.full_name,
        phone: newTenant.phone,
        email: newTenant.email,
        dob: newTenant.dob || 'Not specified',
        gender: newTenant.gender || 'Resident',
        nationality: newTenant.nationality || 'Kenyan',
        idNumber: newTenant.id_number,
        tier: 'Verified Tenant',
        onTimeStreak: 'Active Lease',
        securityDeposit: depositNum,
        vehicleInfo: newTenant.vehicle_info || 'None',
        leaseId: leaseCode,
        leaseCreatedDate: startStr,
        unitType: resolvedUnitType,
        unitNumber: cleanUnitNumber,
        property: propName,
        monthlyRent: rentNum,
        dueDate: resolvedDueDate,
        rentBalance: payStatus === 'Paid' ? 0 : rentNum,
        totalPaid: payStatus === 'Paid' ? rentNum : 0,
        occupants: data.occupants || '1 Adult',
        leaseDuration: data.leaseDuration || '12 Months',
        leaseStart: startStr,
        leaseEnd: endStr,
        leaseNotes: data.leaseNotes || 'Standard residential lease agreement.',
        perks: ['Resident portal access', 'Assigned unit mailbox'],
        baseRent: base,
        utilityPackage: util,
        maintenanceFee: maint,
        parkingFee: park,
        paymentMethod: 'M-Pesa / Bank Transfer',
        status: payStatus,
        avatarBg: '#D8F3E5',
        paymentHistory: [],
        ...(initialPayment ? { initialPayment } : {}),
      } as TenantProfile;
    }

    return await apiRequest<TenantProfile>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTenant: async (
    id: string,
    data: Partial<TenantProfile>
  ): Promise<TenantProfile> => {
    try {
      return await apiRequest<TenantProfile>(`/api/tenants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const patch: Record<string, any> = {};
      if (data.name !== undefined) patch.full_name = String(data.name).trim();
      if (data.phone !== undefined) patch.phone = String(data.phone).trim();
      if (data.email !== undefined) patch.email = String(data.email).trim().toLowerCase();
      if (data.dob !== undefined) patch.dob = data.dob;
      if (data.gender !== undefined) patch.gender = data.gender;
      if (data.nationality !== undefined) patch.nationality = data.nationality;
      if (data.idNumber !== undefined) patch.id_number = data.idNumber;
      if (data.securityDeposit !== undefined) {
        patch.security_deposit = Math.max(0, Number(data.securityDeposit) || 0);
      }
      if (data.depositStatus !== undefined) {
        patch.deposit_status = data.depositStatus;
      }
      if (data.vehicleInfo !== undefined) patch.vehicle_info = data.vehicleInfo;
      if (data.propertyId !== undefined) patch.property_id = data.propertyId;
      if (data.property !== undefined) patch.property_name = data.property;
      if (data.unitNumber !== undefined) patch.unit_number = String(data.unitNumber).trim();
      if (data.unitType !== undefined) patch.unit_type = data.unitType;
      if (data.monthlyRent !== undefined) patch.monthly_rent = Number(data.monthlyRent);

      const moveInUpdate = parseBillingDateToYmd(data.leaseStart || data.moveInDate);
      const leasePatch: Record<string, any> = {};
      if (moveInUpdate) {
        leasePatch.lease_start = moveInUpdate;
        const annivDay = getBillingAnniversaryDay(moveInUpdate);
        const { data: existingPays } = await supabase
          .from('rent_payments')
          .select('due_date,billing_period_start')
          .or(`tenant_id.eq.${id},tenant_ref.eq.${id}`);
        const issuedDates = (existingPays || [])
          .map((row: any) => parseBillingDateToYmd(row.billing_period_start || row.due_date))
          .filter(Boolean) as string[];
        const nextBill = getNextBillingDate(moveInUpdate, getNairobiTodayYmd(), issuedDates);
        leasePatch.billing_anniversary_day = annivDay;
        patch.billing_anniversary_day = annivDay;
        if (nextBill) {
          leasePatch.next_billing_date = nextBill;
          patch.next_billing_date = nextBill;
        }
      }
      if (data.property !== undefined) leasePatch.property_name = data.property;
      if (data.unitNumber !== undefined) leasePatch.unit_number = String(data.unitNumber).trim();
      if (data.unitType !== undefined) leasePatch.unit_type = data.unitType;
      if (data.monthlyRent !== undefined) leasePatch.monthly_rent = Number(data.monthlyRent);
      if (data.leaseDuration !== undefined) leasePatch.lease_duration = data.leaseDuration;
      if (data.occupants !== undefined) leasePatch.occupants = data.occupants;
      if (data.leaseNotes !== undefined) leasePatch.lease_notes = data.leaseNotes;
      if (data.leaseEnd !== undefined) leasePatch.lease_end = data.leaseEnd;
      if (data.paymentMethod !== undefined) leasePatch.payment_method = data.paymentMethod;

      if (Object.keys(patch).length > 0) {
        const { error: supaUpdErr } = await supabase
          .from('tenants')
          .update(patch)
          .or(`id.eq.${id},tenant_ref.eq.${id}`);
        if (supaUpdErr) {
          const fallbackPatch = { ...patch };
          delete fallbackPatch.deposit_status;
          delete fallbackPatch.billing_anniversary_day;
          delete fallbackPatch.next_billing_date;
          if (Object.keys(fallbackPatch).length > 0) {
            await supabase
              .from('tenants')
              .update(fallbackPatch)
              .or(`id.eq.${id},tenant_ref.eq.${id}`);
          }
        }
      }

      if (Object.keys(leasePatch).length > 0) {
        const { error: leaseUpdErr } = await supabase
          .from('leases')
          .update(leasePatch)
          .or(`tenant_id.eq.${id},tenant_ref.eq.${id}`);
        if (leaseUpdErr) {
          const fallbackLease = { ...leasePatch };
          delete fallbackLease.billing_anniversary_day;
          delete fallbackLease.next_billing_date;
          if (Object.keys(fallbackLease).length > 0) {
            await supabase
              .from('leases')
              .update(fallbackLease)
              .or(`tenant_id.eq.${id},tenant_ref.eq.${id}`);
          }
        }
      }

      if (
        data.unitNumber !== undefined ||
        data.unitType !== undefined ||
        data.monthlyRent !== undefined ||
        data.propertyId !== undefined ||
        data.property !== undefined
      ) {
        let resolvedPropId = data.propertyId;
        if (!resolvedPropId && data.property) {
          const { data: propRow } = await supabase
            .from('properties')
            .select('id')
            .ilike('name', String(data.property).trim())
            .maybeSingle();
          resolvedPropId = propRow?.id;
        }
        const targetUnitNum = data.unitNumber ? String(data.unitNumber).trim() : undefined;
        if (resolvedPropId && targetUnitNum) {
          const [{ data: existingUnit }, { data: matchedUtRow }] = await Promise.all([
            supabase
              .from('units')
              .select('*')
              .eq('property_id', resolvedPropId)
              .ilike('unit_number', targetUnitNum)
              .maybeSingle(),
            data.unitType
              ? supabase
                  .from('unit_types')
                  .select('id')
                  .eq('property_id', resolvedPropId)
                  .ilike('name', String(data.unitType).trim())
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          if (existingUnit) {
            const unitPatch: Record<string, any> = { status: 'Occupied' };
            if (data.unitType !== undefined) {
              unitPatch.unit_type_name = data.unitType;
              if (matchedUtRow?.id) unitPatch.unit_type_id = matchedUtRow.id;
            }
            if (data.monthlyRent !== undefined) {
              unitPatch.monthly_rent = Number(data.monthlyRent);
            }
            await supabase.from('units').update(unitPatch).eq('id', existingUnit.id);
          }
        }
      }

      const state = await fetchBootstrapFromSupabase();
      const updated = state.tenants.find(
        (t) => t.id === id || t.tenantRef === id
      );
      if (!updated) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update Tenant (${id})`,
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/tenants'),
          supabaseError: 'Tenant record not found in Supabase.',
          category: 'Database Access',
        });
      }
      return updated;
    }

    return await apiRequest<TenantProfile>(`/api/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  vacateTenant: async (
    id: string,
    payload: {
      vacatedAt?: string;
      depositReturned: boolean;
      depositStatus?: 'Returned' | 'Partially Returned' | 'Forfeited' | 'Not Paid';
      depositReturnedAmount: number;
      hasDamages: boolean;
      damageAmount: number;
      damageNotes?: string;
      recordDamageAsExpense: boolean;
      expenseCategory?: ExpenseTransaction['category'];
      expenseTitle?: string;
    }
  ): Promise<{
    tenant: TenantProfile;
    expense?: ExpenseTransaction | null;
    properties?: PropertyRecord[];
    unitTypes?: UnitTypeItem[];
    analytics?: DashboardAnalytics;
  }> => {
    try {
      return await apiRequest<{
        tenant: TenantProfile;
        expense?: ExpenseTransaction | null;
        properties?: PropertyRecord[];
        unitTypes?: UnitTypeItem[];
        analytics?: DashboardAnalytics;
      }>(
        `/api/tenants/${id}/vacate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
    } catch (backendErr: any) {
      if (backendErr?.statusCode === 400 || backendErr?.statusCode === 403 || !isSupabaseConfigured || !supabase) {
        throw backendErr;
      }
    }

    if (isSupabaseConfigured && supabase) {
      const cleanVacatedAt = payload.vacatedAt || new Date().toISOString().slice(0, 10);
      const returnedNum = Math.max(0, Number(payload.depositReturnedAmount) || 0);
      const damageNum = payload.hasDamages ? Math.max(0, Number(payload.damageAmount) || 0) : 0;
      const cleanNotes = String(payload.damageNotes || '').trim();
      const settledAtIso = new Date().toISOString();
      const finalDepositStatus =
        payload.depositStatus ||
        (!payload.depositReturned && returnedNum <= 0
          ? 'Forfeited'
          : damageNum > 0
          ? 'Partially Returned'
          : 'Returned');

      const { data: target } = await supabase
        .from('tenants')
        .select('*')
        .or(`id.eq.${id},tenant_ref.eq.${id}`)
        .maybeSingle();

      if (!target) {
        throw new Error('Tenant record not found.');
      }

      const { data: leaseRow } = await supabase
        .from('leases')
        .select('*')
        .or(`tenant_id.eq.${target.id},tenant_ref.eq.${target.tenant_ref}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const cleanUnit = leaseRow?.unit_number || target.unit_number || 'Unit 101';
      const cleanProp = leaseRow?.property_name || target.property_name || 'Main Property';
      const baseRawNotes = String(leaseRow?.lease_notes || 'Standard residential lease agreement.')
        .replace(/\[DEPOSIT_SETTLEMENT:[\s\S]*?\]/g, '')
        .trim();
      const settlementMarker = `[DEPOSIT_SETTLEMENT:${JSON.stringify({
        tenancyStatus: 'Vacated',
        vacatedAt: cleanVacatedAt,
        depositStatus: finalDepositStatus,
        depositReturnedAmount: returnedNum,
        depositDeductionAmount: damageNum,
        depositDamageNotes: cleanNotes,
        depositSettledAt: settledAtIso,
        depositSettledBy: currentEmail || 'Admin',
      })}]`;

      const wasAlreadyVacated =
        String(target.tenancy_status || '').toLowerCase() === 'vacated' ||
        String(target.on_time_streak || '').toLowerCase() === 'vacated' ||
        (leaseRow && leaseRow.is_active === false);

      const { error: tUpdErr } = await supabase
        .from('tenants')
        .update({
          on_time_streak: 'Vacated',
          tenancy_status: 'Vacated',
          vacated_at: cleanVacatedAt,
          deposit_status: finalDepositStatus,
          deposit_returned_amount: returnedNum,
          deposit_deduction_amount: damageNum,
          deposit_damage_notes: cleanNotes,
          deposit_settled_at: settledAtIso,
          deposit_settled_by: currentEmail || 'Admin',
        })
        .eq('id', target.id);
      if (tUpdErr) {
        await supabase.from('tenants').update({ on_time_streak: 'Vacated' }).eq('id', target.id);
      }

      if (leaseRow) {
        await supabase
          .from('leases')
          .update({
            is_active: false,
            lease_end: cleanVacatedAt,
            lease_notes: `${baseRawNotes}${baseRawNotes ? ' ' : ''}${settlementMarker}`,
          })
          .eq('id', leaseRow.id);
      }

      // Check if another active lease still occupies the same physical unit
      let isUnitStillOccupiedByAnother = false;
      const { data: otherActiveLeases } = await supabase
        .from('leases')
        .select('id, tenant_id, tenant_ref')
        .ilike('property_name', cleanProp)
        .ilike('unit_number', cleanUnit)
        .eq('is_active', true);
      if (Array.isArray(otherActiveLeases)) {
        isUnitStillOccupiedByAnother = otherActiveLeases.some(
          (l: any) => l.tenant_id !== target.id && l.tenant_ref !== target.tenant_ref
        );
      }

      let vacatedUnitRow: any = null;
      if (!isUnitStillOccupiedByAnother) {
        if (leaseRow?.unit_id) {
          const { data: uRow } = await supabase
            .from('units')
            .update({ status: 'Available', tenant_ref: null })
            .eq('id', leaseRow.unit_id)
            .select('*')
            .maybeSingle();
          vacatedUnitRow = uRow;
        }
        if (!vacatedUnitRow && target.property_id) {
          const { data: uRow } = await supabase
            .from('units')
            .update({ status: 'Available', tenant_ref: null })
            .eq('property_id', target.property_id)
            .ilike('unit_number', cleanUnit)
            .select('*')
            .maybeSingle();
          vacatedUnitRow = uRow;
        }
        if (!vacatedUnitRow) {
          const { data: uRow } = await supabase
            .from('units')
            .update({ status: 'Available', tenant_ref: null })
            .ilike('property_name', cleanProp)
            .ilike('unit_number', cleanUnit)
            .select('*')
            .maybeSingle();
          vacatedUnitRow = uRow;
        }
      }

      if (!wasAlreadyVacated && !isUnitStillOccupiedByAnother) {
        let matchedUt: any = null;
        if (vacatedUnitRow?.unit_type_id) {
          const { data: ut } = await supabase
            .from('unit_types')
            .select('*')
            .eq('id', vacatedUnitRow.unit_type_id)
            .maybeSingle();
          matchedUt = ut;
        }
        if (!matchedUt && target.property_id) {
          const { data: utList } = await supabase
            .from('unit_types')
            .select('*')
            .eq('property_id', target.property_id);
          if (Array.isArray(utList) && utList.length > 0) {
            const targetUtName = String(leaseRow?.unit_type || target.unit_type || '').trim().toLowerCase();
            matchedUt =
              utList.find((ut: any) => String(ut.name || '').trim().toLowerCase() === targetUtName) ||
              utList.find((ut: any) => Number(ut.occupied_count || 0) > 0) ||
              utList[0];
          }
        }
        if (!matchedUt) {
          const { data: utList } = await supabase
            .from('unit_types')
            .select('*')
            .ilike('property_name', cleanProp);
          if (Array.isArray(utList) && utList.length > 0) {
            const targetUtName = String(leaseRow?.unit_type || target.unit_type || '').trim().toLowerCase();
            matchedUt =
              utList.find((ut: any) => String(ut.name || '').trim().toLowerCase() === targetUtName) ||
              utList.find((ut: any) => Number(ut.occupied_count || 0) > 0) ||
              utList[0];
          }
        }

        if (matchedUt) {
          const nextOcc = Math.max(0, Number(matchedUt.occupied_count || 0) - 1);
          const totCount = Math.max(1, Number(matchedUt.total_count || 1));
          const nextStatus =
            matchedUt.status === 'Inactive'
              ? 'Inactive'
              : nextOcc < totCount
              ? 'Available'
              : 'Occupied';
          await supabase
            .from('unit_types')
            .update({
              occupied_count: nextOcc,
              status: nextStatus,
            })
            .eq('id', matchedUt.id);
        }
      }

      await syncSupabasePropertyOccupancy(target.property_id, cleanProp);

      let createdExpense: ExpenseTransaction | null = null;
      if (payload.recordDamageAsExpense && damageNum > 0) {
        const expTitle =
          String(payload.expenseTitle || '').trim() ||
          `Tenant Damage Repair — ${target.full_name} (${target.tenant_ref}, ${cleanUnit})${cleanNotes ? `: ${cleanNotes}` : ''}`;
        const { data: expCreated } = await supabase
          .from('expenses')
          .insert({
            expense_title: expTitle.slice(0, 220),
            category: payload.expenseCategory || 'Maintenance and Repairs',
            property_name: cleanProp,
            quantity: 1,
            amount: damageNum,
            expense_date: formatShortDate(new Date(cleanVacatedAt)),
            status: 'Completed',
          })
          .select('*')
          .maybeSingle();
        if (expCreated) {
          createdExpense = {
            id: expCreated.id,
            expense: expCreated.expense_title,
            category: expCreated.category,
            property: expCreated.property_name,
            quantity: Number(expCreated.quantity || 1),
            amount: Number(expCreated.amount || 0),
            date: expCreated.expense_date,
            status: expCreated.status || 'Completed',
            createdAt: expCreated.created_at,
          };
        }
      }

      const state = await fetchBootstrapFromSupabase();
      const updated = state.tenants.find((t) => t.id === target.id || t.tenantRef === target.tenant_ref);
      if (!updated) throw new Error('Tenant not found after vacate.');
      return {
        tenant: updated,
        expense: createdExpense,
        properties: state.properties,
        unitTypes: state.unitTypes,
        analytics: state.analytics,
      };
    }

    return await apiRequest<{
      tenant: TenantProfile;
      expense?: ExpenseTransaction | null;
      properties?: PropertyRecord[];
      unitTypes?: UnitTypeItem[];
      analytics?: DashboardAnalytics;
    }>(
      `/api/tenants/${id}/vacate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  deleteTenant: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/tenants/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('tenants')
        .delete()
        .or(`id.eq.${id},tenant_ref.eq.${id}`);
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/tenants/${id}`, {
      method: 'DELETE',
    });
  },

  // Rent Payments CRUD & Server-Verified Payment Confirmation
  createPayment: async (
    data: Partial<RentPaymentRecord>
  ): Promise<RentPaymentRecord> => {
    try {
      return await apiRequest<RentPaymentRecord>('/api/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const todayStr = formatShortDate();
      const amtNum = Math.max(0, Number(data.amount) || 0);
      const finalStatus = data.status || 'Paid';
      const txType = classifyPaymentTransaction(data);
      const isDeposit = txType === 'Security Deposit';
      const resolvedRef = String(data.tenantRef || 'A-001')
        .trim()
        .toUpperCase();
      const paymentCode = `${isDeposit ? 'DEP' : 'PAY'}-${resolvedRef.replace('-', '')}-${Date.now()
        .toString()
        .slice(-4)}`;
      const cleanNote = normalizeNewPaymentNote(data.paymentNote, txType);

      const { data: r, error } = await supabase
        .from('rent_payments')
        .insert({
          payment_code: paymentCode,
          tenant_ref: resolvedRef,
          tenant_name: String(data.tenantName || 'Resident').trim(),
          avatar_bg: '#D8F3E5',
          property_name: String(data.property || 'Main Property').trim(),
          unit_type: data.unitType || 'Deluxe',
          unit_number: data.unitNumber || 'Unit 101',
          payment_note: cleanNote,
          lease_term: data.leaseTerm || '12 months',
          due_date: data.dueDate || todayStr,
          paid_date: data.paidDate || todayStr,
          amount: amtNum,
          status: finalStatus,
        })
        .select('*')
        .single();

      if (error || !r) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Payment (public.rent_payments)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/rent_payments'),
          supabaseError:
            error?.message || 'Failed to record payment in Supabase.',
          category: 'Database Access',
        });
      }

      return {
        id: r.id,
        paymentId: r.payment_code,
        tenantRef: r.tenant_ref,
        tenantName: r.tenant_name,
        avatarBg: r.avatar_bg || '#D8F3E5',
        property: r.property_name,
        unitType: r.unit_type || 'Deluxe',
        unitNumber: r.unit_number,
        paymentNote: formatTransactionDisplayNote(r),
        transactionType: classifyPaymentTransaction(r),
        leaseTerm: r.lease_term || '12 months',
        dueDate: r.due_date,
        paidDate: r.paid_date,
        amount: Number(r.amount_due ?? r.amount_paid ?? r.amount ?? amtNum),
        status: r.status || finalStatus,
      };
    }

    return await apiRequest<RentPaymentRecord>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  confirmPayment: async (id: string): Promise<RentPaymentRecord> => {
    try {
      return await apiRequest<RentPaymentRecord>(`/api/payments/${id}/confirm`, {
        method: 'POST',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const todayStr = formatShortDate();
      const nowIso = new Date().toISOString();

      let { data: target } = await supabase
        .from('rent_payments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!target) {
        const { data: byRef } = await supabase
          .from('rent_payments')
          .select('*')
          .ilike('tenant_ref', id)
          .neq('status', 'Paid')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        target = byRef;
      }

      if (!target) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Confirm Payment (${id})`,
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/rent_payments'),
          supabaseError: 'Payment record not found in Supabase.',
          category: 'Database Access',
        });
      }

      const { data: updated, error } = await supabase
        .from('rent_payments')
        .update({
          status: 'Paid',
          paid_date: todayStr,
          confirmed_at: nowIso,
        })
        .eq('id', target.id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Confirm Payment (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/rent_payments'),
          supabaseError: error?.message || 'Failed to confirm payment.',
          category: 'Database Access',
        });
      }

      return {
        id: updated.id,
        paymentId: updated.payment_code,
        tenantRef: updated.tenant_ref,
        tenantName: updated.tenant_name,
        avatarBg: updated.avatar_bg || '#D8F3E5',
        property: updated.property_name,
        unitType: updated.unit_type || 'Deluxe',
        unitNumber: updated.unit_number,
        paymentNote: formatTransactionDisplayNote(updated),
        transactionType: classifyPaymentTransaction(updated),
        leaseTerm: updated.lease_term || '12 months',
        dueDate: updated.due_date,
        paidDate: updated.paid_date,
        amount: Number(updated.amount_due ?? updated.amount ?? 0),
        status: 'Paid',
        confirmedAt: updated.confirmed_at,
      };
    }

    return await apiRequest<RentPaymentRecord>(`/api/payments/${id}/confirm`, {
      method: 'POST',
    });
  },

  deletePayment: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/payments/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('rent_payments')
        .delete()
        .eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Payment (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/rent_payments'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/payments/${id}`, {
      method: 'DELETE',
    });
  },

  // Maintenance CRUD
  createMaintenance: async (
    data: Partial<MaintenanceItem>
  ): Promise<MaintenanceItem> => {
    try {
      return await apiRequest<MaintenanceItem>('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const ref = String(
        data.tenantRef || currentTenantRef || 'GENERAL'
      ).toUpperCase();
      const { data: created, error } = await supabase
        .from('maintenance_requests')
        .insert({
          unit_number: data.unitNumber || 'Unit 101',
          property_name: data.property || 'Main Property',
          unit_type: data.unitType || 'Deluxe',
          tenant_ref: ref,
          maintenance_status: data.maintenanceStatus || 'Needs Inspection',
          priority: data.priority || 'Medium',
          assigned_to: data.assignedTo || 'Site Caretaker',
          notes: String(data.notes || '').trim(),
          selected: false,
        })
        .select('*')
        .single();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest:
            'POST Supabase Create Maintenance (public.maintenance_requests)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint(
            '/rest/v1/maintenance_requests'
          ),
          supabaseError:
            error?.message || 'Failed to create maintenance request.',
          category: 'Database Access',
        });
      }

      return {
        id: created.id,
        unitNumber: created.unit_number,
        property: created.property_name,
        unitType: created.unit_type || 'Deluxe',
        maintenanceStatus: created.maintenance_status || 'Needs Inspection',
        priority: created.priority || 'Medium',
        assignedTo: created.assigned_to,
        notes: created.notes,
        tenantRef: created.tenant_ref,
        selected: Boolean(created.selected),
        createdAt: created.created_at,
      };
    }

    return await apiRequest<MaintenanceItem>('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateMaintenance: async (
    id: string,
    data: Partial<MaintenanceItem>
  ): Promise<MaintenanceItem> => {
    try {
      return await apiRequest<MaintenanceItem>(`/api/maintenance/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const patch: Record<string, any> = {};
      if (data.maintenanceStatus !== undefined)
        patch.maintenance_status = data.maintenanceStatus;
      if (data.priority !== undefined) patch.priority = data.priority;
      if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
      if (data.notes !== undefined) patch.notes = data.notes;
      if (data.selected !== undefined) patch.selected = Boolean(data.selected);

      const { data: row, error } = await supabase
        .from('maintenance_requests')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

      if (error || !row) {
        throw createDiagnosticError({
          failedRequest: `PUT Supabase Update Maintenance (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint(
            '/rest/v1/maintenance_requests'
          ),
          supabaseError:
            error?.message || 'Failed to update maintenance request.',
          category: 'Database Access',
        });
      }

      return {
        id: row.id,
        unitNumber: row.unit_number,
        property: row.property_name,
        unitType: row.unit_type || 'Deluxe',
        maintenanceStatus: row.maintenance_status || 'Needs Inspection',
        priority: row.priority || 'Medium',
        assignedTo: row.assigned_to,
        notes: row.notes,
        tenantRef: row.tenant_ref,
        selected: Boolean(row.selected),
        createdAt: row.created_at,
      };
    }

    return await apiRequest<MaintenanceItem>(`/api/maintenance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteMaintenance: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/maintenance/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('maintenance_requests')
        .delete()
        .eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Maintenance (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint(
            '/rest/v1/maintenance_requests'
          ),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/maintenance/${id}`, {
      method: 'DELETE',
    });
  },

  // Expenses CRUD
  createExpense: async (
    data: Partial<ExpenseTransaction>
  ): Promise<ExpenseTransaction> => {
    try {
      return await apiRequest<ExpenseTransaction>('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const expDate = data.date || formatShortDate();
      const amtNum = Number(data.amount || 0);
      const { data: created, error } = await supabase
        .from('expenses')
        .insert({
          expense_title: String(data.expense || '').trim(),
          category: data.category || 'Maintenance and Repairs',
          property_name: data.property || 'All Properties',
          quantity: Math.max(1, Number(data.quantity) || 1),
          amount: amtNum,
          expense_date: expDate,
          status: data.status || 'Completed',
        })
        .select('*')
        .single();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Expense (public.expenses)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/expenses'),
          supabaseError: error?.message || 'Failed to save expense in Supabase.',
          category: 'Database Access',
        });
      }

      return {
        id: created.id,
        expense: created.expense_title,
        category: created.category,
        property: created.property_name,
        quantity: Number(created.quantity || 1),
        amount: Number(created.amount || 0),
        date: created.expense_date,
        status: created.status || 'Completed',
        createdAt: created.created_at,
      };
    }

    return await apiRequest<ExpenseTransaction>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteExpense: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/expenses/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Expense (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/expenses'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/expenses/${id}`, {
      method: 'DELETE',
    });
  },

  // Tasks CRUD
  createTask: async (data: {
    date: string;
    title: string;
  }): Promise<DashboardTaskRecord> => {
    try {
      return await apiRequest<DashboardTaskRecord>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const tone = Date.now() % 2 === 0 ? 'mint' : 'lime';
      const { data: created, error } = await supabase
        .from('property_tasks')
        .insert({
          scheduled_date: data.date || formatShortDate(),
          title: String(data.title).trim(),
          tone,
          done: false,
        })
        .select('*')
        .single();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Task (public.property_tasks)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/property_tasks'),
          supabaseError: error?.message || 'Failed to create task in Supabase.',
          category: 'Database Access',
        });
      }

      return {
        id: created.id,
        date: created.scheduled_date,
        title: created.title,
        tone: created.tone || 'mint',
        done: Boolean(created.done),
      };
    }

    return await apiRequest<DashboardTaskRecord>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  toggleTask: async (id: string): Promise<DashboardTaskRecord> => {
    try {
      return await apiRequest<DashboardTaskRecord>(`/api/tasks/${id}/toggle`, {
        method: 'POST',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data: existing } = await supabase
        .from('property_tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      const { data: updated, error } = await supabase
        .from('property_tasks')
        .update({ done: !existing?.done })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Toggle Task (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/property_tasks'),
          supabaseError: error?.message || 'Failed to update task.',
          category: 'Database Access',
        });
      }

      return {
        id: updated.id,
        date: updated.scheduled_date,
        title: updated.title,
        tone: updated.tone || 'mint',
        done: Boolean(updated.done),
      };
    }

    return await apiRequest<DashboardTaskRecord>(`/api/tasks/${id}/toggle`, {
      method: 'POST',
    });
  },

  deleteTask: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('property_tasks')
        .delete()
        .eq('id', id);
      if (error) {
        throw createDiagnosticError({
          failedRequest: `DELETE Supabase Task (${id})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/property_tasks'),
          supabaseError: error.message,
          category: 'Database Access',
        });
      }
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  // Property Reviews CRUD
  createReview: async (data: {
    propertyName: string;
    tenantRef?: string;
    tenantName?: string;
    maintenanceScore: number;
    cleanlinessScore: number;
    managementScore: number;
    comfortScore: number;
    locationScore: number;
    comment?: string;
  }): Promise<PropertyReviewRecord> => {
    try {
      return await apiRequest<PropertyReviewRecord>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const m = Math.min(5, Math.max(1, Number(data.maintenanceScore) || 5));
      const c = Math.min(5, Math.max(1, Number(data.cleanlinessScore) || 5));
      const mg = Math.min(5, Math.max(1, Number(data.managementScore) || 5));
      const cf = Math.min(5, Math.max(1, Number(data.comfortScore) || 5));
      const lc = Math.min(5, Math.max(1, Number(data.locationScore) || 5));
      const overall = Number(((m + c + mg + cf + lc) / 5).toFixed(2));

      const { data: created, error } = await supabase
        .from('property_reviews')
        .insert({
          property_name: data.propertyName || 'Portfolio Property',
          tenant_ref: data.tenantRef || currentTenantRef || 'A-001',
          tenant_name: data.tenantName || 'Resident',
          overall_score: overall,
          maintenance_score: m,
          cleanliness_score: c,
          management_score: mg,
          comfort_score: cf,
          location_score: lc,
          comment: data.comment || '',
        })
        .select('*')
        .single();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Review (public.property_reviews)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/property_reviews'),
          supabaseError: error?.message || 'Failed to save review in Supabase.',
          category: 'Database Access',
        });
      }

      return {
        id: created.id,
        propertyName: created.property_name,
        tenantRef: created.tenant_ref,
        tenantName: created.tenant_name,
        overallScore: Number(created.overall_score || 5),
        maintenanceScore: Number(created.maintenance_score || 5),
        cleanlinessScore: Number(created.cleanliness_score || 5),
        managementScore: Number(created.management_score || 5),
        comfortScore: Number(created.comfort_score || 5),
        locationScore: Number(created.location_score || 5),
        comment: created.comment || '',
        createdAt: created.created_at,
      };
    }

    return await apiRequest<PropertyReviewRecord>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Reminders (SMS & Email) & Conversation Threads
  createThread: async (data: {
    tenantRef?: string;
    tenantName: string;
    unitNumber: string;
    property: string;
    email?: string;
    phone?: string;
    channel?: 'SMS' | 'Email' | 'SMS & Email';
    reminderType?:
      | 'Rent Due'
      | 'Balance Arrears'
      | 'Payment Receipt'
      | 'Custom Notice';
    subject?: string;
    balanceDue?: number;
    initialMessage: string;
  }): Promise<ChatThread> => {
    try {
      return await apiRequest<ChatThread>('/api/threads', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const resolvedRef = String(data.tenantRef || 'A-001').toUpperCase();
      const deliveryChannel = data.channel || 'SMS & Email';
      const remType = data.reminderType || 'Rent Due';
      const nowTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const newMsg = {
        id: `rem-${Date.now()}`,
        sender: (currentRole === 'tenant' ? 'tenant' : 'manager') as
          | 'tenant'
          | 'manager',
        senderName: currentEmail || 'Property Manager',
        channel: deliveryChannel,
        reminderType: remType,
        subject:
          data.subject ||
          `${remType} Notice — Ref ${resolvedRef} (${data.unitNumber || 'Unit 101'})`,
        recipientPhone: data.phone || 'On file',
        recipientEmail:
          data.email ||
          `${String(data.tenantName).toLowerCase().replace(/\s+/g, '.')}@tenant.io`,
        balanceDue:
          data.balanceDue !== undefined ? Number(data.balanceDue) : undefined,
        text: String(data.initialMessage).trim(),
        time: nowTime,
      };
      const docEntry = {
        name: `${remType.replace(/\s+/g, '_')}_${resolvedRef}.txt`,
        size: `${deliveryChannel} • Sent ${nowTime}`,
      };

      const { data: existingTh } = await supabase
        .from('chat_threads')
        .select('*')
        .ilike('tenant_ref', resolvedRef)
        .maybeSingle();

      if (existingTh) {
        const updatedMsgs = [
          ...(Array.isArray(existingTh.messages) ? existingTh.messages : []),
          newMsg,
        ];
        const updatedDocs = [
          docEntry,
          ...(Array.isArray(existingTh.documents) ? existingTh.documents : []),
        ].slice(0, 8);
        const { data: updated, error } = await supabase
          .from('chat_threads')
          .update({
            messages: updatedMsgs,
            documents: updatedDocs,
            last_message: `[${deliveryChannel}] ${String(data.initialMessage).trim()}`,
            last_time: nowTime,
            unread_count: 0,
          })
          .eq('id', existingTh.id)
          .select('*')
          .single();

        if (error || !updated) {
          throw createDiagnosticError({
            failedRequest: 'PUT Supabase Update Thread (public.chat_threads)',
            statusCode: 400,
            endpoint: getSanitizedSupabaseEndpoint('/rest/v1/chat_threads'),
            supabaseError: error?.message || 'Failed to update thread.',
            category: 'Database Access',
          });
        }

        return {
          id: updated.id,
          tenantRef: updated.tenant_ref,
          tenantName: updated.tenant_name,
          unitNumber: updated.unit_number,
          property: updated.property_name,
          avatarBg: updated.avatar_bg || '#D8F3E5',
          lastMessage: updated.last_message,
          time: updated.last_time,
          unread: 0,
          email: updated.email,
          phone: updated.phone,
          bio: updated.bio || '',
          documents: updatedDocs,
          messages: updatedMsgs,
        };
      }

      const { data: created, error } = await supabase
        .from('chat_threads')
        .insert({
          tenant_ref: resolvedRef,
          tenant_name: String(data.tenantName).trim(),
          unit_number: data.unitNumber || 'Unit 101',
          property_name: data.property || 'Main Property',
          avatar_bg: '#D8F3E5',
          last_message: `[${deliveryChannel}] ${String(data.initialMessage).trim()}`,
          last_time: nowTime,
          unread_count: 0,
          email:
            data.email ||
            `${String(data.tenantName).toLowerCase().replace(/\s+/g, '.')}@tenant.io`,
          phone: data.phone || 'On file',
          bio: `Resident in ${data.unitNumber || 'Unit 101'} at ${
            data.property || 'Main Property'
          }.`,
          documents: [docEntry],
          messages: [newMsg],
        })
        .select('*')
        .single();

      if (error || !created) {
        throw createDiagnosticError({
          failedRequest: 'POST Supabase Create Thread (public.chat_threads)',
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/chat_threads'),
          supabaseError: error?.message || 'Failed to create thread.',
          category: 'Database Access',
        });
      }

      return {
        id: created.id,
        tenantRef: created.tenant_ref,
        tenantName: created.tenant_name,
        unitNumber: created.unit_number,
        property: created.property_name,
        avatarBg: created.avatar_bg || '#D8F3E5',
        lastMessage: created.last_message,
        time: created.last_time,
        unread: 0,
        email: created.email,
        phone: created.phone,
        bio: created.bio || '',
        documents: [docEntry],
        messages: [newMsg],
      };
    }

    return await apiRequest<ChatThread>('/api/threads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  sendMessage: async (
    threadId: string,
    text: string,
    meta?: {
      channel?: 'SMS' | 'Email' | 'SMS & Email';
      reminderType?:
        | 'Rent Due'
        | 'Balance Arrears'
        | 'Payment Receipt'
        | 'Custom Notice';
      subject?: string;
      recipientPhone?: string;
      recipientEmail?: string;
      balanceDue?: number;
    }
  ): Promise<ChatThread> => {
    try {
      return await apiRequest<ChatThread>(`/api/messages/${threadId}`, {
        method: 'POST',
        body: JSON.stringify({ text, ...meta }),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data: th } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();

      if (!th) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Send Message (${threadId})`,
          statusCode: 404,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/chat_threads'),
          supabaseError: 'Thread not found in Supabase.',
          category: 'Database Access',
        });
      }

      const deliveryChannel = meta?.channel || 'SMS & Email';
      const remType = meta?.reminderType || 'Rent Due';
      const nowTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const newMsg = {
        id: `rem-${Date.now()}`,
        sender: (currentRole === 'tenant' ? 'tenant' : 'manager') as
          | 'tenant'
          | 'manager',
        senderName: currentEmail || 'Property Manager',
        channel: deliveryChannel,
        reminderType: remType,
        subject:
          meta?.subject ||
          `${remType} Notice — Ref ${th.tenant_ref} (${th.unit_number})`,
        recipientPhone: meta?.recipientPhone || th.phone,
        recipientEmail: meta?.recipientEmail || th.email,
        balanceDue: meta?.balanceDue,
        text: String(text).trim(),
        time: nowTime,
      };
      const updatedMsgs = [
        ...(Array.isArray(th.messages) ? th.messages : []),
        newMsg,
      ];

      const { data: updated, error } = await supabase
        .from('chat_threads')
        .update({
          messages: updatedMsgs,
          last_message: `[${deliveryChannel}] ${String(text).trim()}`,
          last_time: nowTime,
          unread_count: 0,
        })
        .eq('id', threadId)
        .select('*')
        .single();

      if (error || !updated) {
        throw createDiagnosticError({
          failedRequest: `POST Supabase Send Message (${threadId})`,
          statusCode: 400,
          endpoint: getSanitizedSupabaseEndpoint('/rest/v1/chat_threads'),
          supabaseError: error?.message || 'Failed to send message.',
          category: 'Database Access',
        });
      }

      return {
        id: updated.id,
        tenantRef: updated.tenant_ref,
        tenantName: updated.tenant_name,
        unitNumber: updated.unit_number,
        property: updated.property_name,
        avatarBg: updated.avatar_bg || '#D8F3E5',
        lastMessage: updated.last_message,
        time: updated.last_time,
        unread: 0,
        email: updated.email,
        phone: updated.phone,
        bio: updated.bio || '',
        documents: Array.isArray(updated.documents) ? updated.documents : [],
        messages: updatedMsgs,
      };
    }

    return await apiRequest<ChatThread>(`/api/messages/${threadId}`, {
      method: 'POST',
      body: JSON.stringify({ text, ...meta }),
    });
  },

  markThreadRead: async (threadId: string): Promise<ChatThread> => {
    try {
      return await apiRequest<ChatThread>(`/api/messages/${threadId}/read`, {
        method: 'POST',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('chat_threads')
        .update({ unread_count: 0 })
        .eq('id', threadId)
        .select('*')
        .maybeSingle();
      return (data || { id: threadId }) as ChatThread;
    }

    return await apiRequest<ChatThread>(`/api/messages/${threadId}/read`, {
      method: 'POST',
    });
  },

  deleteThread: async (id: string): Promise<{ success: boolean }> => {
    try {
      return await apiRequest<{ success: boolean }>(`/api/threads/${id}`, {
        method: 'DELETE',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      await supabase.from('chat_threads').delete().eq('id', id);
      return { success: true };
    }

    return await apiRequest<{ success: boolean }>(`/api/threads/${id}`, {
      method: 'DELETE',
    });
  },

  // SMS Notification Service & Automation
  getSmsHistory: async () => {
    try {
      return await apiRequest<{
        logs: SmsLogRecord[];
        settings: SmsNotificationSettings;
      }>('/api/sms/history');
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const state = await fetchBootstrapFromSupabase();
      return {
        logs: state.smsLogs || [],
        settings: state.smsSettings!,
      };
    }
    return await apiRequest<{
      logs: SmsLogRecord[];
      settings: SmsNotificationSettings;
    }>('/api/sms/history');
  },

  sendSms: async (data: {
    tenantId?: string;
    tenantRef: string;
    tenantName: string;
    recipientPhone: string;
    propertyName: string;
    unitNumber: string;
    triggerType?: SmsTriggerType;
    messageBody: string;
    forceSend?: boolean;
  }) => {
    return await apiRequest<{
      success: boolean;
      log: SmsLogRecord;
      message: string;
      duplicateSkipped?: boolean;
    }>('/api/sms/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  sendBulkSms: async (data: {
    audience?: 'all' | 'property' | 'rent_due' | 'overdue' | 'custom';
    propertyName?: string;
    tenantRefs?: string[];
    triggerType?: SmsTriggerType;
    messageTemplate: string;
    forceSend?: boolean;
  }) => {
    return await apiRequest<{
      success: boolean;
      totalTargeted: number;
      sentCount: number;
      skippedDuplicatesCount: number;
      failedCount: number;
      logs: SmsLogRecord[];
      message: string;
    }>('/api/sms/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateSmsSettings: async (data: Partial<SmsNotificationSettings>) => {
    try {
      return await apiRequest<{
        settings: SmsNotificationSettings;
        message: string;
      }>('/api/sms/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      const nowIso = new Date().toISOString();
      await supabase.from('sms_notification_settings').upsert({
        id: 'default',
        environment: data.environment || 'sandbox',
        sender_id: data.senderId || 'ARABELLA',
        master_enabled: data.masterEnabled ?? true,
        auto_tenant_registered: data.autoTenantRegistered ?? true,
        auto_rent_due_soon: data.autoRentDueSoon ?? true,
        auto_rent_overdue: data.autoRentOverdue ?? true,
        auto_payment_confirmed: data.autoPaymentConfirmed ?? true,
        auto_admin_announcement: data.autoAdminAnnouncement ?? true,
        prevent_duplicates_hours: data.preventDuplicatesHours ?? 24,
        updated_by: currentEmail || 'Administrator',
        updated_at: nowIso,
      });

      const state = await fetchBootstrapFromSupabase();
      return {
        settings: state.smsSettings!,
        message: 'SMS notification settings saved in Supabase.',
      };
    }

    return await apiRequest<{
      settings: SmsNotificationSettings;
      message: string;
    }>('/api/sms/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  triggerAutomatedSmsChecks: async () => {
    try {
      return await apiRequest<{
        success: boolean;
        dueSoonSent: number;
        overdueSent: number;
        skippedDuplicates: number;
        logs: SmsLogRecord[];
        message: string;
      }>('/api/sms/run-automated-checks', {
        method: 'POST',
      });
    } catch (backendErr) {
      if (!isSupabaseConfigured || !supabase) throw backendErr;
    }

    if (isSupabaseConfigured && supabase) {
      return {
        success: true,
        dueSoonSent: 0,
        overdueSent: 0,
        skippedDuplicates: 0,
        logs: [],
        message: 'Automated SMS check synchronized with Supabase.',
      };
    }

    return await apiRequest<{
      success: boolean;
      dueSoonSent: number;
      overdueSent: number;
      skippedDuplicates: number;
      logs: SmsLogRecord[];
      message: string;
    }>('/api/sms/run-automated-checks', {
      method: 'POST',
    });
  },

  testSms: async (data: {
    mobile: string;
    message: string;
    senderId?: string;
    environment?: 'sandbox' | 'production';
    smsType?: 'promotional' | 'transactional';
  }) => {
    return await apiRequest<{
      success: boolean;
      log?: SmsLogRecord;
      message: string;
      simulated?: boolean;
      messageId?: string;
    }>('/api/sms/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSmsBalance: async () => {
    return await apiRequest<{
      success: boolean;
      balanceCredits?: number;
      currency?: string;
      description?: string;
      simulated?: boolean;
      errorMessage?: string;
    }>('/api/sms/balance', {
      method: 'GET',
    });
  },

  querySmsDlr: async (messageId: string) => {
    return await apiRequest<{
      success: boolean;
      messageId: string;
      deliveryStatus: string;
      deliveredAt?: string;
      reason?: string;
    }>('/api/sms/dlr', {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    });
  },

  getEmailHistory: async () => {
    return await apiRequest<{
      emails: BrandedEmailRecord[];
      settings: EmailNotificationSettings;
    }>('/api/email/history', {
      method: 'GET',
    });
  },

  updateEmailSettings: async (data: Partial<EmailNotificationSettings>) => {
    return await apiRequest<{
      settings: EmailNotificationSettings;
      message: string;
    }>('/api/email/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  sendEmailReminder: async (data: {
    tenantId?: string;
    tenantRef: string;
    tenantName: string;
    recipientEmail?: string;
    propertyName: string;
    unitNumber: string;
    triggerType: EmailReminderTriggerType;
    amountDue?: number;
    dueDate?: string;
    leaseEndDate?: string;
    customSubject?: string;
    customBody?: string;
    forceSend?: boolean;
  }) => {
    return await apiRequest<{
      success: boolean;
      log?: BrandedEmailRecord;
      resendId?: string;
      status?: string;
      message: string;
      duplicateSkipped?: boolean;
      disabledSkipped?: boolean;
    }>('/api/email/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  retryEmailNotification: async (emailId: string) => {
    return await apiRequest<{
      success: boolean;
      email?: BrandedEmailRecord;
      message: string;
      error?: string;
    }>(`/api/email/retry/${encodeURIComponent(emailId)}`, {
      method: 'POST',
    });
  },

  testEmail: async (data: { recipientEmail: string; customBody?: string }) => {
    return await apiRequest<{
      success: boolean;
      log?: BrandedEmailRecord;
      resendId?: string;
      status?: string;
      message: string;
    }>('/api/email/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  triggerAutomatedEmailChecks: async () => {
    return await apiRequest<{
      success: boolean;
      nairobiDate: string;
      upcoming3dSent: number;
      dueTodaySent: number;
      overdueSent: number;
      leaseExpiry30dSent: number;
      leaseExpiry7dSent: number;
      skippedDuplicates: number;
      skippedPaidOrDisabled: number;
      failedCount: number;
      totalSent: number;
      emails: BrandedEmailRecord[];
      message: string;
    }>('/api/email/run-automated-checks', {
      method: 'POST',
    });
  },

  runAnniversaryBillingCycle: async (referenceDate?: string) => {
    return await apiRequest<{
      success: boolean;
      referenceDate: string;
      generatedCount: number;
      overdueUpdatedCount: number;
      skippedDuplicateCount: number;
      message: string;
    }>('/api/billing/run-anniversary-cycle', {
      method: 'POST',
      body: JSON.stringify(referenceDate ? { referenceDate } : {}),
    });
  },

  getAllSettings: async (options?: { forceRefresh?: boolean }) => {
    const endpoint = options?.forceRefresh ? '/api/settings/all?refresh=1' : '/api/settings/all';
    const res = await apiRequest<AllSettingsBundle>(endpoint, {
      method: 'GET',
    });
    if (res?.systemSettings && res?.userPreferences) {
      setCachedSettingsBundle(res, currentUserId);
    }
    return res;
  },

  updateSystemSettingsSection: async (
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
    data: Record<string, any>
  ) => {
    const res = await apiRequest<{
      systemSettings: SystemSettingsRecord;
      message: string;
    }>(`/api/settings/system/${encodeURIComponent(section)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const cached = getCachedSettingsBundle(currentUserId);
    if (cached && res?.systemSettings) {
      setCachedSettingsBundle({ ...cached, systemSettings: res.systemSettings }, currentUserId);
    }
    return res;
  },

  updateUserPreferences: async (data: Partial<UserAppearancePreferences>) => {
    const res = await apiRequest<{
      userPreferences: UserAppearancePreferences;
      message: string;
    }>('/api/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const cached = getCachedSettingsBundle(currentUserId);
    if (cached && res?.userPreferences) {
      setCachedSettingsBundle({ ...cached, userPreferences: res.userPreferences }, currentUserId);
    }
    return res;
  },

  upsertPayHeroPaybill: async (data: Partial<PayHeroPaybillMapping>) => {
    const res = await apiRequest<{
      paybills: PayHeroPaybillMapping[];
      message: string;
    }>('/api/settings/payhero/paybills', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const cached = getCachedSettingsBundle(currentUserId);
    if (cached && Array.isArray(res?.paybills)) {
      setCachedSettingsBundle({ ...cached, paybills: res.paybills }, currentUserId);
    }
    return res;
  },

  deletePayHeroPaybill: async (id: string) => {
    const res = await apiRequest<{
      paybills: PayHeroPaybillMapping[];
      message: string;
    }>(`/api/settings/payhero/paybills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const cached = getCachedSettingsBundle(currentUserId);
    if (cached && Array.isArray(res?.paybills)) {
      setCachedSettingsBundle({ ...cached, paybills: res.paybills }, currentUserId);
    }
    return res;
  },

  recordManualPayHeroC2B: async (data: {
    paybillNumber: string;
    channelId?: string;
    accountReference: string;
    amount: number;
    mpesaReceiptNumber?: string;
    payerPhone?: string;
    payerName?: string;
    notes?: string;
  }) => {
    const res = await apiRequest<{
      success: boolean;
      transaction: PayHeroTransactionRecord;
      transactions: PayHeroTransactionRecord[];
      matchedTenant: {
        id: string;
        tenantRef: string;
        name: string;
        property: string;
        unitNumber: string;
      } | null;
      message: string;
    }>('/api/settings/payhero/manual-c2b', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const cached = getCachedSettingsBundle(currentUserId);
    if (cached && Array.isArray(res?.transactions)) {
      setCachedSettingsBundle({ ...cached, transactions: res.transactions }, currentUserId);
    }
    return res;
  },

  exportDatabaseSnapshot: async () => {
    return await apiRequest<{
      exportedAt: string;
      exportedBy: string;
      system: string;
      counts: Record<string, number>;
      data: Record<string, any>;
    }>('/api/settings/database/export', {
      method: 'GET',
    });
  },
};

export const smsApi = {
  getSmsHistory: rentalApi.getSmsHistory,
  sendSingleSms: rentalApi.sendSms,
  sendBulkSms: rentalApi.sendBulkSms,
  updateNotificationSettings: rentalApi.updateSmsSettings,
  updateSmsSettings: rentalApi.updateSmsSettings,
  triggerAutomatedSmsChecks: rentalApi.triggerAutomatedSmsChecks,
  testSms: rentalApi.testSms,
  getSmsBalance: rentalApi.getSmsBalance,
  querySmsDlr: rentalApi.querySmsDlr,
};

export const emailApi = {
  getEmailHistory: rentalApi.getEmailHistory,
  updateEmailSettings: rentalApi.updateEmailSettings,
  sendEmailReminder: rentalApi.sendEmailReminder,
  retryEmailNotification: rentalApi.retryEmailNotification,
  testEmail: rentalApi.testEmail,
  triggerAutomatedEmailChecks: rentalApi.triggerAutomatedEmailChecks,
};

export const settingsApi = {
  getAllSettings: rentalApi.getAllSettings,
  updateSystemSettingsSection: rentalApi.updateSystemSettingsSection,
  updateUserPreferences: rentalApi.updateUserPreferences,
  upsertPayHeroPaybill: rentalApi.upsertPayHeroPaybill,
  deletePayHeroPaybill: rentalApi.deletePayHeroPaybill,
  recordManualPayHeroC2B: rentalApi.recordManualPayHeroC2B,
  exportDatabaseSnapshot: rentalApi.exportDatabaseSnapshot,
};

export { SupabaseIntegrationError };



