/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  NavPageId,
  UnitTypeItem,
  TenantProfile,
  RentPaymentRecord,
  MaintenanceItem,
  ChatThread,
  ExpenseTransaction,
  PropertyRecord,
  DashboardAnalytics,
  DashboardTaskRecord,
  ActivityLogRecord,
  SecurityAuditLogRecord,
  BrandedEmailRecord,
  SmsLogRecord,
  SmsNotificationSettings,
  UserSession,
  UserRole,
  getAllowedPagesForRole,
  getDefaultPageForRole,
  getRoleDisplayLabel,
} from './data/rentalData';
import {
  rentalApi,
  setAuthContext,
  clearAuthContext,
  getStoredToken,
  setOnUnauthorized,
} from './lib/apiClient';
import { realtimeSmsClient } from './lib/realtimeSms';
import { AuthGatePage } from './components/AuthGatePage';
import { LayoutShell } from './components/LayoutShell';
import { DashboardPage } from './components/DashboardPage';
import { UnitsPage } from './components/UnitsPage';
import { TenantProfilePage } from './components/TenantProfilePage';
import { RentPaymentsPage } from './components/RentPaymentsPage';
import { MaintenancePage } from './components/MaintenancePage';
import { MessagesPage } from './components/MessagesPage';
import { ExpensesPage } from './components/ExpensesPage';
import { StaffPage } from './components/StaffPage';
import { PropertiesPage } from './components/PropertiesPage';
import {
  InvoicesPage,
  ReportsPage,
} from './components/PortfolioViews';

const PATH_TO_PAGE: Record<string, NavPageId> = {
  '/dashboard': 'dashboard',
  '/properties': 'properties',
  '/units': 'units',
  '/tenants': 'tenants',
  '/payments': 'payments',
  '/messages': 'messages',
  '/maintenance': 'maintenance',
  '/expenses': 'expenses',
  '/invoices': 'invoices',
  '/reports': 'reports',
  '/staff': 'staff',
  '/settings': 'staff',
};

const PUBLIC_PATHS = new Set([
  '/login',
  '/tenant-login',
  '/recover-password',
  '/activate-invite',
]);

function resolvePublicViewFromPath(pathname: string): 'login' | 'recover' | 'setup' {
  if (pathname === '/recover-password') return 'recover';
  if (pathname === '/activate-invite') return 'setup';
  return 'login';
}

export default function App() {
  const initialPathname = window.location.pathname;
  const initialToken = getStoredToken();

  const [activePage, setActivePage] = useState<NavPageId>(() => {
    return PATH_TO_PAGE[initialPathname] || 'dashboard';
  });
  const [publicView, setPublicView] = useState<'login' | 'recover' | 'setup'>(() =>
    resolvePublicViewFromPath(initialPathname)
  );
  const [redirectNotice, setRedirectNotice] = useState<string | null>(() => {
    if (!initialToken && PATH_TO_PAGE[initialPathname]) {
      return `Authentication required: Please sign in to access ${initialPathname}.`;
    }
    return null;
  });

  // Track requested protected page so after login we can route to it if authorized
  const requestedPageRef = useRef<NavPageId | null>(
    PATH_TO_PAGE[initialPathname] || null
  );

  const [globalSearch, setGlobalSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState<boolean>(Boolean(initialToken));
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Authenticated User Session — MUST start null until verified
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [users, setUsers] = useState<UserSession[]>([]);

  // Live Database State loaded from PostgreSQL / Supabase ONLY after authentication
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeItem[]>([]);
  const [tenants, setTenants] = useState<TenantProfile[]>([]);
  const [selectedTenantRef, setSelectedTenantRef] = useState<string>('');
  const [payments, setPayments] = useState<RentPaymentRecord[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [tasks, setTasks] = useState<DashboardTaskRecord[]>([]);
  const [activities, setActivities] = useState<ActivityLogRecord[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLogRecord[]>([]);
  const [brandedEmails, setBrandedEmails] = useState<BrandedEmailRecord[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLogRecord[]>([]);
  const [smsSettings, setSmsSettings] = useState<SmsNotificationSettings | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);

  const wipeProtectedState = useCallback(() => {
    setCurrentUser(null);
    setUsers([]);
    setProperties([]);
    setUnitTypes([]);
    setTenants([]);
    setSelectedTenantRef('');
    setPayments([]);
    setMaintenanceItems([]);
    setChatThreads([]);
    setActiveThreadId('');
    setTransactions([]);
    setTasks([]);
    setActivities([]);
    setSecurityLogs([]);
    setBrandedEmails([]);
    setSmsLogs([]);
    setSmsSettings(null);
    setAnalytics(null);
  }, []);

  // Register global 401 unauthorized handler for expired or revoked sessions
  useEffect(() => {
    setOnUnauthorized(() => {
      clearAuthContext();
      wipeProtectedState();
      setAuthChecking(false);
      setPublicView('login');
      setRedirectNotice('Your session has expired or you were signed out. Please sign in again.');
      if (!PUBLIC_PATHS.has(window.location.pathname)) {
        window.history.replaceState(null, '', '/login');
      }
    });
  }, [wipeProtectedState]);

  // Enforce URL redirect to /login when unauthenticated
  useEffect(() => {
    if (!currentUser && !authChecking) {
      const path = window.location.pathname;
      if (!PUBLIC_PATHS.has(path)) {
        if (PATH_TO_PAGE[path]) {
          requestedPageRef.current = PATH_TO_PAGE[path];
          setRedirectNotice(`Authentication required: Please sign in to access ${path}.`);
        }
        setPublicView('login');
        window.history.replaceState(null, '', '/login');
      }
    }
  }, [currentUser, authChecking]);

  // Handle browser Back/Forward buttons (popstate) — prevents Back button access after logout
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (!currentUser) {
        if (!PUBLIC_PATHS.has(path)) {
          setRedirectNotice('Please sign in to access protected dashboard pages.');
          setPublicView('login');
          window.history.replaceState(null, '', '/login');
        } else {
          setPublicView(resolvePublicViewFromPath(path));
        }
        return;
      }

      // User is authenticated
      if (PUBLIC_PATHS.has(path) || path === '/') {
        const defPage = getDefaultPageForRole(currentUser.role);
        setActivePage(defPage);
        window.history.replaceState(null, '', `/${defPage}`);
        return;
      }

      const targetPage = PATH_TO_PAGE[path];
      if (targetPage) {
        const allowed = getAllowedPagesForRole(currentUser.role);
        if (allowed.includes(targetPage)) {
          setActivePage(targetPage);
        } else {
          const defPage = getDefaultPageForRole(currentUser.role);
          setActivePage(defPage);
          window.history.replaceState(null, '', `/${defPage}`);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser]);

  const handleSelectPage = useCallback(
    (page: NavPageId) => {
      if (!currentUser) {
        window.history.replaceState(null, '', '/login');
        return;
      }
      setActivePage(page);
      const targetPath = `/${page}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    },
    [currentUser]
  );

  const bootstrapInFlightRef = useRef<Promise<void> | null>(null);
  const bgSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDatabaseState = useCallback(async (options?: { silent?: boolean }) => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      setLoading(false);
      return;
    }

    if (bootstrapInFlightRef.current) {
      return bootstrapInFlightRef.current;
    }

    if (!options?.silent) {
      setLoading((prev) => (analytics ? prev : true));
    }

    const runFetch = (async () => {
      try {
        const data = await rentalApi.getBootstrap();
        if (!data.user || data.user.status !== 'Active') {
          clearAuthContext();
          wipeProtectedState();
          setRedirectNotice('Your account session is not active. Please sign in.');
          window.history.replaceState(null, '', '/login');
          return;
        }

        setAuthContext(data.user);
        setCurrentUser(data.user);
        setUsers(data.users || []);
        setProperties(data.properties);
        setUnitTypes(data.unitTypes);
        setTenants(data.tenants);
        setPayments(data.payments);
        setMaintenanceItems(data.maintenance);
        setChatThreads(data.threads);
        setTransactions(data.expenses);
        setTasks(data.tasks);
        setActivities(data.activities || []);
        setSecurityLogs(data.securityLogs || []);
        setBrandedEmails(data.brandedEmails || []);
        setSmsLogs(data.smsLogs || []);
        setSmsSettings(data.smsSettings || null);
        setAnalytics(data.analytics);

        const allowed = getAllowedPagesForRole(data.user.role);
        const defaultPage = getDefaultPageForRole(data.user.role);
        const requested = requestedPageRef.current;
        const resolvedPage =
          requested && allowed.includes(requested)
            ? requested
            : allowed.includes(activePage)
            ? activePage
            : defaultPage;

        requestedPageRef.current = null;
        if (resolvedPage !== activePage) {
          setActivePage(resolvedPage);
        }
        if (
          PUBLIC_PATHS.has(window.location.pathname) ||
          window.location.pathname === '/' ||
          !allowed.includes(PATH_TO_PAGE[window.location.pathname] || resolvedPage)
        ) {
          window.history.replaceState(null, '', `/${resolvedPage}`);
        }

        if (data.tenants.length > 0 && !data.tenants.some((t) => t.tenantRef === selectedTenantRef)) {
          setSelectedTenantRef(data.user.tenantRef || data.tenants[0].tenantRef);
        }
        if (data.threads.length > 0 && !data.threads.some((t) => t.id === activeThreadId)) {
          setActiveThreadId(data.threads[0].id);
        }
      } catch (err: any) {
        if (
          String(err?.message || '').toLowerCase().includes('authentication') ||
          String(err?.message || '').toLowerCase().includes('unauthorized') ||
          String(err?.message || '').toLowerCase().includes('sign in')
        ) {
          clearAuthContext();
          wipeProtectedState();
          window.history.replaceState(null, '', '/login');
        } else if (!options?.silent) {
          setErrorBanner(err.message || 'Failed to synchronize with PostgreSQL database.');
        }
      } finally {
        bootstrapInFlightRef.current = null;
        setAuthChecking(false);
        setLoading(false);
      }
    })();

    bootstrapInFlightRef.current = runFetch;
    return runFetch;
  }, [activePage, activeThreadId, analytics, selectedTenantRef, wipeProtectedState]);

  const scheduleBackgroundSync = useCallback(() => {
    if (bgSyncTimerRef.current) {
      clearTimeout(bgSyncTimerRef.current);
    }
    bgSyncTimerRef.current = setTimeout(() => {
      void refreshDatabaseState({ silent: true });
    }, 350);
  }, [refreshDatabaseState]);

  // Verify stored session token on initial mount
  useEffect(() => {
    if (getStoredToken()) {
      refreshDatabaseState();
    } else {
      setAuthChecking(false);
    }
    return () => {
      if (bgSyncTimerRef.current) clearTimeout(bgSyncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-Time SMS & Notification WebSocket/SSE Synchronizer
  useEffect(() => {
    const unsubscribe = realtimeSmsClient.subscribe((eventType, payload) => {
      if (eventType === 'sms:dispatched' && payload?.log) {
        setSmsLogs((prev) => [payload.log, ...prev.filter((l) => l.id !== payload.log.id)]);
      } else if (eventType === 'sms:bulk_dispatched' && Array.isArray(payload?.logs)) {
        const newIds = new Set(payload.logs.map((l: any) => l.id));
        setSmsLogs((prev) => [...payload.logs, ...prev.filter((l) => !newIds.has(l.id))]);
      } else if (eventType === 'sms:settings_updated' && payload?.settings) {
        setSmsSettings(payload.settings);
      } else if (eventType === 'thread:updated' && payload?.thread) {
        setChatThreads((prev) => {
          const exists = prev.some((th) => th.id === payload.thread.id);
          return exists
            ? prev.map((th) => (th.id === payload.thread.id ? { ...th, ...payload.thread } : th))
            : [payload.thread, ...prev];
        });
      } else if (eventType === 'payment:confirmed') {
        if (payload?.payment) {
          setPayments((prev) =>
            prev.map((p) => (p.id === payload.payment.id ? { ...p, ...payload.payment, status: 'Paid' } : p))
          );
        }
        if (payload?.smsLog) {
          setSmsLogs((prev) => [payload.smsLog, ...prev.filter((l) => l.id !== payload.smsLog.id)]);
        }
      }
    });

    return unsubscribe;
  }, []);

  const runMutation = async <T,>(
    fn: () => Promise<T>,
    options?: { skipSync?: boolean; awaitSync?: boolean }
  ): Promise<T | undefined> => {
    setErrorBanner(null);
    try {
      const result = await fn();
      if (!options?.skipSync) {
        if (options?.awaitSync) {
          await refreshDatabaseState({ silent: true });
        } else {
          scheduleBackgroundSync();
        }
      }
      return result;
    } catch (err: any) {
      setErrorBanner(err.message || 'Database operation failed.');
      throw err;
    }
  };

  // Apply verified authenticated user session & redirect to role-appropriate dashboard
  const applyAuthenticatedUser = (user: UserSession, rememberMe?: boolean) => {
    setAuthContext(user, rememberMe);
    setCurrentUser(user);
    setRedirectNotice(null);
    setErrorBanner(null);
    if (user.tenantRef) {
      setSelectedTenantRef(user.tenantRef);
    }
    const allowed = getAllowedPagesForRole(user.role);
    const defaultPage = getDefaultPageForRole(user.role);
    const requested = requestedPageRef.current;
    const nextPage =
      requested && allowed.includes(requested) ? requested : defaultPage;
    requestedPageRef.current = null;
    setActivePage(nextPage);
    window.history.replaceState(null, '', `/${nextPage}`);
  };

  const handleSwitchRole = async (role: UserRole, userId?: string) => {
    await runMutation(async () => {
      const { user } = await rentalApi.switchRole(role, userId);
      applyAuthenticatedUser(user);
    }, { awaitSync: true });
  };

  const handleLogin = async (
    email: string,
    password: string,
    options?: {
      portal?: 'management' | 'tenant';
      rememberMe?: boolean;
      mfaCode?: string;
      role?: UserRole;
    }
  ) => {
    const res = await rentalApi.login(email, password, options?.role, {
      portal: options?.portal,
      rememberMe: options?.rememberMe,
      mfaCode: options?.mfaCode,
    });
    if (res.mfaRequired) {
      return res;
    }
    if (res.user) {
      applyAuthenticatedUser(res.user, options?.rememberMe);
      await refreshDatabaseState();
    }
    return res;
  };

  const handleSignup = async (
    fullName: string,
    email: string,
    password: string,
    role: UserRole
  ) => {
    const { user } = await rentalApi.signup(fullName, email, password, role);
    applyAuthenticatedUser(user);
    await refreshDatabaseState();
  };

  const handleSetupPassword = async (data: {
    email: string;
    password: string;
    inviteToken?: string;
  }) => {
    const res = await rentalApi.setupPassword(data);
    if (res.redirectToLogin) {
      return res;
    }
    if (res.user) {
      applyAuthenticatedUser(res.user);
      await refreshDatabaseState();
    }
    return res;
  };

  const handleRecoverPassword = async (email: string) => {
    return await rentalApi.recoverPassword(email);
  };

  const handleLogout = async () => {
    try {
      await rentalApi.logout();
    } catch {
      // Ignore network errors during logout cleanup
    }
    clearAuthContext();
    wipeProtectedState();
    setErrorBanner(null);
    setPublicView('login');
    setRedirectNotice('You have signed out securely.');
    window.history.replaceState(null, '', '/login');
  };

  // Navigate to a specific tenant's profile by their Unique Reference (e.g., A-001)
  const handleOpenTenantByRef = async (ref: string) => {
    const exists = tenants.find((t) => t.tenantRef === ref);
    if (exists) {
      setSelectedTenantRef(ref);
      handleSelectPage('tenants');
      return;
    }

    const payRow = payments.find((p) => p.tenantRef === ref);
    if (payRow) {
      try {
        const created = await rentalApi.createTenant({
          name: payRow.tenantName,
          phone: '',
          email: `${payRow.tenantName.toLowerCase().replace(/\s+/g, '.')}@tenant.org`,
          property: payRow.property,
          unitNumber: payRow.unitNumber,
          unitType: payRow.unitType,
          monthlyRent: payRow.amount,
          leaseDuration: payRow.leaseTerm,
        });
        if (created && created.tenantRef) {
          setTenants((prev) => [...prev.filter((t) => t.id !== created.id), created]);
          setSelectedTenantRef(created.tenantRef);
        }
        scheduleBackgroundSync();
      } catch {
        setSelectedTenantRef(tenants[0]?.tenantRef || '');
      }
    }
    handleSelectPage('tenants');
  };

  // 1. While verifying an existing session token, show only the verification gate (never flash dashboard content)
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#EEF3F0] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E4ECE8] px-6 py-5 shadow-xs flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-[#17231E] border-t-transparent animate-spin" />
          <span className="text-[13px] font-semibold text-[#17231E]">
            Verifying authenticated session...
          </span>
        </div>
      </div>
    );
  }

  // 2. MANDATORY AUTHENTICATION GATE: Never render LayoutShell or any dashboard page without a valid active session
  if (!currentUser) {
    return (
      <AuthGatePage
        initialView={publicView}
        redirectMessage={redirectNotice}
        onLogin={handleLogin}
        onSetupPassword={handleSetupPassword}
        onRecoverPassword={handleRecoverPassword}
      />
    );
  }

  const dueTenantsCount = tenants.filter((t) => t.rentBalance > 0).length;
  const unreadMessagesCount =
    dueTenantsCount || chatThreads.reduce((sum, t) => sum + t.unread, 0);

  const allowedPages = getAllowedPagesForRole(currentUser.role);
  const isPageAuthorized = allowedPages.includes(activePage);

  return (
    <LayoutShell
      activePage={activePage}
      onSelectPage={handleSelectPage}
      globalSearch={globalSearch}
      onGlobalSearchChange={setGlobalSearch}
      unreadMessagesCount={unreadMessagesCount}
      currentUser={currentUser}
      users={users}
      activities={activities}
      onSwitchRole={handleSwitchRole}
      onLogin={async (email, password, role) => {
        await handleLogin(email, password, { role });
      }}
      onSignup={handleSignup}
      onSetupPassword={async (data) => {
        await handleSetupPassword(data);
      }}
      onRecoverPassword={handleRecoverPassword}
      onLogout={handleLogout}
      errorBanner={errorBanner}
      onClearError={() => setErrorBanner(null)}
    >
      {loading || !analytics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-white/80" />
          ))}
          <div className="sm:col-span-2 lg:col-span-4 h-96 rounded-2xl bg-white/80" />
        </div>
      ) : !isPageAuthorized ? (
        <div className="bg-white rounded-2xl p-8 border border-[#E4ECE8] text-center max-w-lg mx-auto my-8">
          <h3 className="text-[16px] font-bold text-[#17231E] mb-2">
            Unauthorized Role Access
          </h3>
          <p className="text-[12.5px] text-[#6E7A75] mb-4">
            Your assigned role (
            <span className="font-bold text-[#17231E]">
              {getRoleDisplayLabel(currentUser.role)}
            </span>
            ) does not have permission to access this module.
          </p>
          <button
            onClick={() => handleSelectPage(getDefaultPageForRole(currentUser.role))}
            className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
          >
            Return to My Role Dashboard
          </button>
        </div>
      ) : (
        <>
          {activePage === 'dashboard' && (
            <DashboardPage
              payments={payments}
              properties={properties}
              analytics={analytics}
              tasks={tasks}
              activities={activities}
              onAddTask={async (date, title) => {
                await runMutation(async () => {
                  const created = await rentalApi.createTask({ date, title });
                  if (created && created.id) {
                    setTasks((prev) => [created, ...prev]);
                  }
                });
              }}
              onToggleTask={async (id) => {
                setTasks((prev) =>
                  prev.map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk))
                );
                await runMutation(async () => {
                  const updated = await rentalApi.toggleTask(id);
                  if (updated && updated.id) {
                    setTasks((prev) =>
                      prev.map((tk) => (tk.id === id ? updated : tk))
                    );
                  }
                }, { skipSync: true });
              }}
              onDeleteTask={async (id) => {
                setTasks((prev) => prev.filter((tk) => tk.id !== id));
                await runMutation(() => rentalApi.deleteTask(id), { skipSync: true });
              }}
              onAddReview={async (review) => {
                await runMutation(() => rentalApi.createReview(review));
              }}
              globalSearch={globalSearch}
              onSelectTenantRef={handleOpenTenantByRef}
              onNavigate={handleSelectPage}
            />
          )}

          {activePage === 'payments' && (
            <RentPaymentsPage
              payments={payments}
              properties={properties}
              tenants={tenants}
              onConfirmPayment={async (id) => {
                setPayments((prev) =>
                  prev.map((p) =>
                    p.id === id || (p.tenantRef && id && p.tenantRef.toUpperCase() === String(id).toUpperCase())
                      ? { ...p, status: 'Paid' as const }
                      : p
                  )
                );
                await runMutation(async () => {
                  const confirmed = await rentalApi.confirmPayment(id);
                  if (confirmed && confirmed.id) {
                    setPayments((prev) => {
                      const exists = prev.some((p) => p.id === confirmed.id);
                      return exists
                        ? prev.map((p) => (p.id === confirmed.id ? confirmed : p))
                        : [confirmed, ...prev];
                    });
                    setTenants((prev) =>
                      prev.map((t) =>
                        t.tenantRef && confirmed.tenantRef && t.tenantRef.toUpperCase() === confirmed.tenantRef.toUpperCase()
                          ? {
                              ...t,
                              status: 'Paid',
                              rentBalance: Math.max(0, t.rentBalance - Number(confirmed.amount || 0)),
                              totalPaid: t.totalPaid + Number(confirmed.amount || 0),
                            }
                          : t
                      )
                    );
                  }
                });
              }}
              onAddPayment={async (rec) => {
                await runMutation(async () => {
                  const created = await rentalApi.createPayment(rec);
                  if (created && created.id) {
                    setPayments((prev) => [created, ...prev]);
                  }
                });
              }}
              onDeletePayment={async (id) => {
                setPayments((prev) => prev.filter((p) => p.id !== id));
                await runMutation(() => rentalApi.deletePayment(id));
              }}
              onSelectTenantRef={handleOpenTenantByRef}
              globalSearch={globalSearch}
            />
          )}

          {activePage === 'units' && (
            <UnitsPage
              unitTypes={unitTypes}
              properties={properties}
              onAddUnitType={async (u) => {
                await runMutation(async () => {
                  const created = await rentalApi.createUnitType(u);
                  if (created && created.id) {
                    setUnitTypes((prev) => [created, ...prev]);
                  }
                });
              }}
              onUpdateUnitType={async (id, updated) => {
                await runMutation(async () => {
                  const saved = await rentalApi.updateUnitType(id, updated);
                  if (saved && saved.id) {
                    setUnitTypes((prev) =>
                      prev.map((item) => (item.id === id ? saved : item))
                    );
                  }
                });
              }}
              onDeleteUnitType={async (id) => {
                setUnitTypes((prev) => prev.filter((item) => item.id !== id));
                await runMutation(() => rentalApi.deleteUnitType(id));
              }}
              globalSearch={globalSearch}
            />
          )}

          {activePage === 'tenants' && (
            <TenantProfilePage
              tenants={tenants}
              properties={properties}
              unitTypes={unitTypes}
              selectedTenantRef={selectedTenantRef}
              onSelectTenantRef={setSelectedTenantRef}
              onAddTenant={async (data) => {
                const created = await runMutation(async () => {
                  const res: any = await rentalApi.createTenant(data);
                  if (res && res.id) {
                    const { initialPayment, ...tenantProfile } = res;
                    setTenants((prev) =>
                      [...prev.filter((t) => t.id !== tenantProfile.id), tenantProfile].sort((a, b) =>
                        a.tenantRef.localeCompare(b.tenantRef)
                      )
                    );
                    if (initialPayment && initialPayment.id) {
                      setPayments((prev) => [initialPayment, ...prev]);
                    }
                    setSelectedTenantRef(tenantProfile.tenantRef);
                    return tenantProfile as TenantProfile;
                  }
                  return res as TenantProfile;
                });
                return created as TenantProfile;
              }}
              onUpdateTenant={async (id, data) => {
                await runMutation(async () => {
                  const updated = await rentalApi.updateTenant(id, data);
                  if (updated && updated.id) {
                    setTenants((prev) =>
                      prev.map((t) =>
                        t.id === updated.id || t.tenantRef === updated.tenantRef ? updated : t
                      )
                    );
                  }
                });
              }}
              onDeleteTenant={async (id) => {
                setTenants((prev) =>
                  prev.filter((t) => t.id !== id && t.tenantRef !== id)
                );
                await runMutation(() => rentalApi.deleteTenant(id));
              }}
              onRecordTenantPayment={async (tenantRef) => {
                await runMutation(async () => {
                  const confirmed = await rentalApi.confirmPayment(tenantRef);
                  if (confirmed && confirmed.id) {
                    setPayments((prev) => {
                      const exists = prev.some((p) => p.id === confirmed.id);
                      return exists
                        ? prev.map((p) => (p.id === confirmed.id ? confirmed : p))
                        : [confirmed, ...prev];
                    });
                    setTenants((prev) =>
                      prev.map((t) =>
                        t.tenantRef && tenantRef && t.tenantRef.toUpperCase() === String(tenantRef).toUpperCase()
                          ? { ...t, status: 'Paid', rentBalance: 0, totalPaid: t.totalPaid + Number(confirmed.amount || 0) }
                          : t
                      )
                    );
                  }
                });
              }}
              onUpdateProperty={async (id, data) => {
                await runMutation(async () => {
                  const updated = await rentalApi.updateProperty(id, data);
                  if (updated && updated.id) {
                    setProperties((prev) =>
                      prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
                    );
                  }
                });
              }}
              onNavigate={handleSelectPage}
            />
          )}

          {activePage === 'maintenance' && (
            <MaintenancePage
              items={maintenanceItems}
              properties={properties}
              tenants={tenants}
              onToggleSelect={async (id, selected) => {
                setMaintenanceItems((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, selected } : m))
                );
                await runMutation(
                  () => rentalApi.updateMaintenance(id, { selected }),
                  { skipSync: true }
                );
              }}
              onUpdateStatus={async (id, maintenanceStatus) => {
                setMaintenanceItems((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, maintenanceStatus } : m))
                );
                await runMutation(async () => {
                  const updated = await rentalApi.updateMaintenance(id, { maintenanceStatus });
                  if (updated && updated.id) {
                    setMaintenanceItems((prev) =>
                      prev.map((m) => (m.id === id ? updated : m))
                    );
                  }
                });
              }}
              onUpdatePriority={async (id, priority) => {
                setMaintenanceItems((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, priority } : m))
                );
                await runMutation(
                  async () => {
                    const updated = await rentalApi.updateMaintenance(id, { priority });
                    if (updated && updated.id) {
                      setMaintenanceItems((prev) =>
                        prev.map((m) => (m.id === id ? updated : m))
                      );
                    }
                  },
                  { skipSync: true }
                );
              }}
              onAddMaintenance={async (item) => {
                await runMutation(async () => {
                  const created = await rentalApi.createMaintenance(item);
                  if (created && created.id) {
                    setMaintenanceItems((prev) => [created, ...prev]);
                  }
                });
              }}
              onDeleteMaintenance={async (id) => {
                setMaintenanceItems((prev) => prev.filter((m) => m.id !== id));
                await runMutation(() => rentalApi.deleteMaintenance(id));
              }}
              globalSearch={globalSearch}
            />
          )}

          {activePage === 'messages' && (
            <MessagesPage
              threads={chatThreads}
              tenants={tenants}
              properties={properties}
              currentUser={currentUser}
              smsLogs={smsLogs}
              smsSettings={smsSettings}
              onSendMessage={async (threadId, text, meta) => {
                await runMutation(async () => {
                  const updated = await rentalApi.sendMessage(threadId, text, meta);
                  if (updated && updated.id) {
                    setChatThreads((prev) =>
                      prev.map((th) => (th.id === updated.id ? updated : th))
                    );
                  }
                });
              }}
              onCreateThread={async (payload) => {
                const created = await rentalApi.createThread(payload);
                if (created && created.id) {
                  setChatThreads((prev) => {
                    const exists = prev.some((th) => th.id === created.id);
                    return exists
                      ? prev.map((th) => (th.id === created.id ? created : th))
                      : [created, ...prev];
                  });
                  setActiveThreadId(created.id);
                }
                scheduleBackgroundSync();
              }}
              onDeleteThread={async (threadId) => {
                setChatThreads((prev) => prev.filter((th) => th.id !== threadId));
                await runMutation(() => rentalApi.deleteThread(threadId), { skipSync: true });
              }}
              onSelectThread={async (threadId) => {
                setActiveThreadId(threadId);
                setChatThreads((prev) =>
                  prev.map((th) => (th.id === threadId ? { ...th, unread: 0 } : th))
                );
                await runMutation(() => rentalApi.markThreadRead(threadId), { skipSync: true });
              }}
              activeThreadId={activeThreadId}
              onSendSms={async (payload) => {
                return await runMutation(async () => {
                  const res = await rentalApi.sendSms(payload);
                  if (res?.log) {
                    setSmsLogs((prev) => [res.log, ...prev.filter((l) => l.id !== res.log.id)]);
                  }
                  return res;
                });
              }}
              onSendBulkSms={async (payload) => {
                return await runMutation(async () => {
                  const res = await rentalApi.sendBulkSms(payload);
                  if (Array.isArray(res?.logs) && res.logs.length > 0) {
                    setSmsLogs((prev) => {
                      const newIds = new Set(res.logs.map((l) => l.id));
                      return [...res.logs, ...prev.filter((l) => !newIds.has(l.id))];
                    });
                  }
                  return res;
                });
              }}
              onUpdateSmsSettings={async (payload) => {
                return await runMutation(async () => {
                  const res = await rentalApi.updateSmsSettings(payload);
                  if (res?.settings) {
                    setSmsSettings(res.settings);
                  }
                  return res;
                }, { skipSync: true });
              }}
              onRunAutomatedSmsChecks={async () => {
                return await runMutation(async () => {
                  const res = await rentalApi.triggerAutomatedSmsChecks();
                  if (Array.isArray(res?.logs) && res.logs.length > 0) {
                    setSmsLogs((prev) => {
                      const newIds = new Set(res.logs.map((l) => l.id));
                      return [...res.logs, ...prev.filter((l) => !newIds.has(l.id))];
                    });
                  }
                  return res;
                });
              }}
            />
          )}

          {activePage === 'expenses' && (
            <ExpensesPage
              transactions={transactions}
              properties={properties}
              analytics={analytics}
              onAddTransaction={async (tx) => {
                await runMutation(async () => {
                  const created = await rentalApi.createExpense(tx);
                  if (created && created.id) {
                    setTransactions((prev) => [created, ...prev]);
                  }
                });
              }}
              onDeleteTransaction={async (id) => {
                setTransactions((prev) => prev.filter((tx) => tx.id !== id));
                await runMutation(() => rentalApi.deleteExpense(id));
              }}
              globalSearch={globalSearch}
            />
          )}

          {activePage === 'properties' && (
            <PropertiesPage
              properties={properties}
              tenants={tenants}
              unitTypes={unitTypes}
              onAddProperty={async (prop) => {
                await runMutation(async () => {
                  const created = await rentalApi.createProperty(prop);
                  if (created && created.id) {
                    setProperties((prev) => [...prev, created]);
                  }
                });
              }}
              onUpdateProperty={async (id, prop) => {
                await runMutation(async () => {
                  const updated = await rentalApi.updateProperty(id, prop);
                  if (updated && updated.id) {
                    setProperties((prev) =>
                      prev.map((p) =>
                        p.id === id
                          ? { ...p, ...updated, images: updated.images || p.images }
                          : p
                      )
                    );
                  }
                });
              }}
              onDeleteProperty={async (id) => {
                setProperties((prev) => prev.filter((p) => p.id !== id));
                await runMutation(() => rentalApi.deleteProperty(id));
              }}
              onNavigate={handleSelectPage}
              globalSearch={globalSearch}
            />
          )}

          {activePage === 'invoices' && (
            <InvoicesPage
              payments={payments}
              onSelectTenantRef={handleOpenTenantByRef}
            />
          )}

          {activePage === 'reports' && (
            <ReportsPage
              properties={properties}
              payments={payments}
              expenses={transactions}
              maintenance={maintenanceItems}
              tenants={tenants}
            />
          )}

          {activePage === 'staff' && (
            <StaffPage
              users={users}
              currentUser={currentUser}
              properties={properties}
              securityLogs={securityLogs}
              brandedEmails={brandedEmails}
              activities={activities}
              onCreateStaff={async (data) => {
                return await runMutation(async () => {
                  const res = await rentalApi.createStaff(data);
                  const createdStaff = res?.staff;
                  if (createdStaff) {
                    setUsers((prev) => {
                      const idx = prev.findIndex(
                        (u) =>
                          u.id === createdStaff.id ||
                          u.email.toLowerCase() === createdStaff.email.toLowerCase()
                      );
                      if (idx >= 0) {
                        const copy = [...prev];
                        copy[idx] = { ...copy[idx], ...createdStaff };
                        return copy;
                      }
                      return [...prev, createdStaff];
                    });
                  }
                  const createdEmail = res?.brandedEmail;
                  if (createdEmail) {
                    setBrandedEmails((prev) => [createdEmail, ...prev]);
                  }
                  return res;
                });
              }}
              onUpdateStaff={async (id, data) => {
                await runMutation(async () => {
                  const res = await rentalApi.updateStaff(id, data);
                  if (res?.staff) {
                    setUsers((prev) =>
                      prev.map((u) => (u.id === id ? { ...u, ...res.staff } : u))
                    );
                  }
                });
              }}
              onResendInvite={async (id) => {
                return await runMutation(() => rentalApi.resendStaffInvite(id));
              }}
              onRevokeInvite={async (id) => {
                return await runMutation(() => rentalApi.revokeStaffInvite(id));
              }}
              onOffboardStaff={async (id, data) => {
                return await runMutation(() => rentalApi.offboardStaff(id, data));
              }}
              onRecoverPassword={async (email) => {
                return await runMutation(() => rentalApi.recoverPassword(email));
              }}
              onDeleteStaff={async (id) => {
                setUsers((prev) => prev.filter((u) => u.id !== id));
                await runMutation(() => rentalApi.deleteStaff(id));
              }}
              onSwitchUserSession={handleSwitchRole}
              globalSearch={globalSearch}
            />
          )}
        </>
      )}
    </LayoutShell>
  );
}
