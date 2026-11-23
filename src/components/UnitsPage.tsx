import React, { useState, useEffect, useMemo } from 'react';
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
    'popular' | 'price-asc' | 'price-desc' | 'vacant-desc'
  >('popular');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setLocalSearch(globalSearch || '');
    setCurrentPage(1);
  }, [globalSearch]);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    onGlobalSearchChange?.(val);
    setCurrentPage(1);
  };

  // Modals state
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitTypeItem | null>(null);
  const [detailModalUnit, setDetailModalUnit] = useState<UnitTypeItem | null>(null);
  const [deleteTargetUnit, setDeleteTargetUnit] = useState<UnitTypeItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Unique property & type filter options
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

  const filteredUnits = useMemo(() => {
    return unitTypes
      .filter((u) => {
        const matchesProperty =
          propertyFilter === 'All' ||
          u.property.trim().toLowerCase() === propertyFilter.trim().toLowerCase();
        const matchesType =
          typeFilter === 'All' ||
          u.name.trim().toLowerCase() === typeFilter.trim().toLowerCase();
        const matchesQuery =
          !query ||
          u.name.toLowerCase().includes(query) ||
          u.property.toLowerCase().includes(query) ||
          u.description.toLowerCase().includes(query) ||
          (u.bedrooms || '').toLowerCase().includes(query) ||
          (u.variant || '').toLowerCase().includes(query) ||
          (u.status || '').toLowerCase().includes(query) ||
          String(u.monthlyRent || '').includes(query) ||
          String(u.sizeSqm || '').includes(query);
        return matchesProperty && matchesType && matchesQuery;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.monthlyRent - b.monthlyRent;
        if (sortBy === 'price-desc') return b.monthlyRent - a.monthlyRent;
        if (sortBy === 'vacant-desc') {
          const vacA = Math.max(0, Number(a.totalCount || 0) - Number(a.occupiedCount || 0));
          const vacB = Math.max(0, Number(b.totalCount || 0) - Number(b.occupiedCount || 0));
          return vacB - vacA;
        }
        return 0;
      });
  }, [unitTypes, propertyFilter, typeFilter, query, sortBy]);

  const totalPages = Math.ceil(filteredUnits.length / itemsPerPage) || 1;
  const paginatedUnits = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * itemsPerPage;
    return filteredUnits.slice(start, start + itemsPerPage);
  }, [filteredUnits, currentPage, totalPages]);

  const inventoryStats = useMemo(() => {
    const totalUnitsCount = filteredUnits.reduce(
      (sum, u) => sum + Number(u.totalCount || 0),
      0
    );
    const occupiedUnitsCount = filteredUnits.reduce(
      (sum, u) => sum + Number(u.occupiedCount || 0),
      0
    );
    const vacantUnitsCount = Math.max(0, totalUnitsCount - occupiedUnitsCount);
    const avgRent =
      filteredUnits.length > 0
        ? Math.round(
            filteredUnits.reduce((sum, u) => sum + Number(u.monthlyRent || 0), 0) /
              filteredUnits.length
          )
        : 0;
    return {
      totalUnitsCount,
      occupiedUnitsCount,
      vacantUnitsCount,
      avgRent,
    };
  }, [filteredUnits]);

  const openAddModal = () => {
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
    setFormDesc('');
    setModalMode('add');
  };

  const openEditModal = (unit: UnitTypeItem) => {
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
    setFormDesc(unit.description);
    setModalMode('edit');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formProperty.trim()) return;
    setSaving(true);
    try {
      const descText =
        formDesc.trim() ||
        `${formName.trim()} residential unit (${formSize} m², ${formBedrooms}) at ${formProperty.trim()}.`;

      if (modalMode === 'add') {
        await onAddUnitType({
          name: formName.trim(),
          property: formProperty.trim(),
          variant: formVariant,
          sizeSqm: Number(formSize),
          bedrooms: formBedrooms,
          maxTenants: Number(formMaxTenants),
          occupiedCount: Number(formOccupiedUnits),
          totalCount: Number(formTotalUnits),
          monthlyRent: Number(formRent),
          description: descText,
          longDescription: descText,
        });
      } else if (modalMode === 'edit' && editingUnit) {
        await onUpdateUnitType(editingUnit.id, {
          name: formName.trim(),
          property: formProperty.trim(),
          variant: formVariant,
          sizeSqm: Number(formSize),
          bedrooms: formBedrooms,
          maxTenants: Number(formMaxTenants),
          occupiedCount: Number(formOccupiedUnits),
          totalCount: Number(formTotalUnits),
          monthlyRent: Number(formRent),
          description: descText,
        });
      }
      setModalMode(null);
      setEditingUnit(null);
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
    <div className="space-y-4">
      {/* Main Full-Width Row Directory Container */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7ECE9] shadow-xs">
        {/* Header & Summary Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#EEF3F0]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[18px] font-bold text-[#17231E] tracking-tight">
                Unit Types &amp; Inventory
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F4F8F6] border border-[#E4ECE8] text-[#5A6762] text-[11px] font-bold tabular-nums">
                {filteredUnits.length} of {unitTypes.length} Tiers
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] text-[#6E7A75] tabular-nums">
              <span>
                Total Units:{' '}
                <strong className="text-[#17231E]">
                  <AnimatedCounter value={inventoryStats.totalUnitsCount} />
                </strong>
              </span>
              <span className="text-[#CBD5D0]">•</span>
              <span>
                Occupied:{' '}
                <strong className="text-[#145338]">
                  <AnimatedCounter value={inventoryStats.occupiedUnitsCount} />
                </strong>
              </span>
              <span className="text-[#CBD5D0]">•</span>
              <span>
                Vacant:{' '}
                <strong className="text-[#17231E]">
                  <AnimatedCounter value={inventoryStats.vacantUnitsCount} />
                </strong>
              </span>
              <span className="text-[#CBD5D0]">•</span>
              <span>
                Avg Rent:{' '}
                <strong className="text-[#17231E]">
                  <AnimatedCounter value={inventoryStats.avgRent} prefix="KSh " />
                </strong>
              </span>
            </div>
          </div>

          {/* Search, Filters & Add Button */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="w-4 h-4 text-[#88948F] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search unit type, property, rent..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
              />
              {localSearch && (
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
                value={propertyFilter}
                onChange={(e) => {
                  setPropertyFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
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

            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
              >
                <option value="All">All Types</option>
                {typeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] border border-[#E7ECE9] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
              >
                <option value="popular">Sort: Default</option>
                <option value="price-asc">Rent: Low to High</option>
                <option value="price-desc">Rent: High to Low</option>
                <option value="vacant-desc">Most Vacant</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Unit
            </button>
          </div>
        </div>

        {/* Full-Width Row Table */}
        {filteredUnits.length === 0 ? (
          <div className="py-14 mt-4 text-center rounded-2xl bg-[#F8FAF9] border border-dashed border-[#E4ECE8]">
            <Layers className="w-9 h-9 text-[#88948F] mx-auto mb-2.5 opacity-60" />
            <p className="text-[13.5px] font-bold text-[#17231E] mb-1">
              {unitTypes.length === 0
                ? 'No rental unit types configured yet'
                : 'No unit types match your filters'}
            </p>
            <p className="text-[12px] text-[#7A8681] mb-4">
              {unitTypes.length === 0
                ? 'Add your first unit tier to manage unit pricing, size, and occupancy.'
                : 'Try adjusting your search or property/type filter.'}
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Unit Type
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EEF4F1] text-[#6E7A75] text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-3.5 rounded-l-xl">Unit Type</th>
                  <th className="py-3 px-3.5">Property</th>
                  <th className="py-3 px-3.5">Layout &amp; Capacity</th>
                  <th className="py-3 px-3.5">Occupancy</th>
                  <th className="py-3 px-3.5">Monthly Rent</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 rounded-r-xl text-right">Actions</th>
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
                  const isFull = totalCount > 0 && vacantCount === 0;
                  const statusLabel = isFull ? 'Full' : unit.status || 'Available';
                  const statusClass =
                    statusLabel === 'Available'
                      ? 'bg-[#D8F3E5] text-[#145338]'
                      : statusLabel === 'Full'
                      ? 'bg-[#FEF3C7] text-[#92400E]'
                      : 'bg-[#E5F69C] text-[#3B5214]';

                  return (
                    <tr
                      key={unit.id}
                      className="hover:bg-[#F8FBF9] transition-colors group"
                    >
                      {/* Unit Type */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#EAF4EE] text-[#145338] flex items-center justify-center shrink-0">
                            <BedDouble className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#17231E] text-[13.5px]">
                                {unit.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-[#F4F8F6] border border-[#E4ECE8] text-[#5A6762] text-[10px] font-semibold">
                                {VARIANT_LABELS[unit.variant] || unit.variant}
                              </span>
                            </div>
                            {unit.description && (
                              <p className="text-[11px] text-[#7A8681] truncate max-w-[260px] mt-0.5">
                                {unit.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Property */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {propPrefix && (
                            <span className="px-1.5 py-0.5 rounded bg-[#17231E] text-[#D5F267] font-mono-num text-[10px] font-bold">
                              {propPrefix}
                            </span>
                          )}
                          <span className="font-semibold text-[#17231E] flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#7A8681]" />
                            {unit.property}
                          </span>
                        </div>
                      </td>

                      {/* Layout & Capacity */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#46544E] tabular-nums">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Maximize2 className="w-3 h-3 text-[#7A8681]" />
                            {unit.sizeSqm} m²
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <BedDouble className="w-3 h-3 text-[#7A8681]" />
                            {unit.bedrooms}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#7A8681]" />
                            Max {unit.maxTenants}
                          </span>
                        </div>
                      </td>

                      {/* Occupancy */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap tabular-nums">
                        <div className="w-36">
                          <div className="flex items-center justify-between text-[11.5px] mb-1">
                            <span className="font-bold text-[#17231E]">
                              {occupiedCount}/{totalCount} Occupied
                            </span>
                            <span className="text-[10.5px] text-[#7A8681]">
                              {vacantCount} free
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#EEF3F0] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#145338] transition-all"
                              style={{ width: `${occPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Monthly Rent */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap tabular-nums">
                        <span className="text-[14px] font-extrabold text-[#17231E]">
                          KSh {Number(unit.monthlyRent || 0).toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[#88948F]">/mo</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailModalUnit(unit)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#EAF4EE] text-[#17231E] text-[11.5px] font-semibold cursor-pointer transition-colors"
                            title="View Unit Features & Amenities"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#145338]" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(unit)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11.5px] font-bold cursor-pointer transition-colors"
                            title="Edit Unit Type"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTargetUnit(unit)}
                            className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#FDE6E6] text-[#7A8681] hover:text-[#B91C1C] cursor-pointer transition-colors"
                            title="Delete Unit Type"
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

        {/* Pagination */}
        {filteredUnits.length > itemsPerPage && (
          <div className="mt-4 pt-4 border-t border-[#EEF3F0] flex items-center justify-between text-[12px] text-[#7A8681]">
            <span className="tabular-nums">
              Showing{' '}
              <strong className="text-[#17231E]">
                {(Math.min(currentPage, totalPages) - 1) * itemsPerPage + 1}–
                {Math.min(
                  Math.min(currentPage, totalPages) * itemsPerPage,
                  filteredUnits.length
                )}
              </strong>{' '}
              of <strong className="text-[#17231E]">{filteredUnits.length}</strong>{' '}
              unit types
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-lg bg-[#F4F8F6] hover:bg-[#E7ECE9] disabled:opacity-40 flex items-center justify-center text-[#17231E] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 py-1 rounded-lg bg-[#17231E] text-white font-bold tabular-nums text-[11.5px]">
                {Math.min(currentPage, totalPages)} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="w-8 h-8 rounded-lg bg-[#F4F8F6] hover:bg-[#E7ECE9] disabled:opacity-40 flex items-center justify-center text-[#17231E] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* On-Demand Unit Features & Amenities Modal */}
      {detailModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4ECE8] space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EEF3F0]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] font-extrabold text-[#17231E]">
                    {detailModalUnit.name} Unit
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                      detailModalUnit.status === 'Available'
                        ? 'bg-[#D8F3E5] text-[#145338]'
                        : 'bg-[#E5F69C] text-[#3B5214]'
                    }`}
                  >
                    {detailModalUnit.status}
                  </span>
                </div>
                <p className="text-[12px] text-[#6E7A75] mt-0.5">
                  {detailModalUnit.property} • Occupied:{' '}
                  <strong className="text-[#17231E] tabular-nums">
                    {detailModalUnit.occupiedCount}/{detailModalUnit.totalCount} Units
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalUnit(null)}
                className="p-1.5 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-[12px] bg-[#F8FAF9] p-3 rounded-xl border border-[#EEF3F0]">
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Floor Area</span>
                <strong className="text-[#17231E] tabular-nums">
                  {detailModalUnit.sizeSqm} m²
                </strong>
              </div>
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Configuration</span>
                <strong className="text-[#17231E]">{detailModalUnit.bedrooms}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-[#7A8681] block">Monthly Rent</span>
                <strong className="text-[#145338] tabular-nums">
                  KSh {Number(detailModalUnit.monthlyRent || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            {detailModalUnit.longDescription && (
              <p className="text-[12px] text-[#5B6B63] leading-relaxed">
                {detailModalUnit.longDescription}
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#17231E]">
                {modalMode === 'add'
                  ? 'Add New Rental Unit Type'
                  : 'Edit Rental Unit Type'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setEditingUnit(null);
                }}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
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
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none"
                />
                <datalist id="units-property-list">
                  {properties.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Visual Layout Style
                </label>
                <select
                  value={formVariant}
                  onChange={(e) =>
                    setFormVariant(e.target.value as UnitTypeItem['variant'])
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
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
                  required
                  value={formRent}
                  onChange={(e) => setFormRent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Floor Area (m²)
                </label>
                <input
                  type="number"
                  required
                  value={formSize}
                  onChange={(e) => setFormSize(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
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
                  required
                  value={formOccupiedUnits}
                  onChange={(e) => setFormOccupiedUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Total Units in Tier
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formTotalUnits}
                  onChange={(e) => setFormTotalUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] tabular-nums"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Bed &amp; Bath Configuration
                </label>
                <input
                  type="text"
                  value={formBedrooms}
                  onChange={(e) => setFormBedrooms(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
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
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setEditingUnit(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755] cursor-pointer"
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
