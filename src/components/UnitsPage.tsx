import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatedCounter } from './AnimatedMetrics';
import {
  Search,
  ChevronDown,
  Maximize2,
  BedDouble,
  Users,
  Check,
  Wifi,
  Wind,
  Tv,
  Coffee,
  Car,
  ShieldCheck,
  Plus,
  X,
  Trash2,
  Edit2,
  Eye,
  Building2,
  Layers,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  DoorOpen,
  UserCheck,
  Banknote,
  Power,
  RotateCcw,
  ArrowUpDown,
  Filter,
  AlertCircle,
} from 'lucide-react';
import { UnitTypeItem, PropertyRecord } from '../data/rentalData';

interface UnitsPageProps {
  unitTypes: UnitTypeItem[];
  properties: PropertyRecord[];
  onAddUnitType: (unit: Partial<UnitTypeItem>) => Promise<void>;
  onUpdateUnitType: (id: string, unit: Partial<UnitTypeItem>) => Promise<void>;
  onDeleteUnitType: (id: string) => Promise<void>;
  globalSearch: string;
  onGlobalSearchChange?: (val: string) => void;
}

const VARIANT_LABELS: Record<UnitTypeItem['variant'], string> = {
  standard: 'Standard 1BR',
  deluxe: 'Deluxe 2BR',
  suite: 'Executive Suite',
  family: 'Family Residence',
  single: 'Studio / Single',
};

type UnitDisplayStatus = 'Available' | 'Fully Occupied' | 'Inactive';

function getUnitDisplayStatus(unit: UnitTypeItem): UnitDisplayStatus {
  const totalCount = Math.max(0, Number(unit.totalCount || 0));
  const occupiedCount = Math.max(0, Number(unit.occupiedCount || 0));
  if (unit.status === 'Inactive' || totalCount <= 0) {
    return 'Inactive';
  }
  if (occupiedCount >= totalCount) {
    return 'Fully Occupied';
  }
  return 'Available';
}

function getStatusBadgeClass(status: UnitDisplayStatus): string {
  switch (status) {
    case 'Available':
      return 'bg-[#D8F3E5] text-[#145338] border border-[#BDE7D1]';
    case 'Fully Occupied':
      return 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]';
    case 'Inactive':
      return 'bg-[#EEF3F0] text-[#5A6762] border border-[#DCE4DF]';
  }
}

export const UnitsPage: React.FC<UnitsPageProps> = ({
  unitTypes,
  properties,
  onAddUnitType,
  onUpdateUnitType,
  onDeleteUnitType,
  globalSearch,
  onGlobalSearchChange,
}) => {
  const [localSearch, setLocalSearch] = useState(globalSearch || '');
  const [propertyFilter, setPropertyFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<
    'popular' | 'price-asc' | 'price-desc' | 'vacant-desc' | 'occupancy-desc'
  >('popular');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Actions popover state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalSearch(globalSearch || '');
    setCurrentPage(1);
  }, [globalSearch]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuId]);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    onGlobalSearchChange?.(val);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    handleSearchChange('');
    setPropertyFilter('All');
    setTypeFilter('All');
    setSortBy('popular');
    setCurrentPage(1);
  };

  // Modals state
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitTypeItem | null>(null);
  const [detailModalUnit, setDetailModalUnit] = useState<UnitTypeItem | null>(null);
  const [deleteTargetUnit, setDeleteTargetUnit] = useState<UnitTypeItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state for Add/Edit modal
  const [formName, setFormName] = useState('');
  const [formProperty, setFormProperty] = useState('');
  const [formVariant, setFormVariant] =
    useState<UnitTypeItem['variant']>('deluxe');
  const [formSize, setFormSize] = useState(70);
  const [formBedrooms, setFormBedrooms] = useState('King Bed • 2 Bath');
  const [formMaxTenants, setFormMaxTenants] = useState(2);
  const [formRent, setFormRent] = useState(35000);
  const [formTotalUnits, setFormTotalUnits] = useState(10);
  const [formOccupiedUnits, setFormOccupiedUnits] = useState(0);
  const [formStatus, setFormStatus] = useState<'Available' | 'Inactive'>('Available');
  const [formDesc, setFormDesc] = useState('');

  // Property prefix lookup
  const propertyPrefixMap = useMemo(() => {
    const map = new Map<string, string>();
    properties.forEach((p, idx) => {
      const prefix =
        p.codePrefix && p.codePrefix.trim()
          ? p.codePrefix.trim().toUpperCase()
          : String.fromCharCode(65 + (idx % 26));
      map.set(p.name.trim().toLowerCase(), prefix);
    });
    return map;
  }, [properties]);

  // Unique property & type filter options from live DB data
  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    unitTypes.forEach((u) => {
      if (u.property?.trim()) set.add(u.property.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [properties, unitTypes]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    unitTypes.forEach((u) => {
      if (u.name?.trim()) set.add(u.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [unitTypes]);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const hasActiveFilters =
    Boolean(query) ||
    propertyFilter !== 'All' ||
    typeFilter !== 'All' ||
    sortBy !== 'popular';

  const filteredUnits = useMemo(() => {
    return unitTypes
      .filter((u) => {
        const matchesProperty =
          propertyFilter === 'All' ||
          u.property.trim().toLowerCase() === propertyFilter.trim().toLowerCase();
        const matchesType =
          typeFilter === 'All' ||
          u.name.trim().toLowerCase() === typeFilter.trim().toLowerCase();
        const displayStatus = getUnitDisplayStatus(u);
        const variantLabel = VARIANT_LABELS[u.variant] || u.variant || '';
        const matchesQuery =
          !query ||
          u.name.toLowerCase().includes(query) ||
          u.property.toLowerCase().includes(query) ||
          u.description.toLowerCase().includes(query) ||
          (u.bedrooms || '').toLowerCase().includes(query) ||
          variantLabel.toLowerCase().includes(query) ||
          displayStatus.toLowerCase().includes(query) ||
          String(u.monthlyRent || '').includes(query) ||
          String(u.sizeSqm || '').includes(query);
        return matchesProperty && matchesType && matchesQuery;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return Number(a.monthlyRent || 0) - Number(b.monthlyRent || 0);
        if (sortBy === 'price-desc') return Number(b.monthlyRent || 0) - Number(a.monthlyRent || 0);
        if (sortBy === 'vacant-desc') {
          const vacA = Math.max(0, Number(a.totalCount || 0) - Number(a.occupiedCount || 0));
          const vacB = Math.max(0, Number(b.totalCount || 0) - Number(b.occupiedCount || 0));
          return vacB - vacA;
        }
        if (sortBy === 'occupancy-desc') {
          const rateA =
            Number(a.totalCount || 0) > 0
              ? Number(a.occupiedCount || 0) / Number(a.totalCount || 0)
              : 0;
          const rateB =
            Number(b.totalCount || 0) > 0
              ? Number(b.occupiedCount || 0) / Number(b.totalCount || 0)
              : 0;
          return rateB - rateA;
        }
        return 0;
      });
  }, [unitTypes, propertyFilter, typeFilter, query, sortBy]);

  const totalPages = Math.ceil(filteredUnits.length / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUnits = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filteredUnits.slice(start, start + itemsPerPage);
  }, [filteredUnits, safePage]);

  // All KPI stats derived strictly from actual DB records (filtered scope)
  const inventoryStats = useMemo(() => {
    const totalUnitsCount = filteredUnits.reduce(
      (sum, u) => sum + Math.max(0, Number(u.totalCount || 0)),
      0
    );
    const occupiedUnitsCount = filteredUnits.reduce(
      (sum, u) => sum + Math.max(0, Number(u.occupiedCount || 0)),
      0
    );
    const vacantUnitsCount = Math.max(0, totalUnitsCount - occupiedUnitsCount);
    const occupancyRate =
      totalUnitsCount > 0
        ? Math.min(100, Math.round((occupiedUnitsCount / totalUnitsCount) * 100))
        : 0;
    const avgRent =
      filteredUnits.length > 0
        ? Math.round(
            filteredUnits.reduce((sum, u) => sum + Math.max(0, Number(u.monthlyRent || 0)), 0) /
              filteredUnits.length
          )
        : 0;
    const activeTierCount = filteredUnits.filter(
      (u) => getUnitDisplayStatus(u) !== 'Inactive'
    ).length;
    const availableTierCount = filteredUnits.filter(
      (u) => getUnitDisplayStatus(u) === 'Available'
    ).length;
    return {
      totalUnitsCount,
      occupiedUnitsCount,
      vacantUnitsCount,
      occupancyRate,
      avgRent,
      activeTierCount,
      availableTierCount,
    };
  }, [filteredUnits]);

  const openAddModal = () => {
    setFormError(null);
    setEditingUnit(null);
    setFormName('');
    setFormProperty(
      propertyFilter !== 'All' ? propertyFilter : properties[0]?.name || ''
    );
    setFormVariant('deluxe');
    setFormSize(68);
    setFormBedrooms('Queen Bed • 1 Bath');
    setFormMaxTenants(2);
    setFormRent(35000);
    setFormTotalUnits(10);
    setFormOccupiedUnits(0);
    setFormStatus('Available');
    setFormDesc('');
    setModalMode('add');
  };

  const openEditModal = (unit: UnitTypeItem) => {
    setFormError(null);
    setEditingUnit(unit);
    setFormName(unit.name);
    setFormProperty(unit.property);
    setFormVariant(unit.variant);
    setFormSize(unit.sizeSqm);
    setFormBedrooms(unit.bedrooms);
    setFormMaxTenants(unit.maxTenants);
    setFormRent(unit.monthlyRent);
    setFormTotalUnits(unit.totalCount);
    setFormOccupiedUnits(unit.occupiedCount);
    setFormStatus(unit.status === 'Inactive' ? 'Inactive' : 'Available');
    setFormDesc(unit.description);
    setModalMode('edit');
  };

  const handleToggleInactive = async (unit: UnitTypeItem) => {
    setOpenMenuId(null);
    setStatusUpdatingId(unit.id);
    const nextStatus = unit.status === 'Inactive' ? 'Available' : 'Inactive';
    try {
      await onUpdateUnitType(unit.id, { status: nextStatus });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formProperty.trim()) {
      setFormError('Unit type name and property are required.');
      return;
    }
    if (Number(formTotalUnits) < 0 || Number(formOccupiedUnits) < 0) {
      setFormError('Unit counts cannot be negative.');
      return;
    }
    if (Number(formOccupiedUnits) > Number(formTotalUnits)) {
      setFormError('Occupied units cannot exceed total units in this tier.');
      return;
    }
    if (Number(formRent) < 0 || Number(formSize) <= 0 || Number(formMaxTenants) < 1) {
      setFormError('Rent, floor area, and max occupants must be valid positive numbers.');
      return;
    }

    setSaving(true);
    try {
      const descText =
        formDesc.trim() ||
        `${formName.trim()} residential unit (${formSize} m², ${formBedrooms}) at ${formProperty.trim()}.`;

      const computedStatus: UnitTypeItem['status'] =
        formStatus === 'Inactive' || Number(formTotalUnits) <= 0
          ? 'Inactive'
          : Number(formOccupiedUnits) >= Number(formTotalUnits)
          ? 'Occupied'
          : 'Available';

      if (modalMode === 'add') {
        await onAddUnitType({
          name: formName.trim(),
          property: formProperty.trim(),
          variant: formVariant,
          sizeSqm: Number(formSize),
          bedrooms: formBedrooms.trim(),
          maxTenants: Number(formMaxTenants),
          occupiedCount: Number(formOccupiedUnits),
          totalCount: Number(formTotalUnits),
          monthlyRent: Number(formRent),
          status: computedStatus,
          description: descText,
          longDescription: descText,
        });
      } else if (modalMode === 'edit' && editingUnit) {
        await onUpdateUnitType(editingUnit.id, {
          name: formName.trim(),
          property: formProperty.trim(),
          variant: formVariant,
          sizeSqm: Number(formSize),
          bedrooms: formBedrooms.trim(),
          maxTenants: Number(formMaxTenants),
          occupiedCount: Number(formOccupiedUnits),
          totalCount: Number(formTotalUnits),
          monthlyRent: Number(formRent),
          status: computedStatus,
          description: descText,
        });
      }
      setModalMode(null);
      setEditingUnit(null);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save unit type. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetUnit) return;
    setDeleting(true);
    try {
      await onDeleteUnitType(deleteTargetUnit.id);
      if (detailModalUnit?.id === deleteTargetUnit.id) {
        setDetailModalUnit(null);
      }
      setDeleteTargetUnit(null);
    } finally {
      setDeleting(false);
    }
  };

  const amenityIcons = [Wifi, Wind, Coffee, Tv, Car, ShieldCheck];

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[20px] sm:text-[22px] font-bold text-[#17231E] tracking-tight">
              Unit Types &amp; Inventory
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-[#EEF4F1] border border-[#DCE4DF] text-[#46544E] text-[11px] font-bold tabular-nums">
              {filteredUnits.length} {filteredUnits.length === 1 ? 'Tier' : 'Tiers'}
              {filteredUnits.length !== unitTypes.length ? ` of ${unitTypes.length}` : ''}
            </span>
          </div>
          <p className="text-[12.5px] text-[#6E7A75] mt-1">
            Monitor residential unit tiers, floor capacity, monthly pricing, and real-time occupancy across your portfolio.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12.5px] font-bold transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          title="Create a new rental unit tier"
        >
          <Plus className="w-4 h-4" />
          <span>Add Unit</span>
        </button>
      </div>

      {/* Four Balanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Units */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E7ECE9] shadow-xs rms-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Total Units
            </span>
            <span
              className="w-8 h-8 rounded-xl bg-[#EEF4F1] text-[#145338] flex items-center justify-center shrink-0"
              title="Total inventory units across displayed tiers"
            >
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-[24px] font-extrabold text-[#17231E] tracking-tight tabular-nums leading-none">
              <AnimatedCounter value={inventoryStats.totalUnitsCount} />
            </div>
            <p className="text-[11.5px] text-[#7A8681] mt-2 tabular-nums">
              {inventoryStats.activeTierCount} active unit{' '}
              {inventoryStats.activeTierCount === 1 ? 'tier' : 'tiers'}
            </p>
          </div>
        </div>

        {/* Occupied */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E7ECE9] shadow-xs rms-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Occupied
            </span>
            <span
              className="w-8 h-8 rounded-xl bg-[#D8F3E5] text-[#145338] flex items-center justify-center shrink-0"
              title="Currently occupied units"
            >
              <UserCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[24px] font-extrabold text-[#145338] tracking-tight tabular-nums leading-none">
                <AnimatedCounter value={inventoryStats.occupiedUnitsCount} />
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#145338] text-[11px] font-bold tabular-nums">
                {inventoryStats.occupancyRate}% filled
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#EEF3F0] overflow-hidden mt-2.5">
              <div
                className="h-full rounded-full bg-[#145338] transition-all duration-300"
                style={{ width: `${inventoryStats.occupancyRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Vacant */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E7ECE9] shadow-xs rms-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Vacant
            </span>
            <span
              className="w-8 h-8 rounded-xl bg-[#EEF4F1] text-[#17231E] flex items-center justify-center shrink-0"
              title="Units currently available for allocation"
            >
              <DoorOpen className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-[24px] font-extrabold text-[#17231E] tracking-tight tabular-nums leading-none">
              <AnimatedCounter value={inventoryStats.vacantUnitsCount} />
            </div>
            <p className="text-[11.5px] text-[#7A8681] mt-2 tabular-nums">
              {inventoryStats.availableTierCount}{' '}
              {inventoryStats.availableTierCount === 1 ? 'tier has' : 'tiers have'} open availability
            </p>
          </div>
        </div>

        {/* Average Rent */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E7ECE9] shadow-xs rms-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Average Rent
            </span>
            <span
              className="w-8 h-8 rounded-xl bg-[#E5F69C] text-[#17231E] flex items-center justify-center shrink-0"
              title="Average monthly rent across displayed unit tiers"
            >
              <Banknote className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-[24px] font-extrabold text-[#17231E] tracking-tight tabular-nums leading-none">
              <AnimatedCounter value={inventoryStats.avgRent} prefix="KSh " />
            </div>
            <p className="text-[11.5px] text-[#7A8681] mt-2">
              Monthly tier average
            </p>
          </div>
        </div>
      </div>

      {/* Main Directory Card: Search, Filters & Table */}
      <div className="bg-white rounded-2xl border border-[#E7ECE9] shadow-xs overflow-visible">
        {/* Search & Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[#EEF3F0] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Generous Search Input */}
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 text-[#88948F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search unit type, property, category, layout, or rent..."
              aria-label="Search unit types and inventory"
              className="w-full h-10 pl-10 pr-9 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12.5px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267] focus:border-[#D5F267]"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                title="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#88948F] hover:text-[#17231E] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Aligned Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:items-center gap-2.5">
            {/* Property Filter */}
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 text-[#6E7A75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={propertyFilter}
                onChange={(e) => {
                  setPropertyFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by property"
                className="w-full lg:w-44 h-10 appearance-none pl-8 pr-8 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267] cursor-pointer"
              >
                <option value="All">All Properties</option>
                {propertyOptions.map((propName) => (
                  <option key={propName} value={propName}>
                    {propName}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Unit Type Filter */}
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-[#6E7A75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by unit type"
                className="w-full lg:w-40 h-10 appearance-none pl-8 pr-8 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267] cursor-pointer"
              >
                <option value="All">All Unit Types</option>
                {typeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Sort Filter */}
            <div className="relative">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#6E7A75] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setCurrentPage(1);
                }}
                aria-label="Sort unit types"
                className="w-full lg:w-44 h-10 appearance-none pl-8 pr-8 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267] cursor-pointer"
              >
                <option value="popular">Sort: Default</option>
                <option value="price-asc">Rent: Low to High</option>
                <option value="price-desc">Rent: High to Low</option>
                <option value="vacant-desc">Most Vacant</option>
                <option value="occupancy-desc">Highest Occupancy</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                title="Reset all filters and sorting"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-[#EEF4F1] hover:bg-[#E2ECE7] text-[#46544E] text-[12px] font-semibold transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {filteredUnits.length === 0 ? (
          <div className="p-6">
            <div className="py-12 px-4 text-center rounded-2xl bg-[#F8FAF9] border border-dashed border-[#DCE4DF]">
              <Layers className="w-9 h-9 text-[#88948F] mx-auto mb-2.5 opacity-60" />
              <p className="text-[14px] font-bold text-[#17231E] mb-1">
                {unitTypes.length === 0
                  ? 'No rental unit types configured yet'
                  : 'No unit types match your current filters'}
              </p>
              <p className="text-[12px] text-[#7A8681] mb-4 max-w-md mx-auto">
                {unitTypes.length === 0
                  ? 'Create your first unit tier to configure monthly pricing, floor area, capacity, and unit counts.'
                  : 'Clear or adjust your search, property, or unit type filters to view available inventory.'}
              </p>
              <div className="flex items-center justify-center gap-2.5">
                {hasActiveFilters && unitTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EEF4F1] hover:bg-[#E2ECE7] text-[#17231E] text-[12px] font-bold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Unit</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div ref={menuContainerRef}>
            {/* Desktop / Tablet Structured Inventory Table (Zero horizontal overflow on desktop) */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="bg-[#EEF4F1] text-[#5A6762] text-[11px] font-bold uppercase tracking-wider border-b border-[#E4ECE8]">
                    <th className="py-3 pl-5 pr-3 w-[25%]">Unit Type</th>
                    <th className="py-3 px-3 w-[15%]">Property</th>
                    <th className="py-3 px-3 w-[19%]">Layout &amp; Capacity</th>
                    <th className="py-3 px-3 w-[16%]">Occupancy</th>
                    <th className="py-3 px-3 w-[11%]">Monthly Rent</th>
                    <th className="py-3 px-3 w-[10%]">Status</th>
                    <th className="py-3 pl-3 pr-5 w-[132px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF3F0] text-[12.5px]">
                  {paginatedUnits.map((unit) => {
                    const totalCount = Math.max(0, Number(unit.totalCount || 0));
                    const occupiedCount = Math.max(0, Number(unit.occupiedCount || 0));
                    const vacantCount = Math.max(0, totalCount - occupiedCount);
                    const occPct =
                      totalCount > 0
                        ? Math.min(100, Math.round((occupiedCount / totalCount) * 100))
                        : 0;
                    const propPrefix = propertyPrefixMap.get(
                      (unit.property || '').trim().toLowerCase()
                    );
                    const displayStatus = getUnitDisplayStatus(unit);
                    const statusBadgeClass = getStatusBadgeClass(displayStatus);
                    const isMenuOpen = openMenuId === unit.id;
                    const isUpdatingStatus = statusUpdatingId === unit.id;

                    const barColor =
                      displayStatus === 'Inactive'
                        ? 'bg-[#9CA9A3]'
                        : displayStatus === 'Fully Occupied'
                        ? 'bg-[#D97706]'
                        : 'bg-[#145338]';

                    return (
                      <tr
                        key={unit.id}
                        className="hover:bg-[#F8FBF9] transition-colors group align-middle"
                      >
                        {/* Unit Type: Name, Category, Description */}
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className="w-9 h-9 rounded-xl bg-[#EAF4EE] text-[#145338] flex items-center justify-center shrink-0 mt-0.5"
                              title={VARIANT_LABELS[unit.variant] || unit.variant}
                            >
                              <BedDouble className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-[#17231E] text-[13px] truncate">
                                  {unit.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[#F4F8F6] border border-[#E4ECE8] text-[#5A6762] text-[10px] font-semibold shrink-0">
                                  {VARIANT_LABELS[unit.variant] || unit.variant}
                                </span>
                              </div>
                              {unit.description && (
                                <p
                                  className="text-[11px] text-[#7A8681] truncate mt-0.5"
                                  title={unit.description}
                                >
                                  {unit.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Property */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {propPrefix && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-[#17231E] text-[#D5F267] font-mono-num text-[10px] font-bold shrink-0"
                                title={`Property Code: ${propPrefix}`}
                              >
                                {propPrefix}
                              </span>
                            )}
                            <span
                              className="font-semibold text-[#17231E] truncate"
                              title={unit.property}
                            >
                              {unit.property}
                            </span>
                          </div>
                        </td>

                        {/* Layout & Capacity: Area, Bedrooms, Max Occupancy */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 text-[11.5px] text-[#46544E] tabular-nums">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span
                                className="inline-flex items-center gap-1 font-medium"
                                title="Floor Area"
                              >
                                <Maximize2 className="w-3 h-3 text-[#7A8681] shrink-0" />
                                <span>{unit.sizeSqm} m²</span>
                              </span>
                              <span
                                className="inline-flex items-center gap-1 font-medium"
                                title="Maximum Occupants"
                              >
                                <Users className="w-3 h-3 text-[#7A8681] shrink-0" />
                                <span>Max {unit.maxTenants}</span>
                              </span>
                            </div>
                            <div
                              className="flex items-center gap-1 text-[11px] text-[#6E7A75] truncate"
                              title={`Bedrooms & Layout: ${unit.bedrooms}`}
                            >
                              <BedDouble className="w-3 h-3 text-[#7A8681] shrink-0" />
                              <span className="truncate">{unit.bedrooms}</span>
                            </div>
                          </div>
                        </td>

                        {/* Occupancy: Occupied, Vacant & Progress Bar */}
                        <td className="py-3.5 px-3 tabular-nums">
                          <div className="w-full max-w-[165px]">
                            <div className="flex items-center justify-between gap-2 text-[11.5px] mb-1.5">
                              <span className="font-bold text-[#17231E]">
                                {occupiedCount}/{totalCount} occ.
                              </span>
                              <span className="text-[11px] font-medium text-[#6E7A75]">
                                {vacantCount} vacant
                              </span>
                            </div>
                            <div
                              className="h-1.5 w-full rounded-full bg-[#EEF3F0] overflow-hidden"
                              title={`${occPct}% occupied (${occupiedCount} occupied, ${vacantCount} vacant)`}
                            >
                              <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{ width: `${occPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Monthly Rent */}
                        <td className="py-3.5 px-3 tabular-nums">
                          <div className="font-extrabold text-[#17231E] text-[13.5px] leading-tight">
                            KSh {Number(unit.monthlyRent || 0).toLocaleString()}
                          </div>
                          <div className="text-[10.5px] text-[#7A8681]">per month</div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${statusBadgeClass}`}
                          >
                            {isUpdatingStatus ? 'Updating...' : displayStatus}
                          </span>
                        </td>

                        {/* Actions: View, Edit, More */}
                        <td className="py-3.5 pl-3 pr-5 text-right">
                          <div className="relative inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailModalUnit(unit)}
                              className="p-2 rounded-lg bg-[#F4F8F6] hover:bg-[#EAF4EE] text-[#145338] cursor-pointer transition-colors"
                              title="View unit details, features & amenities"
                              aria-label={`View ${unit.name}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(unit)}
                              className="p-2 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] cursor-pointer transition-colors"
                              title="Edit unit type details"
                              aria-label={`Edit ${unit.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId((prev) => (prev === unit.id ? null : unit.id))
                              }
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                isMenuOpen
                                  ? 'bg-[#17231E] text-white'
                                  : 'bg-[#F4F8F6] hover:bg-[#E7ECE9] text-[#5A6762]'
                              }`}
                              title="More actions"
                              aria-label={`More actions for ${unit.name}`}
                              aria-expanded={isMenuOpen}
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-white border border-[#E4ECE8] shadow-lg py-1.5 z-30 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setDetailModalUnit(unit);
                                  }}
                                  className="w-full px-3.5 py-2 text-[12px] font-medium text-[#17231E] hover:bg-[#F4F8F6] flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#145338]" />
                                  <span>View Full Details</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    openEditModal(unit);
                                  }}
                                  className="w-full px-3.5 py-2 text-[12px] font-medium text-[#17231E] hover:bg-[#F4F8F6] flex items-center gap-2 cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-[#5A6762]" />
                                  <span>Edit Unit Type</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleInactive(unit)}
                                  className="w-full px-3.5 py-2 text-[12px] font-medium text-[#17231E] hover:bg-[#F4F8F6] flex items-center gap-2 cursor-pointer"
                                >
                                  <Power className="w-3.5 h-3.5 text-[#5A6762]" />
                                  <span>
                                    {unit.status === 'Inactive'
                                      ? 'Mark as Active'
                                      : 'Mark as Inactive'}
                                  </span>
                                </button>
                                <div className="my-1 border-t border-[#EEF3F0]" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setDeleteTargetUnit(unit);
                                  }}
                                  className="w-full px-3.5 py-2 text-[12px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete Unit Type</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Row Cards (<md) */}
            <div className="md:hidden divide-y divide-[#EEF3F0]">
              {paginatedUnits.map((unit) => {
                const totalCount = Math.max(0, Number(unit.totalCount || 0));
                const occupiedCount = Math.max(0, Number(unit.occupiedCount || 0));
                const vacantCount = Math.max(0, totalCount - occupiedCount);
                const occPct =
                  totalCount > 0
                    ? Math.min(100, Math.round((occupiedCount / totalCount) * 100))
                    : 0;
                const propPrefix = propertyPrefixMap.get(
                  (unit.property || '').trim().toLowerCase()
                );
                const displayStatus = getUnitDisplayStatus(unit);
                const statusBadgeClass = getStatusBadgeClass(displayStatus);
                const barColor =
                  displayStatus === 'Inactive'
                    ? 'bg-[#9CA9A3]'
                    : displayStatus === 'Fully Occupied'
                    ? 'bg-[#D97706]'
                    : 'bg-[#145338]';

                return (
                  <div key={unit.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#EAF4EE] text-[#145338] flex items-center justify-center shrink-0">
                          <BedDouble className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[#17231E] text-[13.5px]">
                              {unit.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#F4F8F6] border border-[#E4ECE8] text-[#5A6762] text-[10px] font-semibold">
                              {VARIANT_LABELS[unit.variant] || unit.variant}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11.5px] text-[#5A6762]">
                            {propPrefix && (
                              <span className="px-1.5 py-0.5 rounded bg-[#17231E] text-[#D5F267] font-mono-num text-[9.5px] font-bold">
                                {propPrefix}
                              </span>
                            )}
                            <span className="font-semibold text-[#17231E]">
                              {unit.property}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10.5px] font-bold shrink-0 ${statusBadgeClass}`}
                      >
                        {displayStatus}
                      </span>
                    </div>

                    {unit.description && (
                      <p className="text-[11.5px] text-[#6E7A75] line-clamp-2">
                        {unit.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 bg-[#F8FAF9] p-3 rounded-xl border border-[#EEF3F0] text-[11.5px]">
                      <div>
                        <span className="text-[10.5px] text-[#7A8681] block">
                          Monthly Rent
                        </span>
                        <strong className="text-[#17231E] text-[13.5px] tabular-nums">
                          KSh {Number(unit.monthlyRent || 0).toLocaleString()}
                          <span className="text-[10.5px] font-normal text-[#7A8681]">/mo</span>
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-[#7A8681] block">
                          Layout &amp; Capacity
                        </span>
                        <strong className="text-[#17231E] tabular-nums">
                          {unit.sizeSqm} m² • Max {unit.maxTenants}
                        </strong>
                        <span className="block text-[10.5px] text-[#6E7A75] truncate">
                          {unit.bedrooms}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11.5px] mb-1 tabular-nums">
                        <span className="font-bold text-[#17231E]">
                          {occupiedCount}/{totalCount} Occupied
                        </span>
                        <span className="text-[#6E7A75]">{vacantCount} vacant</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#EEF3F0] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${occPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setDetailModalUnit(unit)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F8F6] text-[#17231E] text-[11.5px] font-semibold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#145338]" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(unit)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleInactive(unit)}
                        title={
                          unit.status === 'Inactive'
                            ? 'Mark as Active'
                            : 'Mark as Inactive'
                        }
                        className="p-1.5 rounded-lg bg-[#F4F8F6] text-[#5A6762] cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetUnit(unit)}
                        title="Delete Unit Type"
                        className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#FEF2F2] text-[#B91C1C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {filteredUnits.length > itemsPerPage && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-[#EEF3F0] flex items-center justify-between text-[12px] text-[#7A8681]">
            <span className="tabular-nums">
              Showing{' '}
              <strong className="text-[#17231E]">
                {(safePage - 1) * itemsPerPage + 1}–
                {Math.min(safePage * itemsPerPage, filteredUnits.length)}
              </strong>{' '}
              of <strong className="text-[#17231E]">{filteredUnits.length}</strong>{' '}
              unit types
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous page"
                className="w-8 h-8 rounded-lg bg-[#F4F8F6] hover:bg-[#E7ECE9] disabled:opacity-40 flex items-center justify-center text-[#17231E] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 py-1 rounded-lg bg-[#17231E] text-white font-bold tabular-nums text-[11.5px]">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next page"
                className="w-8 h-8 rounded-lg bg-[#F4F8F6] hover:bg-[#E7ECE9] disabled:opacity-40 flex items-center justify-center text-[#17231E] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Unit Features & Amenities Modal */}
      {detailModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4ECE8] space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EEF3F0]">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[17px] font-extrabold text-[#17231E]">
                    {detailModalUnit.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-[#F4F8F6] border border-[#E4ECE8] text-[#5A6762] text-[10.5px] font-semibold">
                    {VARIANT_LABELS[detailModalUnit.variant] || detailModalUnit.variant}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${getStatusBadgeClass(
                      getUnitDisplayStatus(detailModalUnit)
                    )}`}
                  >
                    {getUnitDisplayStatus(detailModalUnit)}
                  </span>
                </div>
                <p className="text-[12px] text-[#6E7A75] mt-1">
                  {detailModalUnit.property} • Occupied:{' '}
                  <strong className="text-[#17231E] tabular-nums">
                    {detailModalUnit.occupiedCount}/{detailModalUnit.totalCount} Units
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalUnit(null)}
                title="Close modal"
                className="p-1.5 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[12px] bg-[#F8FAF9] p-3.5 rounded-xl border border-[#EEF3F0]">
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Floor Area</span>
                <strong className="text-[#17231E] tabular-nums">
                  {detailModalUnit.sizeSqm} m²
                </strong>
              </div>
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Max Capacity</span>
                <strong className="text-[#17231E] tabular-nums">
                  {detailModalUnit.maxTenants}{' '}
                  {detailModalUnit.maxTenants === 1 ? 'Occupant' : 'Occupants'}
                </strong>
              </div>
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Layout</span>
                <strong className="text-[#17231E]">{detailModalUnit.bedrooms}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Monthly Rent</span>
                <strong className="text-[#145338] tabular-nums">
                  KSh {Number(detailModalUnit.monthlyRent || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            {(detailModalUnit.longDescription || detailModalUnit.description) && (
              <p className="text-[12.5px] text-[#5B6B63] leading-relaxed">
                {detailModalUnit.longDescription || detailModalUnit.description}
              </p>
            )}

            {detailModalUnit.features?.length > 0 && (
              <div>
                <h4 className="text-[12.5px] font-bold text-[#17231E] mb-2">
                  Features
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detailModalUnit.features.map((feat, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[11.5px] text-[#46544E]"
                    >
                      <span className="w-4 h-4 rounded-md bg-[#D8F3E5] text-[#145338] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailModalUnit.amenities?.length > 0 && (
              <div className="pt-3 border-t border-[#EEF3F0]">
                <h4 className="text-[12.5px] font-bold text-[#17231E] mb-2">
                  Amenities
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {detailModalUnit.amenities.map((amen, i) => {
                    const Icon = amenityIcons[i % amenityIcons.length];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11.5px] text-[#46544E]"
                      >
                        <Icon className="w-3.5 h-3.5 text-[#6E7A75] shrink-0" />
                        <span className="truncate">{amen}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#EEF3F0] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = detailModalUnit;
                  setDetailModalUnit(null);
                  openEditModal(target);
                }}
                className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold cursor-pointer"
              >
                Edit Unit Type
              </button>
              <button
                type="button"
                onClick={() => setDetailModalUnit(null)}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8] space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-bold text-[#17231E]">
                  Delete Unit Type
                </h3>
                <p className="text-[12px] text-[#6E7A75] mt-1">
                  Remove <strong>{deleteTargetUnit.name}</strong> at{' '}
                  <strong>{deleteTargetUnit.property}</strong>? This action cannot be
                  undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetUnit(null)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetUnit(null)}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-[12px] font-bold cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Unit Type'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Unit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveModal}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4ECE8]"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#EEF3F0]">
              <div>
                <h3 className="text-[16px] font-bold text-[#17231E]">
                  {modalMode === 'add'
                    ? 'Add New Rental Unit Type'
                    : 'Edit Rental Unit Type'}
                </h3>
                <p className="text-[11.5px] text-[#7A8681] mt-0.5">
                  Configure unit tier pricing, floor capacity, and active availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setEditingUnit(null);
                  setFormError(null);
                }}
                className="p-1.5 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[12px] font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[12px]">
              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Unit Type Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Deluxe, Standard, Suite"
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Property Name
                </label>
                <input
                  type="text"
                  required
                  list="units-property-list"
                  value={formProperty}
                  onChange={(e) => setFormProperty(e.target.value)}
                  placeholder="Select or enter property name"
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
                <datalist id="units-property-list">
                  {properties.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Unit Category
                </label>
                <select
                  value={formVariant}
                  onChange={(e) =>
                    setFormVariant(e.target.value as UnitTypeItem['variant'])
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                >
                  <option value="standard">Standard 1BR</option>
                  <option value="deluxe">Deluxe 2BR</option>
                  <option value="suite">Executive Suite</option>
                  <option value="family">Family Residence</option>
                  <option value="single">Studio / Single</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Monthly Rent (KSh)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formRent}
                  onChange={(e) => setFormRent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Floor Area (m²)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formSize}
                  onChange={(e) => setFormSize(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Max Occupants
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formMaxTenants}
                  onChange={(e) => setFormMaxTenants(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Occupied Units
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formOccupiedUnits}
                  onChange={(e) => setFormOccupiedUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Total Units in Tier
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formTotalUnits}
                  onChange={(e) => setFormTotalUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Bed &amp; Bath Configuration
                </label>
                <input
                  type="text"
                  value={formBedrooms}
                  onChange={(e) => setFormBedrooms(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Tier Availability Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) =>
                    setFormStatus(e.target.value as 'Available' | 'Inactive')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                >
                  <option value="Available">
                    Active (Auto Available / Fully Occupied)
                  </option>
                  <option value="Inactive">Inactive (Disabled)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Describe layout, finishes, and included utilities..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setEditingUnit(null);
                  setFormError(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755] cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Unit Type'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
