import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  Calendar,
  Eye,
  ArrowUpDown,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Building2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileText,
  Printer,
  Download,
  Check,
  Layers,
  ArrowRight,
  Info,
  DollarSign,
  UserCheck,
} from 'lucide-react';
import {
  RentPaymentRecord,
  PropertyRecord,
  TenantProfile,
} from '../data/rentalData';
import { AvatarBadge } from './UnitIllustration';

interface RentPaymentsPageProps {
  payments: RentPaymentRecord[];
  properties: PropertyRecord[];
  tenants: TenantProfile[];
  onConfirmPayment: (id: string) => Promise<void>;
  onAddPayment: (record: Partial<RentPaymentRecord>) => Promise<void>;
  onDeletePayment: (id: string) => Promise<void>;
  onSelectTenantRef: (ref: string) => void;
  globalSearch: string;
}

export const RentPaymentsPage: React.FC<RentPaymentsPageProps> = ({
  payments,
  properties,
  tenants,
  onConfirmPayment,
  onAddPayment,
  onDeletePayment,
  onSelectTenantRef,
  globalSearch,
}) => {
  // Apartment prefix navigation state ('ALL' or property ID)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('ALL');

  // Table filters & pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Paid' | 'Pending' | 'Overdue'
  >('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDialogPayment, setConfirmDialogPayment] =
    useState<RentPaymentRecord | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [receiptModalPayment, setReceiptModalPayment] =
    useState<RentPaymentRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Payment Modal Form State (Strictly scoped by Property & Verified Tenant)
  const [formPropertyId, setFormPropertyId] = useState<string>('');
  const [formTenantRef, setFormTenantRef] = useState<string>('');
  const [formTenantName, setFormTenantName] = useState('');
  const [formUnitNumber, setFormUnitNumber] = useState('Unit 101');
  const [formUnitType, setFormUnitType] = useState<
    'Standard' | 'Deluxe' | 'Suite' | 'Family' | 'Single'
  >('Deluxe');
  const [formAmount, setFormAmount] = useState<number>(35000);
  const [formPaymentNote, setFormPaymentNote] = useState('M-Pesa / Bank Transfer');
  const [formLeaseTerm, setFormLeaseTerm] = useState('12 Months');
  const [formPayStatus, setFormPayStatus] = useState<
    'Paid' | 'Pending' | 'Overdue'
  >('Paid');
  const [safeguardVerified, setSafeguardVerified] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Helper: compute clean property prefix ('A', 'B', 'C'...)
  const getPropertyPrefix = (prop: PropertyRecord, idx: number) => {
    if (prop.codePrefix && prop.codePrefix.trim()) {
      return prop.codePrefix.trim().toUpperCase();
    }
    return String.fromCharCode(65 + (idx % 26));
  };

  // Build property lookup and prefix metadata
  const propertyMetaMap = useMemo(() => {
    const byId = new Map<
      string,
      { property: PropertyRecord; prefix: string; index: number }
    >();
    const byName = new Map<
      string,
      { property: PropertyRecord; prefix: string; index: number }
    >();

    properties.forEach((p, idx) => {
      const prefix = getPropertyPrefix(p, idx);
      const meta = { property: p, prefix, index: idx };
      byId.set(p.id, meta);
      byName.set(p.name.trim().toLowerCase(), meta);
    });

    return { byId, byName };
  }, [properties]);

  // Build tenant-to-property lookup for strict payment allocation verification
  const tenantMetaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        tenant: TenantProfile;
        property?: PropertyRecord;
        prefix: string;
      }
    >();

    tenants.forEach((t) => {
      const propMeta =
        (t.propertyId ? propertyMetaMap.byId.get(t.propertyId) : undefined) ||
        (t.property
          ? propertyMetaMap.byName.get(t.property.trim().toLowerCase())
          : undefined);

      map.set(t.tenantRef.toUpperCase(), {
        tenant: t,
        property: propMeta?.property,
        prefix: propMeta?.prefix || 'A',
      });
    });

    return map;
  }, [tenants, propertyMetaMap]);

  // Active selected property record (null if 'ALL')
  const activeProperty = useMemo(() => {
    if (selectedPropertyId === 'ALL') return null;
    return properties.find((p) => p.id === selectedPropertyId) || null;
  }, [selectedPropertyId, properties]);

  const activePropertyPrefix = useMemo(() => {
    if (!activeProperty) return '';
    const idx = properties.findIndex((p) => p.id === activeProperty.id);
    return getPropertyPrefix(activeProperty, idx >= 0 ? idx : 0);
  }, [activeProperty, properties]);

  // Computed per-property stats for navigation tabs
  const propertyTabStats = useMemo(() => {
    return properties.map((prop, idx) => {
      const prefix = getPropertyPrefix(prop, idx);
      const propNameLower = prop.name.trim().toLowerCase();

      // Tenants strictly belonging to this property
      const propTenants = tenants.filter((t) => {
        return (
          t.propertyId === prop.id ||
          (t.property && t.property.trim().toLowerCase() === propNameLower)
        );
      });

      const propTenantRefs = new Set(
        propTenants.map((t) => t.tenantRef.toUpperCase())
      );

      // Payments strictly belonging to this property (by property name or tenantRef relationship)
      const propPayments = payments.filter((pay) => {
        const matchesName =
          pay.property && pay.property.trim().toLowerCase() === propNameLower;
        const matchesTenant = propTenantRefs.has(pay.tenantRef.toUpperCase());
        return matchesName || matchesTenant;
      });

      const totalPaid = propPayments
        .filter((p) => p.status === 'Paid')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const pendingCount = propPayments.filter(
        (p) => p.status === 'Pending' || p.status === 'Overdue'
      ).length;

      return {
        property: prop,
        prefix,
        tenantCount: propTenants.length,
        paymentCount: propPayments.length,
        totalPaid,
        pendingCount,
      };
    });
  }, [properties, tenants, payments]);

  // STRICT FILTERING: Filter payments and tenants based on selected property prefix
  const scopedData = useMemo(() => {
    let scopedPayments = payments;
    let scopedTenants = tenants;

    if (activeProperty) {
      const propNameLower = activeProperty.name.trim().toLowerCase();

      // Strict tenants assigned to this property
      scopedTenants = tenants.filter((t) => {
        return (
          t.propertyId === activeProperty.id ||
          (t.property && t.property.trim().toLowerCase() === propNameLower)
        );
      });

      const propTenantRefs = new Set(
        scopedTenants.map((t) => t.tenantRef.toUpperCase())
      );

      // Strict payments for this property (by relationship or property name)
      scopedPayments = payments.filter((pay) => {
        const matchesName =
          pay.property && pay.property.trim().toLowerCase() === propNameLower;
        const matchesTenant = propTenantRefs.has(pay.tenantRef.toUpperCase());
        return matchesName || matchesTenant;
      });
    }

    return { scopedPayments, scopedTenants };
  }, [activeProperty, payments, tenants]);

  // Search filtering
  const query = (search || globalSearch).trim().toLowerCase();

  const filteredPayments = useMemo(() => {
    return scopedData.scopedPayments.filter((item) => {
      const matchesStatus =
        statusFilter === 'All' || item.status === statusFilter;

      if (!matchesStatus) return false;
      if (!query) return true;

      // Search across tenant name, account ref, payment id, unit, note, and property
      const tenantMatch = item.tenantName.toLowerCase().includes(query);
      const refMatch = item.tenantRef.toLowerCase().includes(query);
      const idMatch = item.paymentId.toLowerCase().includes(query);
      const unitMatch = item.unitNumber.toLowerCase().includes(query);
      const noteMatch = (item.paymentNote || '').toLowerCase().includes(query);
      const propMatch = item.property.toLowerCase().includes(query);

      return (
        tenantMatch ||
        refMatch ||
        idMatch ||
        unitMatch ||
        noteMatch ||
        propMatch
      );
    });
  }, [scopedData.scopedPayments, statusFilter, query]);

  // Pagination
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPayments.slice(start, start + itemsPerPage);
  }, [filteredPayments, currentPage, itemsPerPage]);

  // Overall Scope Financial KPIs
  const kpiStats = useMemo(() => {
    const totalCollected = scopedData.scopedPayments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const pendingTotal = scopedData.scopedPayments
      .filter((p) => p.status === 'Pending')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const overdueTotal = scopedData.scopedPayments
      .filter((p) => p.status === 'Overdue')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const confirmedCount = scopedData.scopedPayments.filter(
      (p) => p.status === 'Paid'
    ).length;

    const clearedTenantsCount = scopedData.scopedTenants.filter(
      (t) => (t.rentBalance ?? 0) <= 0 && t.status === 'Paid'
    ).length;

    const dueTenantsCount = scopedData.scopedTenants.filter(
      (t) => (t.rentBalance ?? 0) > 0 || t.status !== 'Paid'
    ).length;

    return {
      totalCollected,
      pendingTotal,
      overdueTotal,
      confirmedCount,
      totalTenants: scopedData.scopedTenants.length,
      clearedTenantsCount,
      dueTenantsCount,
    };
  }, [scopedData]);

  // Open Add Payment Modal with initial property preselection
  const handleOpenAddPayment = (propertyId?: string) => {
    const initialPropId =
      propertyId ||
      (selectedPropertyId !== 'ALL' ? selectedPropertyId : properties[0]?.id) ||
      '';

    setFormPropertyId(initialPropId);
    setSafeguardVerified(false);
    setFormError(null);

    // Filter tenants strictly for this chosen property
    const propObj = properties.find((p) => p.id === initialPropId);
    const propNameLower = propObj ? propObj.name.trim().toLowerCase() : '';
    const initialTenants = tenants.filter(
      (t) =>
        t.propertyId === initialPropId ||
        (t.property && t.property.trim().toLowerCase() === propNameLower)
    );

    const firstTenant = initialTenants[0];
    if (firstTenant) {
      setFormTenantRef(firstTenant.tenantRef);
      setFormTenantName(firstTenant.name);
      setFormUnitNumber(firstTenant.unitNumber);
      setFormUnitType(firstTenant.unitType);
      setFormAmount(
        firstTenant.rentBalance > 0
          ? firstTenant.rentBalance
          : firstTenant.monthlyRent || 35000
      );
      setFormLeaseTerm(firstTenant.leaseDuration || '12 Months');
    } else {
      setFormTenantRef('');
      setFormTenantName('');
      setFormUnitNumber('Unit 101');
      setFormAmount(35000);
    }

    setFormPaymentNote('M-Pesa / Bank Transfer');
    setFormPayStatus('Paid');
    setModalOpen(true);
  };

  // Change property inside modal (re-scopes available tenants strictly)
  const handleModalPropertyChange = (newPropId: string) => {
    setFormPropertyId(newPropId);
    setSafeguardVerified(false);
    setFormError(null);

    const propObj = properties.find((p) => p.id === newPropId);
    const propNameLower = propObj ? propObj.name.trim().toLowerCase() : '';
    const availableTenants = tenants.filter(
      (t) =>
        t.propertyId === newPropId ||
        (t.property && t.property.trim().toLowerCase() === propNameLower)
    );

    const firstTenant = availableTenants[0];
    if (firstTenant) {
      setFormTenantRef(firstTenant.tenantRef);
      setFormTenantName(firstTenant.name);
      setFormUnitNumber(firstTenant.unitNumber);
      setFormUnitType(firstTenant.unitType);
      setFormAmount(
        firstTenant.rentBalance > 0
          ? firstTenant.rentBalance
          : firstTenant.monthlyRent || 35000
      );
      setFormLeaseTerm(firstTenant.leaseDuration || '12 Months');
    } else {
      setFormTenantRef('');
      setFormTenantName('');
      setFormUnitNumber('Unit 101');
      setFormAmount(35000);
    }
  };

  // Select tenant inside modal
  const handleModalTenantChange = (tenantRef: string) => {
    setFormTenantRef(tenantRef);
    setSafeguardVerified(false);
    setFormError(null);

    const found = tenants.find((t) => t.tenantRef === tenantRef);
    if (found) {
      setFormTenantName(found.name);
      setFormUnitNumber(found.unitNumber);
      setFormUnitType(found.unitType);
      setFormAmount(
        found.rentBalance > 0
          ? found.rentBalance
          : found.monthlyRent || 35000
      );
      setFormLeaseTerm(found.leaseDuration || '12 Months');
    }
  };

  // Current active tenant metadata for the verification safeguard card
  const selectedModalTenant = useMemo(() => {
    return tenants.find((t) => t.tenantRef === formTenantRef) || null;
  }, [tenants, formTenantRef]);

  const selectedModalProperty = useMemo(() => {
    return properties.find((p) => p.id === formPropertyId) || null;
  }, [properties, formPropertyId]);

  const selectedModalPrefix = useMemo(() => {
    if (!selectedModalProperty) return 'A';
    const idx = properties.findIndex((p) => p.id === selectedModalProperty.id);
    return getPropertyPrefix(selectedModalProperty, idx >= 0 ? idx : 0);
  }, [selectedModalProperty, properties]);

  // Submit payment with strict safeguard verification
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!safeguardVerified) {
      setFormError(
        'Confirmation required: You must verify that the tenant, apartment prefix, and unit reference match before recording the payment.'
      );
      return;
    }

    if (!formTenantName.trim()) {
      setFormError('Tenant name is required.');
      return;
    }

    if (!formTenantRef.trim()) {
      setFormError('Tenant account reference is required.');
      return;
    }

    if (Number(formAmount) <= 0) {
      setFormError('Payment amount must be greater than zero.');
      return;
    }

    const propName = selectedModalProperty?.name || properties[0]?.name || 'Main Property';

    setSaving(true);
    try {
      await onAddPayment({
        tenantRef: formTenantRef.trim().toUpperCase(),
        tenantName: formTenantName.trim(),
        property: propName,
        unitType: formUnitType,
        unitNumber: formUnitNumber.trim() || 'Unit 101',
        paymentNote: formPaymentNote.trim() || 'Rent Payment',
        leaseTerm: formLeaseTerm.trim() || '12 Months',
        amount: Number(formAmount),
        status: formPayStatus,
      });

      setModalOpen(false);
      showToast(
        `Payment of KSh ${Number(formAmount).toLocaleString()} recorded for ${formTenantName.trim()} (${formTenantRef.toUpperCase()} • ${propName}).`
      );
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save payment record.');
    } finally {
      setSaving(false);
    }
  };

  // Server-side payment confirmation handler
  const handleExecuteConfirmPayment = async () => {
    if (!confirmDialogPayment) return;
    setConfirmingPayment(true);
    try {
      await onConfirmPayment(confirmDialogPayment.id);
      showToast(
        `Payment ${confirmDialogPayment.paymentId} confirmed for ${confirmDialogPayment.tenantName} (${confirmDialogPayment.tenantRef}). Receipt statement generated.`
      );
      setConfirmDialogPayment(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to confirm payment.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  // Download official receipt statement
  const handleDownloadReceipt = (pay: RentPaymentRecord) => {
    const meta = tenantMetaMap.get(pay.tenantRef.toUpperCase());
    const prefix = meta?.prefix || 'A';
    const dateStr = pay.paidDate || new Date().toISOString().slice(0, 10);
    const receiptNum = `RCP-${pay.tenantRef}-${dateStr.replace(/-/g, '')}`;

    const receiptContent = `
==========================================================
                     RENTIFY PROPERTY MANAGEMENT
                   OFFICIAL RENT PAYMENT RECEIPT
==========================================================
Receipt Number     : ${receiptNum}
Transaction Ref    : ${pay.paymentId}
Payment Status     : ${pay.status === 'Paid' ? 'CONFIRMED' : pay.status.toUpperCase()}
Date Issued        : ${new Date().toLocaleDateString('en-KE', { dateStyle: 'full' })}
----------------------------------------------------------
TENANT & PROPERTY DETAILS (STRICT ALLOCATION)
----------------------------------------------------------
Tenant Name        : ${pay.tenantName}
Tenant Account Ref : ${pay.tenantRef} (Prefix ${prefix})
Apartment Property : ${pay.property}
Unit Assigned      : ${pay.unitNumber} (${pay.unitType})
Lease Term         : ${pay.leaseTerm}
----------------------------------------------------------
PAYMENT INFORMATION
----------------------------------------------------------
Payment Note / Ref : ${pay.paymentNote}
Amount Paid        : KSh ${Number(pay.amount).toLocaleString()}
Billing Period     : Due ${pay.dueDate} | Paid ${pay.paidDate}
Confirmed By       : ${pay.confirmedBy || 'Verified ARabella agency Ledger'}
Confirmed Date     : ${pay.confirmedAt || pay.paidDate || 'Verified'}
==========================================================
    Thank you for your prompt rent payment with ARabella agency!
==========================================================
`.trim();

    const blob = new Blob([receiptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ARabella-Agency-Receipt-${pay.tenantRef}-${pay.paymentId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Receipt ${receiptNum} downloaded.`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#172B25] text-white text-xs font-semibold shadow-xl border border-[#273e34] animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[#BFEF43] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Page Purpose */}
      <div className="bg-white rounded-3xl p-6 border border-[#E7ECE9] shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-lg bg-[#EAF4EE] text-[#145338] text-[11px] font-bold uppercase tracking-wider">
                Financial Ledger
              </span>
              <span className="text-xs text-[#7B8983]">•</span>
              <span className="text-xs text-[#7B8983] flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#145338]" />
                Prefix-Based Strict Tenant Allocation
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#172B25] tracking-tight">
              Rent Payments &amp; Collections
            </h1>
            <p className="text-sm text-[#7B8983] mt-0.5">
              Filter payments by apartment prefix to eliminate confusion between tenants with similar names.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenAddPayment(selectedPropertyId !== 'ALL' ? selectedPropertyId : undefined)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#BFEF43] hover:bg-[#b0de3a] text-[#172B25] text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Record Rent Payment</span>
            </button>
          </div>
        </div>

        {/* 1. APARTMENT PREFIX NAVIGATION TABS */}
        <div className="mt-6 pt-5 border-t border-[#E7ECE9]">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#172B25]">
              <Layers className="w-4 h-4 text-[#145338]" />
              <span>Filter by Apartment Prefix:</span>
            </div>
            {activeProperty && (
              <button
                onClick={() => setSelectedPropertyId('ALL')}
                className="text-xs font-semibold text-[#145338] hover:text-[#0d3826] cursor-pointer"
              >
                Clear Filter (View All Properties)
              </button>
            )}
          </div>

          {/* Dynamic Property Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* All Properties Tab */}
            <button
              onClick={() => {
                setSelectedPropertyId('ALL');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedPropertyId === 'ALL'
                  ? 'bg-[#172B25] text-white shadow-xs'
                  : 'bg-[#F5F7F6] hover:bg-[#EAF4EE] text-[#46544E]'
              }`}
            >
              <Building2 className={`w-3.5 h-3.5 ${selectedPropertyId === 'ALL' ? 'text-[#BFEF43]' : 'text-[#7B8983]'}`} />
              <span>All Properties</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                  selectedPropertyId === 'ALL'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#E7ECE9] text-[#172B25]'
                }`}
              >
                {payments.length}
              </span>
            </button>

            {/* Individual Property Prefix Tabs */}
            {propertyTabStats.map((tab) => {
              const isSelected = selectedPropertyId === tab.property.id;
              return (
                <button
                  key={tab.property.id}
                  onClick={() => {
                    setSelectedPropertyId(tab.property.id);
                    setCurrentPage(1);
                  }}
                  className={`group inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#172B25] text-white shadow-xs'
                      : 'bg-[#F5F7F6] hover:bg-[#EAF4EE] text-[#46544E]'
                  }`}
                >
                  {/* Distinctive Prefix Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-mono-num font-bold tracking-tight uppercase ${
                      isSelected
                        ? 'bg-[#BFEF43] text-[#172B25]'
                        : 'bg-white text-[#145338] border border-[#E7ECE9]'
                    }`}
                  >
                    Prefix {tab.prefix}
                  </span>

                  <span className="truncate max-w-[160px] font-bold">
                    {tab.property.name}
                  </span>

                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E7ECE9] text-[#7B8983]'
                    }`}
                    title={`${tab.tenantCount} tenants, ${tab.paymentCount} payments`}
                  >
                    {tab.tenantCount}T • {tab.paymentCount}P
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. STRICT PROPERTY SCOPE BANNER (WHEN AN INDIVIDUAL APARTMENT IS ACTIVE) */}
      {activeProperty ? (
        <div className="bg-[#EAF4EE] border border-[#CDE5D8] rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#172B25] text-[#BFEF43] flex flex-col items-center justify-center font-mono-num font-bold shrink-0 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider text-white/70">PFX</span>
              <span className="text-lg leading-none">{activePropertyPrefix}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#172B25]">
                  {activeProperty.name}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-[#145338] text-white text-[10px] font-bold uppercase tracking-wider">
                  Active Filter
                </span>
              </div>
              <p className="text-xs text-[#46544E] mt-0.5">
                {activeProperty.address} • Manager: {activeProperty.manager || 'Property Manager'} • Showing only tenants and payment records strictly linked to this apartment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleOpenAddPayment(activeProperty.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#145338] hover:bg-[#0f402b] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#BFEF43]" />
              <span>Record {activePropertyPrefix} Payment</span>
            </button>
            <button
              onClick={() => setSelectedPropertyId('ALL')}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F7F6] text-[#46544E] text-xs font-semibold border border-[#CDE5D8] cursor-pointer"
            >
              Reset to All
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#F5F7F6] border border-[#E7ECE9] rounded-3xl p-4 flex items-center justify-between gap-3 text-xs text-[#46544E]">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#145338] shrink-0" />
            <span>
              <strong>All Properties Mode:</strong> Displaying cross-portfolio transactions. Select a prefix tab above to lock view and tenant search strictly to one apartment.
            </span>
          </div>
          <span className="font-semibold tabular-nums text-[#172B25] shrink-0">
            {properties.length} Properties Configured
          </span>
        </div>
      )}

      {/* 3. FINANCIAL SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-[#E7ECE9] shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7B8983] mb-2">
            <span>Confirmed Collections</span>
            <span className="w-7 h-7 rounded-xl bg-[#EAF4EE] text-[#145338] flex items-center justify-center font-bold">
              ✓
            </span>
          </div>
          <p className="text-2xl font-bold text-[#172B25] tabular-nums tracking-tight">
            KSh {kpiStats.totalCollected.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#7B8983]">
            <span>{kpiStats.confirmedCount} Paid Transactions</span>
            <span className="text-[#145338] font-bold">Verified Ledger</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#E7ECE9] shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7B8983] mb-2">
            <span>Pending Invoices</span>
            <span className="w-7 h-7 rounded-xl bg-[#FEF6D2] text-[#8A6508] flex items-center justify-center font-bold">
              ⏳
            </span>
          </div>
          <p className="text-2xl font-bold text-[#8A6508] tabular-nums tracking-tight">
            KSh {kpiStats.pendingTotal.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#7B8983]">
            <span>Awaiting Confirmation</span>
            <span className="font-semibold">Review below</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#E7ECE9] shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7B8983] mb-2">
            <span>Overdue Arrears</span>
            <span className="w-7 h-7 rounded-xl bg-[#FDE6E6] text-[#B91C1C] flex items-center justify-center font-bold">
              !
            </span>
          </div>
          <p className="text-2xl font-bold text-[#B91C1C] tabular-nums tracking-tight">
            KSh {kpiStats.overdueTotal.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#7B8983]">
            <span>Unpaid Balances</span>
            <span className="text-[#B91C1C] font-semibold">Action needed</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#E7ECE9] shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7B8983] mb-2">
            <span>Tenants in Current Scope</span>
            <span className="w-7 h-7 rounded-xl bg-[#F5F7F6] text-[#172B25] flex items-center justify-center font-bold">
              👥
            </span>
          </div>
          <p className="text-2xl font-bold text-[#172B25] tabular-nums tracking-tight">
            {kpiStats.totalTenants} Tenants
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#7B8983]">
            <span className="text-[#145338] font-semibold">
              {kpiStats.clearedTenantsCount} Cleared
            </span>
            <span className="text-[#8A6508] font-semibold">
              {kpiStats.dueTenantsCount} With Balance
            </span>
          </div>
        </div>
      </div>

      {/* 4. MAIN PAYMENTS TABLE SECTION */}
      <div className="bg-white rounded-3xl p-6 border border-[#E7ECE9] shadow-xs">
        {/* Table Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#172B25]">
              Payment Records
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[#F5F7F6] text-[#7B8983] text-xs font-semibold tabular-nums border border-[#E7ECE9]">
              {filteredPayments.length} of {scopedData.scopedPayments.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Field with contextual placeholder */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#7B8983] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={
                  activeProperty
                    ? `Search within ${activeProperty.name}...`
                    : 'Search tenant, ref (A-001), apartment...'
                }
                className="pl-9 pr-8 py-2 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] placeholder-[#7B8983] focus:outline-none focus:ring-2 focus:ring-[#BFEF43] w-64 md:w-72 font-medium"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7B8983] hover:text-[#172B25] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3.5 pr-8 py-2 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Confirmed (Paid)</option>
                <option value="Pending">Pending Verification</option>
                <option value="Overdue">Overdue Arrears</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#7B8983] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Print Batch Statements */}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#F5F7F6] hover:bg-[#EAF4EE] text-[#46544E] text-xs font-bold border border-[#E7ECE9] cursor-pointer transition-colors"
              title="Print Current Statement View"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print View</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredPayments.length === 0 ? (
          <div className="py-14 text-center rounded-2xl bg-[#F5F7F6] border border-dashed border-[#E7ECE9]">
            <Building2 className="w-10 h-10 text-[#7B8983] mx-auto mb-3 opacity-60" />
            <p className="text-sm font-bold text-[#172B25] mb-1">
              No payment records match your filters
            </p>
            <p className="text-xs text-[#7B8983] max-w-md mx-auto mb-4">
              {activeProperty
                ? `No payment transactions found strictly linked to ${activeProperty.name} (${activePropertyPrefix}). You can record a verified payment now.`
                : 'No payments found matching the current search criteria.'}
            </p>
            <button
              onClick={() => handleOpenAddPayment(activeProperty?.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#BFEF43] text-[#172B25] text-xs font-bold cursor-pointer hover:bg-[#b0de3a]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Rent Payment</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7F6] text-[#7B8983] text-[11px] font-bold uppercase tracking-wider border-b border-[#E7ECE9]">
                  <th className="py-3 px-3.5 rounded-l-2xl">
                    <span className="inline-flex items-center gap-1">
                      Tenant Name &amp; Ref
                    </span>
                  </th>
                  <th className="py-3 px-3.5">
                    <span className="inline-flex items-center gap-1">
                      Apartment &amp; Prefix
                    </span>
                  </th>
                  <th className="py-3 px-3.5">Unit</th>
                  <th className="py-3 px-3.5">Payment Note</th>
                  <th className="py-3 px-3.5">Period &amp; Dates</th>
                  <th className="py-3 px-3.5">Amount (KSh)</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 rounded-r-2xl text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7ECE9] text-xs">
                {paginatedPayments.map((row) => {
                  // Resolve tenant's assigned property & prefix
                  const tenantMeta = tenantMetaMap.get(row.tenantRef.toUpperCase());
                  const resolvedPrefix = tenantMeta?.prefix || 'A';
                  const resolvedPropName =
                    tenantMeta?.property?.name || row.property || 'Main Property';

                  const isPaid = row.status === 'Paid';
                  const isPending = row.status === 'Pending';
                  const isOverdue = row.status === 'Overdue';

                  const statusClass = isPaid
                    ? 'bg-[#EAF4EE] text-[#145338] border-[#CDE5D8]'
                    : isPending
                    ? 'bg-[#FEF6D2] text-[#8A6508] border-[#FDECB0]'
                    : 'bg-[#FDE6E6] text-[#B91C1C] border-[#FBD5D5]';

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[#F9FBFA] transition-colors"
                    >
                      {/* Tenant Name & Account Reference */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center gap-3">
                          <AvatarBadge
                            name={row.tenantName}
                            bg={row.avatarBg || '#D8F3E5'}
                            className="w-9 h-9 shrink-0"
                          />
                          <div>
                            <p className="font-bold text-[#172B25] leading-tight flex items-center gap-1.5">
                              {row.tenantName}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => onSelectTenantRef(row.tenantRef)}
                                className="font-mono-num font-bold text-[#145338] bg-[#EAF4EE] hover:bg-[#d5eee0] px-2 py-0.5 rounded-md text-[10.5px] cursor-pointer"
                                title="Open Tenant Profile"
                              >
                                {row.tenantRef}
                              </button>
                              <span className="text-[10px] text-[#7B8983] tabular-nums font-mono">
                                {row.paymentId}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Apartment & Prefix Column (Always displayed so cross-apartment confusion is impossible) */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#172B25] text-white text-[10px] font-mono-num font-bold uppercase">
                            <span className="text-[#BFEF43]">Prefix</span> {resolvedPrefix}
                          </span>
                          <span className="font-semibold text-[#172B25] text-xs">
                            {resolvedPropName}
                          </span>
                        </div>
                      </td>

                      {/* Unit */}
                      <td className="py-3.5 px-3.5 font-medium text-[#172B25]">
                        <span className="font-bold text-[#172B25]">
                          {row.unitNumber}
                        </span>
                        <span className="block text-[10px] text-[#7B8983]">
                          {row.unitType}
                        </span>
                      </td>

                      {/* Payment Note / Method */}
                      <td className="py-3.5 px-3.5 text-[#46544E] max-w-[180px]">
                        <span className="line-clamp-1 font-medium">
                          {row.paymentNote || 'Rent Payment'}
                        </span>
                        <span className="text-[10.5px] text-[#7B8983]">
                          Term: {row.leaseTerm || '12 Months'}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-3.5 text-[#46544E] tabular-nums">
                        <div className="text-[11.5px]">
                          <span className="text-[#7B8983]">Due:</span> {row.dueDate}
                        </div>
                        <div className="text-[11px] text-[#145338] font-semibold">
                          <span className="text-[#7B8983]">Paid:</span> {row.paidDate}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-3.5 font-bold text-[#172B25] tabular-nums text-[13px]">
                        KSh {row.amount.toLocaleString()}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusClass}`}
                        >
                          {isPaid && <CheckCircle2 className="w-3 h-3 text-[#145338]" />}
                          {isPending && <span className="w-1.5 h-1.5 rounded-full bg-[#8A6508]" />}
                          {isOverdue && <AlertCircle className="w-3 h-3 text-[#B91C1C]" />}
                          <span>{isPaid ? 'Confirmed' : row.status}</span>
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* Confirm Button for Pending/Overdue */}
                          {!isPaid ? (
                            <button
                              onClick={() => setConfirmDialogPayment(row)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#BFEF43] hover:bg-[#b0de3a] text-[#172B25] text-xs font-bold cursor-pointer shadow-2xs"
                              title="Verify & Confirm Payment"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDownloadReceipt(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#EAF4EE] hover:bg-[#d5eee0] text-[#145338] text-xs font-bold cursor-pointer"
                              title="Download Verified Receipt"
                            >
                              <Download className="w-3 h-3" />
                              <span>Receipt</span>
                            </button>
                          )}

                          {/* View Tenant Profile */}
                          <button
                            onClick={() => onSelectTenantRef(row.tenantRef)}
                            className="w-8 h-8 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-[#46544E] flex items-center justify-center cursor-pointer transition-colors"
                            title="View Full Tenant Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Payment */}
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete payment record ${row.paymentId} for ${row.tenantName} (${row.tenantRef})?`
                                )
                              ) {
                                onDeletePayment(row.id);
                              }
                            }}
                            className="w-8 h-8 rounded-xl bg-[#F5F7F6] hover:bg-[#FDE6E6] text-[#7B8983] hover:text-[#B91C1C] flex items-center justify-center cursor-pointer transition-colors"
                            title="Delete Payment Record"
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

        {/* Pagination Bar */}
        {filteredPayments.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#E7ECE9] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7B8983]">
            <span>
              Showing{' '}
              <strong className="text-[#172B25] tabular-nums">
                {(currentPage - 1) * itemsPerPage + 1}–
                {Math.min(currentPage * itemsPerPage, filteredPayments.length)}
              </strong>{' '}
              of{' '}
              <strong className="text-[#172B25] tabular-nums">
                {filteredPayments.length}
              </strong>{' '}
              payments
            </span>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-[#172B25] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 rounded-xl bg-[#172B25] text-white font-bold tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="w-8 h-8 rounded-xl bg-[#F5F7F6] hover:bg-[#E7ECE9] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-[#172B25] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. PAYMENT RECORDING SAFEGUARDS MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleCreatePayment}
            className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-[#E7ECE9] my-8"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E7ECE9] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EAF4EE] text-[#145338] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#172B25]">
                    Record Rent Payment
                  </h3>
                  <p className="text-xs text-[#7B8983]">
                    Safeguarded tenant &amp; property allocation workflow
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-xl text-[#7B8983] hover:bg-[#F5F7F6] hover:text-[#172B25] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-2xl bg-[#FDE6E6] border border-[#FBD5D5] text-[#B91C1C] text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* STEP 1: SELECT APARTMENT / PROPERTY */}
              <div>
                <label className="block font-bold text-[#172B25] mb-1.5">
                  1. Target Apartment / Property
                </label>
                <select
                  value={formPropertyId}
                  onChange={(e) => handleModalPropertyChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#BFEF43] cursor-pointer"
                >
                  {properties.map((p, idx) => {
                    const prefix = getPropertyPrefix(p, idx);
                    return (
                      <option key={p.id} value={p.id}>
                        Prefix {prefix} — {p.name} ({p.address})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* STEP 2: SELECT TENANT (STRICTLY SCOPED TO CHOSEN PROPERTY) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-[#172B25]">
                    2. Select Assigned Tenant
                  </label>
                  <span className="text-[11px] text-[#145338] font-bold">
                    Scoped to Prefix {selectedModalPrefix}
                  </span>
                </div>

                {(() => {
                  const propNameLower = selectedModalProperty
                    ? selectedModalProperty.name.trim().toLowerCase()
                    : '';
                  const propTenants = tenants.filter(
                    (t) =>
                      t.propertyId === formPropertyId ||
                      (t.property &&
                        t.property.trim().toLowerCase() === propNameLower)
                  );

                  if (propTenants.length === 0) {
                    return (
                      <div className="p-3 rounded-2xl bg-[#FEF6D2] border border-[#FDECB0] text-[#8A6508] text-xs">
                        No tenants currently registered under {selectedModalProperty?.name || 'this property'}. Please assign or register a tenant first.
                      </div>
                    );
                  }

                  return (
                    <select
                      value={formTenantRef}
                      onChange={(e) => handleModalTenantChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#BFEF43] cursor-pointer"
                    >
                      {propTenants.map((t) => (
                        <option key={t.id} value={t.tenantRef}>
                          [{t.tenantRef}] {t.name} — {t.unitNumber} (Balance: KSh {(t.rentBalance ?? 0).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              {/* STEP 3: MANDATORY VERIFICATION SAFEGUARD CARD */}
              {selectedModalTenant && (
                <div className="rounded-2xl bg-[#F5F7F6] border border-[#D5E5DC] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#145338] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Tenant &amp; Apartment Safeguard Verification
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#172B25] text-[#BFEF43] font-mono-num font-bold text-[10.5px]">
                      Prefix {selectedModalPrefix}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-[#E7ECE9]">
                      <span className="text-[10.5px] text-[#7B8983] block">
                        Tenant Name
                      </span>
                      <strong className="text-[#172B25] text-xs">
                        {selectedModalTenant.name}
                      </strong>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-[#E7ECE9]">
                      <span className="text-[10.5px] text-[#7B8983] block">
                        Account Reference
                      </span>
                      <strong className="text-[#145338] font-mono-num text-xs">
                        {selectedModalTenant.tenantRef}
                      </strong>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-[#E7ECE9]">
                      <span className="text-[10.5px] text-[#7B8983] block">
                        Apartment &amp; Unit
                      </span>
                      <strong className="text-[#172B25] text-xs">
                        {selectedModalProperty?.name} • {selectedModalTenant.unitNumber}
                      </strong>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-[#E7ECE9]">
                      <span className="text-[10.5px] text-[#7B8983] block">
                        Current Outstanding Balance
                      </span>
                      <strong
                        className={`text-xs ${
                          (selectedModalTenant.rentBalance ?? 0) > 0
                            ? 'text-[#B91C1C]'
                            : 'text-[#145338]'
                        }`}
                      >
                        KSh {(selectedModalTenant.rentBalance ?? 0).toLocaleString()}
                        {(selectedModalTenant.rentBalance ?? 0) <= 0 && ' (Cleared)'}
                      </strong>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#7B8983] leading-relaxed">
                    <strong>Safeguard Rule:</strong> Payments are credited strictly to unique account reference{' '}
                    <span className="font-mono font-bold text-[#172B25]">{selectedModalTenant.tenantRef}</span> at{' '}
                    <span className="font-bold text-[#172B25]">{selectedModalProperty?.name}</span>. Allocation by name alone is strictly prevented.
                  </p>
                </div>
              )}

              {/* PAYMENT DETAILS: AMOUNT & NOTES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Amount Paid (KSh)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formAmount}
                    onChange={(e) => {
                      setFormAmount(Number(e.target.value));
                      setSafeguardVerified(false);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] font-bold text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#BFEF43]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Payment Status
                  </label>
                  <select
                    value={formPayStatus}
                    onChange={(e) => setFormPayStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#BFEF43]"
                  >
                    <option value="Paid">Paid (Confirmed Immediately)</option>
                    <option value="Pending">Pending Bank / M-Pesa Verification</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Payment Method / Reference Note
                </label>
                <input
                  type="text"
                  required
                  value={formPaymentNote}
                  onChange={(e) => setFormPaymentNote(e.target.value)}
                  placeholder="e.g. M-Pesa QKH294120 / Equity Bank Transfer"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-[#172B25] text-xs focus:outline-none focus:ring-2 focus:ring-[#BFEF43]"
                />
              </div>

              {/* MANDATORY CONFIRMATION CHECKBOX */}
              <div className="pt-2">
                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#EAF4EE] border border-[#CDE5D8] cursor-pointer hover:bg-[#e2f1e7] transition-colors">
                  <input
                    type="checkbox"
                    checked={safeguardVerified}
                    onChange={(e) => setSafeguardVerified(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#145338] accent-[#145338] cursor-pointer"
                  />
                  <div className="text-xs text-[#172B25]">
                    <span className="font-bold block">
                      Confirm Tenant &amp; Apartment Verification
                    </span>
                    <span className="text-[#46544E] text-[11px] block mt-0.5">
                      I confirm that this payment of KSh {Number(formAmount).toLocaleString()} is for{' '}
                      <strong>{formTenantName || 'the selected tenant'}</strong> at{' '}
                      <strong>{selectedModalProperty?.name}</strong> (Prefix {selectedModalPrefix}, Unit {formUnitNumber}, Ref: {formTenantRef}).
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-[#E7ECE9] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2.5 rounded-2xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-[#46544E] text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !safeguardVerified}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#BFEF43] hover:bg-[#b0de3a] disabled:opacity-40 disabled:pointer-events-none text-[#172B25] text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {saving ? (
                  <span>Recording...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save &amp; Allocate Payment</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. SERVER-SIDE PAYMENT CONFIRMATION DIALOG */}
      {confirmDialogPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E7ECE9]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-[#BFEF43] text-[#172B25] flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172B25]">
                  Confirm Payment Receipt
                </h3>
                <p className="text-xs text-[#7B8983]">
                  Verify ledger entry and generate receipt statement
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-[#7B8983]">Tenant Name:</span>
                <strong className="text-[#172B25]">
                  {confirmDialogPayment.tenantName}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7B8983]">Account Reference:</span>
                <strong className="font-mono text-[#145338]">
                  {confirmDialogPayment.tenantRef}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7B8983]">Property &amp; Unit:</span>
                <strong className="text-[#172B25]">
                  {confirmDialogPayment.property} • {confirmDialogPayment.unitNumber}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7B8983]">Amount:</span>
                <strong className="text-[#145338] text-sm font-bold tabular-nums">
                  KSh {confirmDialogPayment.amount.toLocaleString()}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7B8983]">Payment Note:</span>
                <span className="text-[#46544E]">
                  {confirmDialogPayment.paymentNote}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDialogPayment(null)}
                className="px-4 py-2.5 rounded-2xl bg-[#F5F7F6] hover:bg-[#E7ECE9] text-[#46544E] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingPayment}
                onClick={handleExecuteConfirmPayment}
                className="px-5 py-2.5 rounded-2xl bg-[#172B25] hover:bg-[#253d34] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {confirmingPayment ? (
                  <span>Confirming...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#BFEF43]" />
                    <span>Confirm &amp; Issue Receipt</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
