import React, { useState } from 'react';
import {
  MapPin,
  Download,
  Check,
  Printer,
  Plus,
  X,
  Trash2,
  Building2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  RentPaymentRecord,
  NavPageId,
  PropertyRecord,
  ExpenseTransaction,
  MaintenanceItem,
  TenantProfile,
} from '../data/rentalData';
import { UnitIllustration } from './UnitIllustration';

interface PropertiesViewProps {
  properties: PropertyRecord[];
  onAddProperty: (data: Partial<PropertyRecord>) => Promise<void>;
  onUpdateProperty?: (id: string, data: Partial<PropertyRecord>) => Promise<void>;
  onDeleteProperty: (id: string) => Promise<void>;
  onNavigate: (page: NavPageId) => void;
}

export const PropertiesPage: React.FC<PropertiesViewProps> = ({
  properties,
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onNavigate,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [codePrefix, setCodePrefix] = useState('A');
  const [address, setAddress] = useState('');
  const [totalUnits, setTotalUnits] = useState(24);
  const [occupiedUnits, setOccupiedUnits] = useState(0);
  const [manager, setManager] = useState('Property Manager');

  const totalDoors = properties.reduce((s, p) => s + Number(p.totalUnits), 0);
  const totalOccupied = properties.reduce((s, p) => s + Number(p.occupiedUnits), 0);
  const totalRentRoll = properties.reduce((s, p) => s + Number(p.monthlyRevenue), 0);
  const overallOccPct =
    totalDoors > 0 ? ((totalOccupied / totalDoors) * 100).toFixed(1) : '0.0';

  const openAddModal = () => {
    setEditingProperty(null);
    setFormError(null);
    setName('');
    const used = new Set(properties.map((p) => p.codePrefix.toUpperCase()));
    const nextPrefix =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) || 'A';
    setCodePrefix(nextPrefix);
    setAddress('');
    setTotalUnits(24);
    setOccupiedUnits(0);
    setManager('Property Manager');
    setModalOpen(true);
  };

  const openEditModal = (prop: PropertyRecord) => {
    setEditingProperty(prop);
    setFormError(null);
    setName(prop.name);
    setCodePrefix(prop.codePrefix);
    setAddress(prop.address);
    setTotalUnits(prop.totalUnits);
    setOccupiedUnits(prop.occupiedUnits);
    setManager(prop.manager);
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingProperty && onUpdateProperty) {
        await onUpdateProperty(editingProperty.id, {
          name: name.trim(),
          codePrefix: codePrefix.toUpperCase(),
          address: address.trim(),
          totalUnits: Number(totalUnits),
          occupiedUnits: Number(occupiedUnits),
          manager: manager.trim() || 'Property Manager',
        });
      } else {
        await onAddProperty({
          name: name.trim(),
          codePrefix: codePrefix.toUpperCase(),
          address: address.trim(),
          totalUnits: Number(totalUnits),
          occupiedUnits: Number(occupiedUnits),
          monthlyRevenue: Number(occupiedUnits) * 35000,
          manager: manager.trim() || 'Property Manager',
        });
      }
      setName('');
      setAddress('');
      setEditingProperty(null);
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save property to Supabase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Mint & White Stat Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#D8F3E5] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-medium text-[#4A6358]">
              Managed Communities
            </p>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D5F267] text-[#17231E] text-[10.5px] font-bold cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Property
            </button>
          </div>
          <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tabular-nums">
            {properties.length}
          </p>
          <span className="inline-block mt-3 px-2 py-0.5 rounded-md bg-white text-[#145338] text-[10.5px] font-bold">
            Active Database Portfolio
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[11.5px] font-medium text-[#76827D]">
            Total Portfolio Units
          </p>
          <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tabular-nums">
            {totalDoors.toLocaleString()}
          </p>
          <span className="inline-block mt-3 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold tabular-nums">
            {overallOccPct}% Occupancy Rate
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[11.5px] font-medium text-[#76827D]">
            Occupied Units
          </p>
          <p className="text-[24px] font-extrabold text-[#17231E] mt-1 tabular-nums">
            {totalOccupied.toLocaleString()}
          </p>
          <span className="inline-block mt-3 px-2 py-0.5 rounded-md bg-[#D5F267] text-[#17231E] text-[10.5px] font-bold font-mono-num">
            Auto Ref A-001 Trigger
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-[11.5px] font-medium text-[#76827D]">
            Gross Monthly Rent Roll
          </p>
          <p className="text-[22px] font-extrabold text-[#17231E] mt-1 tabular-nums">
            KSh {totalRentRoll.toLocaleString()}
          </p>
          <span className="inline-block mt-3 px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold">
            Calculated from DB
          </span>
        </div>
      </div>

      {/* Property Cards Grid */}
      {properties.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#D8F3E5] text-[#145338] flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-[16px] font-bold text-[#17231E]">
            No Rental Properties in Database Yet
          </h3>
          <p className="text-[12.5px] text-[#7A8681] mt-1 max-w-md mx-auto">
            Add your first residential property to begin assigning units, generating unique tenant references (A-001), and tracking rent payments.
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#D5F267] text-[#17231E] text-[12.5px] font-bold hover:bg-[#c8e755] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add First Property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop) => {
            const occPct =
              prop.totalUnits > 0
                ? Math.round((prop.occupiedUnits / prop.totalUnits) * 100)
                : 0;
            return (
              <div
                key={prop.id}
                className="bg-white rounded-2xl p-5 flex flex-col sm:flex-row gap-4 justify-between"
              >
                <div className="w-full sm:w-44 h-40 rounded-xl overflow-hidden shrink-0 bg-[#E6ECE9]">
                  <UnitIllustration variant={prop.variant} className="w-full h-full" />
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-[16px] font-bold text-[#17231E]">
                          {prop.name}
                        </h3>
                        <p className="text-[11.5px] text-[#6E7A75] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {prop.address}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#D5F267] text-[#17231E] text-[11px] font-bold tabular-nums">
                          {occPct}% Occupied
                        </span>
                        <button
                          onClick={() => openEditModal(prop)}
                          className="px-2 py-0.5 rounded-lg bg-[#F4F8F6] hover:bg-[#D8F3E5] text-[#145338] text-[10.5px] font-bold cursor-pointer"
                          title="Edit Property"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteProperty(prop.id)}
                          className="p-1 rounded-lg bg-[#F4F8F6] hover:bg-[#FDE6E6] text-[#5A6762] hover:text-[#B91C1C] cursor-pointer"
                          title="Delete Property"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-[#EEF3F0] text-[11px]">
                      <div>
                        <p className="text-[#88948F]">Occupied</p>
                        <p className="font-bold text-[#17231E] tabular-nums">
                          {prop.occupiedUnits}/{prop.totalUnits} Units
                        </p>
                      </div>
                      <div>
                        <p className="text-[#88948F]">Rent Roll</p>
                        <p className="font-bold text-[#17231E] tabular-nums">
                          KSh {prop.monthlyRevenue.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#88948F]">Tenant Ref Range</p>
                        <p className="font-mono-num font-bold text-[#145338]">
                          {prop.refRange}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-2">
                    <span className="text-[11px] text-[#6E7A75]">
                      Lead Manager:{' '}
                      <strong className="text-[#17231E]">{prop.manager}</strong>
                    </span>
                    <button
                      onClick={() => onNavigate('units')}
                      className="px-3.5 py-1.5 rounded-xl bg-[#D8F3E5] hover:bg-[#c7ebd8] text-[#145338] text-[11.5px] font-bold transition-colors cursor-pointer"
                    >
                      Inspect Units
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Property Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#17231E]">
                {editingProperty ? 'Edit Rental Property' : 'Add New Rental Property'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingProperty(null);
                }}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-3 rounded-xl bg-[#FDE6E6] text-[#B91C1C] px-3 py-2 text-[11.5px] font-semibold">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-[12px]">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Property Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Oakwood Apartments"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Ref Prefix
                  </label>
                  <input
                    type="text"
                    maxLength={1}
                    required
                    value={codePrefix}
                    onChange={(e) => setCodePrefix(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] font-mono-num font-bold text-[#145338] uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="250 Harbor View Rd, Waterfront"
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Total Units
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Occupied Units
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={occupiedUnits}
                    onChange={(e) => setOccupiedUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Assigned Property Manager
                </label>
                <input
                  type="text"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingProperty(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755]"
              >
                {saving
                  ? 'Saving...'
                  : editingProperty
                  ? 'Save Changes'
                  : 'Create Property'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface InvoicesPageProps {
  payments: RentPaymentRecord[];
  onSelectTenantRef: (ref: string) => void;
}

export const InvoicesPage: React.FC<InvoicesPageProps> = ({
  payments,
  onSelectTenantRef,
}) => {
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  const handleDownloadInvoice = (inv: RentPaymentRecord, idx: number) => {
    setDownloadedId(inv.id);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(idx + 1).padStart(3, '0')}`;
    const text = [
      'RENTIFY OFFICIAL RENT INVOICE',
      '=============================',
      `Invoice Number: ${invoiceNumber}`,
      `Tenant Reference: ${inv.tenantRef}`,
      `Tenant Name: ${inv.tenantName}`,
      `Property & Unit: ${inv.property} • ${inv.unitNumber} (${inv.unitType})`,
      `Lease Term: ${inv.leaseTerm}`,
      `Billing Period: ${inv.dueDate}`,
      `Amount Due: KSh ${inv.amount.toLocaleString()}`,
      `Payment Status: ${inv.status}`,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}-${inv.tenantRef}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadedId(null), 1500);
  };

  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[16px] font-bold text-[#17231E]">
            Monthly Rent Invoices & Statements
          </h2>
          <p className="text-[11.5px] text-[#7A8681]">
            Automated invoices generated from live PostgreSQL rent ledger records
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Batch Statements
        </button>
      </div>

      {payments.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#7A8681]">
          No rent invoices in the database yet. Record a rent payment on the Rent Payments page to generate statements.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-semibold">
                <th className="py-2.5 px-3 rounded-l-xl">Invoice No.</th>
                <th className="py-2.5 px-3">Tenant Ref</th>
                <th className="py-2.5 px-3">Tenant Name</th>
                <th className="py-2.5 px-3">Property & Unit</th>
                <th className="py-2.5 px-3">Billing Period</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 rounded-r-xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
              {payments.map((inv, idx) => (
                <tr key={inv.id} className="hover:bg-[#F8FBF9]">
                  <td className="py-3 px-3 font-bold text-[#17231E] tabular-nums">
                    INV-{new Date().getFullYear()}-{String(idx + 1).padStart(3, '0')}
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => onSelectTenantRef(inv.tenantRef)}
                      className="font-mono-num font-bold text-[#145338] bg-[#EAF4EE] px-2 py-0.5 rounded-md text-[11px] cursor-pointer"
                    >
                      {inv.tenantRef}
                    </button>
                  </td>
                  <td className="py-3 px-3 font-semibold text-[#17231E]">
                    {inv.tenantName}
                  </td>
                  <td className="py-3 px-3 text-[#46544E]">
                    {inv.property} • {inv.unitNumber}
                  </td>
                  <td className="py-3 px-3 text-[#46544E] tabular-nums">{inv.dueDate}</td>
                  <td className="py-3 px-3 font-extrabold text-[#17231E] tabular-nums">
                    KSh {inv.amount.toLocaleString()}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                        inv.status === 'Paid'
                          ? 'bg-[#D8F3E5] text-[#145338]'
                          : 'bg-[#FEF6D2] text-[#8A6508]'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => handleDownloadInvoice(inv, idx)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold cursor-pointer"
                    >
                      {downloadedId === inv.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          Downloaded
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          Statement
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface ReportsPageProps {
  properties: PropertyRecord[];
  payments: RentPaymentRecord[];
  expenses: ExpenseTransaction[];
  maintenance: MaintenanceItem[];
  tenants: TenantProfile[];
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  properties,
  payments,
  expenses,
  maintenance,
  tenants,
}) => {
  const occupancyByProperty = properties.map((p) => {
    const occ = Math.round((p.occupiedUnits / Math.max(1, p.totalUnits)) * 100);
    return {
      name: p.name.split(' ')[0],
      occupied: occ,
      vacant: Math.max(0, 100 - occ),
    };
  });

  const paidTotal = payments
    .filter((p) => p.status === 'Paid')
    .reduce((s, p) => s + p.amount, 0);
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const depositTotal = tenants.reduce((s, t) => s + t.securityDeposit, 0);
  const resolvedCount = maintenance.filter(
    (m) => m.maintenanceStatus === 'Completed'
  ).length;

  const exportCsv = (filename: string, rows: string[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#17231E]">
                Portfolio Occupancy & Retention Report
              </h2>
              <p className="text-[11.5px] text-[#7A8681]">
                Live Occupancy % across {properties.length} database properties
              </p>
            </div>
            <span className="px-3 py-1 rounded-xl bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold">
              Live SQL
            </span>
          </div>

          {occupancyByProperty.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[12.5px] text-[#7A8681] bg-[#F8FAF9] rounded-xl">
              Add properties in the Properties tab to view occupancy distribution charts.
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={occupancyByProperty}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  barSize={28}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF3F0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#88948F', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#88948F', fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="occupied"
                    name="Occupied %"
                    stackId="a"
                    fill="#BCEAD2"
                    radius={[0, 0, 6, 6]}
                  />
                  <Bar
                    dataKey="vacant"
                    name="Vacant %"
                    stackId="a"
                    fill="#D5F267"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#17231E] mb-3">
              Executive Summary Exports
            </h2>
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-[#F4F8F6] flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-bold text-[#17231E]">
                    Monthly Rent Roll & Arrears Ledger
                  </p>
                  <p className="text-[10.5px] text-[#7A8681]">
                    {payments.length} database records • KSh {paidTotal.toLocaleString()} collected
                  </p>
                </div>
                <button
                  onClick={() =>
                    exportCsv('rent-roll-export.csv', [
                      ['Tenant Ref', 'Tenant Name', 'Property', 'Unit', 'Amount (KSh)', 'Status', 'Due Date'],
                      ...payments.map((p) => [
                        p.tenantRef,
                        p.tenantName,
                        p.property,
                        p.unitNumber,
                        `KSh ${p.amount}`,
                        p.status,
                        p.dueDate,
                      ]),
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Export CSV
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#F4F8F6] flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-bold text-[#17231E]">
                    Owner Net Operating Income (NOI) Ledger
                  </p>
                  <p className="text-[10.5px] text-[#7A8681]">
                    Income KSh {paidTotal.toLocaleString()} vs Expenses KSh {expTotal.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() =>
                    exportCsv('noi-expenses-export.csv', [
                      ['Expense', 'Category', 'Property', 'Quantity', 'Amount (KSh)', 'Date', 'Status'],
                      ...expenses.map((e) => [
                        e.expense,
                        e.category,
                        e.property,
                        String(e.quantity),
                        `KSh ${e.amount}`,
                        e.date,
                        e.status,
                      ]),
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Export CSV
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#F4F8F6] flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-bold text-[#17231E]">
                    Maintenance SLA & Work Orders Report
                  </p>
                  <p className="text-[10.5px] text-[#7A8681]">
                    {resolvedCount} of {maintenance.length} tickets resolved in database
                  </p>
                </div>
                <button
                  onClick={() =>
                    exportCsv('maintenance-tickets-export.csv', [
                      ['Unit', 'Property', 'Unit Type', 'Status', 'Priority', 'Technician', 'Issue'],
                      ...maintenance.map((m) => [
                        m.unitNumber,
                        m.property,
                        m.unitType,
                        m.maintenanceStatus,
                        m.priority,
                        m.assignedTo,
                        m.notes,
                      ]),
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Export CSV
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#F4F8F6] flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-bold text-[#17231E]">
                    Security Deposit Escrow Reconciliation
                  </p>
                  <p className="text-[10.5px] text-[#7A8681]">
                    {tenants.length} active tenants • KSh {depositTotal.toLocaleString()} held in escrow
                  </p>
                </div>
                <button
                  onClick={() =>
                    exportCsv('tenant-escrow-export.csv', [
                      ['Tenant Ref', 'Name', 'Email', 'Phone', 'Property', 'Unit', 'Monthly Rent (KSh)', 'Security Deposit (KSh)', 'Rent Balance (KSh)'],
                      ...tenants.map((t) => [
                        t.tenantRef,
                        t.name,
                        t.email,
                        t.phone,
                        t.property,
                        t.unitNumber,
                        `KSh ${t.monthlyRent}`,
                        `KSh ${t.securityDeposit}`,
                        `KSh ${t.rentBalance}`,
                      ]),
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
