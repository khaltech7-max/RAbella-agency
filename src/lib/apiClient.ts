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
  SmsLogRecord,
  SmsNotificationSettings,
  SmsTriggerType,
  getRoleDisplayLabel,
  getAllowedPagesForRole,
} from '../data/rentalData';
import { supabase } from './supabaseClient';

const AUTH_STORAGE_KEY = 'rentify_auth_token';

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

export function setOnUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function getStoredToken(): string | null {
  if (currentToken) return currentToken;
  if (typeof window !== 'undefined') {
    return (
      window.sessionStorage.getItem(AUTH_STORAGE_KEY) ||
      window.localStorage.getItem(AUTH_STORAGE_KEY)
    );
  }
  return null;
}

export function setAuthContext(session: UserSession, rememberMe?: boolean) {
  currentToken = session.token;
  currentUserId = session.id;
  currentRole = session.role;
  currentEmail = session.email;
  currentTenantRef = session.tenantRef;
  if (typeof window !== 'undefined' && session.token) {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, session.token);
    if (rememberMe) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, session.token);
    }
  }
}

export async function clearAuthContext() {
  currentToken = null;
  currentUserId = '';
  currentEmail = '';
  currentTenantRef = undefined;
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let bearerToken = getStoredToken();
  if (!bearerToken && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      bearerToken = data.session.access_token;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(currentUserId ? { 'X-User-Id': currentUserId } : {}),
    ...(currentEmail ? { 'X-User-Email': currentEmail } : {}),
    ...(currentRole ? { 'X-User-Role': currentRole } : {}),
    ...(currentTenantRef ? { 'X-Tenant-Ref': currentTenantRef } : {}),
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const isPublicAuthAction =
      path === '/api/auth/login' ||
      path === '/api/auth/setup-password' ||
      path === '/api/auth/recover-password' ||
      path.startsWith('/api/auth/validate-invite');
    if (response.status === 401 && !isPublicAuthAction) {
      await clearAuthContext();
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    const fallbackError =
      response.status === 404
        ? 'Service endpoint not found (404). Please ensure backend serverless routes are deployed.'
        : response.status === 401
        ? 'Invalid email or password. Please verify your credentials.'
        : `Request failed (${response.status})`;
    throw new Error(payload.error || fallbackError);
  }
  return payload as T;
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
  smsLogs?: SmsLogRecord[];
  smsSettings?: SmsNotificationSettings;
  analytics: DashboardAnalytics;
}

export const rentalApi = {
  getBootstrap: () => apiRequest<BootstrapPayload>('/api/bootstrap'),

  getSession: () =>
    apiRequest<{ authenticated: boolean; user: UserSession }>('/api/auth/session'),

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
    const cleanEmail = email.trim().toLowerCase();
    try {
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
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isEndpointMissing =
        errMsg.includes('not found') ||
        errMsg.includes('404') ||
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('NetworkError');

      // If backend gave a standard credential error or Supabase client isn't configured, propagate immediately
      if (!isEndpointMissing || !supabase) {
        throw err;
      }

      // Direct Client-Side Fallback via Supabase Auth
      try {
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (authErr || !authData?.user) {
          throw new Error(
            authErr?.message || 'Invalid email or password. Please verify your credentials.'
          );
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        const { data: tenant } = await supabase
          .from('tenants')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        const meta = authData.user.user_metadata || {};
        const resolvedRole: UserRole = (meta.staff_role || profile?.role || (tenant ? 'tenant' : 'owner')) as UserRole;
        const resolvedName = profile?.full_name || meta.full_name || tenant?.full_name || cleanEmail.split('@')[0];
        const nowIso = new Date().toISOString();

        const fallbackUser: UserSession = {
          id: profile?.id || authData.user.id,
          email: cleanEmail,
          fullName: resolvedName,
          role: resolvedRole,
          roleLabel: getRoleDisplayLabel(resolvedRole, tenant?.tenant_ref),
          status: (profile?.account_status || meta.account_status || 'Active') as AccountStatus,
          lastLoginAt: nowIso,
          permissions: getAllowedPagesForRole(resolvedRole),
          tenantRef: tenant?.tenant_ref || undefined,
          token: authData.session?.access_token || authData.user.id,
        };

        setAuthContext(fallbackUser, options?.rememberMe);
        return { user: fallbackUser };
      } catch (fallbackErr: any) {
        throw new Error(
          fallbackErr?.message || 'Invalid email or password. Please verify your credentials.'
        );
      }
    }
  },

  logout: () =>
    apiRequest<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  validateInvite: (email: string, token: string) =>
    apiRequest<{
      valid: boolean;
      email: string;
      fullName: string;
      roleLabel: string;
      jobTitle?: string;
      assignedPropertyName?: string;
      expiresAt?: string;
      message: string;
    }>(
      `/api/auth/validate-invite?email=${encodeURIComponent(
        email
      )}&token=${encodeURIComponent(token)}`
    ),

  signup: (fullName: string, email: string, password: string, role: UserRole) =>
    apiRequest<{ user: UserSession }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password, role }),
    }),

  setupPassword: (data: {
    email: string;
    password: string;
    inviteToken?: string;
  }) =>
    apiRequest<{
      user: UserSession;
      message: string;
      redirectToLogin?: boolean;
      portal?: 'management' | 'tenant';
    }>('/api/auth/setup-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recoverPassword: (email: string, portal?: 'management' | 'tenant') =>
    apiRequest<{
      success: boolean;
      message: string;
      recoveryToken?: string;
      recoveryLink?: string;
    }>('/api/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({ email, portal }),
    }),

  switchRole: (role: UserRole, userId?: string) =>
    apiRequest<{ user: UserSession }>('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role, userId }),
    }),

  // Staff Accounts & Access Management CRUD
  createStaff: (data: {
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
  }) =>
    apiRequest<{
      staff: UserSession;
      message: string;
      inviteLink?: string;
      resendId?: string;
      deliveryStatus?: string;
      brandedEmail?: BrandedEmailRecord;
    }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStaff: (
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
  ) =>
    apiRequest<{ staff: UserSession; message: string }>(`/api/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  resendStaffInvite: (id: string) =>
    apiRequest<{
      staff: UserSession;
      message: string;
      inviteToken?: string;
      inviteLink?: string;
      resendId?: string;
      deliveryStatus?: string;
      brandedEmail?: BrandedEmailRecord;
    }>(`/api/staff/${id}/resend-invite`, {
      method: 'POST',
    }),

  revokeStaffInvite: (id: string) =>
    apiRequest<{
      staff: UserSession;
      message: string;
    }>(`/api/staff/${id}/revoke-invite`, {
      method: 'POST',
    }),

  offboardStaff: (
    id: string,
    data: {
      targetStatus: 'Suspended' | 'Deactivated';
      transferToStaffId?: string;
      reason?: string;
    }
  ) =>
    apiRequest<{
      staff: UserSession;
      message: string;
      transferredPropertiesCount: number;
    }>(`/api/staff/${id}/offboard`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteStaff: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/staff/${id}`, {
      method: 'DELETE',
    }),

  // Properties CRUD
  createProperty: (data: Partial<PropertyRecord>) =>
    apiRequest<PropertyRecord>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProperty: (id: string, data: Partial<PropertyRecord>) =>
    apiRequest<PropertyRecord>(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProperty: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/properties/${id}`, {
      method: 'DELETE',
    }),
  uploadStagedImage: (data: { fileBase64: string; fileName: string; contentType?: string }) =>
    apiRequest<{ publicUrl: string; storagePath: string }>('/api/properties/upload-image', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uploadPropertyImage: (
    propertyId: string,
    data: {
      fileBase64: string;
      fileName: string;
      contentType?: string;
      isCover?: boolean;
      caption?: string;
    }
  ) =>
    apiRequest<{ image: PropertyImageItem; coverImageUrl?: string }>(
      `/api/properties/${propertyId}/images`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  setPropertyCoverImage: (propertyId: string, imageId: string) =>
    apiRequest<{ success: boolean; coverImageUrl: string }>(
      `/api/properties/${propertyId}/images/${imageId}/cover`,
      {
        method: 'PUT',
      }
    ),
  deletePropertyImage: (propertyId: string, imageId: string) =>
    apiRequest<{ success: boolean; newCoverImageUrl: string }>(
      `/api/properties/${propertyId}/images/${imageId}`,
      {
        method: 'DELETE',
      }
    ),

  // Unit Types & Units CRUD
  createUnitType: (data: Partial<UnitTypeItem>) =>
    apiRequest<UnitTypeItem>('/api/unit-types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUnitType: (id: string, data: Partial<UnitTypeItem>) =>
    apiRequest<UnitTypeItem>(`/api/unit-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteUnitType: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/unit-types/${id}`, {
      method: 'DELETE',
    }),

  // Tenants & Leases CRUD (Auto-generates A-001, A-002, B-001 via PostgreSQL trigger!)
  createTenant: (data: {
    name: string;
    phone: string;
    email: string;
    propertyId?: string;
    property: string;
    unitId?: string;
    unitNumber: string;
    unitType: 'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single';
    monthlyRent: number;
    leaseDuration?: string;
    leaseNotes?: string;
    dob?: string;
    gender?: string;
    nationality?: string;
    idNumber?: string;
    securityDeposit?: number;
    vehicleInfo?: string;
    occupants?: string;
    initialPaymentStatus?: 'Paid' | 'Pending';
  }) =>
    apiRequest<TenantProfile>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTenant: (id: string, data: Partial<TenantProfile>) =>
    apiRequest<TenantProfile>(`/api/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTenant: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/tenants/${id}`, {
      method: 'DELETE',
    }),

  // Rent Payments CRUD & Server-Verified Payment Confirmation
  createPayment: (data: Partial<RentPaymentRecord>) =>
    apiRequest<RentPaymentRecord>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  confirmPayment: (id: string) =>
    apiRequest<RentPaymentRecord>(`/api/payments/${id}/confirm`, {
      method: 'POST',
    }),
  deletePayment: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/payments/${id}`, {
      method: 'DELETE',
    }),

  // Maintenance CRUD
  createMaintenance: (data: Partial<MaintenanceItem>) =>
    apiRequest<MaintenanceItem>('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMaintenance: (id: string, data: Partial<MaintenanceItem>) =>
    apiRequest<MaintenanceItem>(`/api/maintenance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteMaintenance: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/maintenance/${id}`, {
      method: 'DELETE',
    }),

  // Expenses CRUD
  createExpense: (data: Partial<ExpenseTransaction>) =>
    apiRequest<ExpenseTransaction>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteExpense: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/expenses/${id}`, {
      method: 'DELETE',
    }),

  // Tasks CRUD
  createTask: (data: { date: string; title: string }) =>
    apiRequest<DashboardTaskRecord>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggleTask: (id: string) =>
    apiRequest<DashboardTaskRecord>(`/api/tasks/${id}/toggle`, {
      method: 'POST',
    }),
  deleteTask: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    }),

  // Property Reviews CRUD
  createReview: (data: {
    propertyName: string;
    tenantRef?: string;
    tenantName?: string;
    maintenanceScore: number;
    cleanlinessScore: number;
    managementScore: number;
    comfortScore: number;
    locationScore: number;
    comment?: string;
  }) =>
    apiRequest<PropertyReviewRecord>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Reminders (SMS & Email) & Conversation Threads
  createThread: (data: {
    tenantRef?: string;
    tenantName: string;
    unitNumber: string;
    property: string;
    email?: string;
    phone?: string;
    channel?: 'SMS' | 'Email' | 'SMS & Email';
    reminderType?: 'Rent Due' | 'Balance Arrears' | 'Payment Receipt' | 'Custom Notice';
    subject?: string;
    balanceDue?: number;
    initialMessage: string;
  }) =>
    apiRequest<ChatThread>('/api/threads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sendMessage: (
    threadId: string,
    text: string,
    meta?: {
      channel?: 'SMS' | 'Email' | 'SMS & Email';
      reminderType?: 'Rent Due' | 'Balance Arrears' | 'Payment Receipt' | 'Custom Notice';
      subject?: string;
      recipientPhone?: string;
      recipientEmail?: string;
      balanceDue?: number;
    }
  ) =>
    apiRequest<ChatThread>(`/api/messages/${threadId}`, {
      method: 'POST',
      body: JSON.stringify({ text, ...meta }),
    }),
  markThreadRead: (threadId: string) =>
    apiRequest<ChatThread>(`/api/messages/${threadId}/read`, {
      method: 'POST',
    }),
  deleteThread: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/threads/${id}`, {
      method: 'DELETE',
    }),

  // Sozuri SMS Gateway API & Notification Automation
  getSmsHistory: () =>
    apiRequest<{ logs: SmsLogRecord[]; settings: SmsNotificationSettings }>(
      '/api/sms/history'
    ),

  sendSms: (data: {
    tenantId?: string;
    tenantRef: string;
    tenantName: string;
    recipientPhone: string;
    propertyName: string;
    unitNumber: string;
    triggerType?: SmsTriggerType;
    messageBody: string;
    forceSend?: boolean;
  }) =>
    apiRequest<{
      success: boolean;
      log: SmsLogRecord;
      message: string;
      duplicateSkipped?: boolean;
    }>('/api/sms/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendBulkSms: (data: {
    audience?: 'all' | 'property' | 'rent_due' | 'overdue' | 'custom';
    propertyName?: string;
    tenantRefs?: string[];
    triggerType?: SmsTriggerType;
    messageTemplate: string;
    forceSend?: boolean;
  }) =>
    apiRequest<{
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
    }),

  updateSmsSettings: (data: Partial<SmsNotificationSettings>) =>
    apiRequest<{
      settings: SmsNotificationSettings;
      message: string;
    }>('/api/sms/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  triggerAutomatedSmsChecks: () =>
    apiRequest<{
      success: boolean;
      dueSoonSent: number;
      overdueSent: number;
      skippedDuplicates: number;
      logs: SmsLogRecord[];
      message: string;
    }>('/api/sms/run-automated-checks', {
      method: 'POST',
    }),

  // Sozuri Official API Diagnostics & WhatsApp
  getSozuriStatus: () =>
    apiRequest<any>('/api/sozuri/status'),

  testSozuriAuth: (project?: string) =>
    apiRequest<{
      authenticated: boolean;
      statusCode: number;
      project: string;
      message: string;
      raw: any;
    }>(`/api/sozuri/authtest${project ? `?project=${encodeURIComponent(project)}` : ''}`),

  getSozuriWhatsAppChannels: (project?: string) =>
    apiRequest<any>(`/api/sozuri/whatsapp/channels${project ? `?project=${encodeURIComponent(project)}` : ''}`),

  getSozuriWhatsAppTemplates: (project?: string) =>
    apiRequest<any>(`/api/sozuri/whatsapp/templates${project ? `?project=${encodeURIComponent(project)}` : ''}`),

  sendSozuriWhatsApp: (data: { to: string; text: string }) =>
    apiRequest<{
      success: boolean;
      status: number;
      channel?: string;
      messageId?: string;
      message: string;
      data: any;
    }>('/api/sozuri/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
