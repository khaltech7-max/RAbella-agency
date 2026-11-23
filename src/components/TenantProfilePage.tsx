import React, { useState, useMemo, useEffect } from 'react';
import { AnimatedCounter } from './AnimatedMetrics';
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
  Download,
  LogOut,
  ShieldCheck,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import {
  TenantProfile,
  NavPageId,
  PropertyRecord,
  UnitTypeItem,
  ExpenseTransaction,
  UserRole,
} from '../data/rentalData';
import { AvatarBadge, UnitIllustration } from './UnitIllustration';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import {
  InvoiceDocumentData,
  buildInvoiceDataFromPayment,
  downloadDesignedInvoiceFile,
  downloadDesignedInvoicePng,
} from '../lib/invoiceGenerator';
import {
  formatOrdinalDay,
  formatYmdShort,
  getBillingAnniversaryDay,
  getBillingCycleForDate,
  getBillingCycleForIndex,
  getNairobiTodayYmd,
  getNextBillingDate,
  parseBillingDateToYmd,
} from '../lib/anniversaryBilling';

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
    dueDate?: string;
    leaseStart?: string;
    leaseDuration?: string;
    leaseNotes?: string;
    dob?: string;
    gender?: string;
    nationality?: string;
    idNumber?: string;
    securityDeposit?: number;
    depositStatus?: 'Held' | 'Not Paid' | 'Returned' | 'Partially Returned' | 'Forfeited';
    vehicleInfo?: string;
    occupants?: string;
    initialPaymentStatus?: 'Paid' | 'Pending';
  }) => Promise<TenantProfile>;
  onUpdateTenant: (id: string, data: Partial<TenantProfile>) => Promise<void>;
  onVacateTenant?: (
    id: string,
    payload: {
      vacatedAt?: string;
      depositReturned: boolean;
      depositStatus?: 'Returned' | 'Partially Returned' | 'Forfeited' | 'Not Paid';
      depositReturnedAmount: number;
      hasDamages: boolean;
      damageAmount: number;
      damageNotes?: string;
      recordDamageAsExpense: boolean;
      expenseCategory?: ExpenseTransaction['category'];
      expenseTitle?: string;
    }
  ) => Promise<{ tenant: TenantProfile; expense?: ExpenseTransaction | null } | undefined>;
  onDeleteTenant: (id: string) => Promise<void>;
  onRecordTenantPayment: (tenantRef: string) => Promise<void>;
  onUpdateProperty?: (id: string, data: Partial<PropertyRecord>) => Promise<void>;
  currentUserRole?: UserRole;
  onNavigate: (page: NavPageId) => void;
  globalSearch?: string;
  onGlobalSearchChange?: (val: string) => void;
}

export const TenantProfilePage: React.FC<TenantProfilePageProps> = ({
  tenants,
  properties,
  unitTypes,
  selectedTenantRef,
  onSelectTenantRef,
  onAddTenant,
  onUpdateTenant,
  onVacateTenant,
  onDeleteTenant,
  onRecordTenantPayment,
  onUpdateProperty,
  currentUserRole,
  onNavigate,
  globalSearch = '',
  onGlobalSearchChange,
}) => {
  const isAdminOrManager =
    !currentUserRole ||
    ['super_admin', 'owner', 'administrator', 'property_manager'].includes(currentUserRole);

  // Global search & filter states
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'cleared' | 'due' | 'overdue' | 'vacated'
  >('all');

  useEffect(() => {
    setSearchQuery(globalSearch || '');
  }, [globalSearch]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    onGlobalSearchChange?.(val);
  };

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
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceDocumentData | null>(null);

  const handleDownloadTenantInvoiceLedger = (tenant: TenantProfile) => {
    const todayYmd = getNairobiTodayYmd();
    const moveInYmd = parseBillingDateToYmd(tenant.moveInDate || tenant.leaseStart) || todayYmd;
    const activeCycle = getBillingCycleForDate(moveInYmd, todayYmd);
    const activeStart = activeCycle?.periodStart || moveInYmd;
    const activeEnd = activeCycle?.periodEnd || moveInYmd;
    const activeDue = activeCycle?.dueDate || moveInYmd;
    const syntheticPayments = (tenant.paymentHistory || []).map((p, idx) => {
      const pStart = parseBillingDateToYmd(p.periodStart) || activeStart;
      const pEnd = parseBillingDateToYmd(p.periodEnd) || getBillingCycleForDate(moveInYmd, pStart)?.periodEnd || activeEnd;
      const amt = Number(p.amount || tenant.monthlyRent || 0);
      return {
        id: p.id || `pay-${idx}`,
        paymentId: p.id || `INV-${tenant.tenantRef}-${idx + 1}`,
        tenantName: tenant.name,
        tenantRef: tenant.tenantRef,
        avatarBg: tenant.avatarBg,
        unitNumber: p.unitNumber || tenant.unitNumber,
        property: tenant.property,
        unitType: tenant.unitType,
        paymentNote: `Monthly Rent (${formatYmdShort(pStart)} - ${formatYmdShort(pEnd)})`,
        leaseTerm: tenant.leaseDuration || '12 Months',
        dueDate: pStart,
        paidDate: p.paymentDate || '-',
        invoiceDate: pStart,
        billingPeriodStart: pStart,
        billingPeriodEnd: pEnd,
        amount: amt,
        amountPaid: p.status === 'Paid' ? amt : 0,
        balanceDue: p.status === 'Paid' ? 0 : amt,
        status: (p.status === 'Paid' ? 'Paid' : p.status === 'Overdue' ? 'Overdue' : 'Pending') as 'Paid' | 'Pending' | 'Overdue',
      };
    });
    const fallbackAmount = Number(tenant.monthlyRent || tenant.rentBalance || 0);
    const fallbackBalance = Number(tenant.rentBalance ?? (tenant.status === 'Paid' ? 0 : fallbackAmount));
    const fallbackPaid = Math.max(0, fallbackAmount - fallbackBalance);
    const primaryRecord = syntheticPayments[0] || {
      id: `inv-${tenant.id}`,
      paymentId: `INV-${new Date().getFullYear()}-${tenant.tenantRef}`,
      tenantName: tenant.name,
      tenantRef: tenant.tenantRef,
      avatarBg: tenant.avatarBg,
      unitNumber: tenant.unitNumber,
      property: tenant.property,
      unitType: tenant.unitType,
      paymentNote: `Monthly Rent (${formatYmdShort(activeStart)} - ${formatYmdShort(activeEnd)})`,
      leaseTerm: tenant.leaseDuration || '12 Months',
      dueDate: parseBillingDateToYmd(tenant.dueDate) || activeDue,
      paidDate: tenant.status === 'Paid' ? todayYmd : '-',
      invoiceDate: activeStart,
      billingPeriodStart: tenant.currentBillingPeriodStart || activeStart,
      billingPeriodEnd: tenant.currentBillingPeriodEnd || activeEnd,
      amount: fallbackAmount,
      amountPaid: fallbackPaid,
      balanceDue: fallbackBalance,
      status: (tenant.status === 'Paid' ? 'Paid' : tenant.status === 'Overdue' ? 'Overdue' : 'Pending') as 'Paid' | 'Pending' | 'Overdue',
    };
    const docData = buildInvoiceDataFromPayment(
      primaryRecord,
      primaryRecord.paymentId,
      syntheticPayments,
      tenant
    );
    setPreviewInvoice(docData);
    downloadDesignedInvoiceFile(docData, 'Invoice');
  };
  const [prefixModalProperty, setPrefixModalProperty] =
    useState<PropertyRecord | null>(null);
  const [newPrefixValue, setNewPrefixValue] = useState('');
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const getDefaultNairobiDateInput = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };

  const toDateInputValue = (raw?: string) => {
    if (!raw) return getDefaultNairobiDateInput();
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
      return `${dotMatch[3]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[1].padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return getDefaultNairobiDateInput();
  };

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
  const [editDeposit, setEditDeposit] = useState(0);
  const [editDepositStatus, setEditDepositStatus] = useState<
    'Held' | 'Not Paid' | 'Returned' | 'Partially Returned' | 'Forfeited'
  >('Held');
  const [editDueDate, setEditDueDate] = useState(getDefaultNairobiDateInput);
  const [editDuration, setEditDuration] = useState('12 Months');
  const [editOccupants, setEditOccupants] = useState('2 Adults');
  const [customNote, setCustomNote] = useState('');

  // Add Tenant form state (Deposit is strictly entered manually by Admin)
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
  const [newDueDate, setNewDueDate] = useState(getDefaultNairobiDateInput);
  const [newDuration, setNewDuration] = useState('12 Months');
  const [newDeposit, setNewDeposit] = useState<string>('');
  const [newDepositStatus, setNewDepositStatus] = useState<'Held' | 'Not Paid'>('Held');
  const [newOccupants, setNewOccupants] = useState('2 Adults');
  const [newInitialStatus, setNewInitialStatus] = useState<'Paid' | 'Pending'>(
    'Pending'
  );

  // Vacate & Deposit Settlement Modal state
  const [vacateModalTenant, setVacateModalTenant] = useState<TenantProfile | null>(null);
  const [vacateDate, setVacateDate] = useState(getDefaultNairobiDateInput);
  const [vacateDepositStatus, setVacateDepositStatus] = useState<
    'Returned' | 'Partially Returned' | 'Forfeited' | 'Not Paid'
  >('Returned');
  const [vacateReturnedAmount, setVacateReturnedAmount] = useState<string>('');
  const [vacateReturnedConfirmed, setVacateReturnedConfirmed] = useState(false);
  const [vacateHasDamages, setVacateHasDamages] = useState(false);
  const [vacateDamageAmount, setVacateDamageAmount] = useState<string>('');
  const [vacateDamageNotes, setVacateDamageNotes] = useState('');
  const [vacateRecordExpense, setVacateRecordExpense] = useState(true);
  const [vacateExpenseCategory, setVacateExpenseCategory] =
    useState<ExpenseTransaction['category']>('Maintenance and Repairs');
  const [vacateExpenseTitle, setVacateExpenseTitle] = useState('');
  const [vacatingSaving, setVacatingSaving] = useState(false);
  const [toastActionPage, setToastActionPage] = useState<NavPageId | null>(null);

  const showToast = (msg: string, actionPage?: NavPageId | null) => {
    setToastMessage(msg);
    setToastActionPage(actionPage ?? null);
    setTimeout(() => {
      setToastMessage(null);
      setToastActionPage(null);
    }, 5500);
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

      const activePropTenants = propTenants.filter((t) => t.tenancyStatus !== 'Vacated');

      const clearedCount = activePropTenants.filter(
        (t) => t.status === 'Paid' && (t.rentBalance ?? 0) <= 0
      ).length;
      const dueCount = activePropTenants.filter(
        (t) =>
          t.status === 'Pending' ||
          ((t.rentBalance ?? 0) > 0 && t.status !== 'Overdue')
      ).length;
      const overdueCount = activePropTenants.filter(
        (t) => t.status === 'Overdue' || ((t.rentBalance ?? 0) > 0 && t.status !== 'Paid')
      ).length;

      const totalMonthlyRent = activePropTenants.reduce(
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

  const activeSearchQuery = (searchQuery || globalSearch).trim().toLowerCase();

  // Filter and search logic across apartment groups
  const filteredApartmentGroups = useMemo(() => {
    const query = activeSearchQuery;

    return apartmentGroups.groups
      .map((group) => {
        const propertyMatchesQuery =
          Boolean(query) &&
          (group.property.name.toLowerCase().includes(query) ||
            group.prefix.toLowerCase() === query ||
            `prefix ${group.prefix.toLowerCase()}`.includes(query) ||
            (group.property.address || '').toLowerCase().includes(query) ||
            (group.property.manager || '').toLowerCase().includes(query));

        const filteredTenants = group.tenants.filter((tenant) => {
          const isVacated = tenant.tenancyStatus === 'Vacated';
          // Status filter
          if (statusFilter === 'vacated') {
            if (!isVacated) return false;
          } else if (statusFilter === 'cleared') {
            if (isVacated || tenant.status !== 'Paid' || (tenant.rentBalance ?? 0) > 0) {
              return false;
            }
          } else if (statusFilter === 'due') {
            const isDue =
              !isVacated &&
              (tenant.status === 'Pending' ||
                ((tenant.rentBalance ?? 0) > 0 && tenant.status !== 'Overdue'));
            if (!isDue) return false;
          } else if (statusFilter === 'overdue') {
            const isOverdue =
              !isVacated &&
              (tenant.status === 'Overdue' ||
                ((tenant.rentBalance ?? 0) > 0 && tenant.status !== 'Paid'));
            if (!isOverdue) return false;
          }

          // Search query
          if (!query || propertyMatchesQuery) return true;

          const nameMatch = tenant.name.toLowerCase().includes(query);
          const refMatch = tenant.tenantRef.toLowerCase().includes(query);
          const unitMatch = tenant.unitNumber.toLowerCase().includes(query);
          const unitTypeMatch = (tenant.unitType || '').toLowerCase().includes(query);
          const propMatch = tenant.property.toLowerCase().includes(query);
          const phoneMatch = (tenant.phone || '').toLowerCase().includes(query);
          const emailMatch = (tenant.email || '').toLowerCase().includes(query);
          const statusMatch = (tenant.status || '').toLowerCase().includes(query);
          const depositStatusMatch = (tenant.depositStatus || '').toLowerCase().includes(query);
          const tenancyMatch = (tenant.tenancyStatus || '').toLowerCase().includes(query);
          const dueMatch = (tenant.dueDate || '').toLowerCase().includes(query);
          const rentMatch = String(tenant.monthlyRent || '').includes(query);
          const depositMatch = String(tenant.securityDeposit || '').includes(query);

          return (
            nameMatch ||
            refMatch ||
            unitMatch ||
            unitTypeMatch ||
            propMatch ||
            phoneMatch ||
            emailMatch ||
            statusMatch ||
            depositStatusMatch ||
            tenancyMatch ||
            dueMatch ||
            rentMatch ||
            depositMatch
          );
        });

        return {
          ...group,
          filteredTenants,
          hasMatches: filteredTenants.length > 0 || propertyMatchesQuery || !query,
        };
      })
      .filter((group) => group.hasMatches);
  }, [apartmentGroups, activeSearchQuery, statusFilter]);

  const filteredUnassignedTenants = useMemo(() => {
    const query = activeSearchQuery;
    return apartmentGroups.unassignedTenants.filter((tenant) => {
      if (!query) return true;
      return (
        tenant.name.toLowerCase().includes(query) ||
        tenant.tenantRef.toLowerCase().includes(query) ||
        tenant.unitNumber.toLowerCase().includes(query) ||
        (tenant.property || '').toLowerCase().includes(query) ||
        (tenant.phone || '').toLowerCase().includes(query) ||
        (tenant.email || '').toLowerCase().includes(query)
      );
    });
  }, [apartmentGroups.unassignedTenants, activeSearchQuery]);

  // Overall database totals
  const activeTenantsList = tenants.filter((t) => t.tenancyStatus !== 'Vacated');
  const totalTenantsCount = tenants.length;
  const activeTenantsCount = activeTenantsList.length;
  const vacatedTotal = tenants.filter((t) => t.tenancyStatus === 'Vacated').length;
  const totalDepositsHeld = activeTenantsList.reduce(
    (sum, t) =>
      sum + (t.depositStatus !== 'Not Paid' ? Number(t.securityDeposit || 0) : 0),
    0
  );
  const clearedTotal = activeTenantsList.filter(
    (t) => t.status === 'Paid' && (t.rentBalance ?? 0) <= 0
  ).length;
  const dueTotal = activeTenantsList.filter(
    (t) =>
      t.status === 'Pending' ||
      ((t.rentBalance ?? 0) > 0 && t.status !== 'Overdue')
  ).length;
  const overdueTotal = activeTenantsList.filter(
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
    setNewDeposit('');
    setNewDepositStatus('Held');
    setNewDueDate(getDefaultNairobiDateInput());
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
    if (!newName.trim() || !propName) {
      setFormError('Tenant full name and assigned property are required.');
      return;
    }

    const cleanEmail = newEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailPattern.test(cleanEmail)) {
      setFormError(
        'A valid tenant email address is required (used for automatic rent reminders, receipts, and lease notices).'
      );
      return;
    }

    const manualDepositAmount = newDeposit.trim() === '' ? 0 : Math.max(0, Number(newDeposit) || 0);
    if (newDepositStatus === 'Held' && newDeposit.trim() === '') {
      setFormError('Please enter the Security Deposit amount manually (enter 0 or switch status to Not Paid if no deposit was collected).');
      return;
    }

    const resolvedMoveInDate = newDueDate.trim() || getDefaultNairobiDateInput();

    setSaving(true);
    setFormError(null);
    try {
      const created = await onAddTenant({
        name: newName.trim(),
        phone: newPhone.trim() || 'On file',
        email: cleanEmail,
        propertyId: chosenProp?.id,
        property: propName,
        unitNumber: newUnitNumber.trim() || 'Unit 101',
        unitType: newUnitType,
        monthlyRent: Number(newRent),
        leaseStart: resolvedMoveInDate,
        dueDate: resolvedMoveInDate,
        securityDeposit: manualDepositAmount,
        depositStatus: manualDepositAmount > 0 ? newDepositStatus : 'Not Paid',
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
      setNewDeposit('');
      setNewDepositStatus('Held');
      setNewDueDate(getDefaultNairobiDateInput());
      showToast(
        `Tenant ${created.name} registered (Deposit: KSh ${manualDepositAmount.toLocaleString()}) and assigned to ${propName} (Ref: ${created.tenantRef})`
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
    setEditDeposit(Number(t.securityDeposit || 0));
    setEditDepositStatus(
      t.depositStatus || (Number(t.securityDeposit || 0) > 0 ? 'Held' : 'Not Paid')
    );
    setEditDueDate(
      toDateInputValue(
        t.moveInDate || t.leaseStart || t.dueDate || t.paymentHistory?.[0]?.periodStart
      )
    );
    setEditDuration(t.leaseDuration);
    setEditOccupants(t.occupants);
    setCustomNote(t.leaseNotes);
    setEditTenantModalOpen(true);
  };

  // Submit Edit Tenant
  const handleSaveTenantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    const cleanEmail = editEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailPattern.test(cleanEmail)) {
      setFormError('Please provide a valid email address for the tenant.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const chosenProp = properties.find((p) => p.id === editPropertyId);
      const cleanMoveIn = editDueDate.trim() || editingTenant.moveInDate || editingTenant.leaseStart;
      const cleanDeposit = Math.max(0, Number(editDeposit) || 0);
      await onUpdateTenant(editingTenant.id, {
        name: editName.trim() || editingTenant.name,
        phone: editPhone.trim() || editingTenant.phone,
        email: cleanEmail,
        propertyId: chosenProp?.id || editingTenant.propertyId,
        property: chosenProp?.name || editingTenant.property,
        unitNumber: editUnitNumber.trim() || editingTenant.unitNumber,
        unitType: editUnitType,
        monthlyRent: Number(editRent),
        leaseStart: cleanMoveIn,
        dueDate: cleanMoveIn,
        securityDeposit: cleanDeposit,
        depositStatus: editDepositStatus,
        leaseDuration: editDuration,
        occupants: editOccupants,
        leaseNotes: customNote,
      });
      setEditTenantModalOpen(false);
      showToast(`Updated profile & deposit details for ${editName.trim() || editingTenant.name}`);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update tenant in Supabase.');
    } finally {
      setSaving(false);
    }
  };

  // Open Vacate & Deposit Settlement modal
  const handleOpenVacateModal = (t: TenantProfile) => {
    setFormError(null);
    setVacateModalTenant(t);
    setVacateDate(t.vacatedAt || getDefaultNairobiDateInput());
    const held = Number(t.securityDeposit || 0);
    const existingDeduct = Number(t.depositDeductionAmount || 0);
    const existingReturned =
      t.tenancyStatus === 'Vacated'
        ? Number(t.depositReturnedAmount ?? 0)
        : held;
    setVacateHasDamages(existingDeduct > 0);
    setVacateDamageAmount(existingDeduct > 0 ? String(existingDeduct) : '');
    setVacateDamageNotes(t.depositDamageNotes || '');
    setVacateRecordExpense(true);
    setVacateExpenseCategory('Maintenance and Repairs');
    setVacateExpenseTitle('');
    setVacateDepositStatus(
      t.tenancyStatus === 'Vacated' && t.depositStatus && t.depositStatus !== 'Held'
        ? (t.depositStatus as any)
        : held > 0
        ? 'Returned'
        : 'Not Paid'
    );
    setVacateReturnedAmount(String(Math.max(0, existingReturned)));
    setVacateReturnedConfirmed(t.tenancyStatus === 'Vacated');
  };

  const handleConfirmVacateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacateModalTenant || !onVacateTenant) return;

    const returnedNum = Math.max(0, Number(vacateReturnedAmount) || 0);
    const damageNum = vacateHasDamages ? Math.max(0, Number(vacateDamageAmount) || 0) : 0;

    if (
      (vacateDepositStatus === 'Returned' || vacateDepositStatus === 'Partially Returned') &&
      returnedNum > 0 &&
      !vacateReturnedConfirmed
    ) {
      setFormError('Please check the confirmation box to mark that the deposit was returned to the tenant.');
      return;
    }

    if (vacateHasDamages && damageNum <= 0) {
      setFormError('Please enter the damage / repair cost amount (KSh) or uncheck the tenant damage option.');
      return;
    }

    setVacatingSaving(true);
    setFormError(null);
    try {
      const result = await onVacateTenant(vacateModalTenant.id, {
        vacatedAt: vacateDate || getDefaultNairobiDateInput(),
        depositReturned: vacateReturnedConfirmed || returnedNum > 0,
        depositStatus: vacateDepositStatus,
        depositReturnedAmount: returnedNum,
        hasDamages: vacateHasDamages,
        damageAmount: damageNum,
        damageNotes: vacateDamageNotes.trim(),
        recordDamageAsExpense: vacateHasDamages && vacateRecordExpense && damageNum > 0,
        expenseCategory: vacateExpenseCategory,
        expenseTitle: vacateExpenseTitle.trim() || undefined,
      });

      const vacatedName = vacateModalTenant.name;
      const hasLoggedExpense = Boolean(result?.expense);
      setVacateModalTenant(null);
      if (hasLoggedExpense) {
        showToast(
          `${vacatedName} marked as Vacated (${vacateDepositStatus}: KSh ${returnedNum.toLocaleString()} returned). Damage repair cost (KSh ${damageNum.toLocaleString()}) added to Expenses.`,
          'expenses'
        );
      } else {
        showToast(
          `${vacatedName} marked as Vacated. Deposit status: ${vacateDepositStatus} (Returned: KSh ${returnedNum.toLocaleString()}).`
        );
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to vacate tenant and settle deposit.');
    } finally {
      setVacatingSaving(false);
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
    <div className="space-y-6 bg-transparent text-[#172B25] min-h-screen">
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
          <div className="rms-card-hover p-3 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9]">
            <p className="text-[11px] font-medium text-[#7B8983]">Active Tenancies</p>
            <p className="text-xl font-bold text-[#172B25] mt-0.5 tabular-nums">
              <AnimatedCounter value={activeTenantsCount} suffix=" Active" />
            </p>
          </div>
          <div className="rms-card-hover p-3 rounded-xl bg-[#D9F5E7]/50 border border-[#BCEAD2]">
            <p className="text-[11px] font-medium text-[#145338]">Security Deposits Held</p>
            <p className="text-xl font-bold text-[#145338] mt-0.5 tabular-nums">
              KSh <AnimatedCounter value={totalDepositsHeld} />
            </p>
          </div>
          <div className="rms-card-hover p-3 rounded-xl bg-[#FEF3C7]/60 border border-[#FDE68A]">
            <p className="text-[11px] font-medium text-[#92400E]">Rent Due</p>
            <p className="text-xl font-bold text-[#92400E] mt-0.5 tabular-nums">
              <AnimatedCounter value={dueTotal} suffix=" Tenants" />
            </p>
          </div>
          <div className="rms-card-hover p-3 rounded-xl bg-[#FDE6E6]/60 border border-[#F8CACA]">
            <p className="text-[11px] font-medium text-[#B91C1C]">Overdue Arrears</p>
            <p className="text-xl font-bold text-[#B91C1C] mt-0.5 tabular-nums">
              <AnimatedCounter value={overdueTotal} suffix=" Tenants" />
            </p>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="px-4 py-3 rounded-2xl bg-[#D9F5E7] border border-[#BCEAD2] text-[#145338] text-xs font-semibold flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage}
          </span>
          <div className="flex items-center gap-3">
            {toastActionPage === 'expenses' && (
              <button
                type="button"
                onClick={() => onNavigate('expenses')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#145338] text-white text-[11px] font-bold hover:opacity-90 cursor-pointer"
              >
                <span>Open Expenses</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setToastMessage(null);
                setToastActionPage(null);
              }}
              className="text-xs underline hover:no-underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
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
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search tenant name, unit number, reference (A-001, B-002)..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] placeholder-[#7B8983] focus:outline-none focus:ring-1 focus:ring-[#BFEF43]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7B8983] hover:text-[#172B25] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters for All Tenants, Cleared, Rent Due, Overdue, and Vacated */}
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
          <button
            type="button"
            onClick={() => setStatusFilter('vacated')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              statusFilter === 'vacated'
                ? 'bg-[#172B25] text-white shadow-xs'
                : 'text-[#7B8983] hover:text-[#172B25]'
            }`}
          >
            Vacated ({vacatedTotal})
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
                            <th className="py-3 px-3">Deposit</th>
                            <th className="py-3 px-3">Rent Balance Status</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7ECE9]/60">
                          {displayedTenants.map((t) => {
                            const isVacated = t.tenancyStatus === 'Vacated';
                            const isOverdue =
                              !isVacated &&
                              (t.status === 'Overdue' ||
                                ((t.rentBalance ?? 0) > 0 && t.status !== 'Paid'));
                            const isDue =
                              !isVacated &&
                              (t.status === 'Pending' ||
                                ((t.rentBalance ?? 0) > 0 && !isOverdue));
                            const depositAmt = Number(t.securityDeposit || 0);
                            const depStatus =
                              t.depositStatus || (depositAmt > 0 ? 'Held' : 'Not Paid');

                            return (
                              <tr
                                key={t.id}
                                className={`hover:bg-[#F5F7F6]/60 transition-colors ${
                                  isVacated ? 'bg-[#F8FAF9]/80 opacity-90' : ''
                                }`}
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
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-bold text-[#172B25] leading-snug break-words">
                                          {t.name}
                                        </p>
                                        {isVacated && (
                                          <span className="px-1.5 py-0.5 rounded bg-[#E7ECE9] text-[#4B5853] text-[9.5px] font-bold uppercase tracking-wide">
                                            Vacated
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-[#7B8983]">
                                        {t.unitType} Suite
                                        {isVacated && t.vacatedAt ? ` • Out ${formatYmdShort(t.vacatedAt)}` : ''}
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

                                {/* Monthly Rent & Anniversary Billing */}
                                <td className="py-3.5 px-3 whitespace-nowrap tabular-nums">
                                  <p className="font-bold text-[#172B25]">
                                    KSh {t.monthlyRent.toLocaleString()}
                                  </p>
                                  <p className="text-[10px] text-[#7B8983]">
                                    Paid: KSh {t.totalPaid.toLocaleString()}
                                  </p>
                                  {isVacated ? (
                                    <p className="text-[10px] font-medium text-[#7B8983]">
                                      Lease Closed {t.vacatedAt ? `(${formatYmdShort(t.vacatedAt)})` : ''}
                                    </p>
                                  ) : (
                                    (() => {
                                      const moveInYmd = parseBillingDateToYmd(t.moveInDate || t.leaseStart);
                                      const annivDay = t.billingAnniversaryDay || (moveInYmd ? getBillingAnniversaryDay(moveInYmd) : null);
                                      const nextYmd = t.nextBillingDate || (moveInYmd ? getNextBillingDate(moveInYmd, getNairobiTodayYmd()) : null);
                                      const dueYmd = parseBillingDateToYmd(t.dueDate);
                                      return (
                                        <>
                                          <p className="text-[10px] font-semibold text-[#145338]">
                                            Due: {dueYmd ? formatYmdShort(dueYmd) : t.dueDate || (nextYmd ? formatYmdShort(nextYmd) : '—')}
                                          </p>
                                          {annivDay && (
                                            <p className="text-[9.5px] text-[#7B8983]">
                                              {formatOrdinalDay(annivDay)} Monthly • Next: {nextYmd ? formatYmdShort(nextYmd) : '—'}
                                            </p>
                                          )}
                                        </>
                                      );
                                    })()
                                  )}
                                </td>

                                {/* Security Deposit Column */}
                                <td className="py-3.5 px-3 whitespace-nowrap tabular-nums">
                                  <div className="space-y-1">
                                    <p className="font-bold text-[#172B25]">
                                      KSh {depositAmt.toLocaleString()}
                                    </p>
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                        depStatus === 'Returned'
                                          ? 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]'
                                          : depStatus === 'Partially Returned'
                                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                                          : depStatus === 'Forfeited'
                                          ? 'bg-[#FDE6E6] text-[#B91C1C] border-[#F8CACA]'
                                          : depStatus === 'Held'
                                          ? 'bg-[#D9F5E7] text-[#145338] border-[#BCEAD2]'
                                          : 'bg-[#F5F7F6] text-[#7B8983] border-[#E7ECE9]'
                                      }`}
                                    >
                                      {depStatus}
                                    </span>
                                    {(t.depositReturnedAmount ?? 0) > 0 && (
                                      <p className="text-[10px] font-medium text-[#0369A1]">
                                        Returned: KSh {(t.depositReturnedAmount ?? 0).toLocaleString()}
                                      </p>
                                    )}
                                    {(t.depositDeductionAmount ?? 0) > 0 && (
                                      <p className="text-[10px] font-semibold text-[#B91C1C]">
                                        Damage: -KSh {(t.depositDeductionAmount ?? 0).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </td>

                                {/* Rent Balance Status Badge */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="space-y-1">
                                    <span
                                      className={`inline-block px-2.5 py-0.5 rounded-md text-[10.5px] font-bold border ${
                                        isVacated
                                          ? 'bg-[#F5F7F6] text-[#4B5853] border-[#D5DDD9]'
                                          : isOverdue
                                          ? 'bg-[#FDE6E6] text-[#B91C1C] border-[#F8CACA]'
                                          : isDue
                                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                                          : 'bg-[#D9F5E7] text-[#145338] border-[#BCEAD2]'
                                      }`}
                                    >
                                      {isVacated
                                        ? 'Vacated'
                                        : isOverdue
                                        ? 'Overdue'
                                        : isDue
                                        ? 'Rent Due'
                                        : 'Cleared'}
                                    </span>
                                    {!isVacated && (t.rentBalance ?? 0) > 0 && (
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

                                    {isAdminOrManager && onVacateTenant && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenVacateModal(t)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors border ${
                                          isVacated
                                            ? 'bg-[#F5F7F6] hover:bg-[#E7ECE9] text-[#4B5853] border-[#D5DDD9]'
                                            : 'bg-[#FFF7ED] hover:bg-[#FFEDD5] text-[#9A3412] border-[#FED7AA]'
                                        }`}
                                        title={
                                          isVacated
                                            ? 'Update Deposit Return / Damage Settlement'
                                            : 'Vacate Tenant & Settle Deposit'
                                        }
                                      >
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span>{isVacated ? 'Deposit' : 'Vacate'}</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(t)}
                                      className="p-1.5 rounded-lg text-[#7B8983] hover:text-[#172B25] hover:bg-[#F5F7F6] cursor-pointer"
                                      title="Edit Tenant & Deposit"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    {!isVacated && (
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
                                    )}

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

        {filteredApartmentGroups.length === 0 && filteredUnassignedTenants.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E7ECE9] p-10 text-center space-y-2">
            <p className="text-sm font-bold text-[#172B25]">
              No tenants or apartments match &ldquo;{searchQuery || globalSearch}&rdquo;
            </p>
            <p className="text-xs text-[#7B8983]">
              Try searching by tenant name, reference code (e.g. A-001), email, phone number, unit number, or apartment name.
            </p>
            {(searchQuery || globalSearch) && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#BFEF43] text-[#172B25] text-xs font-bold cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        )}

        {/* Unassigned / Historical Tenants (if any) */}
        {filteredUnassignedTenants.length > 0 && (
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
                {filteredUnassignedTenants.length} Tenant(s)
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
                    Email Address (Email Reminders) *
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. grace.wanjiku@gmail.com"
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
                    Security Deposit (KSh) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newDeposit}
                    onChange={(e) => setNewDeposit(e.target.value)}
                    placeholder="Enter manually (e.g. 35000)"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                  <p className="text-[10px] text-[#7B8983] mt-0.5">
                    Entered manually by Admin on allocation
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Deposit Payment Status
                  </label>
                  <select
                    value={newDepositStatus}
                    onChange={(e) => setNewDepositStatus(e.target.value as 'Held' | 'Not Paid')}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  >
                    <option value="Held">Held (Paid upon Allocation)</option>
                    <option value="Not Paid">Not Paid Yet</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Occupants
                  </label>
                  <input
                    type="text"
                    value={newOccupants}
                    onChange={(e) => setNewOccupants(e.target.value)}
                    placeholder="e.g. 2 Adults"
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Move-in Date (Billing Anniversary) *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
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

              {(() => {
                const moveInYmd = parseBillingDateToYmd(newDueDate);
                if (!moveInYmd) return null;
                const c0 = getBillingCycleForIndex(moveInYmd, 0);
                const c1 = getBillingCycleForIndex(moveInYmd, 1);
                if (!c0 || !c1) return null;
                return (
                  <div className="p-3 rounded-xl bg-[#EEF4F1] border border-[#CDE5D8] text-[11px] text-[#145338] flex flex-col gap-0.5">
                    <span className="font-bold">
                      Anniversary Billing Cycle ({formatOrdinalDay(c0.anniversaryDay)} of each month)
                    </span>
                    <span>
                      1st Period: <strong>{formatYmdShort(c0.periodStart)} – {formatYmdShort(c0.periodEnd)}</strong> • Next Payment Due: <strong>{formatYmdShort(c1.dueDate)}</strong>
                    </span>
                  </div>
                );
              })()}
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

            {formError && (
              <div className="p-3 rounded-xl bg-[#FDE6E6] text-[#B91C1C] text-xs font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Full Name *
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
                  Email Address (Email Reminders) *
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="tenant@example.com"
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25]"
                />
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Move-in Date (Anniversary) *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Security Deposit (KSh)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editDeposit}
                    onChange={(e) => setEditDeposit(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#172B25] mb-1">
                    Deposit Status
                  </label>
                  <select
                    value={editDepositStatus}
                    onChange={(e) => setEditDepositStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs font-semibold text-[#172B25]"
                  >
                    <option value="Held">Held</option>
                    <option value="Not Paid">Not Paid</option>
                    <option value="Returned">Returned to Tenant</option>
                    <option value="Partially Returned">Partially Returned</option>
                    <option value="Forfeited">Forfeited</option>
                  </select>
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
                {isAdminOrManager && onVacateTenant && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = profileModalTenant;
                      setProfileModalTenant(null);
                      handleOpenVacateModal(target);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFF7ED] hover:bg-[#FFEDD5] text-xs font-semibold text-[#9A3412] border border-[#FED7AA] cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>
                      {profileModalTenant.tenancyStatus === 'Vacated'
                        ? 'Deposit Settlement'
                        : 'Vacate & Settle Deposit'}
                    </span>
                  </button>
                )}
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
                    <span className="text-[#7B8983]">Tenancy Status:</span>{' '}
                    <span
                      className={`font-bold ${
                        profileModalTenant.tenancyStatus === 'Vacated'
                          ? 'text-[#9A3412]'
                          : 'text-[#145338]'
                      }`}
                    >
                      {profileModalTenant.tenancyStatus || 'Active'}
                      {profileModalTenant.vacatedAt ? ` (${formatYmdShort(profileModalTenant.vacatedAt)})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Lease & Deposit Details */}
              <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] space-y-3 text-xs">
                <h4 className="font-bold text-[#172B25] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#145338]" />
                  Lease &amp; Security Deposit
                </h4>
                {(() => {
                  const todayYmd = getNairobiTodayYmd();
                  const moveInYmd = parseBillingDateToYmd(profileModalTenant.moveInDate || profileModalTenant.leaseStart) || todayYmd;
                  const cycle = getBillingCycleForDate(moveInYmd, todayYmd);
                  const nextYmd = profileModalTenant.nextBillingDate || getNextBillingDate(moveInYmd, todayYmd) || undefined;
                  const periodStart = profileModalTenant.currentBillingPeriodStart || cycle?.periodStart || moveInYmd;
                  const periodEnd = profileModalTenant.currentBillingPeriodEnd || cycle?.periodEnd || moveInYmd;
                  const annivDay = profileModalTenant.billingAnniversaryDay || cycle?.anniversaryDay || getBillingAnniversaryDay(moveInYmd) || 1;
                  const depStatus =
                    profileModalTenant.depositStatus ||
                    (profileModalTenant.securityDeposit > 0 ? 'Held' : 'Not Paid');
                  return (
                    <div className="space-y-1.5 text-[#172B25]">
                      <div>
                        <span className="text-[#7B8983]">Lease ID:</span>{' '}
                        <span className="font-mono font-bold">
                          {profileModalTenant.leaseId}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7B8983]">Move-in Date:</span>{' '}
                        <strong>{formatYmdShort(moveInYmd)}</strong>{' '}
                        <span className="text-[10.5px] font-semibold text-[#145338]">
                          ({formatOrdinalDay(annivDay)} Monthly)
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7B8983]">Current Period:</span>{' '}
                        <span className="font-semibold">
                          {formatYmdShort(periodStart)} – {formatYmdShort(periodEnd)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7B8983]">Next Billing Date:</span>{' '}
                        <strong className="text-[#145338]">
                          {profileModalTenant.tenancyStatus === 'Vacated'
                            ? 'Closed'
                            : nextYmd
                            ? formatYmdShort(nextYmd)
                            : '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#7B8983]">Deposit:</span>{' '}
                        <strong>KSh {profileModalTenant.securityDeposit.toLocaleString()}</strong>{' '}
                        <span className="font-semibold text-[#145338]">({depStatus})</span>
                      </div>
                      {(profileModalTenant.depositReturnedAmount ?? 0) > 0 && (
                        <div>
                          <span className="text-[#7B8983]">Deposit Returned:</span>{' '}
                          <strong className="text-[#0369A1]">
                            KSh {(profileModalTenant.depositReturnedAmount ?? 0).toLocaleString()}
                          </strong>
                        </div>
                      )}
                      {(profileModalTenant.depositDeductionAmount ?? 0) > 0 && (
                        <div>
                          <span className="text-[#7B8983]">Damage Deducted:</span>{' '}
                          <strong className="text-[#B91C1C]">
                            KSh {(profileModalTenant.depositDeductionAmount ?? 0).toLocaleString()}
                          </strong>
                          {profileModalTenant.depositDamageNotes ? (
                            <p className="text-[10.5px] text-[#7B8983] mt-0.5">
                              Note: {profileModalTenant.depositDamageNotes}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <h4 className="text-sm font-bold text-[#172B25]">
                  Payment Transaction History ({profileModalTenant.tenantRef})
                </h4>
                <button
                  type="button"
                  onClick={() => handleDownloadTenantInvoiceLedger(profileModalTenant)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D5F267] hover:bg-[#c8e755] text-[#17231E] text-[11px] font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Invoice &amp; Ledger</span>
                </button>
              </div>
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

      {/* MODAL 5: VACATE TENANT & SECURITY DEPOSIT SETTLEMENT */}
      {vacateModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleConfirmVacateSubmit}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-[#E7ECE9] max-h-[92vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E7ECE9]">
              <div>
                <h3 className="text-base font-bold text-[#172B25]">
                  Vacate Tenant &amp; Settle Security Deposit
                </h3>
                <p className="text-xs text-[#7B8983]">
                  {vacateModalTenant.name} ({vacateModalTenant.tenantRef}) • {vacateModalTenant.property} — {vacateModalTenant.unitNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVacateModalTenant(null)}
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

            {/* Deposit Summary Banner */}
            {(() => {
              const held = Number(vacateModalTenant.securityDeposit || 0);
              const dmg = vacateHasDamages ? Math.max(0, Number(vacateDamageAmount) || 0) : 0;
              const suggestedRefund = Math.max(0, held - dmg);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs">
                  <div>
                    <p className="text-[11px] text-[#7B8983]">Deposit Held</p>
                    <p className="text-sm font-bold text-[#172B25] tabular-nums">
                      KSh {held.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#7B8983]">Damage / Repairs</p>
                    <p className="text-sm font-bold text-[#B91C1C] tabular-nums">
                      - KSh {dmg.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] text-[#7B8983]">Suggested Refund</p>
                      <p className="text-sm font-bold text-[#145338] tabular-nums">
                        KSh {suggestedRefund.toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVacateReturnedAmount(String(suggestedRefund));
                        if (suggestedRefund === 0) {
                          setVacateDepositStatus('Forfeited');
                          setVacateReturnedConfirmed(false);
                        } else if (dmg > 0 || suggestedRefund < held) {
                          setVacateDepositStatus('Partially Returned');
                        } else {
                          setVacateDepositStatus('Returned');
                        }
                      }}
                      className="mt-1 self-start text-[10.5px] font-bold text-[#145338] underline hover:no-underline cursor-pointer"
                    >
                      Use Net Refund Amount
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#172B25] mb-1">
                  Vacate / Move-out Date *
                </label>
                <input
                  type="date"
                  required
                  value={vacateDate}
                  onChange={(e) => setVacateDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                />
              </div>

              {/* Section 1: Tenant Damages -> Expenses */}
              <div className="p-3.5 rounded-2xl border border-[#E7ECE9] bg-[#FAFCFB] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-bold text-[#172B25] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vacateHasDamages}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setVacateHasDamages(checked);
                        const held = Number(vacateModalTenant.securityDeposit || 0);
                        if (!checked) {
                          setVacateDamageAmount('');
                          setVacateReturnedAmount(String(held));
                          setVacateDepositStatus(held > 0 ? 'Returned' : 'Not Paid');
                        }
                      }}
                      className="w-4 h-4 rounded accent-[#172B25]"
                    />
                    <span>Tenant caused damages (record repair cost to Expenses)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setVacateModalTenant(null);
                      onNavigate('expenses');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145338] hover:underline cursor-pointer shrink-0"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Go to Expenses</span>
                  </button>
                </div>

                {vacateHasDamages && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-[#172B25] mb-1">
                          Damage / Repair Cost (KSh) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          required={vacateHasDamages}
                          value={vacateDamageAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVacateDamageAmount(val);
                            const held = Number(vacateModalTenant.securityDeposit || 0);
                            const dmg = Math.max(0, Number(val) || 0);
                            const nextRefund = Math.max(0, held - dmg);
                            setVacateReturnedAmount(String(nextRefund));
                            if (nextRefund <= 0) {
                              setVacateDepositStatus('Forfeited');
                            } else if (dmg > 0) {
                              setVacateDepositStatus('Partially Returned');
                            } else {
                              setVacateDepositStatus(held > 0 ? 'Returned' : 'Not Paid');
                            }
                          }}
                          placeholder="e.g. 5000"
                          className="w-full px-3 py-2 rounded-xl bg-white border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[#172B25] mb-1">
                          Expense Category
                        </label>
                        <select
                          value={vacateExpenseCategory}
                          onChange={(e) => setVacateExpenseCategory(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-[#E7ECE9] text-xs text-[#172B25]"
                        >
                          <option value="Maintenance and Repairs">Maintenance and Repairs</option>
                          <option value="Supplies">Supplies</option>
                          <option value="Property Management">Property Management</option>
                          <option value="Utilities">Utilities</option>
                          <option value="Insurance & Misc">Insurance &amp; Misc</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-[#172B25] mb-1">
                        Damage Description / Expense Title
                      </label>
                      <input
                        type="text"
                        value={vacateDamageNotes}
                        onChange={(e) => {
                          setVacateDamageNotes(e.target.value);
                          if (!vacateExpenseTitle) {
                            setVacateExpenseTitle('');
                          }
                        }}
                        placeholder="e.g. Repainting bedroom wall & replacing broken sink tap"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#E7ECE9] text-xs text-[#172B25]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[11.5px] font-semibold text-[#145338] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vacateRecordExpense}
                        onChange={(e) => setVacateRecordExpense(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#145338]"
                      />
                      <span>
                        Save this damage repair directly into Expenses ledger for{' '}
                        <strong>{vacateModalTenant.property}</strong>
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Section 2: Manual Deposit Return Confirmation */}
              <div className="p-3.5 rounded-2xl border border-[#E7ECE9] bg-[#FAFCFB] space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-[#172B25]">
                  <ShieldCheck className="w-4 h-4 text-[#145338]" />
                  <span>Admin Deposit Settlement Confirmation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#172B25] mb-1">
                      Deposit Return Status
                    </label>
                    <select
                      value={vacateDepositStatus}
                      onChange={(e) => setVacateDepositStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E7ECE9] text-xs font-semibold text-[#172B25]"
                    >
                      <option value="Returned">Returned to Tenant</option>
                      <option value="Partially Returned">Partially Returned (Damages Deducted)</option>
                      <option value="Forfeited">Forfeited / Not Returned</option>
                      <option value="Not Paid">Not Paid / No Deposit Held</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-[#172B25] mb-1">
                      Amount Returned to Tenant (KSh)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={vacateReturnedAmount}
                      onChange={(e) => setVacateReturnedAmount(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E7ECE9] text-xs text-[#172B25] tabular-nums"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2 text-xs font-semibold text-[#172B25] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={vacateReturnedConfirmed}
                    onChange={(e) => setVacateReturnedConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-[#145338]"
                  />
                  <span>
                    Admin confirms the security deposit settlement was returned / processed for{' '}
                    <strong>{vacateModalTenant.name}</strong>
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-[#E7ECE9]">
              <button
                type="button"
                onClick={() => setVacateModalTenant(null)}
                className="px-4 py-2 rounded-xl bg-[#F5F7F6] text-[#7B8983] text-xs font-semibold hover:bg-[#E7ECE9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={vacatingSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#172B25] hover:bg-[#253d34] text-white text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5 text-[#BFEF43]" />
                <span>{vacatingSaving ? 'Saving...' : 'Confirm Vacate & Deposit'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <InvoicePreviewModal
        invoiceData={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />
    </div>
  );
};
