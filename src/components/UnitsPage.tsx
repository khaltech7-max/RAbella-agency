import React, { useState } from 'react';
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
  Sparkles,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import { UnitTypeItem, PropertyRecord } from '../data/rentalData';
import { UnitIllustration } from './UnitIllustration';

interface UnitsPageProps {
  unitTypes: UnitTypeItem[];
  properties: PropertyRecord[];
  onAddUnitType: (unit: Partial<UnitTypeItem>) => Promise<void>;
  onUpdateUnitType: (id: string, unit: Partial<UnitTypeItem>) => Promise<void>;
  onDeleteUnitType: (id: string) => Promise<void>;
  globalSearch: string;
}

export const UnitsPage: React.FC<UnitsPageProps> = ({
  unitTypes,
  properties,
  onAddUnitType,
  onUpdateUnitType,
  onDeleteUnitType,
  globalSearch,
}) => {
  const [selectedId, setSelectedId] = useState<string>(unitTypes[0]?.id || '');
  const [localSearch, setLocalSearch] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'price-asc' | 'price-desc'>(
    'popular'
  );
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [activeThumb, setActiveThumb] = useState<
    'main' | 'kitchen' | 'bath' | 'balcony'
  >('main');
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
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

  const query = (localSearch || globalSearch).trim().toLowerCase();

  const filteredUnits = unitTypes
    .filter((u) => {
      const matchesType = typeFilter === 'All' || u.name === typeFilter;
      const matchesQuery =
        !query ||
        u.name.toLowerCase().includes(query) ||
        u.property.toLowerCase().includes(query) ||
        u.description.toLowerCase().includes(query);
      return matchesType && matchesQuery;
    })
    .sort((a, b) => {
      if (sortBy === 'price-asc') return a.monthlyRent - b.monthlyRent;
      if (sortBy === 'price-desc') return b.monthlyRent - a.monthlyRent;
      return 0;
    });

  const selectedUnit =
    unitTypes.find((u) => u.id === selectedId) ||
    filteredUnits[0] ||
    unitTypes[0];

  const openAddModal = () => {
    setFormName('');
    setFormProperty(properties[0]?.name || '');
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

  const openEditModal = () => {
    if (!selectedUnit) return;
    setFormName(selectedUnit.name);
    setFormProperty(selectedUnit.property);
    setFormVariant(selectedUnit.variant);
    setFormSize(selectedUnit.sizeSqm);
    setFormBedrooms(selectedUnit.bedrooms);
    setFormMaxTenants(selectedUnit.maxTenants);
    setFormRent(selectedUnit.monthlyRent);
    setFormTotalUnits(selectedUnit.totalCount);
    setFormOccupiedUnits(selectedUnit.occupiedCount);
    setFormDesc(selectedUnit.description);
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
      } else if (modalMode === 'edit' && selectedUnit) {
        await onUpdateUnitType(selectedUnit.id, {
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
    } finally {
      setSaving(false);
    }
  };

  const amenityIcons = [Wifi, Wind, Coffee, Tv, Car, ShieldCheck];

  return (
    <div className="bg-white rounded-2xl p-5">
      {/* Top Filter & Action Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#88948F] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search unit type, property, etc."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F4F8F6] text-[12.5px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11.5px] text-[#7A8681]">Sort by:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
            >
              <option value="popular">Popular</option>
              <option value="price-asc">Rent: Low to High</option>
              <option value="price-desc">Rent: High to Low</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
            >
              <option value="All">All Type</option>
              {unitTypes.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#5A6762] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[12px] font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Unit
          </button>
        </div>
      </div>

      {/* Main 2-Column Split */}
      {filteredUnits.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-[13px] text-[#7A8681] mb-3">
            {unitTypes.length === 0
              ? 'No rental unit types configured in the database yet.'
              : 'No unit types match your search filter.'}
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add First Unit Type
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 7 Columns: Unit List Cards */}
          <div className="lg:col-span-7 space-y-3.5">
            {filteredUnits.map((unit) => {
              const isSelected = selectedUnit?.id === unit.id;
              const statusClass =
                unit.status === 'Available'
                  ? 'bg-[#D8F3E5] text-[#145338]'
                  : 'bg-[#E5F69C] text-[#3B5214]';

              return (
                <div
                  key={unit.id}
                  onClick={() => {
                    setSelectedId(unit.id);
                    setActiveThumb('main');
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row gap-4 ${
                    isSelected
                      ? 'bg-[#F8FBF9] border-[#BCEAD2] shadow-xs'
                      : 'bg-white border-[#E8EFEA] hover:border-[#CBE2D6]'
                  }`}
                >
                  <div className="w-full sm:w-44 h-32 rounded-xl overflow-hidden shrink-0 bg-[#E6ECE9]">
                    <UnitIllustration
                      variant={unit.variant}
                      className="w-full h-full"
                    />
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-[16px] font-bold text-[#17231E] leading-snug">
                            {unit.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6E7A75] mt-1">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Maximize2 className="w-3 h-3" /> {unit.sizeSqm} m²
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <BedDouble className="w-3 h-3" /> {unit.bedrooms}
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Users className="w-3 h-3" /> {unit.maxTenants}{' '}
                              tenants
                            </span>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold shrink-0 ${statusClass}`}
                        >
                          {unit.status}
                        </span>
                      </div>

                      <p className="text-[11.5px] text-[#6E7A75] mt-2.5 line-clamp-2 leading-relaxed">
                        {unit.description}
                      </p>
                    </div>

                    <div className="flex items-baseline justify-between pt-3 mt-2 border-t border-[#EEF3F0]">
                      <span className="text-[11.5px] text-[#6E7A75]">
                        Availability:{' '}
                        <strong className="text-[#17231E] tabular-nums">
                          {unit.occupiedCount}/{unit.totalCount} Units
                        </strong>{' '}
                        <span className="text-[#88948F]">• {unit.property}</span>
                      </span>
                      <div className="text-right">
                        <span className="text-[17px] font-extrabold text-[#17231E] tabular-nums">
                          KSh {unit.monthlyRent.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[#88948F]">/mo</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 5 Columns: Sticky Unit Detail Panel */}
          {selectedUnit && (
            <div className="lg:col-span-5 rounded-2xl border border-[#E8EFEA] bg-[#FBFDFC] p-5 lg:sticky lg:top-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-bold text-[#17231E]">
                  Unit Detail
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openEditModal}
                    className="px-3.5 py-1 rounded-lg bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11.5px] font-bold transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteUnitType(selectedUnit.id)}
                    className="p-1.5 rounded-lg bg-[#FDE6E6] hover:bg-[#fbd5d5] text-[#B91C1C] transition-colors cursor-pointer"
                    title="Delete Unit Type"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <h2 className="text-[20px] font-extrabold text-[#17231E]">
                  {selectedUnit.name} Unit
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold ${
                    selectedUnit.status === 'Available'
                      ? 'bg-[#D8F3E5] text-[#145338]'
                      : 'bg-[#E5F69C] text-[#3B5214]'
                  }`}
                >
                  {selectedUnit.status}
                </span>
              </div>
              <p className="text-[11.5px] text-[#6E7A75] mt-1 tabular-nums">
                Occupied:{' '}
                <strong className="text-[#17231E]">
                  {selectedUnit.occupiedCount}/{selectedUnit.totalCount} Units
                </strong>{' '}
                • {selectedUnit.property}
              </p>

              {/* Gallery Grid */}
              <div className="grid grid-cols-12 gap-2.5 mt-4">
                <div className="col-span-9 h-48 rounded-2xl overflow-hidden bg-[#E6ECE9]">
                  <UnitIllustration
                    variant={
                      activeThumb === 'main' ? selectedUnit.variant : activeThumb
                    }
                    className="w-full h-full"
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-2 h-48">
                  <button
                    onClick={() => setActiveThumb('main')}
                    className={`flex-1 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      activeThumb === 'main'
                        ? 'border-[#17231E]'
                        : 'border-transparent'
                    }`}
                  >
                    <UnitIllustration
                      variant={selectedUnit.variant}
                      className="w-full h-full"
                    />
                  </button>
                  <button
                    onClick={() => setActiveThumb('kitchen')}
                    className={`flex-1 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      activeThumb === 'kitchen'
                        ? 'border-[#17231E]'
                        : 'border-transparent'
                    }`}
                  >
                    <UnitIllustration variant="kitchen" className="w-full h-full" />
                  </button>
                  <button
                    onClick={() => setActiveThumb('balcony')}
                    className={`relative flex-1 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      activeThumb === 'balcony'
                        ? 'border-[#17231E]'
                        : 'border-transparent'
                    }`}
                  >
                    <UnitIllustration variant="balcony" className="w-full h-full" />
                    <span className="absolute inset-0 bg-[#D5F267]/85 flex items-center justify-center text-[10px] font-extrabold text-[#17231E]">
                      View All
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-[#5B6B63] mt-4 pb-3 border-b border-[#EEF3F0]">
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Maximize2 className="w-3.5 h-3.5 text-[#76827D]" />
                  {selectedUnit.sizeSqm} m²
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5 text-[#76827D]" />
                  {selectedUnit.bedrooms}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Users className="w-3.5 h-3.5 text-[#76827D]" />
                  {selectedUnit.maxTenants} tenants
                </span>
              </div>

              <p className="text-[11.5px] text-[#5B6B63] mt-3 leading-relaxed">
                {selectedUnit.longDescription}
              </p>

              {/* Features Section */}
              {selectedUnit.features.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-[12.5px] font-bold text-[#17231E] mb-2.5">
                    Features
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedUnit.features.map((feat, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[11px] text-[#46544E]"
                      >
                        <span className="w-4 h-4 rounded-md bg-[#D8F3E5] text-[#145338] flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                        <span className="leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amenities Section */}
              {selectedUnit.amenities.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#EEF3F0]">
                  <h4 className="text-[12.5px] font-bold text-[#17231E] mb-2.5">
                    Amenities
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    {selectedUnit.amenities.map((amen, i) => {
                      const Icon = amenityIcons[i % amenityIcons.length];
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[11px] text-[#46544E]"
                        >
                          <Icon className="w-3.5 h-3.5 text-[#6E7A75] shrink-0" />
                          <span className="truncate">{amen}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
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
                onClick={() => setModalMode(null)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
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
                  Bed & Bath Configuration
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
                onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] text-[12px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold hover:bg-[#c8e755]"
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
