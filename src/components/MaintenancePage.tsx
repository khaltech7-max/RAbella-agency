import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  Check,
  ArrowUpDown,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import {
  MaintenanceItem,
  PropertyRecord,
  TenantProfile,
} from '../data/rentalData';

interface MaintenancePageProps {
  items: MaintenanceItem[];
  properties: PropertyRecord[];
  tenants: TenantProfile[];
  onToggleSelect: (id: string, selected: boolean) => Promise<void>;
  onUpdateStatus: (
    id: string,
    status: MaintenanceItem['maintenanceStatus']
  ) => Promise<void>;
  onUpdatePriority: (
    id: string,
    priority: MaintenanceItem['priority']
  ) => Promise<void>;
  onAddMaintenance: (item: Partial<MaintenanceItem>) => Promise<void>;
  onDeleteMaintenance: (id: string) => Promise<void>;
  globalSearch: string;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  items,
  properties,
  tenants,
  onToggleSelect,
  onUpdateStatus,
  onUpdatePriority,
  onAddMaintenance,
  onDeleteMaintenance,
  globalSearch,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New maintenance request state
  const [unitNumber, setUnitNumber] = useState('Unit 101');
  const [property, setProperty] = useState('');
  const [unitType, setUnitType] = useState<
    'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single'
  >('Deluxe');
  const [tenantRef, setTenantRef] = useState('A-001');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');

  const query = (search || globalSearch).trim().toLowerCase();

  const filtered = items.filter((m) => {
    const matchesType = typeFilter === 'All' || m.unitType === typeFilter;
    const matchesStatus =
      statusFilter === 'All' || m.maintenanceStatus === statusFilter;
    const matchesPriority =
      priorityFilter === 'All' || m.priority === priorityFilter;
    const matchesQuery =
      !query ||
      m.unitNumber.toLowerCase().includes(query) ||
      m.property.toLowerCase().includes(query) ||
      m.assignedTo.toLowerCase().includes(query) ||
      m.notes.toLowerCase().includes(query) ||
      m.tenantRef.toLowerCase().includes(query);
    return matchesType && matchesStatus && matchesPriority && matchesQuery;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    setSaving(true);
    try {
      await onAddMaintenance({
        unitNumber: unitNumber.trim() || 'Unit 101',
        property: property.trim() || properties[0]?.name || 'Main Property',
        unitType,
        maintenanceStatus: 'In Progress',
        priority,
        assignedTo: assignedTo.trim() || 'Site Caretaker',
        notes: notes.trim(),
        tenantRef: tenantRef.trim().toUpperCase() || 'A-001',
        selected: true,
      });
      setNotes('');
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5">
      {/* Top Filter Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit, tech, ref (A-001)..."
              className="pl-8 pr-3 py-2 rounded-xl bg-[#F4F8F6] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267] w-56"
            />
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] cursor-pointer"
            >
              <option value="All">Unit Type</option>
              <option value="Standard">Standard</option>
              <option value="Deluxe">Deluxe</option>
              <option value="Suite">Suite</option>
              <option value="Family">Family</option>
              <option value="Single">Single</option>
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
              <option value="In Progress">In Progress</option>
              <option value="Needs Inspection">Needs Inspection</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#6E7A75] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] cursor-pointer"
            >
              <option value="All">All Priority</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#6E7A75] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={() => {
            setProperty(properties[0]?.name || '');
            if (tenants[0]?.tenantRef) setTenantRef(tenants[0].tenantRef);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold transition-colors cursor-pointer self-start lg:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Maintenance Request
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[13px] text-[#7A8681] mb-3">
            {items.length === 0
              ? 'No maintenance work orders logged in the database yet.'
              : 'No maintenance work orders match your current filter.'}
          </p>
          <button
            onClick={() => {
              setProperty(properties[0]?.name || '');
              if (tenants[0]?.tenantRef) setTenantRef(tenants[0].tenantRef);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Log First Maintenance Request
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-semibold">
                <th className="py-2.5 px-3 rounded-l-xl w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="rounded border-[#CBD8D1]"
                    onChange={() => {}}
                  />
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Unit Number <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Unit Type <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Maintenance Status <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Priority <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Technician <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    Tenant Ref <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-3 rounded-r-xl w-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
              {filtered.map((row) => {
                const statusColors =
                  row.maintenanceStatus === 'Completed'
                    ? 'bg-[#D8F3E5] text-[#145338]'
                    : row.maintenanceStatus === 'In Progress'
                    ? 'bg-[#E5F69C] text-[#354B14]'
                    : 'bg-[#FDE6E6] text-[#B91C1C]';

                const prioColors =
                  row.priority === 'Low'
                    ? 'bg-[#D8F3E5] text-[#145338]'
                    : row.priority === 'Medium'
                    ? 'bg-[#E5F69C] text-[#354B14]'
                    : 'bg-[#FDE6E6] text-[#B91C1C]';

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      row.selected ? 'bg-[#F7FBF8]' : 'hover:bg-[#F9FCFA]'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <button
                        onClick={() => onToggleSelect(row.id, !row.selected)}
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                          row.selected
                            ? 'bg-[#BCEAD2] border-[#6AB790] text-[#17231E]'
                            : 'bg-white border-[#CBD8D1]'
                        }`}
                      >
                        {row.selected && (
                          <Check className="w-3 h-3 stroke-[3]" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3 font-bold text-[#17231E]">
                      {row.unitNumber}
                    </td>
                    <td className="py-3 px-3 text-[#46544E]">{row.unitType}</td>
                    <td className="py-3 px-3">
                      <div className="relative inline-block">
                        <select
                          value={row.maintenanceStatus}
                          onChange={(e) =>
                            onUpdateStatus(
                              row.id,
                              e.target.value as MaintenanceItem['maintenanceStatus']
                            )
                          }
                          className={`appearance-none pl-2.5 pr-6 py-1 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none ${statusColors}`}
                        >
                          <option value="Completed">✓ Ready / Completed</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Needs Inspection">
                            Needs Inspection
                          </option>
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="relative inline-block">
                        <select
                          value={row.priority}
                          onChange={(e) =>
                            onUpdatePriority(
                              row.id,
                              e.target.value as MaintenanceItem['priority']
                            )
                          }
                          className={`appearance-none pl-2.5 pr-6 py-1 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none ${prioColors}`}
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-[#17231E]">
                      {row.assignedTo}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono-num font-bold text-[#145338] bg-[#EAF4EE] px-2 py-0.5 rounded-md text-[11px]">
                        {row.tenantRef}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#5A6762] max-w-xs truncate">
                      {row.notes}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => onDeleteMaintenance(row.id)}
                        className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#FDE6E6] text-[#5A6762] hover:text-[#B91C1C] transition-colors cursor-pointer"
                        title="Delete Work Order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#EEF3F0] flex items-center justify-between text-[11.5px] text-[#7A8681]">
        <span>
          Showing{' '}
          <strong className="text-[#17231E] tabular-nums">
            {filtered.length === 0 ? 0 : 1}–{filtered.length}
          </strong>{' '}
          of{' '}
          <strong className="text-[#17231E] tabular-nums">
            {items.length}
          </strong>{' '}
          work orders
        </span>
      </div>

      {/* Add Maintenance Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#17231E]">
                Log Maintenance Work Order
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[12px]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Property
                  </label>
                  <input
                    type="text"
                    list="maint-property-list"
                    value={property}
                    onChange={(e) => setProperty(e.target.value)}
                    placeholder="Property Name"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                  <datalist id="maint-property-list">
                    {properties.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Unit Number
                  </label>
                  <input
                    type="text"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Tenant Ref
                  </label>
                  <input
                    type="text"
                    list="maint-tenant-list"
                    value={tenantRef}
                    onChange={(e) => setTenantRef(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] font-mono-num font-bold text-[#145338]"
                  />
                  <datalist id="maint-tenant-list">
                    {tenants.map((t) => (
                      <option
                        key={t.id}
                        value={t.tenantRef}
                        label={`${t.name} (${t.unitNumber})`}
                      />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Unit Type
                  </label>
                  <select
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Suite">Suite</option>
                    <option value="Family">Family</option>
                    <option value="Single">Single</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Assigned Technician
                  </label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Technician or Caretaker"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Issue & Repair Notes
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the repair or inspection needed..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755]"
              >
                {saving ? 'Creating...' : 'Create Work Order'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
