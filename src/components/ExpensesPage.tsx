import React, { useState, useEffect } from 'react';
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

interface ExpensesPageProps {
  transactions: ExpenseTransaction[];
  properties: PropertyRecord[];
  analytics: DashboardAnalytics;
  onAddTransaction: (tx: Partial<ExpenseTransaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  globalSearch: string;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  transactions,
  properties,
  analytics,
  onAddTransaction,
  onDeleteTransaction,
  globalSearch,
}) => {
  const [breakdownTab, setBreakdownTab] = useState<'Income' | 'Expense'>('Expense');
  const [search, setSearch] = useState('');
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
      t.property.toLowerCase().includes(query);
    return matchesCat && matchesStatus && matchesQuery;
  });

  const activeDonutData =
    breakdownTab === 'Expense'
      ? analytics.expenseBreakdown
      : analytics.incomeBreakdown;

  const totalIncomeVal = analytics.totalIncome ?? (analytics.netBalance + analytics.totalExpenses);

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
          {/* 3 Summary Stat Cards computed from live database records */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Balance */}
            <div className="bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#145338]">
                    <CircleDollarSign className="w-4 h-4" />
                  </span>
                  <span className="text-[12px] font-medium text-[#6E7A75]">
                    Total Balance
                  </span>
                </div>
                <button className="text-[#88948F] hover:text-[#17231E]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <p className="text-[22px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  KSh {analytics.netBalance.toLocaleString()}
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E4F69B] text-[#283B0B] text-[10.5px] font-bold tabular-nums">
                    <TrendingUp className="w-3 h-3" />
                    Net NOI
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">live DB balance</p>
                </div>
              </div>
            </div>

            {/* Total Income */}
            <div className="bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#145338]">
                    <CircleDollarSign className="w-4 h-4" />
                  </span>
                  <span className="text-[12px] font-medium text-[#6E7A75]">
                    Total Income
                  </span>
                </div>
                <button className="text-[#88948F] hover:text-[#17231E]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <p className="text-[22px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  KSh {totalIncomeVal.toLocaleString()}
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold tabular-nums">
                    {analytics.rentCollectedCount} Paid
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">verified rent</p>
                </div>
              </div>
            </div>

            {/* Total Expenses */}
            <div className="bg-white rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#D8F3E5] flex items-center justify-center text-[#145338]">
                    <CircleDollarSign className="w-4 h-4" />
                  </span>
                  <span className="text-[12px] font-medium text-[#6E7A75]">
                    Total Expenses
                  </span>
                </div>
                <button className="text-[#88948F] hover:text-[#17231E]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <p className="text-[22px] font-extrabold text-[#17231E] tracking-tight tabular-nums">
                  KSh {analytics.totalExpenses.toLocaleString()}
                </p>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E4F69B] text-[#283B0B] text-[10.5px] font-bold tabular-nums">
                    {transactions.length} Vouchers
                  </span>
                  <p className="text-[10px] text-[#88948F] mt-0.5">in database</p>
                </div>
              </div>
            </div>
          </div>

          {/* Earnings Positive/Negative Bar Chart Card */}
          <div className="bg-white rounded-2xl p-5 flex-1 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#17231E]">Earnings</h2>
                <div className="flex items-center gap-4 mt-1 text-[11px] text-[#7A8681]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#BCEAD2]" />
                    Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#DBF573]" />
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
                  <div className="px-3 py-1.5 rounded-xl bg-[#E4F69B] text-[#17231E] shadow-xs border border-[#CEE876] text-[10.5px]">
                    <p className="text-[#4F613F] font-semibold">YTD Totals</p>
                    <p className="font-bold tabular-nums">
                      Income: KSh {totalIncomeVal.toLocaleString()}
                    </p>
                    <p className="font-bold tabular-nums">
                      Expense: KSh {analytics.totalExpenses.toLocaleString()}
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF3F0" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#88948F', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#88948F', fontSize: 10.5 }}
                    tickFormatter={(val) =>
                      val === 0 ? '0' : `${val / 1000}K`
                    }
                  />
                  <ReferenceLine y={0} stroke="#E4ECE8" />
                  <Tooltip
                    cursor={{ fill: '#F4F8F6' }}
                    contentStyle={{
                      backgroundColor: '#E4F69B',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}
                    formatter={(val: any, name: any) => [
                      `KSh ${Math.abs(Number(val || 0)).toLocaleString()}`,
                      name === 'income' ? 'Income' : 'Expense',
                    ]}
                  />
                  <Bar
                    dataKey="income"
                    stackId="stack"
                    fill="#BCEAD2"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    stackId="stack"
                    fill="#DBF573"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Income / Expense Donut & Breakdown List */}
        <div className="xl:col-span-4 bg-white rounded-2xl p-5 flex flex-col justify-between">
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
                  {breakdownTab === 'Expense'
                    ? `KSh ${analytics.totalExpenses.toLocaleString()}`
                    : `KSh ${totalIncomeVal.toLocaleString()}`}
                </p>
                <p className="text-[11px] text-[#7A8681]">
                  Total {breakdownTab}
                </p>
              </div>

              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      activeDonutData.some((d) => d.value > 0)
                        ? activeDonutData
                        : [{ name: 'No Records', value: 1, color: '#EEF3F0' }]
                    }
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {(activeDonutData.some((d) => d.value > 0)
                      ? activeDonutData
                      : [{ name: 'No Records', value: 1, color: '#EEF3F0' }]
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
            {activeDonutData.map((cat) => (
              <div
                key={cat.name}
                className="flex items-center justify-between text-[12px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-[#17231E] font-medium truncate">
                    {cat.name}{' '}
                    <span className="text-[#88948F] font-normal">({cat.percent})</span>
                  </span>
                </div>
                <span className="font-bold text-[#17231E] tabular-nums shrink-0">
                  KSh {cat.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
          <h2 className="text-[16px] font-bold text-[#17231E]">Transactions</h2>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expense"
                className="pl-8 pr-3 py-2 rounded-xl bg-[#F4F8F6] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none w-52"
              />
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
