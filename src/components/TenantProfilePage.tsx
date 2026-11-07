import React, { useState, useMemo } from 'react';
import {
  Search,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  ArrowUpDown,
  Maximize2,
  BedDouble,
  CreditCard,
  Check,
  Eye,
  SlidersHorizontal,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  TenantProfile,
  NavPageId,
  PropertyRecord,
  UnitTypeItem,
} from '../data/rentalData';
import { AvatarBadge, UnitIllustration } from './UnitIllustration';

interface TenantProfilePageProps {
  tenants: TenantProfile[];
  properties: PropertyRecord[];
  unitTypes: UnitTypeItem[];
  selectedTenantRef: string;
  onSelectTenantRef: (ref: string) => void;
  onAddTenant: (data: {
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
  }) => Promise<TenantProfile>;
  onUpdateTenant: (id: string, data: Partial<TenantProfile>) => Promise<void>;
  onDeleteTenant: (id: string) => Promise<void>;
  onRecordTenantPayment: (tenantRef: string) => Promise<void>;
  onUpdateProperty?: (id: string, data: Partial<PropertyRecord>) => Promise<void>;
  onNavigate: (page: NavPageId) => void;
}

export const TenantProfilePage: React.FC<TenantProfilePageProps> = ({
  tenants,
  properties,
  unitTypes,
  selectedTenantRef,
  onSelectTenantRef,
  onAddTenant,
  onUpdateTenant,
  onDeleteTenant,
  onRecordTenantPayment,
  onUpdateProperty,
  onNavigate,
}) => {
  // Global search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'cleared' | 'due' | 'overdue'
  >('all');

  // Expanded apartment sections state (default: all expanded)
  const [expandedApartments, setExpandedApartments] = useState<
    Record<string, boolean>
  >({});

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [targetPropertyForAdd, setTargetPropertyForAdd] = useState<
    PropertyRecord | null
  >(null);
  const [editTenantModalOpen, setEditTenantModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantProfile | null>(null);
  const [profileModalTenant, setProfileModalTenant] =
    useState<TenantProfile | null>(null);
  const [prefixModalProperty, setPrefixModalProperty] =
    useState<PropertyRecord | null>(null);
  const [newPrefixValue, setNewPrefixValue] = useState('');
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Tenant & Lease state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPropertyId, setEditPropertyId] = useState('');
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState<
    'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single'
  >('Deluxe');
  const [editRent, setEditRent] = useState(35000);
  const [editDeposit, setEditDeposit] = useState(35000);
  const [editDuration, setEditDuration] = useState('12 Months');
  const [editOccupants, setEditOccupants] = useState('2 Adults');
  const [customNote, setCustomNote] = useState('');

  // Add Tenant form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [newProperty, setNewProperty] = useState('');
  const [newUnitNumber, setNewUnitNumber] = useState('Unit 101');
  const [newUnitType, setNewUnitType] = useState<
    'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single'
  >('Deluxe');
  const [newRent, setNewRent] = useState(35000);
  const [newDuration, setNewDuration] = useState('12 Months');
  const [newDeposit, setNewDeposit] = useState(35000);
  const [newOccupants, setNewOccupants] = useState('2 Adults');
  const [newInitialStatus, setNewInitialStatus] = useState<'Paid' | 'Pending'>(
    'Pending'
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Toggle expansion of an apartment section
  const toggleApartmentExpand = (apartmentKey: string) => {
    setExpandedApartments((prev) => ({
      ...prev,
      [apartmentKey]: prev[apartmentKey] === undefined ? false : !prev[apartmentKey],
    }));
  };

  const isApartmentExpanded = (apartmentKey: string) => {
    return expandedApartments[apartmentKey] !== false; // Default expanded
  };

  const expandAllApartments = () => {
    const allExpanded: Record<string, boolean> = {};
    properties.forEach((p) => {
      allExpanded[p.id] = true;
    });
    allExpanded['unassigned'] = true;
    setExpandedApartments(allExpanded);
  };

  const collapseAllApartments = () => {
    const allCollapsed: Record<string, boolean> = {};
    properties.forEach((p) => {
      allCollapsed[p.id] = false;
    });
    allCollapsed['unassigned'] = false;
    setExpandedApartments(allCollapsed);
  };

  // Group tenants strictly by actual property-to-tenant relationship in Supabase
  const apartmentGroups = useMemo(() => {
    const groups: {
      property: PropertyRecord;
      prefix: string;
      tenants: TenantProfile[];
      clearedCount: number;
      dueCount: number;
      overdueCount: number;
      totalMonthlyRent: number;
    }[] = [];

    const assignedTenantIds = new Set<string>();

    properties.forEach((prop, idx) => {
      // Configured prefix (e.g. 'A', 'B', 'C')
      const prefix =
        prop.codePrefix && prop.codePrefix.trim()
          ? prop.codePrefix.trim().toUpperCase()
          : String.fromCharCode(65 + (idx % 26));

      // Match tenants based on property ID or exact property name
      const propTenants = tenants.filter((t) => {
        const matchesId = t.propertyId && t.propertyId === prop.id;
        const matchesName =
          t.property &&
          t.property.trim().toLowerCase() === prop.name.trim().toLowerCase();
        return matchesId || matchesName;
      });

      propTenants.forEach((t) => assignedTenantIds.add(t.id));

      const clearedCount = propTenants.filter(
        (t) => t.status === 'Paid' && (t.rentBalance ?? 0) <= 0
      ).length;
      const dueCount = propTenants.filter(
        (t) =>
          t.status === 'Pending' ||
          ((t.rentBalance ?? 0) > 0 && t.status !== 'Overdue')
      ).length;
      const overdueCount = propTenants.filter(
        (t) => t.status === 'Overdue' || ((t.rentBalance ?? 0) > 0 && t.status !== 'Paid')
      ).length;

      const totalMonthlyRent = propTenants.reduce(
        (acc, t) => acc + (t.monthlyRent || 0),
        0
      );

      groups.push({
        property: prop,
        prefix,
        tenants: propTenants,
        clearedCount,
        dueCount,
        overdueCount,
        totalMonthlyRent,
      });
    });

    // Handle any unassigned or historical orphan tenants
    const unassignedTenants = tenants.filter(
      (t) => !assignedTenantIds.has(t.id)
    );

    return { groups, unassignedTenants };
  }, [properties, tenants]);

  // Filter and search logic across apartment groups
  const filteredApartmentGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return apartmentGroups.groups.map((group) => {
      const filteredTenants = group.tenants.filter((tenant) => {
        // Status filter
        if (statusFilter === 'cleared') {
          if (tenant.status !== 'Paid' || (tenant.rentBalance ?? 0) > 0) {
            return false;
          }
        } else if (statusFilter === 'due') {
          const isDue =
            tenant.status === 'Pending' ||
            ((tenant.rentBalance ?? 0) > 0 && tenant.status !== 'Overdue');
          if (!isDue) return false;
        } else if (statusFilter === 'overdue') {
          const isOverdue =
            tenant.status === 'Overdue' ||
            ((tenant.rentBalance ?? 0) > 0 && tenant.status !== 'Paid');
          if (!isOverdue) return false;
        }

        // Search query
        if (!query) return true;

        const nameMatch = tenant.name.toLowerCase().includes(query);
        const refMatch = tenant.tenantRef.toLowerCase().includes(query);
        const unitMatch = tenant.unitNumber.toLowerCase().includes(query);
        const propMatch = tenant.property.toLowerCase().includes(query);
        const phoneMatch = (tenant.phone || '').toLowerCase().includes(query);
        const emailMatch = (tenant.email || '').toLowerCase().includes(query);

        return (
          nameMatch ||
          refMatch ||
          unitMatch ||
          propMatch ||
          phoneMatch ||
          emailMatch
        );
      });

      return {
        ...group,
        filteredTenants,
        hasMatches: filteredTenants.length > 0 || !query,
      };
    });
  }, [apartmentGroups, searchQuery, statusFilter]);

  // Overall database totals
  const totalTenantsCount = tenants.length;
  const clearedTotal = tenants.filter(
    (t) => t.status === 'Paid' && (t.rentBalance ?? 0) <= 0
  ).length;
  const dueTotal = tenants.filter(
    (t) =>
      t.status === 'Pending' ||
      ((t.rentBalance ?? 0) > 0 && t.status !== 'Overdue')
  ).length;
  const overdueTotal = tenants.filter(
    (t) => t.status === 'Overdue' || ((t.rentBalance ?? 0) > 0 && t.status !== 'Paid')
  ).length;

  // Open modal to add tenant specifically for an apartment
  const handleOpenAddTenantModal = (presetProp?: PropertyRecord) => {
    setFormError(null);
    const target = presetProp || properties[0];
    if (target) {
      setTargetPropertyForAdd(target);
      setSelectedPropertyId(target.id);
      setNewProperty(target.name);
    } else {
      setTargetPropertyForAdd(null);
      setSelectedPropertyId('');
      setNewProperty('');
    }
    setAddModalOpen(true);
  };

  // Submit Add Tenant
  const handleCreateTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenProp =
      selectedPropertyId && selectedPropertyId !== '__NEW__'
        ? properties.find((p) => p.id === selectedPropertyId)
        : targetPropertyForAdd || properties[0];

    const propName =
      chosenProp?.name || newProperty.trim() || properties[0]?.name || 'Main Property';
    if (!newName.trim() || !propName) return;

    setSaving(true);
    setFormError(null);
    try {
      const created = await onAddTenant({
        name: newName.trim(),
        phone: newPhone.trim() || 'On file',
        email:
          newEmail.trim() ||
          `${newName.toLowerCase().replace(/\s+/g, '.')}@tenant.io`,
        propertyId: chosenProp?.id,
        property: propName,
        unitNumber: newUnitNumber.trim() || 'Unit 101',
        unitType: newUnitType,
        monthlyRent: Number(newRent),
        securityDeposit: Number(newDeposit),
        occupants: newOccupants,
        leaseDuration: newDuration,
        initialPaymentStatus: newInitialStatus,
      });

      if (created?.tenantRef) {
        onSelectTenantRef(created.tenantRef);
      }
      setAddModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      showToast(
        `Tenant ${created.name} registered and assigned to ${propName} (Ref: ${created.tenantRef})`
      );
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save tenant to Supabase.');
    } finally {
      setSaving(false);
    }
  };

  // Open edit modal for tenant
  const handleOpenEditModal = (t: TenantProfile) => {
    setFormError(null);
    setEditingTenant(t);
    setEditName(t.name);
    setEditPhone(t.phone);
    setEditEmail(t.email);
    const matchedProp =
      properties.find((p) => p.id === t.propertyId) ||
      properties.find((p) => p.name.toLowerCase() === t.property.toLowerCase());
    setEditPropertyId(matchedProp?.id || properties[0]?.id || '');
    setEditUnitNumber(t.unitNumber);
    setEditUnitType(t.unitType);
    setEditRent(t.monthlyRent);
    setEditDeposit(t.securityDeposit);
    setEditDuration(t.leaseDuration);
    setEditOccupants(t.occupants);
    setCustomNote(t.leaseNotes);
    setEditTenantModalOpen(true);
  };

  // Submit Edit Tenant
  const handleSaveTenantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    setSaving(true);
    setFormError(null);
    try {
      const chosenProp = properties.find((p) => p.id === editPropertyId);
      await onUpdateTenant(editingTenant.id, {
        name: editName.trim() || editingTenant.name,
        phone: editPhone.trim() || editingTenant.phone,
        email: editEmail.trim() || editingTenant.email,
        propertyId: chosenProp?.id || editingTenant.propertyId,
        property: chosenProp?.name || editingTenant.property,
        unitNumber: editUnitNumber.trim() || editingTenant.unitNumber,
        unitType: editUnitType,
        monthlyRent: Number(editRent),
        securityDeposit: Number(editDeposit),
        leaseDuration: editDuration,
        occupants: editOccupants,
        leaseNotes: customNote,
      });
      setEditTenantModalOpen(false);
      showToast(`Updated profile for ${editName.trim() || editingTenant.name}`);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update tenant in Supabase.');
    } finally {
      setSaving(false);
    }
  };

  // Open Configure Prefix modal for property
  const handleOpenPrefixModal = (prop: PropertyRecord, curPrefix: string) => {
    setPrefixModalProperty(prop);
    setNewPrefixValue(curPrefix);
    setFormError(null);
  };

  // Save new property prefix in Supabase
  const handleSavePrefix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefixModalProperty || !onUpdateProperty) return;
    const cleanPrefix = newPrefixValue.trim().toUpperCase();
    if (!cleanPrefix) {
      setFormError('Please enter a valid unique prefix (e.g. A, B, C, KMB).');
      return;
    }

    setSavingPrefix(true);
    setFormError(null);
    try {
      await onUpdateProperty(prefixModalProperty.id, {
        codePrefix: cleanPrefix,
      });
      showToast(
        `Prefix for ${prefixModalProperty.name} updated to 'Prefix ${cleanPrefix}'`
      );
      setPrefixModalProperty(null);
    } catch (err: any) {
      setFormError(
        err?.message || 'Failed to update property prefix in Supabase.'
      );
    } finally {
      setSavingPrefix(false);
    }
  };

  return (
    <div className="space-y-6 bg-[#F5F7F6] text-[#172B25] min-h-screen">
      {/* 1. TOP HEADER & METRIC STRIP */}
      <header className="bg-white rounded-2xl p-5 border border-[#E7ECE9] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#BFEF43]/30 border border-[#BFEF43] flex items-center justify-center text-[#172B25] shrink-0">
                <Users className="w-5 h-5 text-[#172B25]" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[#172B25]">
                  Tenants Directory
                </h1>
                <p className="text-xs text-[#7B8983] mt-0.5">
                  Organised automatically by assigned apartment &amp; configured unique property prefix
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={expandAllApartments}
              className="px-3 py-1.5 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-xs font-semibold text-[#172B25] border border-[#E7ECE9] transition-colors cursor-pointer"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllApartments}
              className="px-3 py-1.5 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-xs font-semibold text-[#172B25] border border-[#E7ECE9] transition-colors cursor-pointer"
            >
              Collapse All
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddTenantModal()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#BFEF43] hover:bg-[#b0e434] text-[#172B25] text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Tenant</span>
            </button>
          </div>
        </div>

        {/* Compact KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#E7ECE9]">
          <div className="p-3 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9]">
            <p className="text-[11px] font-medium text-[#7B8983]">Total Registered</p>
            <p className="text-xl font-bold text-[#172B25] mt-0.5 tabular-nums">
              {totalTenantsCount} Tenants
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9]">
            <p className="text-[11px] font-medium text-[#7B8983]">Apartment Groups</p>
            <p className="text-xl font-bold text-[#172B25] mt-0.5 tabular-nums">
              {properties.length} Properties
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#FEF3C7]/60 border border-[#FDE68A]">
            <p className="text-[11px] font-medium text-[#92400E]">Rent Due</p>
            <p className="text-xl font-bold text-[#92400E] mt-0.5 tabular-nums">
              {dueTotal} Tenants
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#FDE6E6]/60 border border-[#F8CACA]">
            <p className="text-[11px] font-medium text-[#B91C1C]">Overdue Arrears</p>
            <p className="text-xl font-bold text-[#B91C1C] mt-0.5 tabular-nums">
              {overdueTotal} Tenants
            </p>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="px-4 py-3 rounded-2xl bg-[#D9F5E7] border border-[#BCEAD2] text-[#145338] text-xs font-semibold flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage}
          </span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs underline hover:no-underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SEARCH & STATUS FILTERS BAR */}
      <section className="bg-white rounded-2xl p-4 border border-[#E7ECE9] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Universal Search across all apartment groups */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#7B8983] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tenant name, unit number, reference (A-001, B-002)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] placeholder-[#7B8983] focus:outline-none focus:ring-1 focus:ring-[#BFEF43]"
          />
        </div>

        {/* Filters for All Tenants, Cleared, Rent Due, and Overdue */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs font-bold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#BFEF43] text-[#172B25] shadow-xs'
                : 'text-[#7B8983] hover:text-[#172B25]'
            }`}
          >
            All Tenants ({totalTenantsCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('cleared')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              statusFilter === 'cleared'
                ? 'bg-[#BFEF43] text-[#172B25] shadow-xs'
                : 'text-[#7B8983] hover:text-[#172B25]'
            }`}
          >
            Cleared ({clearedTotal})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('due')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              statusFilter === 'due'
                ? 'bg-[#BFEF43] text-[#172B25] shadow-xs'
                : 'text-[#7B8983] hover:text-[#172B25]'
            }`}
          >
            Rent Due ({dueTotal})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              statusFilter === 'overdue'
                ? 'bg-[#BFEF43] text-[#172B25] shadow-xs'
                : 'text-[#7B8983] hover:text-[#172B25]'
            }`}
          >
            Overdue ({overdueTotal})
          </button>
        </div>
      </section>

      {/* 3. APARTMENT / PROPERTY ACCORDION SECTIONS */}
      <div className="space-y-4">
        {filteredApartmentGroups.map((group) => {
          const expanded = isApartmentExpanded(group.property.id);
          const displayedTenants = group.filteredTenants;

          return (
            <div
              key={group.property.id}
              className="bg-white rounded-2xl border border-[#E7ECE9] shadow-xs overflow-hidden transition-all"
            >
              {/* Expandable Section Header */}
              <div
                className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                  expanded ? 'bg-[#FAFCFB] border-b border-[#E7ECE9]' : 'hover:bg-[#F5F7F6]'
                }`}
                onClick={() => toggleApartmentExpand(group.property.id)}
              >
                <div className="flex items-center gap-3">
                  {/* Configurable Prefix Badge */}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPrefixModal(group.property, group.prefix);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#BFEF43] text-[#172B25] text-xs font-mono font-bold shadow-xs border border-[#aee432] cursor-pointer hover:bg-[#b0e434]"
                    title="Click to configure unique prefix for this apartment"
                  >
                    <span>Prefix {group.prefix}</span>
                    <Edit2 className="w-3 h-3 text-[#172B25]/70" />
                  </span>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[#172B25]">
                        {group.property.name}
                      </h3>
                      <span className="text-xs text-[#7B8983] hidden sm:inline">
                        • {group.property.address}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7B8983] mt-0.5">
                      {group.property.totalUnits} Total Units • Managed by {group.property.manager}
                    </p>
                  </div>
                </div>

                {/* Right Badges & Controls in Section Header */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs font-bold text-[#172B25] tabular-nums">
                    {group.tenants.length} Tenant{group.tenants.length === 1 ? '' : 's'}
                  </span>

                  <span className="px-2 py-0.5 rounded-lg bg-[#D9F5E7] text-[#145338] text-[11px] font-semibold border border-[#BCEAD2] tabular-nums">
                    {group.clearedCount} Cleared
                  </span>

                  {group.dueCount > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-[#FEF3C7] text-[#92400E] text-[11px] font-semibold border border-[#FDE68A] tabular-nums">
                      {group.dueCount} Due
                    </span>
                  )}

                  {group.overdueCount > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-[#FDE6E6] text-[#B91C1C] text-[11px] font-semibold border border-[#F8CACA] tabular-nums">
                      {group.overdueCount} Overdue
                    </span>
                  )}

                  {/* Add Tenant button restricted to this apartment */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAddTenantModal(group.property);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#172B25] hover:bg-[#253d34] text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                    title={`Onboard tenant directly into ${group.property.name}`}
                  >
                    <Plus className="w-3.5 h-3.5 text-[#BFEF43]" />
                    <span className="hidden sm:inline">Add to {group.prefix}</span>
                  </button>

                  <div className="p-1 rounded-lg text-[#7B8983] hover:text-[#172B25] transition-transform">
                    {expanded ? (
                      <ChevronUp className="w-5 h-5 text-[#172B25]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#7B8983]" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Apartment Content */}
              {expanded && (
                <div className="p-4 sm:p-5">
                  {displayedTenants.length === 0 ? (
                    <div className="py-10 text-center bg-[#F5F7F6] rounded-2xl border border-dashed border-[#E7ECE9] p-6">
                      <Building2 className="w-8 h-8 text-[#7B8983] mx-auto mb-2 opacity-60" />
                      <p className="text-sm font-bold text-[#172B25]">
                        {group.tenants.length === 0
                          ? `No tenants onboarded in ${group.property.name} yet.`
                          : `No tenants in ${group.property.name} match '${statusFilter}' filter.`}
                      </p>
                      <p className="text-xs text-[#7B8983] mt-1 max-w-sm mx-auto">
                        New tenants added to this property will automatically use Prefix{' '}
                        <strong>{group.prefix}</strong> (e.g. {group.prefix}-001).
                      </p>
                      <button
                        type="button"
                        onClick={() => handleOpenAddTenantModal(group.property)}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#BFEF43] hover:bg-[#b0e434] text-[#172B25] text-xs font-bold cursor-pointer transition-all shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Tenant to {group.property.name}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#E7ECE9] text-[11px] font-bold text-[#7B8983]">
                            <th className="py-3 px-3">Tenant Name</th>
                            <th className="py-3 px-3">Unit Number</th>
                            <th className="py-3 px-3">Account Reference</th>
                            <th className="py-3 px-3">Contact Details</th>
                            <th className="py-3 px-3">Monthly Rent</th>
                            <th className="py-3 px-3">Rent Balance Status</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7ECE9]/60">
                          {displayedTenants.map((t) => {
                            const isOverdue =
                              t.status === 'Overdue' ||
                              ((t.rentBalance ?? 0) > 0 && t.status !== 'Paid');
                            const isDue =
                              t.status === 'Pending' ||
                              ((t.rentBalance ?? 0) > 0 && !isOverdue);
                            const isCleared = !isOverdue && !isDue;

                            return (
                              <tr
                                key={t.id}
                                className="hover:bg-[#F5F7F6]/60 transition-colors"
                              >
                                {/* Tenant Name with Avatar */}
                                <td className="py-3.5 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <AvatarBadge
                                      name={t.name}
                                      bg={t.avatarBg}
                                      className="w-8 h-8 text-[11px] shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-bold text-[#172B25] leading-snug break-words">
                                        {t.name}
                                      </p>
                                      <span className="text-[10px] text-[#7B8983]">
                                        {t.unitType} Suite
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* Unit Number */}
                                <td className="py-3.5 px-3 font-semibold text-[#172B25] whitespace-nowrap">
                                  {t.unitNumber}
                                </td>

                                {/* Tenant Account Reference */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#D9F5E7] text-[#145338] border border-[#BCEAD2]">
                                    {t.tenantRef}
                                  </span>
                                </td>

                                {/* Contact Details */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="space-y-0.5 text-[11px] text-[#7B8983]">
                                    <div className="flex items-center gap-1.5 font-mono">
                                      <Phone className="w-3 h-3 text-[#145338]" />
                                      <span>{t.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                                      <Mail className="w-3 h-3 text-[#145338]" />
                                      <span className="truncate">{t.email}</span>
                                    </div>
                                  </div>
                                </td>

                                {/* Monthly Rent */}
                                <td className="py-3.5 px-3 whitespace-nowrap tabular-nums">
                                  <p className="font-bold text-[#172B25]">
                                    KSh {t.monthlyRent.toLocaleString()}
                                  </p>
                                  <p className="text-[10px] text-[#7B8983]">
                                    Paid: KSh {t.totalPaid.toLocaleString()}
                                  </p>
                                </td>

                                {/* Rent Balance Status Badge */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="space-y-1">
                                    <span
                                      className={`inline-block px-2.5 py-0.5 rounded-md text-[10.5px] font-bold border ${
                                        isOverdue
                                          ? 'bg-[#FDE6E6] text-[#B91C1C] border-[#F8CACA]'
                                          : isDue
                                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                                          : 'bg-[#D9F5E7] text-[#145338] border-[#BCEAD2]'
                                      }`}
                                    >
                                      {isOverdue
                                        ? 'Overdue'
                                        : isDue
                                        ? 'Rent Due'
                                        : 'Cleared'}
                                    </span>
                                    {(t.rentBalance ?? 0) > 0 && (
                                      <p className="text-[10px] font-mono tabular-nums text-[#B91C1C]">
                                        Bal: KSh {(t.rentBalance ?? 0).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </td>

                                {/* Actions Suite */}
                                <td className="py-3.5 px-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSelectTenantRef(t.tenantRef);
                                        setProfileModalTenant(t);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F5F7F6] hover:bg-[#E7ECE9] text-[#172B25] text-xs font-semibold cursor-pointer transition-colors border border-[#E7ECE9]"
                                      title="View Full Lease & Payment Profile"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-[#145338]" />
                                      <span>Profile</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(t)}
                                      className="p-1.5 rounded-lg text-[#7B8983] hover:text-[#172B25] hover:bg-[#F5F7F6] cursor-pointer"
                                      title="Edit Tenant"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await onRecordTenantPayment(t.tenantRef);
                                        showToast(`Payment confirmed for ${t.name} (${t.tenantRef})`);
                                      }}
                                      className="p-1.5 rounded-lg text-[#145338] hover:bg-[#D9F5E7] cursor-pointer"
                                      title="Record Rent Payment"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (
                                          window.confirm(
                                            `Are you sure you want to delete ${t.name} (${t.tenantRef})?`
                                          )
                                        ) {
                                          await onDeleteTenant(t.id);
                                          showToast(`Tenant ${t.name} removed from database.`);
                                        }
                                      }}
                                      className="p-1.5 rounded-lg text-[#7B8983] hover:text-[#B91C1C] hover:bg-[#FDE6E6] cursor-pointer"
                                      title="Delete Tenant Record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned / Historical Tenants (if any) */}
        {apartmentGroups.unassignedTenants.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E7ECE9] shadow-xs overflow-hidden">
            <div
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#F5F7F6]"
              onClick={() => toggleApartmentExpand('unassigned')}
            >
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-xl bg-[#FEF3C7] text-[#92400E] text-xs font-mono font-bold border border-[#FDE68A]">
                  Unassigned
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#172B25]">
                    Other / Unassigned Property Tenants
                  </h3>
                  <p className="text-[11px] text-[#7B8983]">
                    Tenants whose property was modified or not matched
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#172B25] tabular-nums">
                {apartmentGroups.unassignedTenants.length} Tenant(s)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: CONFIGURE UNIQUE APARTMENT PREFIX */}
      {prefixModalProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSavePrefix}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E7ECE9] space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E7ECE9]">
              <div>
                <h3 className="text-base font-bold text-[#172B25]">
                  Configure Apartment Prefix
                </h3>
                <p className="text-xs text-[#7B8983]">
                  {prefixModalProperty.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrefixModalProperty(null)}
                className="p-1 rounded-lg text-[#7B8983] hover:bg-[#F5F7F6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-[#FDE6E6] text-[#B91C1C] text-xs font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Unique Property Code Prefix
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={newPrefixValue}
                  onChange={(e) => setNewPrefixValue(e.target.value.toUpperCase())}
                  placeholder="e.g. A, B, C, KMB"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-sm font-mono font-bold text-[#172B25] uppercase focus:outline-none focus:ring-2 focus:ring-[#BFEF43]"
                />
                <p className="text-[11px] text-[#7B8983] mt-1.5">
                  Tenants onboarded to <strong>{prefixModalProperty.name}</strong> will receive account references formatted as <code>{newPrefixValue || 'X'}-001</code>, <code>{newPrefixValue || 'X'}-002</code>, etc.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#D9F5E7]/60 border border-[#BCEAD2] text-[11.5px] text-[#145338] space-y-1">
                <p className="font-bold">Standard Configuration Examples:</p>
                <div>• Prefix A — Kiambu Apartments</div>
                <div>• Prefix B — Kirigiti Apartments</div>
                <div>• Prefix C — Another Apartment</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPrefixModalProperty(null)}
                className="px-4 py-2 rounded-xl bg-[#F5F7F6] text-[#7B8983] text-xs font-semibold hover:bg-[#E7ECE9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPrefix}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#BFEF43] hover:bg-[#b0e434] text-[#172B25] text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingPrefix ? 'Saving...' : 'Save Prefix'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: ADD TENANT (AUTO APARTMENT GROUP & PREFIX MAPPING) */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateTenantSubmit}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-[#E7ECE9] max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E7ECE9]">
              <div>
                <h3 className="text-base font-bold text-[#172B25]">
                  Onboard Tenant to{' '}
                  {targetPropertyForAdd ? targetPropertyForAdd.name : 'Apartment'}
                </h3>
                <p className="text-xs text-[#7B8983]">
                  Automatically generates unique account reference quoting the apartment prefix
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1 rounded-lg text-[#7B8983] hover:bg-[#F5F7F6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-[#FDE6E6] text-[#B91C1C] text-xs font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              {/* Target Property Selector */}
              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Assigned Apartment / Property
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPropertyId(id);
                    const p = properties.find((item) => item.id === id);
                    if (p) {
                      setTargetPropertyForAdd(p);
                      setNewProperty(p.name);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs font-semibold text-[#172B25]"
                >
                  {properties.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      Prefix {p.codePrefix || String.fromCharCode(65 + idx)} — {p.name} ({p.address})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Grace Wanjiku"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Phone Number (SMS Notifications)
                  </label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+254 700 000 001"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="grace.wanjiku@domain.io"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Unit Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(e.target.value)}
                    placeholder="Unit 101"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Unit Type
                  </label>
                  <select
                    value={newUnitType}
                    onChange={(e) => setNewUnitType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  >
                    <option value="Deluxe">Deluxe</option>
                    <option value="Standard">Standard</option>
                    <option value="Suite">Suite</option>
                    <option value="Family">Family</option>
                    <option value="Single">Single</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Monthly Rent (KSh)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newRent}
                    onChange={(e) => setNewRent(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Security Deposit (KSh)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newDeposit}
                    onChange={(e) => setNewDeposit(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Lease Duration
                  </label>
                  <input
                    type="text"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    placeholder="12 Months"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Initial Rent Status
                  </label>
                  <select
                    value={newInitialStatus}
                    onChange={(e) => setNewInitialStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  >
                    <option value="Pending">Pending (Rent Due)</option>
                    <option value="Paid">Paid (Balance Cleared)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-[#E7ECE9]">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#F5F7F6] text-[#7B8983] text-xs font-semibold hover:bg-[#E7ECE9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#BFEF43] hover:bg-[#b0e434] text-[#172B25] text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{saving ? 'Onboarding...' : 'Onboard Tenant'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: EDIT TENANT MODAL */}
      {editTenantModalOpen && editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveTenantEdit}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E7ECE9] max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E7ECE9]">
              <div>
                <h3 className="text-base font-bold text-[#172B25]">
                  Edit Tenant &amp; Lease Details
                </h3>
                <p className="text-xs text-[#7B8983]">
                  {editingTenant.tenantRef} • {editingTenant.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditTenantModalOpen(false)}
                className="p-1 rounded-lg text-[#7B8983] hover:bg-[#F5F7F6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Assigned Property
                </label>
                <select
                  value={editPropertyId}
                  onChange={(e) => setEditPropertyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs font-semibold text-[#172B25]"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      Prefix {p.codePrefix || 'A'} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Unit Number
                  </label>
                  <input
                    type="text"
                    value={editUnitNumber}
                    onChange={(e) => setEditUnitNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Monthly Rent (KSh)
                  </label>
                  <input
                    type="number"
                    value={editRent}
                    onChange={(e) => setEditRent(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Special Lease Notes
                </label>
                <textarea
                  rows={3}
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] resize-none"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-[#E7ECE9]">
              <button
                type="button"
                onClick={() => setEditTenantModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#F5F7F6] text-[#7B8983] text-xs font-semibold hover:bg-[#E7ECE9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#BFEF43] hover:bg-[#b0e434] text-[#172B25] text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? 'Updating...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: FULL TENANT PROFILE & PAYMENT HISTORY DRAWER/MODAL */}
      {profileModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-[#E7ECE9] max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7ECE9]">
              <div className="flex items-center gap-3">
                <AvatarBadge
                  name={profileModalTenant.name}
                  bg={profileModalTenant.avatarBg}
                  className="w-12 h-12 text-sm shadow-xs"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#172B25]">
                      {profileModalTenant.name}
                    </h3>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#D9F5E7] text-[#145338] border border-[#BCEAD2]">
                      Ref: {profileModalTenant.tenantRef}
                    </span>
                  </div>
                  <p className="text-xs text-[#7B8983] mt-0.5">
                    {profileModalTenant.unitNumber} • {profileModalTenant.property}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenEditModal(profileModalTenant);
                    setProfileModalTenant(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-xs font-semibold text-[#172B25] border border-[#E7ECE9]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setProfileModalTenant(null)}
                  className="p-1.5 rounded-lg text-[#7B8983] hover:bg-[#F5F7F6] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Content 3-Column Split */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Contact & Personal Info */}
              <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] space-y-3 text-xs">
                <h4 className="font-bold text-[#172B25] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#145338]" />
                  Contact &amp; Identification
                </h4>
                <div className="space-y-1.5 text-[#172B25]">
                  <div>
                    <span className="text-[#7B8983]">Phone:</span> {profileModalTenant.phone}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Email:</span> {profileModalTenant.email}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">ID / Passport:</span> {profileModalTenant.idNumber}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Nationality:</span> {profileModalTenant.nationality}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Tier:</span>{' '}
                    <span className="font-bold text-[#145338]">
                      {profileModalTenant.tier}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Lease Details */}
              <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] space-y-3 text-xs">
                <h4 className="font-bold text-[#172B25] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#145338]" />
                  Lease Agreement
                </h4>
                <div className="space-y-1.5 text-[#172B25]">
                  <div>
                    <span className="text-[#7B8983]">Lease ID:</span>{' '}
                    <span className="font-mono font-bold">
                      {profileModalTenant.leaseId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Duration:</span> {profileModalTenant.leaseDuration}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Term:</span> {profileModalTenant.leaseStart} to {profileModalTenant.leaseEnd}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Occupants:</span> {profileModalTenant.occupants}
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Deposit:</span> KSh {profileModalTenant.securityDeposit.toLocaleString()} Held
                  </div>
                </div>
              </div>

              {/* Card 3: Financial Standing */}
              <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] space-y-3 text-xs">
                <h4 className="font-bold text-[#172B25] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#145338]" />
                  Financial Standing
                </h4>
                <div className="space-y-1.5 text-[#172B25]">
                  <div>
                    <span className="text-[#7B8983]">Monthly Rent:</span>{' '}
                    <strong>KSh {profileModalTenant.monthlyRent.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Total Paid to Date:</span>{' '}
                    <span className="text-[#145338] font-bold">
                      KSh {profileModalTenant.totalPaid.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Current Balance:</span>{' '}
                    <span
                      className={`font-bold ${
                        (profileModalTenant.rentBalance ?? 0) > 0
                          ? 'text-[#B91C1C]'
                          : 'text-[#145338]'
                      }`}
                    >
                      KSh {(profileModalTenant.rentBalance ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7B8983]">Status:</span>{' '}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        profileModalTenant.status === 'Paid'
                          ? 'bg-[#D9F5E7] text-[#145338]'
                          : 'bg-[#FEF3C7] text-[#92400E]'
                      }`}
                    >
                      {profileModalTenant.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Transaction History Ledger */}
            <div className="pt-2">
              <h4 className="text-sm font-bold text-[#172B25] mb-2.5">
                Payment Transaction History ({profileModalTenant.tenantRef})
              </h4>
              {profileModalTenant.paymentHistory.length === 0 ? (
                <div className="p-6 text-center bg-[#F5F7F6] rounded-xl text-xs text-[#7B8983]">
                  No recorded payment transactions for {profileModalTenant.name} yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E7ECE9]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F7F6] text-[#7B8983] text-[11px] font-semibold">
                        <th className="py-2.5 px-3">Receipt ID</th>
                        <th className="py-2.5 px-3">Payment Date</th>
                        <th className="py-2.5 px-3">Unit Number</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7ECE9]">
                      {profileModalTenant.paymentHistory.map((p) => (
                        <tr key={p.id} className="hover:bg-[#F9FBFA]">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#172B25]">
                            {p.id}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">{p.paymentDate}</td>
                          <td className="py-2.5 px-3">{p.unitNumber}</td>
                          <td className="py-2.5 px-3 text-[#7B8983] tabular-nums">
                            {p.periodStart} - {p.periodEnd}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#172B25] tabular-nums">
                            KSh {p.amount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'Paid'
                                  ? 'bg-[#D9F5E7] text-[#145338]'
                                  : 'bg-[#FEF3C7] text-[#92400E]'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 flex justify-between items-center border-t border-[#E7ECE9]">
              <button
                type="button"
                onClick={() => {
                  onSelectTenantRef(profileModalTenant.tenantRef);
                  onNavigate('messages');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-xs font-semibold text-[#172B25]"
              >
                <Mail className="w-3.5 h-3.5 text-[#145338]" />
                <span>Send Rent Reminder Notice</span>
              </button>

              <button
                type="button"
                onClick={() => setProfileModalTenant(null)}
                className="px-5 py-2 rounded-xl bg-[#172B25] text-white text-xs font-bold hover:bg-[#253d34] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
