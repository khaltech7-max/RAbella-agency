import React, { useState, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { AnimatedCounter } from './AnimatedMetrics';
import {
  CircleDollarSign,
  TrendingUp,
  MoreHorizontal,
  Calendar,
  ChevronDown,
  Search,
  Filter,
  Eye,
  Download,
  ArrowUpDown,
  Plus,
  X,
  Check,
  Trash2,
  Landmark,
  Wallet,
  Building2,
  Sparkles,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ExpenseTransaction,
  DashboardAnalytics,
  PropertyRecord,
} from '../data/rentalData';
import { useThemePalette } from '../lib/useThemeState';

interface ExpensesPageProps {
  transactions: ExpenseTransaction[];
  properties: PropertyRecord[];
  analytics: DashboardAnalytics;
  onAddTransaction: (tx: Partial<ExpenseTransaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  globalSearch: string;
  onGlobalSearchChange?: (val: string) => void;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  transactions,
  properties,
  analytics,
  onAddTransaction,
  onDeleteTransaction,
  globalSearch,
  onGlobalSearchChange,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const theme = useThemePalette();
  const [breakdownTab, setBreakdownTab] = useState<'Income' | 'Expense'>('Expense');
  const [search, setSearch] = useState(globalSearch || '');

  useEffect(() => {
    setSearch(globalSearch || '');
  }, [globalSearch]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    onGlobalSearchChange?.(val);
  };
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [previewTx, setPreviewTx] = useState<ExpenseTransaction | null>(null);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New Expense modal form
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newCategory, setNewCategory] =
    useState<ExpenseTransaction['category']>('Maintenance and Repairs');
  const [newProperty, setNewProperty] = useState(properties[0]?.name || 'All Properties');
  const [newQty, setNewQty] = useState(1);
  const [newAmount, setNewAmount] = useState(15000);

  useEffect(() => {
    if (properties.length > 0 && (!newProperty || newProperty === 'All Properties')) {
      setNewProperty(properties[0].name);
    }
  }, [properties, newProperty]);

  const query = (search || globalSearch).trim().toLowerCase();

  const filteredTx = transactions.filter((t) => {
    const matchesCat = categoryFilter === 'All' || t.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    const matchesQuery =
      !query ||
      t.expense.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query) ||
      t.property.toLowerCase().includes(query) ||
      (t.status || '').toLowerCase().includes(query) ||
      (t.date || '').toLowerCase().includes(query) ||
      (t.id || '').toLowerCase().includes(query) ||
      String(t.amount || '').includes(query);
    return matchesCat && matchesStatus && matchesQuery;
  });

  const activeDonutData =
    breakdownTab === 'Expense'
      ? analytics.expenseBreakdown
      : analytics.incomeBreakdown;

  const rentCollectedVal =
    analytics.rentCollected !== undefined
      ? analytics.rentCollected
      : analytics.totalRentRevenue || 0;
  const otherIncomeVal = analytics.otherIncome || 0;
  const depositDeductionsVal = analytics.depositDeductions || 0;
  const totalRevenueVal =
    analytics.totalRevenue !== undefined
      ? analytics.totalRevenue
      : analytics.totalIncome ?? rentCollectedVal + otherIncomeVal;
  const depositsHeldVal = analytics.depositsHeld || 0;
  const depositsReceivedVal = analytics.depositsReceived ?? depositsHeldVal;
  const depositsRefundedVal = analytics.depositsRefunded || 0;
  const depositsHeldCount = analytics.depositsHeldCount || 0;
  const totalMoneyReceivedVal =
    analytics.totalMoneyReceived !== undefined
      ? analytics.totalMoneyReceived
      : rentCollectedVal + (otherIncomeVal - depositDeductionsVal) + depositsReceivedVal;
  const outstandingRentVal = analytics.outstandingRent || 0;
  const propertyFinancials = analytics.propertyFinancials || [];
  const totalIncomeVal = totalRevenueVal;

  const handleDownload = (tx: ExpenseTransaction) => {
    setDownloadedId(tx.id);
    const content = [
      'RENTIFY EXPENSE VOUCHER',
      '=======================',
      `Voucher ID: ${tx.id}`,
      `Description: ${tx.expense}`,
      `Category: ${tx.category}`,
      `Property: ${tx.property}`,
      `Quantity: ${tx.quantity}`,
      `Amount: KSh ${tx.amount.toLocaleString()}`,
      `Date: ${tx.date}`,
      `Status: ${tx.status}`,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voucher-${tx.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadedId(null), 1800);
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseName.trim()) return;
    setSaving(true);
    try {
      const todayFormatted = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      await onAddTransaction({
        expense: newExpenseName.trim(),
        category: newCategory,
        property: newProperty || properties[0]?.name || 'All Properties',
        quantity: Number(newQty),
        amount: Number(newAmount),
        date: todayFormatted,
        status: 'Completed',
      });
      setNewExpenseName('');
      setAddModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      {/* TOP SECTION: 8 COLS LEFT (3 STAT CARDS + EARNINGS BAR CHART) + 4 COLS RIGHT (INCOME/EXPENSE DONUT) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left 8 Columns */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          {/* Financial Accounting & Deposit Liability Separation Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 1. Total Earned Revenue */}
            <div className="rms-card-hover bg-[#D8F3E5] rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-[#145338]">
                    <CircleDollarSign className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Total Revenue
                    </span>
                    <span className="text-[10px] font-semibold text-[#315243]">
                      Rent + Other Income Only
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-white/80 text-[#145338] text-[9.5px] font-bold uppercase">
                  Earned
                </span>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={totalRevenueVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-[#145338] text-[10.5px] font-bold tabular-nums">
                    NOI: KSh {Number(analytics.netBalance || 0).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-[#4A6358] mt-0.5">
                    Exp: KSh {Number(analytics.totalExpenses || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Rent Collected */}
            <div className="rms-card-hover bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#145338]">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Rent Collected
                    </span>
                    <span className="text-[10px] text-[#6E7A75]">
                      Confirmed rental payments
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={rentCollectedVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold tabular-nums">
                    <AnimatedCounter value={analytics.rentCollectedCount} suffix=" Paid" />
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">rental invoices</p>
                </div>
              </div>
            </div>

            {/* 3. Other Income (Fees + Retained Deposit Deductions) */}
            <div className="rms-card-hover bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[#EAF6BE] flex items-center justify-center text-[#354B14]">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Other Income
                    </span>
                    <span className="text-[10px] text-[#6E7A75]">
                      Fees & deposit deductions
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={otherIncomeVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EAF6BE] text-[#354B14] text-[10.5px] font-bold tabular-nums">
                    Deductions: KSh {Number(depositDeductionsVal).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">transferred to revenue</p>
                </div>
              </div>
            </div>

            {/* 4. Deposits Held (Liability — Not Revenue) */}
            <div className="rms-card-hover bg-white rounded-2xl p-4 flex flex-col justify-between border border-[#BAE6FD]/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[#E0F2FE] flex items-center justify-center text-[#0369A1]">
                    <Landmark className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Deposits Held
                    </span>
                    <span className="text-[10px] text-[#0369A1] font-semibold">
                      Tenant Escrow Liability
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#E0F2FE] text-[#0369A1] text-[9.5px] font-bold uppercase">
                  Liability
                </span>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={depositsHeldVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E0F2FE] text-[#0369A1] text-[10.5px] font-bold tabular-nums">
                    Refunded: KSh {Number(depositsRefundedVal).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">
                    {depositsHeldCount} active {depositsHeldCount === 1 ? 'deposit' : 'deposits'}
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Total Money Received */}
            <div className="rms-card-hover bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[#D5F267] flex items-center justify-center text-[#17231E]">
                    <Wallet className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Total Money Received
                    </span>
                    <span className="text-[10px] text-[#6E7A75]">
                      All incoming payments
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={totalMoneyReceivedVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EEF4F1] text-[#145338] text-[10.5px] font-bold">
                    Rent + Deposits + Other
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">gross cash inflow</p>
                </div>
              </div>
            </div>

            {/* 6. Outstanding Rent */}
            <div className="rms-card-hover bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[#FDE6E6] flex items-center justify-center text-[#B91C1C]">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-[12px] font-bold text-[#17231E] block leading-tight">
                      Outstanding Rent
                    </span>
                    <span className="text-[10px] text-[#6E7A75]">
                      Pending & overdue rent only
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-end justify-between">
                <p className="text-[21px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  <AnimatedCounter value={outstandingRentVal} prefix="KSh " />
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FDE6E6] text-[#B91C1C] text-[10.5px] font-bold tabular-nums">
                    {analytics.pendingRentCount} Unpaid
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">excludes deposits</p>
                </div>
              </div>
            </div>
          </div>

          {/* Earnings Positive/Negative Bar Chart Card */}
          <div className="rms-card-hover bg-white rounded-2xl p-5 flex-1 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#17231E]">Earnings</h2>
                <div className="flex items-center gap-4 mt-1 text-[11px] text-[#7A8681]">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: theme.secondary }}
                    />
                    Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: theme.primary }}
                    />
                    Expense
                  </span>
                </div>
              </div>

              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold">
                <Calendar className="w-3.5 h-3.5" />
                <span>{currentYear} Ledger</span>
              </button>
            </div>

            <div className="relative h-[250px] w-full">
              {(totalIncomeVal > 0 || analytics.totalExpenses > 0) && (
                <div className="absolute left-[46%] top-3 z-10 pointer-events-none hidden sm:block">
                  <div
                    className="px-3 py-1.5 rounded-xl shadow-xs text-[10.5px]"
                    style={{
                      backgroundColor: theme.calloutBg,
                      border: `1px solid ${theme.calloutBorder}`,
                      color: theme.tooltipText,
                    }}
                  >
                    <p className="font-semibold" style={{ color: theme.calloutLabel }}>
                      YTD Totals
                    </p>
                    <p className="font-bold tabular-nums">
                      Income: <AnimatedCounter value={totalIncomeVal} prefix="KSh " />
                    </p>
                    <p className="font-bold tabular-nums">
                      Expense: <AnimatedCounter value={analytics.totalExpenses} prefix="KSh " />
                    </p>
                  </div>
                </div>
              )}

              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.earningsYearly}
                  stackOffset="sign"
                  margin={{ top: 16, right: 8, left: -10, bottom: 0 }}
                  barSize={22}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme.axisTick, fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme.axisTick, fontSize: 10.5 }}
                    tickFormatter={(val) =>
                      val === 0 ? '0' : `${val / 1000}K`
                    }
                  />
                  <ReferenceLine y={0} stroke={theme.referenceLine} />
                  <Tooltip
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={180}
                    animationEasing="ease-out"
                    cursor={{ fill: theme.cursorFill }}
                    contentStyle={{
                      backgroundColor: theme.tooltipAccentBg,
                      border: theme.tooltipAccentBorder,
                      borderRadius: '10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: theme.tooltipText,
                      boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.45)' : undefined,
                    }}
                    itemStyle={{ color: theme.tooltipAccentValue }}
                    labelStyle={{ color: theme.tooltipMuted }}
                    formatter={(val: any, name: any) => [
                      `KSh ${Math.abs(Number(val || 0)).toLocaleString()}`,
                      name === 'income' ? 'Income' : 'Expense',
                    ]}
                  />
                  <Bar
                    dataKey="income"
                    stackId="stack"
                    fill={theme.secondary}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={60}
                    animationDuration={820}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="expense"
                    stackId="stack"
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
        </div>

        {/* Right 4 Columns: Income / Expense Donut & Breakdown List */}
        <div className="rms-card-hover xl:col-span-4 bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            {/* Segmented Tab Switcher matching reference */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#F4F8F6] mb-4">
              <button
                onClick={() => setBreakdownTab('Income')}
                className={`py-2 rounded-lg text-[12.5px] font-bold transition-all cursor-pointer ${
                  breakdownTab === 'Income'
                    ? 'bg-[#D5F267] text-[#17231E]'
                    : 'text-[#6E7A75] hover:text-[#17231E]'
                }`}
              >
                Income
              </button>
              <button
                onClick={() => setBreakdownTab('Expense')}
                className={`py-2 rounded-lg text-[12.5px] font-bold transition-all cursor-pointer ${
                  breakdownTab === 'Expense'
                    ? 'bg-[#D5F267] text-[#17231E]'
                    : 'text-[#6E7A75] hover:text-[#17231E]'
                }`}
              >
                Expense
              </button>
            </div>

            {/* Donut Chart with Center Total */}
            <div className="relative h-[195px] w-full flex items-center justify-center">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[17px] font-extrabold text-[#17231E] tabular-nums">
                  <AnimatedCounter
                    key={breakdownTab}
                    value={
                      breakdownTab === 'Expense'
                        ? analytics.totalExpenses
                        : totalIncomeVal
                    }
                    prefix="KSh "
                  />
                </p>
                <p className="text-[11px] text-[#7A8681]">
                  Total {breakdownTab}
                </p>
              </div>

              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={`donut-${breakdownTab}`}>
                  <Pie
                    data={
                      activeDonutData.some((d) => d.value > 0)
                        ? activeDonutData.map((entry, idx) => ({
                            ...entry,
                            color: theme.donutPalette[idx % theme.donutPalette.length],
                          }))
                        : [{ name: 'No Records', value: 1, color: theme.emptyRing }]
                    }
                    cx="50%"
                    cy="50%"
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={80}
                    animationDuration={880}
                    animationEasing="ease-out"
                  >
                    {(activeDonutData.some((d) => d.value > 0)
                      ? activeDonutData.map((entry, idx) => ({
                          ...entry,
                          color: theme.donutPalette[idx % theme.donutPalette.length],
                        }))
                      : [{ name: 'No Records', value: 1, color: theme.emptyRing }]
                    ).map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category List */}
          <div className="space-y-2.5 mt-3">
            {activeDonutData.map((cat, idx) => (
              <div
                key={cat.name}
                className="flex items-center justify-between text-[12px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-5 h-2.5 rounded-sm shrink-0"
                    style={{
                      backgroundColor:
                        theme.donutPalette[idx % theme.donutPalette.length],
                    }}
                  />
                  <span className="text-[#17231E] font-medium truncate">
                    {cat.name}{' '}
                    <span className="text-[#88948F] font-normal">({cat.percent})</span>
                  </span>
                </div>
                <span className="font-bold text-[#17231E] tabular-nums shrink-0">
                  <AnimatedCounter
                    key={`${breakdownTab}-${cat.name}`}
                    value={cat.value}
                    prefix="KSh "
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PROPERTY-LEVEL FINANCIAL STATEMENTS (REVENUE VS DEPOSIT LIABILITY ACCOUNTING) */}
      <div className="rms-card-hover bg-white rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[16px] font-bold text-[#17231E] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#145338]" />
              Property-Level Financial Statements
            </h2>
            <p className="text-[11.5px] text-[#6E7A75] mt-0.5">
              Earned revenue (Rent Collected + Other Income) is strictly separated from tenant Security Deposit liabilities. Refunded deposits reduce liability, not revenue.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#EEF4F1] text-[#145338] text-[11px] font-bold">
            Accrual & Escrow Compliant
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-semibold">
                <th className="py-2.5 px-3 rounded-l-xl">Property</th>
                <th className="py-2.5 px-3 text-right">Rent Collected</th>
                <th className="py-2.5 px-3 text-right">Other Income</th>
                <th className="py-2.5 px-3 text-right">Total Revenue</th>
                <th className="py-2.5 px-3 text-right">Deposits Held (Liability)</th>
                <th className="py-2.5 px-3 text-right">Deposits Refunded</th>
                <th className="py-2.5 px-3 text-right">Total Money Received</th>
                <th className="py-2.5 px-3 text-right">Outstanding Rent</th>
                <th className="py-2.5 px-3 text-right">Expenses</th>
                <th className="py-2.5 px-3 text-right rounded-r-xl">Net NOI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
              {propertyFinancials.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-[#7A8681]">
                    No property financial records available yet.
                  </td>
                </tr>
              ) : (
                propertyFinancials.map((pf) => (
                  <tr key={pf.propertyId} className="hover:bg-[#F8FBF9] transition-colors">
                    <td className="py-3 px-3 font-bold text-[#17231E]">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-[#EAF4EE] text-[#145338] text-[10.5px] font-mono-num font-bold">
                          {pf.codePrefix}
                        </span>
                        <span>{pf.propertyName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-[#17231E] tabular-nums">
                      KSh {pf.rentCollected.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-[#354B14] tabular-nums">
                      KSh {pf.otherIncome.toLocaleString()}
                      {pf.depositDeductions > 0 && (
                        <span className="block text-[10px] text-[#6E7A75]">
                          (Incl. KSh {pf.depositDeductions.toLocaleString()} deduction)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-[#145338] tabular-nums bg-[#F4FAF7]">
                      KSh {pf.totalRevenue.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#0369A1] tabular-nums">
                      KSh {pf.depositsHeld.toLocaleString()}
                      <span className="block text-[10px] font-normal text-[#6E7A75]">
                        {pf.depositsHeldCount} active
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-[#6E7A75] tabular-nums">
                      KSh {pf.depositsRefunded.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#17231E] tabular-nums">
                      KSh {pf.totalMoneyReceived.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-[#B91C1C] tabular-nums">
                      KSh {pf.outstandingRent.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-[#46544E] tabular-nums">
                      KSh {pf.expenses.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-[#17231E] tabular-nums">
                      KSh {pf.netOperatingIncome.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {propertyFinancials.length > 0 && (
              <tfoot>
                <tr className="bg-[#EEF4F1] font-extrabold text-[#17231E] text-[12px]">
                  <td className="py-3 px-3 rounded-l-xl">Portfolio Total</td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    KSh {rentCollectedVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    KSh {otherIncomeVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-[#145338] tabular-nums">
                    KSh {totalRevenueVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-[#0369A1] tabular-nums">
                    KSh {depositsHeldVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-[#6E7A75] tabular-nums">
                    KSh {depositsRefundedVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    KSh {totalMoneyReceivedVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-[#B91C1C] tabular-nums">
                    KSh {outstandingRentVal.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    KSh {Number(analytics.totalExpenses || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right rounded-r-xl tabular-nums">
                    KSh {Number(analytics.netBalance || 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* BOTTOM SECTION: TRANSACTIONS TABLE */}
      <div className="rms-card-hover bg-white rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
          <h2 className="text-[16px] font-bold text-[#17231E]">Transactions</h2>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search expense, category, property..."
                className="pl-8 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none w-56"
              />
              {search && (
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
              <Filter className="w-3.5 h-3.5 text-[#6E7A75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none pl-8 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] cursor-pointer"
              >
                <option value="All">All Category</option>
                <option value="Supplies">Supplies</option>
                <option value="Utilities">Utilities</option>
                <option value="Marketing and Listing">Marketing and Listing</option>
                <option value="Maintenance and Repairs">Maintenance and Repairs</option>
                <option value="Property Management">Property Management</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#6E7A75] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] cursor-pointer"
              >
                <option value="All">All Status</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#6E7A75] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#7A8681]">
            No expense transactions found in the database. Click "+ Add Expense" to record a property expense.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-semibold">
                  <th className="py-2.5 px-3 rounded-l-xl">
                    <span className="inline-flex items-center gap-1">
                      Expense <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Category <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Property <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Quantity <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Amount <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Date <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1">
                      Status <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3 rounded-r-xl">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
                {filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#F8FBF9] transition-colors">
                    <td className="py-3.5 px-3 font-semibold text-[#17231E]">
                      {tx.expense}
                    </td>
                    <td className="py-3.5 px-3 text-[#46544E]">{tx.category}</td>
                    <td className="py-3.5 px-3 text-[#46544E]">{tx.property}</td>
                    <td className="py-3.5 px-3 text-[#46544E] tabular-nums">{tx.quantity}</td>
                    <td className="py-3.5 px-3 font-bold text-[#17231E] tabular-nums">
                      KSh {tx.amount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 text-[#46544E] tabular-nums">{tx.date}</td>
                    <td className="py-3.5 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[11px] font-bold">
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewTx(tx)}
                          className="w-7 h-7 rounded-lg bg-[#F4F8F6] hover:bg-[#E4ECE8] text-[#5A6762] flex items-center justify-center cursor-pointer"
                          title="View Expense Voucher"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="w-7 h-7 rounded-lg bg-[#F4F8F6] hover:bg-[#FDE6E6] text-[#5A6762] hover:text-[#B91C1C] flex items-center justify-center cursor-pointer"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(tx)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          {downloadedId === tx.id ? (
                            <>
                              <Check className="w-3 h-3" />
                              Saved
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              Download
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expense Voucher Preview Modal */}
      {previewTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#17231E]">
                Expense Voucher Details
              </h3>
              <button
                onClick={() => setPreviewTx(null)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-[#F4F8F6] space-y-2.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#6E7A75]">Description</span>
                <span className="font-bold text-[#17231E]">{previewTx.expense}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E7A75]">Category</span>
                <span className="font-semibold text-[#17231E]">{previewTx.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E7A75]">Property</span>
                <span className="font-semibold text-[#17231E]">{previewTx.property}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E7A75]">Quantity / Units</span>
                <span className="font-semibold text-[#17231E] tabular-nums">
                  {previewTx.quantity}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E7A75]">Date Recorded</span>
                <span className="font-semibold text-[#17231E] tabular-nums">
                  {previewTx.date}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E2ECE7] flex justify-between text-[14px] font-extrabold text-[#17231E]">
                <span>Total Amount</span>
                <span className="tabular-nums">KSh {previewTx.amount.toLocaleString()}</span>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setPreviewTx(null)}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateExpense}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#17231E]">
                Record Property Expense
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[12px]">
              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Expense Description
                </label>
                <input
                  type="text"
                  required
                  value={newExpenseName}
                  onChange={(e) => setNewExpenseName(e.target.value)}
                  placeholder="e.g., Elevator Annual Safety Certification"
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  >
                    <option value="Maintenance and Repairs">Maintenance and Repairs</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Property Management">Property Management</option>
                    <option value="Marketing and Listing">Marketing and Listing</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Property
                  </label>
                  <input
                    type="text"
                    list="expense-properties-list"
                    required
                    value={newProperty}
                    onChange={(e) => setNewProperty(e.target.value)}
                    placeholder="Select or type property"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                  <datalist id="expense-properties-list">
                    <option value="All Properties" />
                    {properties.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Amount (KSh)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755]"
              >
                {saving ? 'Recording...' : 'Save Expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
