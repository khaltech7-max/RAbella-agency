import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutGrid,
  CreditCard,
  Home,
  Bell,
  Wrench,
  Building2,
  Users,
  UserCog,
  CircleDollarSign,
  FileText,
  Receipt,
  FileBarChart,
  Search,
  Settings,
  ChevronDown,
  Menu,
  X,
  CheckCircle2,
  Building2 as BuildingIcon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
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
  pendingPaymentsCount?: number;
  pendingMaintenanceCount?: number;
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

function getInitials(name: string): string {
  const parts = String(name || 'AR')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activePage,
  onSelectPage,
  globalSearch,
  onGlobalSearchChange,
  unreadMessagesCount,
  pendingPaymentsCount = 0,
  pendingMaintenanceCount = 0,
  currentUser,
  activities,
  onLogout,
  errorBanner,
  onClearError,
  children,
}) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [financialsOpen, setFinancialsOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    key: string;
    label: string;
    badge?: number;
    top: number;
  } | null>(null);

  const allowedPages = getAllowedPagesForRole(currentUser.role);

  const primaryNavItems: {
    id: NavPageId;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    {
      id: 'payments',
      label: 'Rent Payments',
      icon: CreditCard,
      badge: pendingPaymentsCount > 0 ? pendingPaymentsCount : undefined,
    },
    { id: 'units', label: 'Units', icon: LayoutGrid },
    {
      id: 'messages',
      label: 'Reminders',
      icon: Bell,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      icon: Wrench,
      badge: pendingMaintenanceCount > 0 ? pendingMaintenanceCount : undefined,
    },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'tenants', label: 'Tenants', icon: Users },
    { id: 'staff', label: 'Staff & Roles', icon: UserCog },
  ];

  const navItems = primaryNavItems.filter((item) => allowedPages.includes(item.id));
  const showFinancials =
    allowedPages.includes('invoices') || allowedPages.includes('expenses');
  const showReports = allowedPages.includes('reports');

  const handleNavClick = (id: NavPageId) => {
    onSelectPage(id);
    setMobileMenuOpen(false);
    setHoveredTooltip(null);
  };

  const userInitials = getInitials(currentUser.fullName);

  const showTooltip = (
    e: React.MouseEvent<HTMLElement>,
    key: string,
    label: string,
    badge?: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTooltip({
      key,
      label,
      badge,
      top: rect.top + rect.height / 2,
    });
  };

  const renderFloatingSidebar = (mode: 'desktop' | 'mobile') => {
    const isExpanded = mode === 'mobile' ? true : sidebarExpanded;

    const renderNavButton = (
      item: {
        id: string;
        label: string;
        icon: React.FC<{ className?: string }>;
        badge?: number;
        isActive: boolean;
        onClick: () => void;
        isSubItem?: boolean;
      },
      layoutScope: string
    ) => {
      const Icon = item.icon;

      return (
        <div
          key={item.id}
          className="relative flex items-center justify-center w-full"
          onMouseEnter={(e) =>
            !isExpanded &&
            showTooltip(e, `${layoutScope}-${item.id}`, item.label, item.badge)
          }
          onMouseLeave={() => setHoveredTooltip(null)}
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={item.onClick}
            aria-label={item.label}
            className={`relative flex items-center transition-colors duration-200 cursor-pointer focus:outline-none ${
              isExpanded
                ? `w-full px-3.5 ${item.isSubItem ? 'py-2' : 'py-2.5'} rounded-[16px] justify-between`
                : 'w-11 h-11 rounded-[16px] justify-center'
            } ${
              item.isActive
                ? 'text-[#17231E] font-bold'
                : 'text-[#6E7A75] hover:text-[#17231E] hover:bg-[#F4F8F6] font-semibold'
            }`}
          >
            {item.isActive && (
              <motion.div
                layoutId={`floating-sidebar-active-${layoutScope}`}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="absolute inset-0 rounded-[16px] bg-[#D6F45A] shadow-[0_4px_12px_rgba(214,244,90,0.35)]"
              />
            )}

            <span
              className={`relative z-10 flex items-center ${
                isExpanded ? 'gap-3 min-w-0' : 'justify-center'
              }`}
            >
              <Icon
                className={`${
                  item.isSubItem ? 'w-4 h-4' : 'w-[19px] h-[19px]'
                } shrink-0 transition-colors duration-200 ${
                  item.isActive ? 'text-[#17231E]' : 'text-current'
                }`}
              />
              {isExpanded && (
                <span className="text-[13px] tracking-tight truncate whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </span>

            {/* Notification Badge */}
            {item.badge && item.badge > 0 ? (
              isExpanded ? (
                <span
                  className={`relative z-10 min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-extrabold flex items-center justify-center tabular-nums shrink-0 ${
                    item.isActive
                      ? 'bg-[#17231E] text-[#D6F45A]'
                      : 'bg-[#D6F45A] text-[#17231E]'
                  }`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : (
                <span
                  className={`absolute -top-1 -right-1 z-20 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center tabular-nums border-2 border-white shadow-xs ${
                    item.isActive
                      ? 'bg-[#17231E] text-[#D6F45A]'
                      : 'bg-[#D6F45A] text-[#17231E]'
                  }`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )
            ) : null}
          </motion.button>
        </div>
      );
    };

    return (
      <div
        className={`flex flex-col justify-between h-full bg-white text-[#17231E] rounded-[24px] shadow-[0_10px_30px_rgba(23,35,30,0.07)] border border-[#E4ECE8] select-none transition-all duration-250 ease-out ${
          isExpanded ? 'w-[240px] px-3.5 py-4' : 'w-[68px] px-2.5 py-4 items-center'
        }`}
      >
        {/* Top Brand Emblem */}
        <div
          className={`flex items-center ${
            isExpanded ? 'justify-between px-1' : 'justify-center'
          } mb-3 shrink-0`}
        >
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-3 group focus:outline-none cursor-pointer"
            title="ARabella agency — Dashboard"
          >
            <div className="w-11 h-11 rounded-[16px] bg-[#D6F45A] flex items-center justify-center shadow-[0_4px_12px_rgba(214,244,90,0.3)] transition-transform duration-200 group-hover:scale-105 shrink-0">
              {/* Four-point star emblem matching clean icon language */}
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-[#17231E] fill-current"
                aria-hidden="true"
              >
                <path d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z" />
              </svg>
            </div>
            {isExpanded && (
              <div className="text-left min-w-0">
                <span className="block text-[15.5px] font-extrabold tracking-tight text-[#17231E] truncate">
                  ARabella agency
                </span>
                <span className="block text-[10.5px] font-medium text-[#7A8681] truncate">
                  Rental Management
                </span>
              </div>
            )}
          </button>

          {mode === 'mobile' && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-xl text-[#76827D] hover:text-[#17231E] hover:bg-[#EEF3F0] transition-colors cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Primary Navigation Items */}
        <nav
          className={`flex-1 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col ${
            isExpanded ? 'space-y-1.5' : 'space-y-2 items-center'
          } py-1`}
        >
          {navItems.map((item) =>
            renderNavButton(
              {
                id: item.id,
                label: item.label,
                icon: item.icon,
                badge: item.badge,
                isActive: activePage === item.id,
                onClick: () => handleNavClick(item.id),
              },
              mode
            )
          )}

          {/* Financials Section: Supports both Expanded Collapsible Group & Collapsed Direct Icons */}
          {showFinancials && (
            <>
              {isExpanded ? (
                <div className="pt-1 w-full">
                  <button
                    type="button"
                    onClick={() => setFinancialsOpen(!financialsOpen)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[16px] text-[13px] font-semibold transition-colors duration-200 cursor-pointer ${
                      activePage === 'invoices' || activePage === 'expenses'
                        ? 'text-[#17231E] bg-[#F4F8F6] font-bold'
                        : 'text-[#6E7A75] hover:text-[#17231E] hover:bg-[#F4F8F6]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <CircleDollarSign className="w-[19px] h-[19px] shrink-0 text-[#76827D]" />
                      <span className="truncate">Financials</span>
                    </span>
                    <motion.span
                      animate={{ rotate: financialsOpen ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-[#76827D]" />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {financialsOpen && (
                      <motion.div
                        key="financials-floating-submenu"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1.5 ml-3.5 pl-2.5 border-l border-[#E4ECE8] space-y-1">
                          {allowedPages.includes('invoices') &&
                            renderNavButton(
                              {
                                id: 'invoices',
                                label: 'Rent Invoices',
                                icon: FileText,
                                isActive: activePage === 'invoices',
                                onClick: () => handleNavClick('invoices'),
                                isSubItem: true,
                              },
                              mode
                            )}
                          {allowedPages.includes('expenses') &&
                            renderNavButton(
                              {
                                id: 'expenses',
                                label: 'Expenses',
                                icon: Receipt,
                                isActive: activePage === 'expenses',
                                onClick: () => handleNavClick('expenses'),
                                isSubItem: true,
                              },
                              mode
                            )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <>
                  {allowedPages.includes('invoices') &&
                    renderNavButton(
                      {
                        id: 'invoices',
                        label: 'Rent Invoices',
                        icon: FileText,
                        isActive: activePage === 'invoices',
                        onClick: () => handleNavClick('invoices'),
                      },
                      mode
                    )}
                  {allowedPages.includes('expenses') &&
                    renderNavButton(
                      {
                        id: 'expenses',
                        label: 'Expenses',
                        icon: Receipt,
                        isActive: activePage === 'expenses',
                        onClick: () => handleNavClick('expenses'),
                      },
                      mode
                    )}
                </>
              )}
            </>
          )}

          {/* Reports Item */}
          {showReports &&
            renderNavButton(
              {
                id: 'reports',
                label: 'Reports',
                icon: FileBarChart,
                isActive: activePage === 'reports',
                onClick: () => handleNavClick('reports'),
              },
              mode
            )}
        </nav>

        {/* Bottom Utility Stack: System Status, Settings, Collapse/Expand Toggle & User Avatar */}
        <div
          className={`pt-3 mt-2 border-t border-[#E4ECE8] flex flex-col ${
            isExpanded ? 'space-y-1.5' : 'space-y-2.5 items-center'
          } shrink-0`}
        >
          {/* System Info / Help Button */}
          {renderNavButton(
            {
              id: 'system-info',
              label: 'System Info',
              icon: HelpCircle,
              isActive: upgradeModalOpen,
              onClick: () => {
                setUpgradeModalOpen(true);
                setMobileMenuOpen(false);
              },
            },
            mode
          )}

          {/* Settings Item */}
          {renderNavButton(
            {
              id: 'settings',
              label: 'Settings',
              icon: Settings,
              isActive: profileModalOpen,
              onClick: () => {
                setProfileModalOpen(true);
                setMobileMenuOpen(false);
              },
            },
            mode
          )}

          {/* Expand / Collapse Sidebar Toggle (Desktop) */}
          {mode === 'desktop' && (
            <div
              className="relative flex items-center justify-center w-full"
              onMouseEnter={(e) =>
                !isExpanded &&
                showTooltip(e, 'desktop-toggle-expand', 'Expand Sidebar')
              }
              onMouseLeave={() => setHoveredTooltip(null)}
            >
              <motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setHoveredTooltip(null);
                  setSidebarExpanded((prev) => !prev);
                }}
                aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                className={`flex items-center transition-colors duration-200 cursor-pointer border border-[#E4ECE8] bg-[#F4F8F6] hover:bg-[#EAF2ED] text-[#5A6762] hover:text-[#17231E] ${
                  isExpanded
                    ? 'w-full px-3.5 py-2 rounded-full justify-between'
                    : 'w-10 h-10 rounded-full justify-center'
                }`}
              >
                <span className="flex items-center gap-3">
                  {isExpanded ? (
                    <PanelLeftClose className="w-4 h-4 shrink-0" />
                  ) : (
                    <PanelLeftOpen className="w-4 h-4 shrink-0" />
                  )}
                  {isExpanded && (
                    <span className="text-[12.5px] font-semibold">Collapse Menu</span>
                  )}
                </span>
              </motion.button>
            </div>
          )}

          {/* User Profile Avatar at Bottom */}
          <div
            className="relative flex items-center justify-center w-full pt-0.5"
            onMouseEnter={(e) =>
              !isExpanded &&
              showTooltip(
                e,
                `${mode}-user-profile`,
                `${currentUser.fullName} • ${currentUser.roleLabel}`
              )
            }
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setProfileModalOpen(true);
                setMobileMenuOpen(false);
              }}
              aria-label={`Account profile for ${currentUser.fullName}`}
              className={`flex items-center transition-colors duration-200 cursor-pointer ${
                isExpanded
                  ? 'w-full p-1.5 rounded-2xl bg-[#F4F8F6] hover:bg-[#EAF2ED] gap-2.5 border border-[#E4ECE8]'
                  : 'justify-center'
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-[#D6F45A] text-[#17231E] font-extrabold text-[13px] tracking-tight flex items-center justify-center shrink-0 shadow-[0_3px_10px_rgba(214,244,90,0.3)] ring-2 ring-[#E4ECE8]">
                {userInitials}
              </div>
              {isExpanded && (
                <div className="text-left min-w-0 flex-1 pr-1">
                  <p className="text-[12.5px] font-bold text-[#17231E] truncate">
                    {currentUser.fullName}
                  </p>
                  <p className="text-[10.5px] text-[#7A8681] font-medium truncate">
                    {currentUser.roleLabel}
                  </p>
                </div>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    );
  };

  const pageMeta = PAGE_TITLES[activePage] || { title: 'Dashboard' };

  return (
    <div className="min-h-screen flex bg-[#EEF3F0] text-[#17231E]">
      {/* Desktop Floating Left Sidebar (Detached from browser edges with surrounding space) */}
      <aside className="hidden lg:block shrink-0 pl-3.5 pr-1 py-3.5 sticky top-0 h-screen z-30">
        {renderFloatingSidebar('desktop')}

        {/* Unclipped Floating Tooltip for Collapsed Icon Mode */}
        <AnimatePresence>
          {!sidebarExpanded && hoveredTooltip && (
            <motion.div
              key={hoveredTooltip.key}
              initial={{ opacity: 0, x: -6, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4, scale: 0.96 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{ top: hoveredTooltip.top }}
              className="fixed left-[90px] -translate-y-1/2 z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#17231E] text-[12px] font-semibold whitespace-nowrap shadow-[0_8px_24px_rgba(23,35,30,0.12)] border border-[#E4ECE8]"
            >
              <span>{hoveredTooltip.label}</span>
              {hoveredTooltip.badge && hoveredTooltip.badge > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-[#D6F45A] text-[#17231E] text-[10px] font-extrabold tabular-nums leading-none">
                  {hoveredTooltip.badge}
                </span>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Mobile & Tablet Floating Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex p-3">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 bg-black/30 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -28, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative z-10 h-full max-w-[85vw]"
            >
              {renderFloatingSidebar('mobile')}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area — Automatically adjusts to floating sidebar width */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Persistent) */}
        {/* Top Bar matching reference screenshot (Persistent) */}
        <header className="px-4 sm:px-6 lg:px-8 pt-4 pb-3 flex items-center justify-between gap-3 sm:gap-5 min-w-0">
          {/* Left: Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-2xl bg-white text-[#17231E] border border-[#E4ECE8] hover:bg-[#EEF3F0] transition-colors shadow-xs cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[20px] sm:text-[23px] font-bold text-[#172B23] tracking-tight truncate">
              {pageMeta.title}
            </h1>
          </div>

          {/* Right Header Cluster: Search Bar + Chat + Bell + User Profile */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 ml-auto shrink-0">
            {/* Search Pill with Magnifying Glass on the Right */}
            <div className="relative w-36 sm:w-56 md:w-64 lg:w-72">
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => onGlobalSearchChange(e.target.value)}
                placeholder="Search placeholder"
                className="w-full pl-4 pr-9 py-2 sm:py-2.5 rounded-full bg-[#EBF0ED] border border-[#DEE6E0] text-[13px] text-[#17231E] placeholder-[#88968F] focus:outline-none focus:ring-1 focus:ring-[#D6F45A] focus:bg-white transition-all shadow-2xs"
              />
              <Search className="w-4 h-4 text-[#7A8881] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
            </div>

            {/* Circular Messages / Chat Button */}
            <button
              onClick={() => handleNavClick('messages')}
              className="w-10 h-10 rounded-full bg-[#EAF0EC] hover:bg-[#DEE7E1] text-[#2C4438] flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Messages & Reminders"
              aria-label="Messages"
            >
              <svg
                className="w-[18px] h-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                <circle cx="8.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </button>

            {/* Circular Notification Bell Button with Red Dot */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="w-10 h-10 rounded-full bg-[#EAF0EC] hover:bg-[#DEE7E1] text-[#2C4438] flex items-center justify-center relative transition-all cursor-pointer shrink-0"
                title="Database Activity Alerts"
                aria-label="Notifications"
              >
                <Bell className="w-[18px] h-[18px] stroke-[1.9]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] border-2 border-[#EEF3F0] absolute top-1.5 right-1.5" />
              </button>

              {/* Real Database Activity Notifications Dropdown */}
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    key="notifications-dropdown"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-lg border border-[#E4ECE8] p-4 z-40 origin-top-right"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-bold text-[#17231E]">
                        Recent Database Alerts ({activities.length})
                      </span>
                      <button
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[11px] text-[#6E7A75] hover:text-[#17231E] cursor-pointer"
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
                            className="p-2.5 rounded-xl bg-[#F4F8F6] hover:bg-[#EAF4EE] cursor-pointer transition-colors duration-150"
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Profile Area: Name on Left, Avatar on Right with Lime Ring */}
            <button
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-2.5 pl-1 hover:opacity-90 transition-opacity cursor-pointer text-left shrink-0"
              title="My Account Profile & Settings"
            >
              <span className="hidden sm:inline-block text-[13.5px] sm:text-[14px] font-bold text-[#172B23] tracking-tight truncate max-w-[160px]">
                {currentUser.fullName}
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full ring-2 ring-[#BFEF43] overflow-hidden shrink-0 shadow-xs">
                <AvatarBadge
                  name={currentUser.fullName}
                  bg="#D5F267"
                  className="w-full h-full"
                />
              </div>
            </button>
          </div>
        </header>

        {/* Global RLS / Validation Error Banner */}
        <AnimatePresence>
          {errorBanner && (
            <motion.div
              key="global-error-banner"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mx-4 sm:mx-6 mb-3 px-4 py-2.5 rounded-xl bg-[#FDE6E6] text-[#B91C1C] text-[12px] font-semibold flex items-center justify-between"
            >
              <span>{errorBanner}</span>
              <button
                onClick={onClearError}
                className="ml-4 text-[11px] font-bold underline cursor-pointer"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Viewport — Smooth 220ms fade-in + 10px upward slide on route navigation */}
        <main className="flex-1 px-4 sm:px-6 pb-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 0, transition: { duration: 0.05, ease: 'easeOut' } }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full will-change-[transform,opacity]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#84918B]">
          <div className="flex flex-wrap items-center gap-4">
            <span>Copyright © {new Date().getFullYear()} ARabella agency</span>
            <button
              onClick={() => handleNavClick('reports')}
              className="hover:text-[#17231E] transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => handleNavClick('reports')}
              className="hover:text-[#17231E] transition-colors cursor-pointer"
            >
              Term and conditions
            </button>
            <button
              onClick={() => handleNavClick('messages')}
              className="hover:text-[#17231E] transition-colors cursor-pointer"
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

      {/* My Account Profile / Settings Modal */}
      <AnimatePresence>
        {profileModalOpen && (
          <motion.div
            key="profile-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4"
            onClick={() => setProfileModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]"
            >
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
                      My Account Profile & Settings
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
                    className="rms-interactive-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4F8F6] hover:bg-[#E4ECE8] text-[#17231E] text-[12px] font-bold cursor-pointer"
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
                      className="rms-interactive-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FDE6E6] text-[#B91C1C] hover:bg-[#F8CACA] text-[12px] font-bold cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Status Modal */}
      <AnimatePresence>
        {upgradeModalOpen && (
          <motion.div
            key="upgrade-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4"
            onClick={() => setUpgradeModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]"
            >
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
                  className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[13px] text-[#5B6B63] leading-relaxed">
                Every statistic, chart, table, rating, task, and activity log is queried directly from your PostgreSQL database with automatic <span className="font-mono-num font-semibold text-[#17231E]">A-001</span> tenant reference triggers and Row-Level Security (RLS).
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setUpgradeModalOpen(false)}
                  className="rms-interactive-btn px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12.5px] font-bold hover:bg-[#c7e655] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
