import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Upload,
  Image as ImageIcon,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  AlertTriangle,
  FolderOpen,
  Users,
  Layers,
  ArrowUpDown,
  Home,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  PropertyRecord,
  PropertyImageItem,
  NavPageId,
  TenantProfile,
  UnitTypeItem,
} from '../data/rentalData';
import { rentalApi } from '../lib/apiClient';

interface PropertiesPageProps {
  properties: PropertyRecord[];
  tenants?: TenantProfile[];
  unitTypes?: UnitTypeItem[];
  onAddProperty: (data: Partial<PropertyRecord>) => Promise<void>;
  onUpdateProperty?: (id: string, data: Partial<PropertyRecord>) => Promise<void>;
  onDeleteProperty: (id: string) => Promise<void>;
  onNavigate: (page: NavPageId) => void;
  globalSearch?: string;
}

interface StagedImageItem {
  id: string;
  imageUrl: string;
  fileBase64?: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  isCover: boolean;
  caption?: string;
  isExisting?: boolean;
}

export const PropertiesPage: React.FC<PropertiesPageProps> = ({
  properties,
  tenants = [],
  unitTypes = [],
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onNavigate,
  globalSearch = '',
}) => {
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState(globalSearch);
  const [selectedPrefixFilter, setSelectedPrefixFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyRecord | null>(null);
  const [viewingProperty, setViewingProperty] = useState<PropertyRecord | null>(null);
  const [deleteConfirmProperty, setDeleteConfirmProperty] = useState<PropertyRecord | null>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formPrefix, setFormPrefix] = useState('A');
  const [formAddress, setFormAddress] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<PropertyRecord['status']>('Active');
  const [formVariant, setFormVariant] = useState<PropertyRecord['variant']>('deluxe');
  const [formTotalUnits, setFormTotalUnits] = useState(24);
  const [formOccupiedUnits, setFormOccupiedUnits] = useState(0);
  const [formMonthlyRevenue, setFormMonthlyRevenue] = useState(840000);
  const [formManager, setFormManager] = useState('Property Manager');
  const [stagedImages, setStagedImages] = useState<StagedImageItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync globalSearch prop when changed externally
  useEffect(() => {
    if (globalSearch) {
      setSearchTerm(globalSearch);
    }
  }, [globalSearch]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev + 1) % (lightboxImages.length || 1));
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % (lightboxImages.length || 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxImages.length]);

  // Calculate live portfolio metrics
  const totalDoors = useMemo(
    () => properties.reduce((s, p) => s + Number(p.totalUnits || 0), 0),
    [properties]
  );
  const totalOccupied = useMemo(
    () => properties.reduce((s, p) => s + Number(p.occupiedUnits || 0), 0),
    [properties]
  );
  const totalRentRoll = useMemo(
    () => properties.reduce((s, p) => s + Number(p.monthlyRevenue || 0), 0),
    [properties]
  );
  const overallOccupancyPct = useMemo(
    () => (totalDoors > 0 ? ((totalOccupied / totalDoors) * 100).toFixed(1) : '0.0'),
    [totalDoors, totalOccupied]
  );

  // Dynamic set of all prefixes in the current portfolio
  const availablePrefixes = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      const pref = String(p.codePrefix || p.name[0] || '').trim().toUpperCase();
      if (/^[A-Z]$/.test(pref)) {
        set.add(pref);
      }
    }
    return Array.from(set).sort();
  }, [properties]);

  // Group properties alphabetically by prefix (dynamic, never hardcoded)
  const groupedProperties = useMemo(() => {
    const groups: Record<string, PropertyRecord[]> = {};

    // Filter by search and status first
    const filtered = properties.filter((p) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.propertyCode && p.propertyCode.toLowerCase().includes(term)) ||
        p.codePrefix.toLowerCase().includes(term) ||
        p.address.toLowerCase().includes(term) ||
        p.manager.toLowerCase().includes(term);

      const matchesStatus =
        selectedStatusFilter === 'ALL' ||
        (p.status || 'Active').toLowerCase() === selectedStatusFilter.toLowerCase();

      const pref = String(p.codePrefix || p.name[0] || '').trim().toUpperCase();
      const matchesPrefix =
        selectedPrefixFilter === 'ALL' ||
        pref === selectedPrefixFilter ||
        (selectedPrefixFilter === 'OTHER' && !/^[A-Z]$/.test(pref));

      return matchesSearch && matchesStatus && matchesPrefix;
    });

    for (const p of filtered) {
      const pref = String(p.codePrefix || p.name[0] || '').trim().toUpperCase();
      const groupKey = /^[A-Z]$/.test(pref) ? pref : 'OTHER';
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(p);
    }

    // Sort property items within each group numerically / alphabetically by property code or name
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const codeA = a.propertyCode || a.name;
        const codeB = b.propertyCode || b.name;
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    // Return sorted keys: A, B, C... followed by OTHER at the end
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'OTHER') return 1;
      if (b === 'OTHER') return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => ({
      prefix: key,
      title: key === 'OTHER' ? 'Other Properties' : `${key} — Properties`,
      properties: groups[key],
    }));
  }, [properties, searchTerm, selectedPrefixFilter, selectedStatusFilter]);

  const toggleGroupCollapse = (prefix: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [prefix]: !prev[prefix],
    }));
  };

  // Open Add Property modal
  const openAddModal = () => {
    setEditingProperty(null);
    setFormError(null);
    setFormName('');
    const used = new Set(properties.map((p) => String(p.codePrefix || '').toUpperCase()));
    const nextPrefix =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) || 'A';
    setFormPrefix(nextPrefix);
    setFormCode(`${nextPrefix}-001`);
    setFormAddress('');
    setFormDescription('');
    setFormStatus('Active');
    setFormVariant('deluxe');
    setFormTotalUnits(24);
    setFormOccupiedUnits(0);
    setFormMonthlyRevenue(840000);
    setFormManager('Property Manager');
    setStagedImages([]);
    setIsAddEditModalOpen(true);
  };

  // Open Edit Property modal
  const openEditModal = (prop: PropertyRecord) => {
    setEditingProperty(prop);
    setFormError(null);
    setFormName(prop.name);
    setFormPrefix(prop.codePrefix || 'A');
    setFormCode(prop.propertyCode || `${prop.codePrefix || 'A'}-001`);
    setFormAddress(prop.address);
    setFormDescription(prop.description || '');
    setFormStatus(prop.status || 'Active');
    setFormVariant(prop.variant || 'deluxe');
    setFormTotalUnits(prop.totalUnits);
    setFormOccupiedUnits(prop.occupiedUnits);
    setFormMonthlyRevenue(prop.monthlyRevenue);
    setFormManager(prop.manager);

    const existingImages: StagedImageItem[] = (prop.images || []).map((img, idx) => ({
      id: img.id || `img_${idx}`,
      imageUrl: img.imageUrl,
      isCover: Boolean(img.isCover),
      caption: img.caption || '',
      isExisting: true,
    }));

    if (existingImages.length === 0 && prop.coverImageUrl) {
      existingImages.push({
        id: `cover_${Date.now()}`,
        imageUrl: prop.coverImageUrl,
        isCover: true,
        caption: 'Cover Image',
        isExisting: true,
      });
    }

    setStagedImages(existingImages);
    setIsAddEditModalOpen(true);
  };

  // Open Detail modal
  const openDetailModal = (prop: PropertyRecord) => {
    setViewingProperty(prop);
  };

  // Launch Fullscreen Lightbox
  const openLightbox = (images: string[], startIndex = 0) => {
    if (images.length === 0) return;
    setLightboxImages(images);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  };

  // Handle image files selection (supports multiple, max 10 images, max 5MB each, JPG/PNG/WEBP)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (stagedImages.length + files.length > 10) {
      setFormError('You can upload a maximum of 10 pictures per property.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploadingFiles(true);
    setFormError(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const newItems: StagedImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!allowedTypes.includes(file.type.toLowerCase())) {
        setFormError(`File "${file.name}" is not a supported format. Please select JPG, PNG, or WebP.`);
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        setFormError(`File "${file.name}" exceeds the 5MB size limit. Please choose a smaller image.`);
        continue;
      }

      try {
        const { base64, contentType, byteSize } = await compressImageFile(file);
        const hasCover = stagedImages.some((img) => img.isCover) || newItems.some((img) => img.isCover);

        newItems.push({
          id: `staged_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          imageUrl: base64,
          fileBase64: base64,
          fileName: file.name,
          contentType,
          fileSize: byteSize,
          isCover: !hasCover && newItems.length === 0,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          isExisting: false,
        });
      } catch (err: any) {
        setFormError(`Failed to process "${file.name}": ${err?.message || 'Read error'}`);
      }
    }

    setStagedImages((prev) => [...prev, ...newItems]);
    setIsUploadingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const compressImageFile = async (
    file: File
  ): Promise<{ base64: string; contentType: string; byteSize: number }> => {
    const rawBase64 = await readFileAsBase64(file);
    if (file.size <= 350 * 1024) {
      return { base64: rawBase64, contentType: file.type, byteSize: file.size };
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIMENSION = 1600;
          let { width, height } = img;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width >= height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ base64: rawBase64, contentType: file.type, byteSize: file.size });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
          const compressedBase64 = canvas.toDataURL(outputType, 0.82);
          const estimatedBytes = Math.round((compressedBase64.length * 3) / 4);
          if (estimatedBytes < file.size) {
            resolve({ base64: compressedBase64, contentType: outputType, byteSize: estimatedBytes });
          } else {
            resolve({ base64: rawBase64, contentType: file.type, byteSize: file.size });
          }
        } catch {
          resolve({ base64: rawBase64, contentType: file.type, byteSize: file.size });
        }
      };
      img.onerror = () => {
        resolve({ base64: rawBase64, contentType: file.type, byteSize: file.size });
      };
      img.src = rawBase64;
    });
  };

  // Set an image as cover in staging
  const handleSetCover = (id: string) => {
    setStagedImages((prev) =>
      prev.map((img) => ({
        ...img,
        isCover: img.id === id,
      }))
    );
  };

  // Remove an image from staging
  const handleRemoveImage = (id: string) => {
    setStagedImages((prev) => {
      const updated = prev.filter((img) => img.id !== id);
      if (updated.length > 0 && !updated.some((img) => img.isCover)) {
        updated[0].isCover = true;
      }
      return updated;
    });
  };

  // Save Property (Add or Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Property name is required.');
      return;
    }
    if (!formAddress.trim()) {
      setFormError('Street address is required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const coverItem = stagedImages.find((img) => img.isCover) || stagedImages[0];
      const chosenCover = coverItem?.fileBase64 ? '' : (coverItem?.imageUrl || '');
      const formattedPrefix = formPrefix.trim().toUpperCase().slice(0, 1) || 'A';
      const formattedCode = formCode.trim() || `${formattedPrefix}-001`;

      const payload: Partial<PropertyRecord> & { images?: any[] } = {
        name: formName.trim(),
        propertyCode: formattedCode,
        codePrefix: formattedPrefix,
        address: formAddress.trim(),
        description: formDescription.trim(),
        status: formStatus,
        variant: formVariant,
        totalUnits: Number(formTotalUnits) || 24,
        occupiedUnits: Number(formOccupiedUnits) || 0,
        monthlyRevenue: Number(formMonthlyRevenue) || 0,
        manager: formManager.trim() || 'Property Manager',
        coverImageUrl: chosenCover,
        images: stagedImages.map((img, idx) => ({
          id: img.id,
          propertyId: editingProperty?.id || '',
          imageUrl: img.fileBase64 ? '' : img.imageUrl,
          fileBase64: img.fileBase64,
          fileName: img.fileName,
          contentType: img.contentType,
          isCover: img.isCover,
          displayOrder: idx,
          caption: img.caption,
        })),
      };

      if (editingProperty && onUpdateProperty) {
        await onUpdateProperty(editingProperty.id, payload);
      } else {
        await onAddProperty(payload);
      }

      setIsAddEditModalOpen(false);
      setEditingProperty(null);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save property. Please check connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmProperty) return;
    setIsSaving(true);
    try {
      await onDeleteProperty(deleteConfirmProperty.id);
      setDeleteConfirmProperty(null);
    } catch (err: any) {
      alert(`Failed to delete property: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. TOP STATS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-[#D8F3E5] p-4.5 border border-[#BCE9D3] flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#1B4D3E] uppercase tracking-wider">
              Properties
            </span>
            <div className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center text-[#145338]">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-[#17231E]">
              {properties.length} <span className="text-xs font-medium text-[#2F5E4E]">Active Estates</span>
            </div>
            <div className="text-[11px] text-[#4A6D5E] mt-0.5">
              Across {availablePrefixes.length} alphabetical prefix groups
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4.5 border border-[#E5EAE7] flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#66766E] uppercase tracking-wider">
              Total Units
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#F0F5F2] flex items-center justify-center text-[#234A38]">
              <Home className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-[#17231E]">
              {totalDoors} <span className="text-xs font-medium text-[#7C8B83]">Units</span>
            </div>
            <div className="text-[11px] text-[#7C8B83] mt-0.5">
              {totalOccupied} Occupied &bull; {Math.max(0, totalDoors - totalOccupied)} Vacant
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4.5 border border-[#E5EAE7] flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#66766E] uppercase tracking-wider">
              Portfolio Occupancy
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#EAF8E6] text-[#24693D]">
              {overallOccupancyPct}%
            </span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-[#E5EAE7] rounded-full h-2 overflow-hidden mb-1.5">
              <div
                className="bg-[#24693D] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, Number(overallOccupancyPct)))}%` }}
              />
            </div>
            <div className="text-[11px] text-[#7C8B83]">
              {totalOccupied} of {totalDoors} units generating active rent
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#17231E] p-4.5 text-white flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#D5F267] uppercase tracking-wider">
              Monthly Rent Roll
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#23352D] text-[#D5F267]">
              KES
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white">
              KES {totalRentRoll.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#9FB5A7] mt-0.5">
              Expected gross portfolio yield / month
            </div>
          </div>
        </div>
      </div>

      {/* 2. SEARCH, PREFIX PILLS & ACTION BAR */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5EAE7] shadow-xs space-y-3.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Field */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C9C93]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search property by name, prefix, code, location or manager..."
              className="w-full pl-9.5 pr-4 py-2.5 bg-[#F6F8F7] border border-[#DFE5E1] rounded-xl text-[13px] text-[#17231E] placeholder-[#8C9C93] focus:outline-none focus:border-[#145338] transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C9C93] hover:text-[#17231E]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Dropdown & Add Button */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#F6F8F7] border border-[#DFE5E1] rounded-xl">
              <Filter className="w-3.5 h-3.5 text-[#5F7167]" />
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="bg-transparent text-[12.5px] font-medium text-[#17231E] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Occupied">Fully Occupied</option>
                <option value="Available">Vacancies Available</option>
                <option value="Under Maintenance">Under Maintenance</option>
              </select>
            </div>

            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#D5F267] hover:bg-[#c8e858] text-[#17231E] rounded-xl text-[13px] font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add Property
            </button>
          </div>
        </div>

        {/* Dynamic Alphabetical Prefix Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-thin">
          <span className="text-[11.5px] font-semibold text-[#7C8B83] uppercase tracking-wider mr-1 shrink-0">
            Prefix Filter:
          </span>
          <button
            onClick={() => setSelectedPrefixFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all shrink-0 cursor-pointer ${
              selectedPrefixFilter === 'ALL'
                ? 'bg-[#17231E] text-white shadow-xs'
                : 'bg-[#F2F5F3] text-[#55675D] hover:bg-[#E5EAE7]'
            }`}
          >
            All Prefixes ({properties.length})
          </button>
          {availablePrefixes.map((prefix) => {
            const count = properties.filter(
              (p) => String(p.codePrefix || p.name[0] || '').trim().toUpperCase() === prefix
            ).length;
            const isSelected = selectedPrefixFilter === prefix;
            return (
              <button
                key={prefix}
                onClick={() => setSelectedPrefixFilter(isSelected ? 'ALL' : prefix)}
                className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-[#145338] text-[#D5F267] shadow-xs'
                    : 'bg-[#F2F5F3] text-[#55675D] hover:bg-[#E5EAE7]'
                }`}
              >
                <span>Prefix {prefix}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-[#23684B] text-white' : 'bg-[#E1E7E3] text-[#4A5D52]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. ALPHABETICAL PROPERTY ORGANIZATION (Grouped by Prefix dynamically) */}
      {groupedProperties.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#E5EAE7] shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F7F5] flex items-center justify-center text-[#8C9C93] mx-auto mb-3.5">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#17231E]">No properties match your filter</h3>
          <p className="text-[13px] text-[#6E7F75] max-w-md mx-auto mt-1 mb-4">
            Try adjusting your search query, status selector, or prefix filters, or click below to register a new community.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#17231E] text-white rounded-xl text-[13px] font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#D5F267]" /> Add New Property
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedProperties.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.prefix]);
            const groupUnits = group.properties.reduce((s, p) => s + Number(p.totalUnits || 0), 0);
            const groupOccupied = group.properties.reduce((s, p) => s + Number(p.occupiedUnits || 0), 0);
            const groupRent = group.properties.reduce((s, p) => s + Number(p.monthlyRevenue || 0), 0);
            const firstProp = group.properties[0];
            const groupCoverImage =
              firstProp?.coverImageUrl ||
              firstProp?.images?.find((img) => img.isCover)?.imageUrl ||
              firstProp?.images?.[0]?.imageUrl;

            return (
              <div
                key={group.prefix}
                className="bg-white rounded-2xl border border-[#E2E8E4] shadow-xs overflow-hidden transition-all"
              >
                {/* Group Section Header */}
                <div className="bg-[#FAFBFB] px-5 py-3.5 border-b border-[#EAEFEA] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-[#DFE5E1] bg-[#F0F4F2] shadow-xs flex items-center justify-center">
                      {groupCoverImage ? (
                        <img
                          src={groupCoverImage}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#EEF4F0] to-[#DFEBE3] text-[#145338]">
                          <Building2 className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold text-[#17231E] flex items-center gap-2">
                        <span>{group.title}</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EAF5EF] text-[#1E5D44] border border-[#CFE4D8]">
                          {group.properties.length} {group.properties.length === 1 ? 'Property' : 'Properties'}
                        </span>
                      </h2>
                      <p className="text-[11.5px] text-[#697B71]">
                        {groupUnits} Total Units &bull; {groupOccupied} Occupied &bull; KES {groupRent.toLocaleString()} / mo
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleGroupCollapse(group.prefix)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F0F4F2] text-[11.5px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {isCollapsed ? (
                        <>
                          <span>Expand</span> <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <span>Collapse</span> <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Group Properties Row / Grid */}
                {!isCollapsed && (
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {group.properties.map((property) => {
                      const occRatio = property.totalUnits > 0 ? property.occupiedUnits / property.totalUnits : 0;
                      const occPct = (occRatio * 100).toFixed(0);
                      const imageCount = property.images?.length || (property.coverImageUrl ? 1 : 0);
                      const displayCover = property.coverImageUrl || property.images?.[0]?.imageUrl;

                      return (
                        <div
                          key={property.id}
                          className="group bg-white rounded-xl border border-[#E5EAE7] hover:border-[#145338] shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
                        >
                          <div>
                            {/* Card Photo Container with Cover Photo & Status Badge */}
                            <div className="relative aspect-16/9 bg-[#F0F4F2] overflow-hidden border-b border-[#EAEFEA]">
                              {displayCover ? (
                                <img
                                  src={displayCover}
                                  alt={property.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#EEF4F0] to-[#DFEBE3] p-4 text-center">
                                  <div className="w-12 h-12 rounded-xl bg-white/80 shadow-xs flex items-center justify-center text-[#145338] mb-1.5">
                                    <Building2 className="w-6 h-6" />
                                  </div>
                                  <span className="text-[12px] font-bold text-[#17231E]">
                                    {property.propertyCode || `Prefix ${property.codePrefix}`}
                                  </span>
                                  <span className="text-[10px] text-[#55695E]">No photos uploaded</span>
                                </div>
                              )}

                              {/* Top Status & Code Badges */}
                              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                                <span
                                  className={`text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs ${
                                    property.status === 'Occupied'
                                      ? 'bg-[#17231E] text-[#D5F267]'
                                      : property.status === 'Under Maintenance'
                                      ? 'bg-[#FEF3C7] text-[#92400E]'
                                      : 'bg-[#D8F3E5] text-[#145338]'
                                  }`}
                                >
                                  {property.status || 'Active'}
                                </span>
                              </div>

                              <div className="absolute top-2.5 right-2.5">
                                <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-[#17231E]/80 backdrop-blur-xs text-white">
                                  {property.propertyCode || `${property.codePrefix}-001`}
                                </span>
                              </div>

                              {/* Bottom Photo Count Pill */}
                              {imageCount > 0 && (
                                <button
                                  onClick={() => {
                                    const allImgs = (property.images || []).map((i) => i.imageUrl);
                                    if (allImgs.length === 0 && property.coverImageUrl) {
                                      allImgs.push(property.coverImageUrl);
                                    }
                                    openLightbox(allImgs, 0);
                                  }}
                                  className="absolute bottom-2.5 right-2.5 px-2 py-0.8 rounded-md bg-black/70 backdrop-blur-xs text-white text-[10.5px] font-bold flex items-center gap-1 hover:bg-black transition-colors cursor-pointer"
                                >
                                  <ImageIcon className="w-3 h-3 text-[#D5F267]" />
                                  <span>{imageCount} {imageCount === 1 ? 'photo' : 'photos'}</span>
                                </button>
                              )}
                            </div>

                            {/* Card Body */}
                            <div className="p-4 space-y-3">
                              <div>
                                <h3 className="text-[15px] font-bold text-[#17231E] leading-snug group-hover:text-[#145338] transition-colors">
                                  {property.name}
                                </h3>
                                <p className="text-[12px] text-[#697B71] flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3.5 h-3.5 text-[#8E9F95] shrink-0" />
                                  <span className="truncate">{property.address}</span>
                                </p>
                              </div>

                              {/* Occupancy Progress Bar */}
                              <div className="bg-[#F8FAF9] rounded-xl p-2.5 border border-[#ECF1EE]">
                                <div className="flex items-center justify-between text-[11.5px] font-medium text-[#4A5D52] mb-1">
                                  <span>Occupancy ({occPct}%)</span>
                                  <span className="font-bold text-[#17231E]">
                                    {property.occupiedUnits} / {property.totalUnits} Units
                                  </span>
                                </div>
                                <div className="w-full bg-[#E2E8E4] rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      occRatio >= 0.9 ? 'bg-[#145338]' : occRatio >= 0.5 ? 'bg-[#3A8B63]' : 'bg-[#EAB308]'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, occRatio * 100))}%` }}
                                  />
                                </div>
                              </div>

                              {/* Rent & Manager */}
                              <div className="flex items-center justify-between text-[11.5px] pt-0.5">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-[#8C9C93] block">
                                    Monthly Roll
                                  </span>
                                  <span className="font-bold text-[#17231E]">
                                    KES {Number(property.monthlyRevenue || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-[#8C9C93] block">
                                    Manager
                                  </span>
                                  <span className="font-medium text-[#2F4238] truncate max-w-[120px] inline-block">
                                    {property.manager}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="px-4 py-3 bg-[#FAFBFB] border-t border-[#EAEFEA] flex items-center justify-between gap-1.5">
                            <button
                              onClick={() => openDetailModal(property)}
                              className="flex-1 py-1.5 px-2.5 rounded-lg bg-white border border-[#DFE5E1] hover:border-[#145338] hover:text-[#145338] text-[#2F4238] text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Property
                            </button>

                            <button
                              onClick={() => openEditModal(property)}
                              title="Edit Property & Photos"
                              className="p-1.5 rounded-lg bg-white border border-[#DFE5E1] hover:bg-[#F2F6F4] text-[#4A5D52] hover:text-[#17231E] transition-colors cursor-pointer shadow-2xs"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setDeleteConfirmProperty(property)}
                              title="Delete Property"
                              className="p-1.5 rounded-lg bg-white border border-[#DFE5E1] hover:border-red-300 hover:bg-red-50 text-[#8C9C93] hover:text-red-600 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          4. ADD / EDIT PROPERTY MODAL WITH MULTI-PICTURE UPLOAD SYSTEM
         ========================================================================= */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17231E]">
                  {editingProperty ? `Edit Property: ${editingProperty.name}` : 'Add New Property to Portfolio'}
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Configure estate specifications, unit count and manage photo gallery
                </p>
              </div>
              <button
                onClick={() => setIsAddEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto space-y-5">
              {formError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[12.5px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Property Basics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!editingProperty && e.target.value.trim().length > 0) {
                        const firstChar = e.target.value.trim()[0].toUpperCase();
                        if (/^[A-Z]$/.test(firstChar)) {
                          setFormPrefix(firstChar);
                          setFormCode(`${firstChar}-001`);
                        }
                      }
                    }}
                    placeholder="e.g. Kiambu Apartments"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Prefix (A-Z) *
                  </label>
                  <input
                    type="text"
                    maxLength={1}
                    required
                    value={formPrefix}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                      setFormPrefix(val);
                      if (val) setFormCode(`${val}-001`);
                    }}
                    placeholder="A"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] font-black text-[#17231E] text-center focus:outline-none focus:border-[#145338]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Property Code / Unit Identification
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. A-001"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] font-mono text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Physical Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="e.g. Kiambu Road, Nairobi"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>
              </div>

              {/* Units, Revenue & Manager */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Total Units *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={formTotalUnits}
                    onChange={(e) => setFormTotalUnits(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Monthly Rent Roll (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={formMonthlyRevenue}
                    onChange={(e) => setFormMonthlyRevenue(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Property Manager
                  </label>
                  <input
                    type="text"
                    value={formManager}
                    onChange={(e) => setFormManager(e.target.value)}
                    placeholder="Manager Name"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Operational Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  >
                    <option value="Active">Active</option>
                    <option value="Occupied">Fully Occupied</option>
                    <option value="Available">Available (Units Vacant)</option>
                    <option value="Under Maintenance">Under Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Property Architecture / Variant
                  </label>
                  <select
                    value={formVariant}
                    onChange={(e) => setFormVariant(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                  >
                    <option value="deluxe">Deluxe Residence</option>
                    <option value="standard">Standard Residential</option>
                    <option value="suite">Executive Suites</option>
                    <option value="family">Family Apartments</option>
                    <option value="single">Studio / Single Units</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Description / Amenities & Notes
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Modern apartments featuring 24/7 borehole water, perimeter electric fencing, biometric access..."
                  className="w-full px-3.5 py-2 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                />
              </div>

              {/* PICTURE UPLOAD SYSTEM SECTION */}
              <div className="pt-2 border-t border-[#EAEFEA]">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-[12px] font-bold text-[#17231E] uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-[#145338]" />
                      <span>Property Photo Gallery ({stagedImages.length}/10)</span>
                    </label>
                    <p className="text-[11px] text-[#718478]">
                      Upload photos (JPG, PNG, WebP &bull; Max 5MB each). Choose one as the Main Cover photo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={stagedImages.length >= 10 || isUploadingFiles}
                    className="px-3 py-1.5 bg-[#17231E] hover:bg-[#23352D] disabled:opacity-50 text-white rounded-xl text-[11.5px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#D5F267]" />
                    <span>Browse Photos</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileChange}
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    className="hidden"
                  />
                </div>

                {/* Staged Photos Preview Grid */}
                {stagedImages.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#CFD9D3] hover:border-[#145338] bg-[#F9FBFA] rounded-2xl p-6 text-center cursor-pointer transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#E8EFEA] group-hover:bg-[#D5F267] flex items-center justify-center text-[#145338] mx-auto mb-2 transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-[12.5px] font-bold text-[#17231E]">
                      Click or drag photos here to upload
                    </p>
                    <p className="text-[11px] text-[#788C80] mt-0.5">
                      JPG, PNG, or WebP up to 5MB each &bull; Up to 10 photos
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {stagedImages.map((img) => (
                      <div
                        key={img.id}
                        className={`relative rounded-xl overflow-hidden border-2 aspect-4/3 bg-[#F0F4F2] group ${
                          img.isCover ? 'border-[#145338] ring-2 ring-[#D5F267]' : 'border-[#DFE5E1]'
                        }`}
                      >
                        <img
                          src={img.imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />

                        {/* Top Badges */}
                        <div className="absolute top-1.5 left-1.5">
                          {img.isCover ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#145338] text-[#D5F267] text-[9.5px] font-black shadow-xs flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> COVER
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetCover(img.id)}
                              className="px-1.5 py-0.5 rounded-md bg-black/60 hover:bg-black text-white text-[9.5px] font-bold shadow-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              Set Cover
                            </button>
                          )}
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove picture"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {stagedImages.length < 10 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl border-2 border-dashed border-[#CFD9D3] hover:border-[#145338] bg-[#FAFBFB] aspect-4/3 flex flex-col items-center justify-center text-[#697B71] hover:text-[#145338] transition-colors cursor-pointer"
                      >
                        <Plus className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-bold">Add More</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-[#EAEFEA] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[13px] font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] disabled:opacity-50 text-[#17231E] text-[13px] font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#17231E] border-t-transparent rounded-full animate-spin" />
                      <span>Saving Property...</span>
                    </>
                  ) : (
                    <span>{editingProperty ? 'Update Property' : 'Save Property to Supabase'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. VIEW PROPERTY DETAILS MODAL WITH IMAGE GALLERY
         ========================================================================= */}
      {viewingProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-[#17231E] text-[#D5F267] mr-2">
                  {viewingProperty.propertyCode || `Prefix ${viewingProperty.codePrefix}`}
                </span>
                <span className="text-base font-bold text-[#17231E]">{viewingProperty.name}</span>
              </div>
              <button
                onClick={() => setViewingProperty(null)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Main Cover Hero with Lightbox trigger */}
              {viewingProperty.coverImageUrl || viewingProperty.images?.[0]?.imageUrl ? (
                <div
                  onClick={() => {
                    const allImgs = (viewingProperty.images || []).map((i) => i.imageUrl);
                    if (allImgs.length === 0 && viewingProperty.coverImageUrl) {
                      allImgs.push(viewingProperty.coverImageUrl);
                    }
                    openLightbox(allImgs, 0);
                  }}
                  className="relative aspect-21/9 rounded-2xl overflow-hidden bg-[#17231E] cursor-pointer group shadow-sm"
                >
                  <img
                    src={viewingProperty.coverImageUrl || viewingProperty.images?.[0]?.imageUrl}
                    alt={viewingProperty.name}
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-between p-4">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#D5F267] text-[#17231E] mb-1 inline-block">
                        {viewingProperty.status || 'Active'}
                      </span>
                      <h4 className="text-white font-bold text-lg drop-shadow-sm">{viewingProperty.name}</h4>
                      <p className="text-white/80 text-[12px] flex items-center gap-1 drop-shadow-xs">
                        <MapPin className="w-3.5 h-3.5 text-[#D5F267]" /> {viewingProperty.address}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xs">
                      <Maximize2 className="w-3.5 h-3.5 text-[#D5F267]" /> Fullscreen Gallery
                    </span>
                  </div>
                </div>
              ) : (
                <div className="aspect-21/9 rounded-2xl bg-gradient-to-br from-[#EEF4F0] to-[#DFEBE3] p-6 flex flex-col items-center justify-center text-center">
                  <Building2 className="w-10 h-10 text-[#145338] mb-2" />
                  <h4 className="text-[#17231E] font-bold text-base">{viewingProperty.name}</h4>
                  <p className="text-[12px] text-[#55695E] flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" /> {viewingProperty.address}
                  </p>
                </div>
              )}

              {/* Photo Gallery Strip */}
              {viewingProperty.images && viewingProperty.images.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-bold text-[#17231E] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#145338]" />
                    <span>Photo Gallery ({viewingProperty.images.length})</span>
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {viewingProperty.images.map((img, idx) => (
                      <div
                        key={img.id || idx}
                        onClick={() => {
                          const allImgs = (viewingProperty.images || []).map((i) => i.imageUrl);
                          openLightbox(allImgs, idx);
                        }}
                        className="aspect-square rounded-xl overflow-hidden border border-[#DFE5E1] hover:border-[#145338] cursor-pointer group relative bg-[#F0F4F2]"
                      >
                        <img
                          src={img.imageUrl}
                          alt={img.caption || `Photo ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                        />
                        {img.isCover && (
                          <div className="absolute top-1 left-1 px-1 rounded bg-[#145338] text-[#D5F267] text-[8px] font-black">
                            COVER
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specifications Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10.5px] font-bold text-[#7C8B83] uppercase block">Total Doors</span>
                  <span className="text-base font-black text-[#17231E]">{viewingProperty.totalUnits} Units</span>
                </div>
                <div className="p-3 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10.5px] font-bold text-[#7C8B83] uppercase block">Occupied</span>
                  <span className="text-base font-black text-[#145338]">{viewingProperty.occupiedUnits} Units</span>
                </div>
                <div className="p-3 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10.5px] font-bold text-[#7C8B83] uppercase block">Monthly Roll</span>
                  <span className="text-base font-black text-[#17231E]">
                    KES {Number(viewingProperty.monthlyRevenue || 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10.5px] font-bold text-[#7C8B83] uppercase block">Manager</span>
                  <span className="text-[13px] font-bold text-[#17231E] truncate block">
                    {viewingProperty.manager}
                  </span>
                </div>
              </div>

              {/* Description */}
              {viewingProperty.description && (
                <div className="p-4 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7]">
                  <h5 className="text-[11.5px] font-bold text-[#17231E] uppercase tracking-wider mb-1">
                    About this Community
                  </h5>
                  <p className="text-[12.5px] text-[#4A5D52] leading-relaxed">
                    {viewingProperty.description}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-[#FAFBFB] border-t border-[#EAEFEA] flex items-center justify-between">
              <button
                onClick={() => {
                  setViewingProperty(null);
                  openEditModal(viewingProperty);
                }}
                className="px-4 py-2 rounded-xl bg-white border border-[#DFE5E1] text-[#17231E] text-[12.5px] font-bold flex items-center gap-1.5 hover:bg-[#F0F4F2] cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Property Details & Photos
              </button>

              <button
                onClick={() => setViewingProperty(null)}
                className="px-5 py-2 rounded-xl bg-[#17231E] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#23352D]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          6. FULLSCREEN HIGH-RESOLUTION LIGHTBOX MODAL
         ========================================================================= */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <div className="fixed inset-0 z-60 bg-black/95 flex flex-col justify-between p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-150">
          {/* Top Bar with Counter & Close */}
          <div className="flex items-center justify-between text-white z-10">
            <span className="text-[13px] font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-xs">
              Photo {lightboxIndex + 1} of {lightboxImages.length}
            </span>
            <button
              onClick={() => setLightboxOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Center Image with Prev / Next Arrows */}
          <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden">
            <img
              src={lightboxImages[lightboxIndex]}
              alt={`Photo ${lightboxIndex + 1}`}
              className="max-h-[82vh] max-w-[90vw] object-contain rounded-xl shadow-2xl transition-all duration-200"
            />

            {lightboxImages.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length)
                  }
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-xs"
                  title="Previous Photo"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() =>
                    setLightboxIndex((prev) => (prev + 1) % lightboxImages.length)
                  }
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-xs"
                  title="Next Photo"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Thumbnail Strip */}
          {lightboxImages.length > 1 && (
            <div className="flex items-center justify-center gap-2 overflow-x-auto py-1 z-10">
              {lightboxImages.map((src, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={`w-14 h-11 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    lightboxIndex === idx ? 'border-[#D5F267] scale-105' : 'border-white/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          7. SAFE DELETION CONFIRMATION MODAL
         ========================================================================= */}
      {deleteConfirmProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-3.5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#17231E] text-center">
              Remove &ldquo;{deleteConfirmProperty.name}&rdquo;?
            </h3>
            <p className="text-[12.5px] text-[#697B71] text-center mt-1.5 mb-5">
              This action will remove the property from your portfolio. Any attached units and tenant records in Supabase will be unlinked safely to preserve database integrity.
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmProperty(null)}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[13px] font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
