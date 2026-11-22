import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  AnimatedCounter,
  AnimatedProgressBar,
  AnimatedChartReveal,
} from './AnimatedMetrics';
import {
  FileCheck2,
  LogIn,
  Clock,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  Search,
  ChevronDown,
  Plus,
  Check,
  Wrench,
  CheckCircle2,
  UserCheck,
  Sparkles,
  ArrowUpDown,
  Trash2,
  Building2,
  MessageSquare,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  RentPaymentRecord,
  NavPageId,
  DashboardAnalytics,
  DashboardTaskRecord,
  ActivityLogRecord,
  PropertyRecord,
  UserSession,
} from '../data/rentalData';
import { useThemePalette } from '../lib/useThemeState';

interface DashboardPageProps {
  currentUser?: UserSession;
  payments: RentPaymentRecord[];
  properties: PropertyRecord[];
  analytics: DashboardAnalytics;
  tasks: DashboardTaskRecord[];
  activities: ActivityLogRecord[];
  onAddTask: (date: string, title: string) => Promise<void>;
  onToggleTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onAddReview: (data: {
    propertyName: string;
    tenantRef?: string;
    tenantName?: string;
    maintenanceScore: number;
    cleanlinessScore: number;
    managementScore: number;
    comfortScore: number;
    locationScore: number;
    comment?: string;
  }) => Promise<void>;
  globalSearch: string;
  onGlobalSearchChange?: (val: string) => void;
  onSelectTenantRef: (tenantRef: string) => void;
  onNavigate: (page: NavPageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentUser,
  payments,
  properties,
  analytics,
  tasks,
  activities,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddReview,
  globalSearch,
  onGlobalSearchChange,
  onSelectTenantRef,
  onNavigate,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const theme = useThemePalette();
  const [revenueRange, setRevenueRange] = useState<'6m' | '12m'>('6m');
  const [collectionRange, setCollectionRange] = useState<'7d' | '14d'>('7d');
  const [tableSearch, setTableSearch] = useState(globalSearch || '');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Paid' | 'Pending' | 'Overdue'
  >('All');

  useEffect(() => {
    setTableSearch(globalSearch || '');
  }, [globalSearch]);

  const handleSearchChange = (val: string) => {
    setTableSearch(val);
    onGlobalSearchChange?.(val);
  };

  // Task Modal
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(() =>
    new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  );
  const [submittingTask, setSubmittingTask] = useState(false);

  // Review Modal (Saves to public.property_reviews in PostgreSQL)
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [revProperty, setRevProperty] = useState('');
  const [revTenantName, setRevTenantName] = useState('');
  const [revTenantRef, setRevTenantRef] = useState('A-001');
  const [revMaint, setRevMaint] = useState(5);
  const [revClean, setRevClean] = useState(5);
  const [revMgmt, setRevMgmt] = useState(5);
  const [revComfort, setRevComfort] = useState(5);
  const [revLoc, setRevLoc] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);

  const revenueData =
    revenueRange === '6m' ? analytics.revenueChart6M : analytics.revenueChart12M;

  const combinedSearch = (tableSearch || globalSearch).trim().toLowerCase();
  const filteredPayments = payments
    .filter((item) => {
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesQuery =
        !combinedSearch ||
        item.tenantName.toLowerCase().includes(combinedSearch) ||
        item.tenantRef.toLowerCase().includes(combinedSearch) ||
        item.paymentId.toLowerCase().includes(combinedSearch) ||
        item.unitNumber.toLowerCase().includes(combinedSearch) ||
        item.unitType.toLowerCase().includes(combinedSearch) ||
        (item.property || '').toLowerCase().includes(combinedSearch) ||
        (item.status || '').toLowerCase().includes(combinedSearch) ||
        (item.dueDate || '').toLowerCase().includes(combinedSearch) ||
        String(item.amount || '').includes(combinedSearch);
      return matchesStatus && matchesQuery;
    })
    .slice(0, combinedSearch ? 50 : 10);

  const filteredTasks = tasks.filter(
    (tk) =>
      !combinedSearch ||
      tk.title.toLowerCase().includes(combinedSearch) ||
      tk.date.toLowerCase().includes(combinedSearch)
  );

  const filteredActivities = activities
    .filter(
      (act) =>
        !combinedSearch ||
        act.title.toLowerCase().includes(combinedSearch) ||
        act.description.toLowerCase().includes(combinedSearch) ||
        (act.tenantRef || '').toLowerCase().includes(combinedSearch)
    )
    .slice(0, combinedSearch ? 15 : 6);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setSubmittingTask(true);
    try {
      await onAddTask(newTaskDate, newTaskTitle.trim());
      setNewTaskTitle('');
      setNewTaskModalOpen(false);
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await onAddReview({
        propertyName:
          revProperty.trim() || properties[0]?.name || 'Portfolio Property',
        tenantName: revTenantName.trim() || 'Verified Resident',
        tenantRef: revTenantRef.trim() || 'A-001',
        maintenanceScore: Number(revMaint),
        cleanlinessScore: Number(revClean),
        managementScore: Number(revMgmt),
        comfortScore: Number(revComfort),
        locationScore: Number(revLoc),
      });
      setReviewModalOpen(false);
      setRevTenantName('');
    } finally {
      setSubmittingReview(false);
    }
  };

  const avail = analytics.unitAvailability;
  const rawTotalAvail =
    avail.occupied + avail.reserved + avail.available + avail.notReady;
  const totalAvail = Math.max(1, rawTotalAvail);

  const totalPaymentsCount =
    analytics.rentCollectedCount + analytics.pendingRentCount;
  const pendingRatePct =
    totalPaymentsCount > 0
      ? Number(((analytics.pendingRentCount / totalPaymentsCount) * 100).toFixed(1))
      : 0;

  const rating = analytics.ratingSummary;

  const getActivityIcon = (type: ActivityLogRecord['activityType']) => {
    if (type === 'maintenance') return Wrench;
    if (type === 'lease') return UserCheck;
    if (type === 'unit') return Sparkles;
    if (type === 'property') return Building2;
    if (type === 'message') return MessageSquare;
    return CheckCircle2;
  };

  // Time-of-day greeting (medium size)
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser?.fullName?.trim().split(' ')[0];
  const greetingHeading = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Greeting Section (Medium Size) Before the Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-0.5">
        <div>
          <h2 className="text-[18px] sm:text-[20px] font-bold text-[#17231E] tracking-tight">
            {greetingHeading} 👋
          </h2>
          <p className="text-[12px] sm:text-[12.5px] text-[#6E7A75] font-medium mt-0.5">
            Here's what is happening across your rental properties today.
          </p>
        </div>
        <div className="hidden sm:inline-flex items-center gap-2 text-[12px] font-medium text-[#76827D]">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: theme.primary }}
          />
          <span>{todayFormatted}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT / MAIN 9 COLUMNS */}
        <div className="xl:col-span-9 space-y-4">
          {/* ROW 1: 4 STAT CARDS COMPUTED 100% FROM LIVE POSTGRESQL DATABASE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Mint-green card — Active Leases */}
          <div
            onClick={() => onNavigate('tenants')}
            className="rms-card-hover rounded-2xl bg-[#D8F3E5] p-4 flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11.5px] font-medium text-[#4A6358]">
                  Active Leases
                </p>
                <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tracking-tight tabular-nums">
                  <AnimatedCounter value={analytics.activeLeasesCount} />
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#242424] border border-transparent dark:border-white/10 flex items-center justify-center text-[#145338] dark:text-[var(--rms-soft-ink)] shadow-2xs">
                <FileCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-[#242424] border border-transparent dark:border-white/10 text-[#145338] dark:text-[var(--rms-soft-ink)] text-[10.5px] font-bold tabular-nums">
                <TrendingUp className="w-3 h-3" />
                <AnimatedCounter
                  value={analytics.occupancyRatePct}
                  decimals={Number.isInteger(analytics.occupancyRatePct) ? 0 : 1}
                  suffix="%"
                />
              </span>
              <span className="text-[11px] text-[#5B7268] dark:text-[#A6ACA8]">occupancy rate</span>
            </div>
          </div>

          {/* Card 2: White card — Rent Collected */}
          <div
            onClick={() => onNavigate('payments')}
            className="rms-card-hover rounded-2xl bg-white p-4 flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11.5px] font-medium text-[#76827D]">
                  Rent Collected
                </p>
                <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tracking-tight tabular-nums">
                  <AnimatedCounter value={analytics.rentCollectedCount} />
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#17231E]">
                <LogIn className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold tabular-nums">
                <TrendingUp className="w-3 h-3" />
                <AnimatedCounter
                  value={analytics.collectionRatePct}
                  decimals={Number.isInteger(analytics.collectionRatePct) ? 0 : 1}
                  suffix="%"
                />
              </span>
              <span className="text-[11px] text-[#88948F]">paid invoices</span>
            </div>
          </div>

          {/* Card 3: White card — Pending Rent */}
          <div
            onClick={() => onNavigate('payments')}
            className="rms-card-hover rounded-2xl bg-white p-4 flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11.5px] font-medium text-[#76827D]">
                  Pending Rent
                </p>
                <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tracking-tight tabular-nums">
                  <AnimatedCounter value={analytics.pendingRentCount} />
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#17231E]">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FDE6E6] text-[#B91C1C] text-[10.5px] font-bold tabular-nums">
                <TrendingDown className="w-3 h-3" />
                <AnimatedCounter
                  value={pendingRatePct}
                  decimals={Number.isInteger(pendingRatePct) ? 0 : 1}
                  suffix="%"
                />
              </span>
              <span className="text-[11px] text-[#88948F]">awaiting payment</span>
            </div>
          </div>

          {/* Card 4: White card — Total Revenue */}
          <div
            onClick={() => onNavigate('expenses')}
            className="rms-card-hover rounded-2xl bg-white p-4 flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11.5px] font-medium text-[#76827D]">
                  Total Revenue
                </p>
                <p className="text-[22px] font-extrabold text-[#17231E] mt-1 tracking-tight tabular-nums">
                  <AnimatedCounter
                    value={analytics.totalRentRevenue}
                    prefix="KSh "
                  />
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#17231E]">
                <CircleDollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold tabular-nums">
                <TrendingUp className="w-3 h-3" />
                <AnimatedCounter
                  value={analytics.netBalance}
                  prefix="KSh "
                />
              </span>
              <span className="text-[11px] text-[#88948F]">net balance</span>
            </div>
          </div>
        </div>

        {/* ROW 2: UNIT AVAILABILITY + RENT REVENUE AREA CHART */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Unit Availability Card */}
          <div className="rms-card-hover lg:col-span-5 bg-white rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-bold text-[#17231E]">
                  Unit Availability
                </h2>
                <button
                  onClick={() => onNavigate('units')}
                  className="text-[#88948F] hover:text-[#17231E] p-1 rounded-lg cursor-pointer"
                  title="Manage units"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Multi-segment Horizontal Bar (Animated) */}
              {rawTotalAvail === 0 ? (
                <div className="h-10 w-full rounded-xl bg-[#EEF3F0] dark:bg-[#282828] flex items-center justify-center text-[11px] font-medium text-[#7A8681]">
                  No units registered yet — Add a Property or Unit Type
                </div>
              ) : (
                <div className="h-10 w-full rounded-xl overflow-hidden flex gap-1">
                  {avail.occupied > 0 && (
                    <AnimatedProgressBar
                      percent={Math.max(8, Math.round((avail.occupied / totalAvail) * 100))}
                      delay={0.04}
                      className="h-full rounded-l-xl"
                      style={{ backgroundColor: theme.secondary }}
                      title={`Occupied: ${avail.occupied} units`}
                    />
                  )}
                  {avail.reserved > 0 && (
                    <AnimatedProgressBar
                      percent={Math.max(8, Math.round((avail.reserved / totalAvail) * 100))}
                      delay={0.1}
                      className="h-full"
                      style={{ backgroundColor: theme.tertiary }}
                      title={`Reserved / Pending: ${avail.reserved} units`}
                    />
                  )}
                  {avail.available > 0 && (
                    <AnimatedProgressBar
                      percent={Math.max(8, Math.round((avail.available / totalAvail) * 100))}
                      delay={0.16}
                      className="h-full"
                      style={{ backgroundColor: theme.primary }}
                      title={`Available: ${avail.available} units`}
                    />
                  )}
                  {avail.notReady > 0 && (
                    <AnimatedProgressBar
                      percent={Math.max(8, Math.round((avail.notReady / totalAvail) * 100))}
                      delay={0.22}
                      className="h-full rounded-r-xl"
                      style={{ backgroundColor: theme.neutral }}
                      title={`Not Ready / Maintenance: ${avail.notReady} units`}
                    />
                  )}
                </div>
              )}
            </div>

            {/* 2x2 Breakdown Grid matching reference */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 mt-5 pt-2">
              <div className="flex items-start gap-2.5">
                <span
                  className="w-1 h-9 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: theme.secondary }}
                />
                <div>
                  <p className="text-[11px] text-[#7A8681] font-medium">Occupied</p>
                  <p className="text-[20px] font-extrabold text-[#17231E] leading-tight tabular-nums">
                    <AnimatedCounter value={avail.occupied} />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="w-1 h-9 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: theme.tertiary }}
                />
                <div>
                  <p className="text-[11px] text-[#7A8681] font-medium">Reserved</p>
                  <p className="text-[20px] font-extrabold text-[#17231E] leading-tight tabular-nums">
                    <AnimatedCounter value={avail.reserved} />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="w-1 h-9 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: theme.primary }}
                />
                <div>
                  <p className="text-[11px] text-[#7A8681] font-medium">Available</p>
                  <p className="text-[20px] font-extrabold text-[#17231E] leading-tight tabular-nums">
                    <AnimatedCounter value={avail.available} />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="w-1 h-9 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: theme.isDark ? '#424242' : '#D7E5DD' }}
                />
                <div>
                  <p className="text-[11px] text-[#7A8681] font-medium">Not Ready</p>
                  <p className="text-[20px] font-extrabold text-[#17231E] leading-tight tabular-nums">
                    <AnimatedCounter value={avail.notReady} />
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Area Chart Card */}
          <div className="rms-card-hover lg:col-span-7 bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-[#17231E]">Revenue</h2>
              <button
                onClick={() =>
                  setRevenueRange(revenueRange === '6m' ? '12m' : '6m')
                }
                className="rms-interactive-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold hover:bg-[#c8e755] cursor-pointer"
              >
                <span>
                  {revenueRange === '6m' ? 'Last 6 Months' : 'Last 12 Months'}
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative h-[175px] w-full">
              {analytics.totalRentRevenue > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.25, ease: 'easeOut' }}
                  className="absolute left-[38%] top-2 z-10 pointer-events-none hidden sm:block"
                >
                  <div
                    className="px-2.5 py-1 rounded-lg shadow-xs"
                    style={{
                      backgroundColor: theme.calloutBg,
                      border: `1px solid ${theme.calloutBorder}`,
                      color: theme.tooltipText,
                    }}
                  >
                    <p
                      className="text-[9.5px] font-medium leading-none"
                      style={{ color: theme.calloutLabel }}
                    >
                      Confirmed Revenue
                    </p>
                    <p className="text-[12px] font-extrabold tabular-nums mt-0.5">
                      <AnimatedCounter
                        value={analytics.totalRentRevenue}
                        prefix="KSh "
                      />
                    </p>
                  </div>
                </motion.div>
              )}

              <AnimatedChartReveal
                key={`rev-chart-${revenueRange}`}
                direction="left-to-right"
                duration={0.88}
                className="w-full h-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenueData}
                    margin={{ top: 18, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={`revGrad-${theme.accentTheme}`} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={theme.areaGrad}
                          stopOpacity={theme.isDark ? 0.32 : 0.65}
                        />
                        <stop
                          offset="95%"
                          stopColor={theme.areaGrad}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={theme.gridStroke}
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme.axisTick, fontSize: 10.5 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme.axisTick, fontSize: 10 }}
                      tickFormatter={(val) =>
                        val === 0
                          ? 'KSh 0'
                          : val >= 1000
                          ? `KSh ${(val / 1000).toFixed(0)}K`
                          : `KSh ${val}`
                      }
                    />
                    <Tooltip
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={180}
                      animationEasing="ease-out"
                      contentStyle={{
                        backgroundColor: theme.tooltipAccentBg,
                        border: theme.tooltipAccentBorder,
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: theme.tooltipText,
                        boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.45)' : undefined,
                      }}
                      itemStyle={{ color: theme.tooltipAccentValue }}
                      labelStyle={{ color: theme.tooltipMuted }}
                      formatter={(value: any) => [
                        `KSh ${Number(value || 0).toLocaleString()}`,
                        'Rent Revenue',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={theme.areaStroke}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill={`url(#revGrad-${theme.accentTheme})`}
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={40}
                      animationDuration={860}
                      animationEasing="ease-out"
                      activeDot={{
                        r: 5,
                        fill: theme.primary,
                        stroke: theme.cardBg,
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </AnimatedChartReveal>
            </div>
          </div>
        </div>

        {/* ROW 3: RENT COLLECTION BAR CHART + LEASES BY PROPERTY DONUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="rms-card-hover lg:col-span-7 bg-white rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-[15px] font-bold text-[#17231E]">
                  Rent Collection
                </h2>
                <div className="flex items-center gap-4 mt-1 text-[11px] text-[#7A8681]">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: theme.secondary }}
                    />
                    Collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: theme.primary }}
                    />
                    Pending
                  </span>
                </div>
              </div>

              <button
                onClick={() =>
                  setCollectionRange(collectionRange === '7d' ? '14d' : '7d')
                }
                className="rms-interactive-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold hover:bg-[#c8e755] cursor-pointer"
              >
                <span>
                  {collectionRange === '7d' ? 'Last 7 Days' : 'This Month'}
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={`rent-col-bar-${collectionRange}`}
                  data={analytics.rentCollection7D}
                  margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
                  barSize={24}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={theme.gridStroke}
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme.axisTick, fontSize: 10.5 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme.axisTick, fontSize: 10.5 }}
                  />
                  <Tooltip
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={180}
                    animationEasing="ease-out"
                    cursor={{ fill: theme.cursorFill }}
                    contentStyle={{
                      backgroundColor: theme.tooltipBg,
                      border: theme.tooltipBorder,
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: theme.tooltipText,
                      boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.45)' : undefined,
                    }}
                    itemStyle={{ color: theme.tooltipText }}
                    labelStyle={{ color: theme.tooltipMuted, fontWeight: 700 }}
                  />
                  <Bar
                    dataKey="collected"
                    name="Collected Payments"
                    stackId="a"
                    fill={theme.secondary}
                    radius={[0, 0, 6, 6]}
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={60}
                    animationDuration={820}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending Payments"
                    stackId="a"
                    fill={theme.primary}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={180}
                    animationDuration={860}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Leases by Property Donut Chart */}
          <div className="rms-card-hover lg:col-span-5 bg-white rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-bold text-[#17231E]">
                Leases by Property
              </h2>
              <button
                onClick={() => onNavigate('properties')}
                className="text-[#88948F] hover:text-[#17231E] p-1 rounded-lg cursor-pointer"
                title="Manage Properties"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {analytics.leasesByProperty.length === 0 ? (
              <div className="my-auto py-8 text-center">
                <p className="text-[12px] text-[#7A8681] mb-3">
                  No properties in database yet.
                </p>
                <button
                  onClick={() => onNavigate('properties')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Property
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-12 items-center gap-2 my-auto">
                <div className="col-span-5 h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.leasesByProperty}
                        cx="50%"
                        cy="50%"
                        startAngle={90}
                        endAngle={-270}
                        innerRadius={38}
                        outerRadius={62}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={!prefersReducedMotion}
                        animationBegin={90}
                        animationDuration={880}
                        animationEasing="ease-out"
                      >
                        {analytics.leasesByProperty.map((_entry, idx) => (
                          <Cell
                            key={idx}
                            fill={theme.donutPalette[idx % theme.donutPalette.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        isAnimationActive={!prefersReducedMotion}
                        animationDuration={180}
                        animationEasing="ease-out"
                        formatter={(val: any) => [`${val ?? 0}%`, 'Share']}
                        contentStyle={{
                          backgroundColor: theme.tooltipBg,
                          borderRadius: '10px',
                          border: theme.tooltipBorder,
                          fontSize: '11px',
                          color: theme.tooltipText,
                        }}
                        itemStyle={{ color: theme.tooltipAccentValue }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="col-span-7 space-y-2 pl-2">
                  {analytics.leasesByProperty.map((item, idx) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-2 text-[11.5px]"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            theme.donutPalette[idx % theme.donutPalette.length],
                        }}
                      />
                      <span className="font-bold text-[#17231E] w-9 tabular-nums">
                        <AnimatedCounter
                          value={item.value}
                          decimals={Number.isInteger(item.value) ? 0 : 1}
                          suffix="%"
                        />
                      </span>
                      <span className="text-[#6E7A75] truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ROW 4: RENT PAYMENT LIST TABLE */}
        <div className="rms-card-hover bg-white rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-[15px] font-bold text-[#17231E]">
              Rent Payment List
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search tenant, ref (A-001), status, etc"
                  className="pl-8 pr-7 py-1.5 rounded-xl bg-[#F4F8F6] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267] w-56"
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88948F] hover:text-[#17231E] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="appearance-none pl-3 pr-7 py-1.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold focus:outline-none cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#17231E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[12.5px] text-[#7A8681] mb-3">
                {payments.length === 0
                  ? 'No rent payments or leases recorded in the database yet.'
                  : 'No rent payment records match your current search or filter.'}
              </p>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  onClick={() => onNavigate('tenants')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D8F3E5] text-[#145338] text-[12px] font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Onboard Tenant (Auto Ref A-001)
                </button>
                <button
                  onClick={() => onNavigate('payments')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Record Payment
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-semibold">
                    <th className="py-2.5 px-3 rounded-l-xl">
                      <span className="inline-flex items-center gap-1">
                        Payment ID <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Tenant Ref <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Tenant Name <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Unit Type <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Unit Number <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Term <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1">
                        Due & Paid Date <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3 rounded-r-xl">
                      <span className="inline-flex items-center gap-1">
                        Status <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
                  {filteredPayments.map((row) => {
                    const unitBadgeClass =
                      row.unitType === 'Deluxe'
                        ? 'bg-[#EAF6BE] text-[#354B14]'
                        : row.unitType === 'Suite'
                        ? 'bg-[#D5F267] text-[#17231E]'
                        : 'bg-[#D8F3E5] text-[#145338]';

                    const statusBadgeClass =
                      row.status === 'Paid'
                        ? 'bg-[#D5F267] text-[#17231E]'
                        : row.status === 'Pending'
                        ? 'bg-[#D8F3E5] text-[#145338]'
                        : 'bg-[#FDE6E6] text-[#B91C1C]';

                    return (
                      <tr
                        key={row.id}
                        onClick={() => onSelectTenantRef(row.tenantRef)}
                        className="hover:bg-[#F7FAF8] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3 font-medium text-[#17231E] tabular-nums">
                          {row.paymentId}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono-num font-bold text-[#145338] bg-[#EAF4EE] px-2 py-0.5 rounded-md text-[11px]">
                            {row.tenantRef}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-[#17231E]">
                          {row.tenantName}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${unitBadgeClass}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                            {row.unitType}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#46544E]">{row.unitNumber}</td>
                        <td className="py-3 px-3 text-[#46544E] tabular-nums">
                          {row.leaseTerm}
                        </td>
                        <td className="py-3 px-3 text-[#46544E] tabular-nums">
                          {row.dueDate} &nbsp;-&nbsp; {row.paidDate}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${statusBadgeClass}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT 3 COLUMNS: RATING + TASKS + RECENT ACTIVITIES (100% DATABASE DRIVEN) */}
      <div className="xl:col-span-3 space-y-4">
        {/* Card 1: Overall Property Rating (Computed from public.property_reviews) */}
        <div className="rms-card-hover bg-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#17231E]">
              Overall Rating
            </h2>
            <button
              onClick={() => setReviewModalOpen(true)}
              className="rms-interactive-btn w-7 h-7 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] flex items-center justify-center cursor-pointer"
              title="Log tenant property review"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="px-3.5 py-2 rounded-2xl bg-[#D8F3E5] text-[#17231E] flex items-baseline gap-0.5">
              <span className="text-[22px] font-extrabold tabular-nums">
                <AnimatedCounter
                  value={rating.overallScore}
                  decimals={1}
                />
              </span>
              <span className="text-[12px] font-semibold text-[#556B60]">/5</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#17231E]">
                {rating.label}
              </p>
              <p className="text-[11px] text-[#7A8681] tabular-nums">
                from <AnimatedCounter value={rating.reviewCount} /> tenant{' '}
                {rating.reviewCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {rating.categories.map((item, idx) => (
              <div
                key={item.label}
                className="flex items-center gap-2 text-[11.5px]"
              >
                <span className="w-20 text-[#6E7A75] shrink-0">{item.label}</span>
                <div className="flex-1 h-2 rounded-full bg-[#EEF3F0] overflow-hidden">
                  <AnimatedProgressBar
                    percent={item.pct}
                    delay={0.05 * idx}
                    className="h-full rounded-full"
                    style={{ backgroundColor: theme.primary }}
                  />
                </div>
                <span className="w-7 text-right font-bold text-[#17231E] tabular-nums">
                  <AnimatedCounter value={item.score} decimals={1} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Tasks (Connected to public.property_tasks in PostgreSQL) */}
        <div className="rms-card-hover bg-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[15px] font-bold text-[#17231E]">Tasks</h2>
            <button
              onClick={() => setNewTaskModalOpen(true)}
              className="rms-interactive-btn w-7 h-7 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] flex items-center justify-center cursor-pointer"
              title="Add task"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[11.5px] text-[#7A8681] mb-2">
                {tasks.length === 0
                  ? 'No property tasks scheduled yet.'
                  : 'No tasks match your search.'}
              </p>
              <button
                onClick={() => setNewTaskModalOpen(true)}
                className="rms-interactive-btn px-3 py-1.5 rounded-xl bg-[#D8F3E5] text-[#145338] text-[11px] font-bold cursor-pointer"
              >
                + Add First Task
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onToggleTask(task.id)}
                  className={`rms-interactive-btn p-3 rounded-xl border border-transparent cursor-pointer group ${
                    task.tone === 'lime' ? 'bg-[#DDF576]' : 'bg-[#D8F3E5]'
                  } ${task.done ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-center justify-between text-[10.5px] text-[#4E6459] mb-1">
                    <span>{task.date}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTask(task.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/60 dark:hover:bg-white/10 text-[#4E6459] transition-opacity"
                        title="Delete task"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <span className="w-4 h-4 rounded-full bg-white/70 dark:bg-white/10 flex items-center justify-center">
                        {task.done ? (
                          <Check className="w-2.5 h-2.5 text-[#17231E]" />
                        ) : (
                          <MoreHorizontal className="w-3 h-3 text-[#4E6459]" />
                        )}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`text-[12px] font-bold text-[#17231E] leading-snug ${
                      task.done ? 'line-through' : ''
                    }`}
                  >
                    {task.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: Recent Activities (Connected to public.activity_logs in PostgreSQL) */}
        <div className="rms-card-hover bg-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[15px] font-bold text-[#17231E]">
              Recent Activities
            </h2>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-[#88948F] hover:text-[#17231E]"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {filteredActivities.length === 0 ? (
            <p className="py-6 text-center text-[11.5px] text-[#7A8681]">
              {activities.length === 0
                ? 'Real-time database events (new leases, payments, work orders, expenses) will appear here automatically.'
                : 'No recent activities match your search.'}
            </p>
          ) : (
            <div className="space-y-3.5">
              {filteredActivities.map((act) => {
                const Icon = getActivityIcon(act.activityType);
                const bg =
                  act.tone === 'lime' ? 'bg-[#DDF576]' : 'bg-[#D8F3E5]';
                return (
                  <div key={act.id} className="flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <Icon className="w-3.5 h-3.5 text-[#17231E]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#88948F] font-medium tabular-nums">
                        {act.time}
                      </p>
                      <p className="text-[12px] font-bold text-[#17231E] leading-snug">
                        {act.title}
                      </p>
                      <p className="text-[11px] text-[#6E7A75] leading-relaxed mt-0.5">
                        {act.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      <AnimatePresence>
        {newTaskModalOpen && (
          <motion.div
            key="add-task-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4"
            onClick={() => setNewTaskModalOpen(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleAddTask}
              className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-[#E4ECE8]"
            >
              <h3 className="text-[15px] font-bold text-[#17231E] mb-3">
                Add Property Task
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[#5A6762] mb-1">
                    Scheduled Date
                  </label>
                  <input
                    type="text"
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[12.5px] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-semibold text-[#5A6762] mb-1">
                    Task Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Inspect smoke detectors in Building A"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[12.5px] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewTaskModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTask}
                  className="rms-interactive-btn px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755] cursor-pointer"
                >
                  {submittingTask ? 'Saving...' : 'Save Task'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Tenant Review Modal */}
      <AnimatePresence>
        {reviewModalOpen && (
          <motion.div
            key="add-review-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4"
            onClick={() => setReviewModalOpen(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleCreateReview}
              className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-[#E4ECE8]"
            >
              <h3 className="text-[15px] font-bold text-[#17231E] mb-3">
                Log Tenant Property Rating
              </h3>
              <div className="space-y-3 text-[12px]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#5A6762] mb-1">
                      Property
                    </label>
                    <input
                      type="text"
                      value={revProperty}
                      onChange={(e) => setRevProperty(e.target.value)}
                      placeholder={properties[0]?.name || 'Property Name'}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#5A6762] mb-1">
                      Tenant Ref
                    </label>
                    <input
                      type="text"
                      value={revTenantRef}
                      onChange={(e) => setRevTenantRef(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] font-mono-num font-bold text-[#145338]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Tenant Name
                  </label>
                  <input
                    type="text"
                    required
                    value={revTenantName}
                    onChange={(e) => setRevTenantName(e.target.value)}
                    placeholder="Resident Name"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: 'Maint.', val: revMaint, set: setRevMaint },
                    { label: 'Clean.', val: revClean, set: setRevClean },
                    { label: 'Mgmt.', val: revMgmt, set: setRevMgmt },
                    { label: 'Comfort', val: revComfort, set: setRevComfort },
                    { label: 'Location', val: revLoc, set: setRevLoc },
                  ].map((item) => (
                    <div key={item.label}>
                      <label className="block text-[10.5px] font-semibold text-[#5A6762] mb-1">
                        {item.label}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={0.1}
                        value={item.val}
                        onChange={(e) => item.set(Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums text-center font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="rms-interactive-btn px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755] cursor-pointer"
                >
                  {submittingReview ? 'Saving...' : 'Save Review'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};
