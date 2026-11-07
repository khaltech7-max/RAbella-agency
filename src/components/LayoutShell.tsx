import React, { useState } from 'react';
import {
  LayoutGrid,
  CalendarCheck,
  Home,
  MessageSquare,
  Sparkles,
  Building2,
  Users,
  CircleDollarSign,
  FileBarChart,
  Search,
  Settings,
  Bell,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  CheckCircle2,
  Shield,
  KeyRound,
  UserCog,
  Building2 as BuildingIcon,
  Lock,
  LogOut,
} from 'lucide-react';
import {
  NavPageId,
  UserRole,
  UserSession,
  ActivityLogRecord,
  getAllowedPagesForRole,
  getRoleDisplayLabel,
} from '../data/rentalData';
import { AvatarBadge } from './UnitIllustration';

interface LayoutShellProps {
  activePage: NavPageId;
  onSelectPage: (page: NavPageId) => void;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
  unreadMessagesCount: number;
  currentUser: UserSession;
  users: UserSession[];
  activities: ActivityLogRecord[];
  onSwitchRole: (role: UserRole, userId?: string) => Promise<void>;
  onLogin: (email: string, password: string, role?: UserRole) => Promise<void>;
  onSignup: (
    fullName: string,
    email: string,
    password: string,
    role: UserRole
  ) => Promise<void>;
  onSetupPassword?: (data: {
    email: string;
    password: string;
    inviteToken?: string;
  }) => Promise<void>;
  onRecoverPassword?: (email: string) => Promise<{
    success: boolean;
    message: string;
    recoveryToken?: string;
    recoveryLink?: string;
  } | undefined>;
  onLogout?: () => Promise<void>;
  errorBanner: string | null;
  onClearError: () => void;
  children: React.ReactNode;
}

const PAGE_TITLES: Record<NavPageId, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard' },
  payments: { title: 'Rent Payments' },
  units: { title: 'Units & Types' },
  tenants: { title: 'Tenant Profile', subtitle: 'Tenant Directory & Lease Profile' },
  messages: {
    title: 'Rent Reminders',
    subtitle: 'SMS & Email Rent Due & Balance Notifications',
  },
  maintenance: { title: 'Maintenance' },
  properties: { title: 'Properties' },
  invoices: { title: 'Rent Invoices', subtitle: 'Financials / Invoices' },
  expenses: { title: 'Expense' },
  reports: { title: 'Reports' },
  staff: {
    title: 'Staff & Role Access',
    subtitle: 'Account Management, Invitations & Role-Based Permissions',
  },
};

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activePage,
  onSelectPage,
  globalSearch,
  onGlobalSearchChange,
  unreadMessagesCount,
  currentUser,
  users,
  activities,
  onSwitchRole,
  onLogin,
  onSignup,
  onSetupPassword,
  onRecoverPassword,
  onLogout,
  errorBanner,
  onClearError,
  children,
}) => {
  const [financialsOpen, setFinancialsOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const allowedPages = getAllowedPagesForRole(currentUser.role);

  const allNavItems: {
    id: NavPageId;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'payments', label: 'Rent Payments', icon: CalendarCheck },
    { id: 'units', label: 'Units', icon: Home },
    {
      id: 'messages',
      label: 'Reminders',
      icon: Bell,
      badge: unreadMessagesCount,
    },
    { id: 'maintenance', label: 'Maintenance', icon: Sparkles },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'tenants', label: 'Tenants', icon: Users },
    { id: 'staff', label: 'Staff & Roles', icon: UserCog },
  ];

  const navItems = allNavItems.filter((item) => allowedPages.includes(item.id));
  const showFinancials =
    allowedPages.includes('invoices') || allowedPages.includes('expenses');
  const showReports = allowedPages.includes('reports');

  const handleNavClick = (id: NavPageId) => {
    onSelectPage(id);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between py-5 px-4 bg-white select-none">
      <div>
        {/* Brand Logo matching exact Lodgify vertical bar mark */}
        <div className="flex items-center justify-between px-2 mb-7">
          <button
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-left focus:outline-none group cursor-pointer"
          >
            <div className="flex items-end gap-0.5 h-6">
              <span className="w-1.5 h-4 rounded-sm bg-[#BCEAD2]" />
              <span className="w-1.5 h-6 rounded-sm bg-[#D5F267]" />
              <span className="w-1.5 h-5 rounded-sm bg-[#86C9A7]" />
            </div>
            <span className="text-[19px] font-extrabold tracking-tight text-[#17231E]">
              ARabella agency
            </span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-[#6E7A75] hover:bg-[#EEF3F0]"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#D5F267] text-[#17231E] shadow-[0_2px_8px_rgba(213,242,103,0.35)]'
                    : 'text-[#76827D] hover:bg-[#F4F8F6] hover:text-[#17231E]'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#17231E]' : 'text-[#88948F]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="w-5 h-5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Financials Collapsible Group (Invoices & Expenses) */}
          {showFinancials && (
            <div className="pt-0.5">
              <button
                onClick={() => setFinancialsOpen(!financialsOpen)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors cursor-pointer ${
                  activePage === 'expenses' || activePage === 'invoices'
                    ? 'text-[#17231E]'
                    : 'text-[#76827D] hover:bg-[#F4F8F6] hover:text-[#17231E]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <CircleDollarSign className="w-4 h-4 text-[#88948F]" />
                  <span>Financials</span>
                </span>
                {financialsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[#88948F]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[#88948F]" />
                )}
              </button>

              {financialsOpen && (
                <div className="mt-1 ml-4 pl-3 border-l border-[#E6ECE9] space-y-1">
                  {allowedPages.includes('invoices') && (
                    <button
                      onClick={() => handleNavClick('invoices')}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                        activePage === 'invoices'
                          ? 'bg-[#D5F267] text-[#17231E]'
                          : 'text-[#76827D] hover:bg-[#F4F8F6] hover:text-[#17231E]'
                      }`}
                    >
                      Rent Invoices
                    </button>
                  )}
                  {allowedPages.includes('expenses') && (
                    <button
                      onClick={() => handleNavClick('expenses')}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                        activePage === 'expenses'
                          ? 'bg-[#D5F267] text-[#17231E]'
                          : 'text-[#76827D] hover:bg-[#F4F8F6] hover:text-[#17231E]'
                      }`}
                    >
                      Expenses
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reports item */}
          {showReports && (
            <button
              onClick={() => handleNavClick('reports')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
                activePage === 'reports'
                  ? 'bg-[#D5F267] text-[#17231E]'
                  : 'text-[#76827D] hover:bg-[#F4F8F6] hover:text-[#17231E]'
              }`}
            >
              <span className="flex items-center gap-3">
                <FileBarChart
                  className={`w-4 h-4 ${
                    activePage === 'reports' ? 'text-[#17231E]' : 'text-[#88948F]'
                  }`}
                />
                <span>Reports</span>
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Bottom Promotional Card matching exact reference */}
      <div className="mt-6 rounded-2xl bg-[#E1F3E8] p-3.5 relative overflow-hidden">
        <div className="flex items-end gap-1.5 mb-3">
          <div className="w-16 h-11 rounded-md bg-[#17231E] p-1 shadow-sm border border-[#2C3E36]">
            <div className="w-full h-full rounded-[3px] bg-[#EEF3F0] p-1 flex flex-col justify-between">
              <div className="flex gap-0.5">
                <div className="w-3 h-1.5 bg-[#BCEAD2] rounded-[1px]" />
                <div className="w-3 h-1.5 bg-[#D5F267] rounded-[1px]" />
                <div className="w-3 h-1.5 bg-white rounded-[1px]" />
              </div>
              <div className="flex items-end gap-0.5 h-4">
                <div className="w-1.5 h-2 bg-[#BCEAD2]" />
                <div className="w-1.5 h-3.5 bg-[#D5F267]" />
                <div className="w-1.5 h-2.5 bg-[#BCEAD2]" />
                <div className="w-1.5 h-4 bg-[#86C9A7]" />
              </div>
            </div>
          </div>
          <div className="w-5 h-7 rounded bg-[#D5F267] border border-[#17231E]/20 p-0.5 flex flex-col justify-between">
            <div className="w-full h-1 bg-[#17231E]/30 rounded-full" />
            <div className="w-full h-2.5 bg-white/80 rounded-[1px]" />
          </div>
        </div>

        <h4 className="text-[12.5px] font-bold text-[#17231E] leading-snug">
          Elevate Property Standards
        </h4>
        <p className="text-[10.5px] text-[#5B6B63] mt-1 leading-relaxed">
          Enhanced Reporting, Faster Tenant Onboarding & Integrated Accounting Tools
        </p>
        <button
          onClick={() => setUpgradeModalOpen(true)}
          className="mt-3 w-full py-2 px-3 rounded-xl bg-[#D5F267] hover:bg-[#c9e954] text-[#17231E] text-[11.5px] font-bold transition-colors shadow-xs cursor-pointer"
        >
          Update Now
        </button>
      </div>
    </div>
  );

  const pageMeta = PAGE_TITLES[activePage] || { title: 'Dashboard' };

  return (
    <div className="min-h-screen flex bg-[#EEF3F0] text-[#17231E]">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:block w-[220px] xl:w-[232px] shrink-0 bg-white border-r border-[#E4ECE8] sticky top-0 h-screen overflow-y-auto">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[240px] max-w-[80vw] bg-white h-full z-10 shadow-xl overflow-y-auto">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar matching reference design */}
        <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white text-[#17231E] hover:bg-[#E4ECE8] transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-[21px] font-bold text-[#17231E] tracking-tight truncate">
                {pageMeta.title}
              </h1>
              {pageMeta.subtitle && (
                <p className="text-[11px] text-[#7A8681] font-medium truncate">
                  {pageMeta.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Center Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-[#899690] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => onGlobalSearchChange(e.target.value)}
                placeholder="Search unit, tenant, ref (A-001), etc"
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white text-[12.5px] text-[#17231E] placeholder-[#94A19B] focus:outline-none focus:ring-2 focus:ring-[#D5F267] transition-all"
              />
              {globalSearch && (
                <button
                  onClick={() => onGlobalSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#76827D] hover:text-[#17231E]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right User Profile & Action Icons */}
          <div className="flex items-center gap-2.5 shrink-0 relative">
            <button
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-2.5 px-2.5 py-1 rounded-xl hover:bg-white transition-colors text-left cursor-pointer"
              title="My Account Profile"
            >
              <AvatarBadge
                name={currentUser.fullName}
                bg={
                  currentUser.role === 'owner' || currentUser.role === 'super_admin'
                    ? '#D5F267'
                    : '#D8F3E5'
                }
                className="w-9 h-9"
              />
              <div className="hidden sm:block leading-tight">
                <p className="text-[13px] font-bold text-[#17231E] flex items-center gap-1">
                  {currentUser.fullName}
                  <ChevronDown className="w-3 h-3 text-[#7A8681]" />
                </p>
                <p className="text-[11px] text-[#7A8681] font-medium">
                  {currentUser.roleLabel}
                  {currentUser.assignedPropertyName &&
                  currentUser.assignedPropertyName !== 'All Properties'
                    ? ` • ${currentUser.assignedPropertyName}`
                    : ''}
                </p>
              </div>
            </button>

            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#5A6762] hover:text-[#17231E] hover:shadow-xs transition-all cursor-pointer"
              title="Account Profile"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#5A6762] hover:text-[#17231E] hover:shadow-xs transition-all relative cursor-pointer"
              title="Database Activity Alerts"
            >
              <Bell className="w-4 h-4" />
              {activities.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#EF4444] absolute top-2 right-2.5" />
              )}
            </button>

            {onLogout && (
              <button
                onClick={async () => {
                  await onLogout();
                }}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white border border-[#E4ECE8] text-[12px] font-bold text-[#17231E] hover:bg-[#FDE6E6] hover:text-[#B91C1C] hover:border-[#F8CACA] transition-all cursor-pointer"
                title="Sign Out of Dashboard"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}

            {/* Real Database Activity Notifications Dropdown */}
            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-lg border border-[#E4ECE8] p-4 z-40">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-bold text-[#17231E]">
                    Recent Database Alerts ({activities.length})
                  </span>
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[11px] text-[#6E7A75] hover:text-[#17231E]"
                  >
                    Close
                  </button>
                </div>

                {activities.length === 0 ? (
                  <p className="py-6 text-center text-[11.5px] text-[#7A8681]">
                    No database activity alerts recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2 text-[12px] max-h-72 overflow-y-auto">
                    {activities.slice(0, 6).map((act) => (
                      <div
                        key={act.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          if (act.activityType === 'payment') handleNavClick('payments');
                          else if (act.activityType === 'maintenance')
                            handleNavClick('maintenance');
                          else if (act.activityType === 'lease')
                            handleNavClick('tenants');
                          else if (act.activityType === 'property')
                            handleNavClick('properties');
                          else if (act.activityType === 'expense')
                            handleNavClick('expenses');
                          else if (act.activityType === 'message')
                            handleNavClick('messages');
                        }}
                        className="p-2.5 rounded-xl bg-[#F4F8F6] hover:bg-[#EAF4EE] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#17231E] truncate">
                            {act.title}
                          </p>
                          <span className="text-[10px] text-[#88948F] shrink-0 tabular-nums">
                            {act.time}
                          </span>
                        </div>
                        <p className="text-[#6E7A75] text-[11px] mt-0.5 line-clamp-2">
                          {act.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Global RLS / Validation Error Banner */}
        {errorBanner && (
          <div className="mx-4 sm:mx-6 mb-3 px-4 py-2.5 rounded-xl bg-[#FDE6E6] text-[#B91C1C] text-[12px] font-semibold flex items-center justify-between">
            <span>{errorBanner}</span>
            <button
              onClick={onClearError}
              className="ml-4 text-[11px] font-bold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Page Viewport */}
        <main className="flex-1 px-4 sm:px-6 pb-4">{children}</main>

        {/* Footer matching reference image */}
        <footer className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#84918B]">
          <div className="flex flex-wrap items-center gap-4">
            <span>Copyright © {new Date().getFullYear()} ARabella agency</span>
            <button
              onClick={() => handleNavClick('reports')}
              className="hover:text-[#17231E] transition-colors"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => handleNavClick('reports')}
              className="hover:text-[#17231E] transition-colors"
            >
              Term and conditions
            </button>
            <button
              onClick={() => handleNavClick('messages')}
              className="hover:text-[#17231E] transition-colors"
            >
              Contact
            </button>
          </div>
          <div className="flex items-center gap-3 text-[#84918B]">
            <span className="text-[11px] font-medium">
              Authenticated: {currentUser.fullName} ({currentUser.roleLabel})
            </span>
          </div>
        </footer>
      </div>

      {/* My Account Profile Modal (No Sign-In forms) */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <AvatarBadge
                  name={currentUser.fullName}
                  bg={
                    currentUser.role === 'owner' || currentUser.role === 'super_admin'
                      ? '#D5F267'
                      : '#D8F3E5'
                  }
                  className="w-10 h-10"
                />
                <div>
                  <h3 className="text-[15px] font-bold text-[#17231E]">
                    My Account Profile
                  </h3>
                  <p className="text-[11px] text-[#7A8681]">
                    {currentUser.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="p-1.5 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F4FAF6] border border-[#CDEEE0] text-[12px] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[#5A6762] font-medium">Full Name</span>
                <span className="font-bold text-[#17231E]">
                  {currentUser.fullName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5A6762] font-medium">Assigned Role</span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#D5F267] text-[#17231E] text-[11px] font-bold">
                  {getRoleDisplayLabel(currentUser.role, currentUser.tenantRef)}
                </span>
              </div>
              {currentUser.jobTitle && (
                <div className="flex items-center justify-between">
                  <span className="text-[#5A6762] font-medium">Job Title</span>
                  <span className="font-semibold text-[#17231E]">
                    {currentUser.jobTitle}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[#5A6762] font-medium">Property Scope</span>
                <span className="font-semibold text-[#156943] flex items-center gap-1">
                  <BuildingIcon className="w-3.5 h-3.5" />
                  {currentUser.assignedPropertyName || 'All Properties'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5A6762] font-medium">Account Status</span>
                <span className="px-2 py-0.5 rounded bg-[#D8F3E5] text-[#156943] text-[10.5px] font-bold">
                  {currentUser.status || 'Active'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {allowedPages.includes('staff') ? (
                <button
                  type="button"
                  onClick={() => {
                    setProfileModalOpen(false);
                    handleNavClick('staff');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4F8F6] hover:bg-[#E4ECE8] text-[#17231E] text-[12px] font-bold transition-colors cursor-pointer"
                >
                  <UserCog className="w-3.5 h-3.5" />
                  Staff & Role Access
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
                >
                  Close
                </button>
                {onLogout && (
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileModalOpen(false);
                      await onLogout();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FDE6E6] text-[#B91C1C] hover:bg-[#F8CACA] text-[12px] font-bold transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database Status Modal when clicking "Update Now" in Sidebar */}
      {upgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#D5F267] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-[#17231E]" />
                </span>
                <h3 className="text-[16px] font-bold text-[#17231E]">
                  PostgreSQL & Supabase Live Mode
                </h3>
              </div>
              <button
                onClick={() => setUpgradeModalOpen(false)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-[#5B6B63] leading-relaxed">
              All mock data has been removed. Every statistic, chart, table, rating, task, and activity log is queried directly from your PostgreSQL database with automatic <span className="font-mono-num font-semibold text-[#17231E]">A-001</span> tenant reference triggers and Row-Level Security (RLS).
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setUpgradeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12.5px] font-bold hover:bg-[#c7e655] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
