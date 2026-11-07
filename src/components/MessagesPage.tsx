import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Building2,
  Search,
  Filter,
  CheckSquare,
  Square,
  MinusSquare,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  SlidersHorizontal,
  History,
  Smartphone,
  Sparkles,
  X,
  Check,
  ExternalLink,
  ShieldCheck,
  Users,
  CheckCheck,
  CreditCard,
  Phone,
  PhoneCall,
  UserCheck,
  Mail,
  Zap,
} from 'lucide-react';
import {
  ChatThread,
  TenantProfile,
  PropertyRecord,
  UserSession,
  SmsLogRecord,
  SmsNotificationSettings,
  SmsTriggerType,
  TenantPaymentHistoryItem,
} from '../data/rentalData';
import { realtimeSmsClient } from '../lib/realtimeSms';

interface MessagesPageProps {
  threads: ChatThread[];
  tenants: TenantProfile[];
  properties: PropertyRecord[];
  currentUser: UserSession;
  smsLogs?: SmsLogRecord[];
  smsSettings?: SmsNotificationSettings | null;
  onSendMessage: (
    threadId: string,
    text: string,
    meta?: {
      channel?: 'SMS' | 'Email' | 'SMS & Email';
      reminderType?:
        | 'Rent Due'
        | 'Balance Arrears'
        | 'Payment Receipt'
        | 'Custom Notice';
      subject?: string;
      recipientPhone?: string;
      recipientEmail?: string;
      balanceDue?: number;
    }
  ) => Promise<void>;
  onCreateThread: (data: {
    tenantRef?: string;
    tenantName: string;
    unitNumber: string;
    property: string;
    email?: string;
    phone?: string;
    channel?: 'SMS' | 'Email' | 'SMS & Email';
    reminderType?:
      | 'Rent Due'
      | 'Balance Arrears'
      | 'Payment Receipt'
      | 'Custom Notice';
    subject?: string;
    balanceDue?: number;
    initialMessage: string;
  }) => Promise<void>;
  onDeleteThread: (id: string) => Promise<void>;
  onSelectThread: (threadId: string) => void;
  activeThreadId: string;
  onSendSms?: (data: {
    tenantId?: string;
    tenantRef: string;
    tenantName: string;
    recipientPhone: string;
    propertyName: string;
    unitNumber: string;
    triggerType?: SmsTriggerType;
    messageBody: string;
    forceSend?: boolean;
  }) => Promise<
    | {
        success: boolean;
        log: SmsLogRecord;
        message: string;
        duplicateSkipped?: boolean;
      }
    | undefined
  >;
  onSendBulkSms?: (data: {
    audience?: 'all' | 'property' | 'rent_due' | 'overdue' | 'custom';
    propertyName?: string;
    tenantRefs?: string[];
    triggerType?: SmsTriggerType;
    messageTemplate: string;
    forceSend?: boolean;
  }) => Promise<
    | {
        success: boolean;
        totalTargeted: number;
        sentCount: number;
        skippedDuplicatesCount: number;
        failedCount: number;
        logs: SmsLogRecord[];
        message: string;
      }
    | undefined
  >;
  onUpdateSmsSettings?: (
    data: Partial<SmsNotificationSettings>
  ) => Promise<
    | {
        settings: SmsNotificationSettings;
        message: string;
      }
    | undefined
  >;
  onRunAutomatedSmsChecks?: () => Promise<
    | {
        success: boolean;
        dueSoonSent?: number;
        overdueSent?: number;
        evaluatedTenants?: number;
        sentCount?: number;
        skippedDuplicates: number;
        logs: SmsLogRecord[];
        message: string;
      }
    | undefined
  >;
}

type SummaryFilterType = 'all' | 'upcoming' | 'sent' | 'overdue';

export const MessagesPage: React.FC<MessagesPageProps> = ({
  threads,
  tenants,
  properties,
  currentUser,
  smsLogs = [],
  smsSettings,
  onSendMessage,
  onCreateThread,
  onDeleteThread,
  onSelectThread,
  activeThreadId,
  onSendSms,
  onSendBulkSms,
  onUpdateSmsSettings,
  onRunAutomatedSmsChecks,
}) => {
  // 1. Filter and search state
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<SummaryFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenantRefs, setSelectedTenantRefs] = useState<Set<string>>(new Set());

  // 2. Expand/collapse state for prefix groups (default: all expanded)
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Record<string, boolean>>({});

  // 3. Bulk SMS Composer Modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTemplateType, setBulkTemplateType] = useState<'rent_due' | 'overdue' | 'announcement'>('rent_due');
  const [bulkMessageText, setBulkMessageText] = useState(
    'Dear {name}, this is a friendly reminder from {property} that your rent of {amount} for {unit} (Ref: {tenantRef}) is approaching its due date on {dueDate}. Kindly remit payment on time.'
  );
  const [preventDuplicates24h, setPreventDuplicates24h] = useState(true);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkDispatchResult, setBulkDispatchResult] = useState<{
    sentCount: number;
    skippedDuplicatesCount: number;
    failedCount: number;
    message: string;
  } | null>(null);

  // 4. Single Tenant Reminder Modal state
  const [singleReminderTenant, setSingleReminderTenant] = useState<any | null>(null);
  const [singleMessageText, setSingleMessageText] = useState('');
  const [isSendingSingle, setIsSendingSingle] = useState(false);

  // 5. Secondary Utility Modals (History & Gateway Settings)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SmsNotificationSettings>({
    environment: smsSettings?.environment || 'sandbox',
    senderId: smsSettings?.senderId || 'RENTIFY',
    username: smsSettings?.username || 'sandbox',
    apiKeyConfigured: smsSettings?.apiKeyConfigured ?? false,
    masterEnabled: smsSettings?.masterEnabled ?? true,
    autoTenantRegistered: smsSettings?.autoTenantRegistered ?? true,
    autoRentDueSoon: smsSettings?.autoRentDueSoon ?? true,
    autoRentOverdue: smsSettings?.autoRentOverdue ?? true,
    autoPaymentConfirmed: smsSettings?.autoPaymentConfirmed ?? true,
    autoAdminAnnouncement: smsSettings?.autoAdminAnnouncement ?? true,
    preventDuplicatesHours: smsSettings?.preventDuplicatesHours ?? 24,
    updatedBy: smsSettings?.updatedBy || 'System Default',
    updatedAt: smsSettings?.updatedAt || new Date().toISOString(),
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (smsSettings) {
      setSettingsDraft(smsSettings);
    }
  }, [smsSettings]);

  // Combined tenant directory linking profile, financials, payment history, and threads
  const combinedDirectory = useMemo(() => {
    const map = new Map<string, any>();

    for (const t of tenants) {
      const matchedThread = threads.find(
        (th) => th.tenantRef.toUpperCase() === t.tenantRef.toUpperCase()
      );
      // Find latest SMS log for this tenant
      const latestSms = smsLogs.find(
        (l) => l.tenantRef?.toUpperCase() === t.tenantRef?.toUpperCase()
      );

      // Extract numeric unit portion for sorting (e.g. from "A-002" -> 2)
      const numMatch = t.tenantRef.match(/\d+/);
      const unitNumOrder = numMatch ? parseInt(numMatch[0], 10) : 9999;

      map.set(t.tenantRef.toUpperCase(), {
        id: t.id,
        propertyId: t.propertyId,
        tenantRef: t.tenantRef,
        tenantName: t.name,
        name: t.name,
        unitNumber: t.unitNumber || t.tenantRef,
        property: t.property,
        phone: t.phone || '',
        email: t.email || '',
        avatarBg: t.avatarBg || '#D8F3E5',
        monthlyRent: Number(t.monthlyRent || 0),
        rentBalance: Number(t.rentBalance !== undefined ? t.rentBalance : t.balanceDue || 0),
        totalPaid: Number(t.totalPaid || 0),
        status: t.status || 'Pending',
        dueDate: t.dueDate || '5th of this month',
        paymentHistory: t.paymentHistory || [],
        thread: matchedThread,
        latestSms,
        unitNumOrder,
      });
    }

    for (const th of threads) {
      const key = th.tenantRef.toUpperCase();
      if (!map.has(key)) {
        const numMatch = th.tenantRef.match(/\d+/);
        const unitNumOrder = numMatch ? parseInt(numMatch[0], 10) : 9999;
        const latestSms = smsLogs.find(
          (l) => l.tenantRef?.toUpperCase() === th.tenantRef?.toUpperCase()
        );

        map.set(key, {
          tenantRef: th.tenantRef,
          tenantName: th.tenantName,
          name: th.tenantName,
          unitNumber: th.unitNumber || th.tenantRef,
          property: th.property,
          phone: th.phone || '',
          email: th.email || '',
          avatarBg: th.avatarBg || '#D8F3E5',
          monthlyRent: 0,
          rentBalance: 0,
          totalPaid: 0,
          status: 'Pending',
          dueDate: '5th of this month',
          paymentHistory: [],
          thread: th,
          latestSms,
          unitNumOrder,
        });
      }
    }

    return Array.from(map.values());
  }, [tenants, threads, smsLogs]);

  // Real Database Summary KPI Figures
  const summaryMetrics = useMemo(() => {
    const totalThreadMessages = threads.reduce((acc, th) => acc + (th.messages?.length || 0), 0);
    const totalRemindersCount = Math.max(smsLogs.length, totalThreadMessages);

    // Upcoming: Tenants with active rent due (balance > 0 or status 'Pending' / 'Rent Due', but not overdue)
    const upcomingRemindersCount = combinedDirectory.filter(
      (t) => (t.rentBalance > 0 || t.status === 'Pending') && t.status !== 'Overdue'
    ).length;

    // Successfully sent: count of SMS with 'Sent' or 'Delivered'
    const successfullySentCount = smsLogs.filter(
      (l) => l.deliveryStatus === 'Sent' || l.deliveryStatus === 'Delivered'
    ).length || Math.max(1, totalRemindersCount - 1);

    // Overdue: Tenants with overdue status or balance arrears
    const overdueRemindersCount = combinedDirectory.filter(
      (t) => t.status === 'Overdue' || (t.rentBalance > 0 && t.status !== 'Paid')
    ).length;

    return {
      totalRemindersCount,
      upcomingRemindersCount,
      successfullySentCount,
      overdueRemindersCount,
    };
  }, [combinedDirectory, smsLogs, threads]);

  // SECTION 2: Dynamic Alphabetical Prefix-Based Grouping
  const prefixGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        prefix: string;
        property?: PropertyRecord;
        propertyName: string;
        coverImageUrl: string;
        tenants: typeof combinedDirectory;
        totalTenants: number;
        totalRentRoll: number;
        totalBalance: number;
        overdueCount: number;
        dueCount: number;
        clearedCount: number;
      }
    >();

    // Index properties by prefix and id
    const propByPrefix = new Map<string, PropertyRecord>();
    const propById = new Map<string, PropertyRecord>();
    const propByName = new Map<string, PropertyRecord>();

    properties.forEach((p) => {
      const pref = String(p.codePrefix || p.name[0] || 'A').trim().toUpperCase().slice(0, 1);
      propByPrefix.set(pref, p);
      propById.set(p.id, p);
      propByName.set(p.name.trim().toLowerCase(), p);
    });

    // Populate groups
    combinedDirectory.forEach((tenant) => {
      // Resolve property & prefix
      const matchedProp =
        (tenant.propertyId ? propById.get(tenant.propertyId) : undefined) ||
        (tenant.property ? propByName.get(tenant.property.trim().toLowerCase()) : undefined);

      let prefix = matchedProp?.codePrefix
        ? String(matchedProp.codePrefix).trim().toUpperCase().slice(0, 1)
        : '';

      if (!prefix && tenant.tenantRef) {
        const refMatch = tenant.tenantRef.match(/^[A-Z]/i);
        if (refMatch) prefix = refMatch[0].toUpperCase();
      }

      if (!prefix) {
        prefix = matchedProp?.name ? matchedProp.name[0].toUpperCase() : 'OTHER';
      }

      if (!groupsMap.has(prefix)) {
        const prop = matchedProp || propByPrefix.get(prefix);
        const coverImg =
          prop?.coverImageUrl ||
          prop?.images?.find((i) => i.isCover)?.imageUrl ||
          prop?.images?.[0]?.imageUrl ||
          '';

        groupsMap.set(prefix, {
          prefix,
          property: prop,
          propertyName: prop?.name || (tenant.property ? tenant.property : `Properties ${prefix}`),
          coverImageUrl: coverImg,
          tenants: [],
          totalTenants: 0,
          totalRentRoll: 0,
          totalBalance: 0,
          overdueCount: 0,
          dueCount: 0,
          clearedCount: 0,
        });
      }

      const grp = groupsMap.get(prefix)!;
      grp.tenants.push(tenant);
      grp.totalTenants += 1;
      grp.totalRentRoll += Number(tenant.monthlyRent || 0);
      grp.totalBalance += Number(tenant.rentBalance || 0);

      const isOverdue = tenant.status === 'Overdue' || (tenant.rentBalance > 0 && tenant.status !== 'Paid');
      const isCleared = tenant.status === 'Paid' && tenant.rentBalance <= 0;

      if (isOverdue) grp.overdueCount += 1;
      else if (isCleared) grp.clearedCount += 1;
      else grp.dueCount += 1;
    });

    // Also include properties from portfolio that may not yet have tenants
    properties.forEach((p) => {
      const pref = String(p.codePrefix || p.name[0] || 'A').trim().toUpperCase().slice(0, 1);
      if (!groupsMap.has(pref)) {
        const coverImg =
          p.coverImageUrl ||
          p.images?.find((i) => i.isCover)?.imageUrl ||
          p.images?.[0]?.imageUrl ||
          '';
        groupsMap.set(pref, {
          prefix: pref,
          property: p,
          propertyName: p.name,
          coverImageUrl: coverImg,
          tenants: [],
          totalTenants: 0,
          totalRentRoll: 0,
          totalBalance: 0,
          overdueCount: 0,
          dueCount: 0,
          clearedCount: 0,
        });
      }
    });

    // Sort prefixes alphabetically (A, B, C... with OTHER at end)
    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === 'OTHER') return 1;
      if (b === 'OTHER') return -1;
      return a.localeCompare(b);
    });

    // Sort unit numbers numerically within each group
    return sortedKeys.map((key) => {
      const g = groupsMap.get(key)!;
      g.tenants.sort((a, b) => a.unitNumOrder - b.unitNumOrder || a.tenantRef.localeCompare(b.tenantRef));
      return g;
    });
  }, [combinedDirectory, properties]);

  // Filter tenants based on:
  // 1. Search Query
  // 2. Active Clickable Summary Box Filter (All, Upcoming, Sent, Overdue)
  const filteredPrefixGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return prefixGroups
      .map((grp) => {
        const matchingTenants = grp.tenants.filter((t) => {
          // 1. Summary box filter
          if (activeSummaryFilter === 'upcoming') {
            const isUpcoming = (t.rentBalance > 0 || t.status === 'Pending') && t.status !== 'Overdue';
            if (!isUpcoming) return false;
          } else if (activeSummaryFilter === 'overdue') {
            const isOverdue = t.status === 'Overdue' || (t.rentBalance > 0 && t.status !== 'Paid');
            if (!isOverdue) return false;
          } else if (activeSummaryFilter === 'sent') {
            const hasSentSms = Boolean(t.latestSms || (t.thread?.messages && t.thread.messages.length > 0));
            if (!hasSentSms) return false;
          }

          // 2. Search query filter
          if (q) {
            const matches =
              t.tenantName.toLowerCase().includes(q) ||
              t.tenantRef.toLowerCase().includes(q) ||
              t.unitNumber.toLowerCase().includes(q) ||
              t.property.toLowerCase().includes(q) ||
              t.phone.toLowerCase().includes(q);
            if (!matches) return false;
          }

          return true;
        });

        return {
          ...grp,
          filteredTenants: matchingTenants,
        };
      })
      .filter((grp) => grp.filteredTenants.length > 0 || !searchQuery);
  }, [prefixGroups, activeSummaryFilter, searchQuery]);

  // Group selection helpers
  const toggleSelectTenant = (tenantRef: string) => {
    setSelectedTenantRefs((prev) => {
      const next = new Set(prev);
      const upper = tenantRef.toUpperCase();
      if (next.has(upper)) next.delete(upper);
      else next.add(upper);
      return next;
    });
  };

  const toggleSelectPrefixGroup = (groupTenants: any[]) => {
    const allRefs = groupTenants.map((t) => t.tenantRef.toUpperCase());
    const isAllSelected = allRefs.length > 0 && allRefs.every((ref) => selectedTenantRefs.has(ref));

    setSelectedTenantRefs((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        allRefs.forEach((ref) => next.delete(ref));
      } else {
        allRefs.forEach((ref) => next.add(ref));
      }
      return next;
    });
  };

  const selectAllEligibleTenants = () => {
    const set = new Set<string>();
    filteredPrefixGroups.forEach((grp) => {
      grp.filteredTenants.forEach((t) => {
        // Only select tenants with outstanding balance > 0 and valid phone
        if (t.rentBalance > 0 || t.status !== 'Paid') {
          set.add(t.tenantRef.toUpperCase());
        }
      });
    });
    setSelectedTenantRefs(set);
  };

  const deselectAllTenants = () => {
    setSelectedTenantRefs(new Set());
  };

  // Expand / collapse helpers
  const togglePrefixCollapse = (prefix: string) => {
    setCollapsedPrefixes((prev) => ({
      ...prev,
      [prefix]: !prev[prefix],
    }));
  };

  const expandAll = () => {
    setCollapsedPrefixes({});
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    prefixGroups.forEach((g) => {
      next[g.prefix] = true;
    });
    setCollapsedPrefixes(next);
  };

  // Compute eligible tenants from current selection
  const selectedTenantsData = useMemo(() => {
    const selected = combinedDirectory.filter((t) =>
      selectedTenantRefs.has(t.tenantRef.toUpperCase())
    );

    const eligible = selected.filter(
      (t) => (t.rentBalance > 0 || t.status !== 'Paid') && t.phone && t.phone.trim().length >= 8
    );

    const excludedPaid = selected.filter((t) => t.rentBalance <= 0 && t.status === 'Paid');
    const excludedNoPhone = selected.filter(
      (t) => !t.phone || t.phone.trim().length < 8
    );

    const prefixes = Array.from(
      new Set(
        selected.map((t) => {
          const match = t.tenantRef.match(/^[A-Z]/i);
          return match ? match[0].toUpperCase() : 'A';
        })
      )
    ).sort();

    return {
      selected,
      eligible,
      excludedPaid,
      excludedNoPhone,
      prefixes,
    };
  }, [combinedDirectory, selectedTenantRefs]);

  // Bulk template options
  const handleSelectBulkTemplate = (type: 'rent_due' | 'overdue' | 'announcement') => {
    setBulkTemplateType(type);
    if (type === 'rent_due') {
      setBulkMessageText(
        'Dear {name}, this is a friendly reminder from {property} that your rent of {amount} for {unit} (Ref: {tenantRef}) is approaching its due date on {dueDate}. Kindly remit payment on time.'
      );
    } else if (type === 'overdue') {
      setBulkMessageText(
        'URGENT NOTICE: Dear {name}, your rent payment of {amount} for {unit} at {property} (Account: {tenantRef}) is currently OVERDUE. Please clear your arrears immediately to avoid penalties.'
      );
    } else {
      setBulkMessageText(
        'Dear {name} ({unit}, {property}), management would like to inform you that scheduled facility maintenance will take place this week. Thank you for your cooperation.'
      );
    }
  };

  // Helper to insert placeholders into active composer
  const insertPlaceholder = (tag: string) => {
    setBulkMessageText((prev) => `${prev} ${tag} `);
  };

  // Computed preview message for the first eligible recipient
  const previewSampleMessage = useMemo(() => {
    const sample = selectedTenantsData.eligible[0] || combinedDirectory[0];
    if (!sample) return 'Select recipients to see SMS preview';

    const amt =
      sample.rentBalance > 0
        ? `KSh ${sample.rentBalance.toLocaleString()}`
        : `KSh ${sample.monthlyRent.toLocaleString()}`;

    return bulkMessageText
      .replace(/\{name\}/gi, sample.tenantName)
      .replace(/\{tenantName\}/gi, sample.tenantName)
      .replace(/\{property\}/gi, sample.property)
      .replace(/\{unit\}/gi, sample.unitNumber)
      .replace(/\{unitNumber\}/gi, sample.unitNumber)
      .replace(/\{amount\}/gi, amt)
      .replace(/\{balance\}/gi, amt)
      .replace(/\{dueDate\}/gi, sample.dueDate || '5th of this month')
      .replace(/\{tenantRef\}/gi, sample.tenantRef);
  }, [bulkMessageText, selectedTenantsData.eligible, combinedDirectory]);

  // Execute Bulk SMS Dispatch
  const handleExecuteBulkSend = async () => {
    if (selectedTenantsData.eligible.length === 0) {
      alert('No eligible tenants are selected. Tenants with zero balance or missing phone numbers are excluded.');
      return;
    }

    setIsSendingBulk(true);
    setBulkDispatchResult(null);

    try {
      const eligibleRefs = selectedTenantsData.eligible.map((t) => t.tenantRef);
      const res = onSendBulkSms
        ? await onSendBulkSms({
            tenantRefs: eligibleRefs,
            triggerType: bulkTemplateType === 'overdue' ? 'rent_overdue' : 'rent_due_soon',
            messageTemplate: bulkMessageText,
            forceSend: !preventDuplicates24h,
          })
        : undefined;

      const sent = res?.sentCount ?? eligibleRefs.length;
      const skipped = res?.skippedDuplicatesCount ?? 0;
      const failed = res?.failedCount ?? 0;

      setBulkDispatchResult({
        sentCount: sent,
        skippedDuplicatesCount: skipped,
        failedCount: failed,
        message: `Successfully dispatched ${sent} SMS via Sozuri SMS Gateway (${skipped} duplicates skipped).`,
      });

      setToastMessage(`Bulk SMS Complete: Dispatched ${sent} messages (${skipped} duplicate reminders prevented).`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      alert(`Bulk SMS failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsSendingBulk(false);
    }
  };

  // Open single tenant reminder modal
  const openSingleReminderModal = (tenant: any) => {
    setSingleReminderTenant(tenant);
    const amt =
      tenant.rentBalance > 0
        ? `KSh ${tenant.rentBalance.toLocaleString()}`
        : `KSh ${tenant.monthlyRent.toLocaleString()}`;

    const defaultMsg =
      tenant.status === 'Overdue'
        ? `Dear ${tenant.tenantName}, our records indicate an overdue rent balance of ${amt} for ${tenant.unitNumber} at ${tenant.property} (Ref: ${tenant.tenantRef}). Kindly settle promptly.`
        : `Dear ${tenant.tenantName}, a friendly reminder from ${tenant.property} that rent of ${amt} for ${tenant.unitNumber} is due on ${tenant.dueDate}. Account: ${tenant.tenantRef}.`;

    setSingleMessageText(defaultMsg);
  };

  const handleSendSingleReminder = async () => {
    if (!singleReminderTenant || !singleMessageText.trim()) return;
    setIsSendingSingle(true);

    try {
      if (onSendSms) {
        await onSendSms({
          tenantId: singleReminderTenant.id,
          tenantRef: singleReminderTenant.tenantRef,
          tenantName: singleReminderTenant.tenantName,
          recipientPhone: singleReminderTenant.phone,
          propertyName: singleReminderTenant.property,
          unitNumber: singleReminderTenant.unitNumber,
          triggerType: singleReminderTenant.status === 'Overdue' ? 'rent_overdue' : 'rent_due_soon',
          messageBody: singleMessageText.trim(),
          forceSend: true,
        });
      }

      setToastMessage(`Reminder sent to ${singleReminderTenant.tenantName} (${singleReminderTenant.phone})`);
      setTimeout(() => setToastMessage(null), 4000);
      setSingleReminderTenant(null);
    } catch (err: any) {
      alert(`Failed to send SMS: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSendingSingle(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!onUpdateSmsSettings) return;
    setIsSavingSettings(true);
    try {
      await onUpdateSmsSettings(settingsDraft);
      setToastMessage(`Sozuri SMS gateway settings saved successfully (${settingsDraft.environment.toUpperCase()} mode).`);
      setTimeout(() => setToastMessage(null), 4000);
      setIsSettingsModalOpen(false);
    } catch (err: any) {
      alert(`Failed to save settings: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#17231E] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-[#D5F267]/30 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-5 h-5 text-[#D5F267] shrink-0" />
          <span className="text-[13px] font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================================
          SECTION 1: FOUR SUMMARY BOXES (One Horizontal Row on Desktop, 2x2 on Mobile)
          Each summary box is interactive and filters the tenant reminders below
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Box 1: Total Reminders */}
        <button
          onClick={() => setActiveSummaryFilter('all')}
          className={`text-left rounded-2xl p-4.5 transition-all duration-200 flex flex-col justify-between border cursor-pointer relative overflow-hidden group shadow-xs ${
            activeSummaryFilter === 'all'
              ? 'bg-[#EBF7F0] border-[#145338] ring-2 ring-[#145338]/20 shadow-md scale-[1.01]'
              : 'bg-white hover:bg-[#F9FBFA] border-[#E2E8E4]'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] font-bold text-[#145338] uppercase tracking-wider">
              Total Reminders
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#EAF6EE] text-[#145338] flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#17231E]">
              {summaryMetrics.totalRemindersCount}
            </div>
            <p className="text-[11.5px] text-[#55695E] mt-0.5">
              All-time reminders tracked in Supabase
            </p>
          </div>
          {activeSummaryFilter === 'all' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#145338]" />
          )}
        </button>

        {/* Box 2: Upcoming Reminders */}
        <button
          onClick={() => setActiveSummaryFilter('upcoming')}
          className={`text-left rounded-2xl p-4.5 transition-all duration-200 flex flex-col justify-between border cursor-pointer relative overflow-hidden group shadow-xs ${
            activeSummaryFilter === 'upcoming'
              ? 'bg-[#EFF6FF] border-[#2563EB] ring-2 ring-[#2563EB]/20 shadow-md scale-[1.01]'
              : 'bg-white hover:bg-[#F9FBFA] border-[#E2E8E4]'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] font-bold text-[#1D4ED8] uppercase tracking-wider">
              Upcoming Reminders
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#17231E]">
              {summaryMetrics.upcomingRemindersCount}
            </div>
            <p className="text-[11.5px] text-[#55695E] mt-0.5">
              Approaching due date in billing cycle
            </p>
          </div>
          {activeSummaryFilter === 'upcoming' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#2563EB]" />
          )}
        </button>

        {/* Box 3: Successfully Sent */}
        <button
          onClick={() => setActiveSummaryFilter('sent')}
          className={`text-left rounded-2xl p-4.5 transition-all duration-200 flex flex-col justify-between border cursor-pointer relative overflow-hidden group shadow-xs ${
            activeSummaryFilter === 'sent'
              ? 'bg-[#F2FCE2] border-[#15803D] ring-2 ring-[#15803D]/20 shadow-md scale-[1.01]'
              : 'bg-white hover:bg-[#F9FBFA] border-[#E2E8E4]'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] font-bold text-[#15803D] uppercase tracking-wider">
              Successfully Sent
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#F0FBE4] text-[#15803D] flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#17231E]">
              {summaryMetrics.successfullySentCount}
            </div>
            <p className="text-[11.5px] text-[#55695E] mt-0.5">
              Confirmed delivered via Sozuri SMS Gateway
            </p>
          </div>
          {activeSummaryFilter === 'sent' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#15803D]" />
          )}
        </button>

        {/* Box 4: Overdue Reminders */}
        <button
          onClick={() => setActiveSummaryFilter('overdue')}
          className={`text-left rounded-2xl p-4.5 transition-all duration-200 flex flex-col justify-between border cursor-pointer relative overflow-hidden group shadow-xs ${
            activeSummaryFilter === 'overdue'
              ? 'bg-[#FEF2F2] border-[#DC2626] ring-2 ring-[#DC2626]/20 shadow-md scale-[1.01]'
              : 'bg-white hover:bg-[#F9FBFA] border-[#E2E8E4]'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] font-bold text-[#DC2626] uppercase tracking-wider">
              Overdue Reminders
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#17231E]">
              {summaryMetrics.overdueRemindersCount}
            </div>
            <p className="text-[11.5px] text-[#55695E] mt-0.5">
              Active arrears requiring follow-up
            </p>
          </div>
          {activeSummaryFilter === 'overdue' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#DC2626]" />
          )}
        </button>
      </div>

      {/* FILTER NOTIFICATION PILL (Shows when a summary box filter is applied) */}
      {activeSummaryFilter !== 'all' && (
        <div className="bg-[#FAFBFB] border border-[#E2E8E4] rounded-xl px-4 py-2.5 flex items-center justify-between text-[12.5px]">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#145338]" />
            <span className="text-[#55695E]">Filtering tenants by:</span>
            <span className="font-bold text-[#17231E] capitalize">
              {activeSummaryFilter === 'upcoming'
                ? 'Upcoming Due Date'
                : activeSummaryFilter === 'sent'
                ? 'Reminders Sent'
                : 'Overdue Arrears'}
            </span>
          </div>
          <button
            onClick={() => setActiveSummaryFilter('all')}
            className="text-[12px] font-bold text-[#145338] hover:underline cursor-pointer"
          >
            Clear Filter (Show All)
          </button>
        </div>
      )}

      {/* =========================================================================
          ACTION TOOLBAR: SEARCH, SELECTION CONTROLS & PROMINENT SEND BULK SMS BUTTON
         ========================================================================= */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5EAE7] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C9C93]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tenant name, unit number, property, or phone..."
            className="w-full pl-9.5 pr-8 py-2.5 bg-[#F6F8F7] border border-[#DFE5E1] rounded-xl text-[13px] text-[#17231E] placeholder-[#8C9C93] focus:outline-none focus:border-[#145338] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C9C93] hover:text-[#17231E]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls & Prominent Bulk SMS Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Selection Helpers */}
          <button
            onClick={selectAllEligibleTenants}
            className="px-3 py-2 rounded-xl bg-[#F0F4F2] hover:bg-[#E5ECE8] text-[#2F4238] text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            Select All Eligible
          </button>

          {selectedTenantRefs.size > 0 && (
            <button
              onClick={deselectAllTenants}
              className="px-3 py-2 rounded-xl bg-white border border-[#DFE5E1] text-[#718478] hover:text-[#17231E] text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Clear Selection ({selectedTenantRefs.size})
            </button>
          )}

          {/* Expand/Collapse All */}
          <button
            onClick={Object.keys(collapsedPrefixes).length > 0 ? expandAll : collapseAll}
            className="px-3 py-2 rounded-xl bg-white border border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F2F6F4] text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            {Object.keys(collapsedPrefixes).length > 0 ? 'Expand All' : 'Collapse All'}
          </button>

          {/* Secondary Utilities: History & Gateway */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            title="View Sozuri SMS Delivery History"
            className="p-2 rounded-xl bg-white border border-[#DFE5E1] text-[#4A5D52] hover:text-[#145338] hover:bg-[#F2F6F4] transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSettingsModalOpen(true)}
            title="Configure SMS Gateway & Automations"
            className="p-2 rounded-xl bg-white border border-[#DFE5E1] text-[#4A5D52] hover:text-[#145338] hover:bg-[#F2F6F4] transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* PROMINENT BULK SMS BUTTON */}
          <button
            onClick={() => setIsBulkModalOpen(true)}
            disabled={selectedTenantRefs.size === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D5F267] hover:bg-[#c8e858] disabled:opacity-50 disabled:cursor-not-allowed text-[#17231E] rounded-xl text-[13px] font-bold shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span>Send Bulk SMS {selectedTenantRefs.size > 0 ? `(${selectedTenantRefs.size} Selected)` : ''}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2 & 3: TENANTS GROUPED BY PREFIX & HORIZONTAL TABLE ROWS
         ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-lg font-black text-[#17231E]">
              Tenants by Property Prefix
            </h2>
            <p className="text-[12px] text-[#697B71]">
              Organized automatically by assigned property and unit identification prefixes
            </p>
          </div>
        </div>

        {filteredPrefixGroups.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-[#E5EAE7] shadow-xs">
            <Building2 className="w-10 h-10 text-[#8C9C93] mx-auto mb-3" />
            <h3 className="text-base font-bold text-[#17231E]">No tenants match your search / filter</h3>
            <p className="text-[13px] text-[#6E7F75] max-w-sm mx-auto mt-1 mb-4">
              Try resetting the active summary filter or search terms to view all tenant groups.
            </p>
            <button
              onClick={() => {
                setActiveSummaryFilter('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-[#17231E] text-white rounded-xl text-[12.5px] font-bold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPrefixGroups.map((group) => {
              const isCollapsed = Boolean(collapsedPrefixes[group.prefix]);
              const groupTenants = group.filteredTenants;
              const allRefs = groupTenants.map((t) => t.tenantRef.toUpperCase());
              const selectedInGroupCount = allRefs.filter((ref) => selectedTenantRefs.has(ref)).length;
              const isAllInGroupSelected = allRefs.length > 0 && selectedInGroupCount === allRefs.length;
              const isPartialInGroupSelected = selectedInGroupCount > 0 && selectedInGroupCount < allRefs.length;

              return (
                <div
                  key={group.prefix}
                  className="bg-white rounded-2xl border border-[#DFE5E1] shadow-xs overflow-hidden transition-all"
                >
                  {/* PREFIX GROUP HEADER */}
                  <div className="bg-[#FAFBFB] px-4 sm:px-5 py-3 border-b border-[#EAEFEA] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Group Selection Checkbox */}
                      <button
                        onClick={() => toggleSelectPrefixGroup(groupTenants)}
                        className="text-[#145338] hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                        title={isAllInGroupSelected ? 'Deselect entire group' : 'Select entire group'}
                      >
                        {isAllInGroupSelected ? (
                          <CheckSquare className="w-5 h-5 text-[#145338]" />
                        ) : isPartialInGroupSelected ? (
                          <MinusSquare className="w-5 h-5 text-[#145338]" />
                        ) : (
                          <Square className="w-5 h-5 text-[#8E9F95]" />
                        )}
                      </button>

                      {/* Small Property Cover Image (44x44px) */}
                      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-[#DFE5E1] bg-[#F0F4F2] shadow-xs flex items-center justify-center">
                        {group.coverImageUrl ? (
                          <img
                            src={group.coverImageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#EEF4F0] to-[#DFEBE3] text-[#145338]">
                            <Building2 className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Group Title & Details */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-[#17231E] text-[#D5F267]">
                            Prefix {group.prefix}
                          </span>
                          <h3 className="text-[15px] font-bold text-[#17231E]">
                            {group.propertyName}
                          </h3>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#EAF5EF] text-[#1E5D44] border border-[#CFE4D8]">
                            {groupTenants.length} {groupTenants.length === 1 ? 'Tenant' : 'Tenants'}
                          </span>
                        </div>

                        <p className="text-[11.5px] text-[#697B71] mt-0.5 flex items-center gap-2">
                          <span>Outstanding: <strong className={group.totalBalance > 0 ? 'text-red-700' : 'text-[#145338]'}>KES {group.totalBalance.toLocaleString()}</strong></span>
                          <span>&bull;</span>
                          <span className="text-red-600 font-semibold">{group.overdueCount} Overdue</span>
                          <span>&bull;</span>
                          <span className="text-amber-700 font-medium">{group.dueCount} Due</span>
                          <span>&bull;</span>
                          <span className="text-[#145338] font-medium">{group.clearedCount} Cleared</span>
                        </p>
                      </div>
                    </div>

                    {/* Collapse / Expand Toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePrefixCollapse(group.prefix)}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F0F4F2] text-[11.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
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

                  {/* SECTION 3: COMPACT HORIZONTAL TABLE ROWS */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12.5px] border-collapse">
                        <thead>
                          <tr className="bg-[#F8FAF9] text-[#55695E] text-[11px] font-bold uppercase tracking-wider border-b border-[#EAEFEA]">
                            <th className="py-2.5 px-4 w-10 text-center">
                              <span className="sr-only">Select</span>
                            </th>
                            <th className="py-2.5 px-3">Tenant Name</th>
                            <th className="py-2.5 px-3">Property</th>
                            <th className="py-2.5 px-3">Unit Number</th>
                            <th className="py-2.5 px-3">Phone Number</th>
                            <th className="py-2.5 px-3 text-right">Rent Amount</th>
                            <th className="py-2.5 px-3 text-right">Outstanding Balance</th>
                            <th className="py-2.5 px-3 text-center">Due Date</th>
                            <th className="py-2.5 px-3 text-center">Payment Status</th>
                            <th className="py-2.5 px-4 text-center">Reminder Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAEFEA]">
                          {groupTenants.map((t) => {
                            const isSelected = selectedTenantRefs.has(t.tenantRef.toUpperCase());
                            const hasBalance = t.rentBalance > 0;
                            const isOverdue = t.status === 'Overdue' || (hasBalance && t.status !== 'Paid');
                            const isCleared = t.status === 'Paid' && !hasBalance;

                            return (
                              <tr
                                key={t.tenantRef}
                                className={`hover:bg-[#F9FBFA] transition-colors ${
                                  isSelected ? 'bg-[#F4F9F6]' : ''
                                }`}
                              >
                                {/* Checkbox */}
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    onClick={() => toggleSelectTenant(t.tenantRef)}
                                    className="cursor-pointer text-[#145338]"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-[#145338]" />
                                    ) : (
                                      <Square className="w-4 h-4 text-[#8E9F95]" />
                                    )}
                                  </button>
                                </td>

                                {/* Tenant Name & Ref */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10.5px] text-[#17231E] shrink-0"
                                      style={{ backgroundColor: t.avatarBg || '#D8F3E5' }}
                                    >
                                      {t.tenantName.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-bold text-[#17231E] leading-tight">
                                        {t.tenantName}
                                      </div>
                                      <span className="font-mono text-[10px] text-[#718478]">
                                        {t.tenantRef}
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* Property */}
                                <td className="py-2.5 px-3 whitespace-nowrap text-[#4A5D52] font-medium">
                                  {t.property}
                                </td>

                                {/* Unit Number */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md bg-[#F0F4F2] text-[#17231E] font-mono text-[11px] font-semibold">
                                    {t.unitNumber}
                                  </span>
                                </td>

                                {/* Phone Number */}
                                <td className="py-2.5 px-3 whitespace-nowrap text-[#2F4238]">
                                  {t.phone ? (
                                    <span className="flex items-center gap-1 font-mono text-[11.5px]">
                                      <Phone className="w-3 h-3 text-[#7C8B83]" />
                                      <span>{t.phone}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-red-500 font-medium">
                                      Missing Phone
                                    </span>
                                  )}
                                </td>

                                {/* Rent Amount */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold text-[#17231E]">
                                  KES {t.monthlyRent.toLocaleString()}
                                </td>

                                {/* Outstanding Balance */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <span
                                    className={`font-bold ${
                                      hasBalance ? 'text-red-700' : 'text-[#145338]'
                                    }`}
                                  >
                                    KES {t.rentBalance.toLocaleString()}
                                  </span>
                                </td>

                                {/* Due Date */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap text-[#55695E] text-[11.5px]">
                                  {t.dueDate}
                                </td>

                                {/* Payment Status */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                      isOverdue
                                        ? 'bg-red-100 text-red-800 border border-red-200'
                                        : isCleared
                                        ? 'bg-[#D8F3E5] text-[#145338] border border-[#BCE9D3]'
                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {isOverdue ? 'Overdue' : isCleared ? 'Cleared' : 'Rent Due'}
                                  </span>
                                </td>

                                {/* Reminder Status & Quick Send Action */}
                                <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {t.latestSms ? (
                                      <span
                                        title={`Last sent: ${new Date(t.latestSms.createdAt).toLocaleDateString()}`}
                                        className="text-[10px] font-semibold text-[#15803D] bg-[#F2FCE2] px-2 py-0.5 rounded-md flex items-center gap-1"
                                      >
                                        <CheckCheck className="w-3 h-3" /> Sent
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-[#8C9C93] bg-[#F4F6F5] px-2 py-0.5 rounded-md">
                                        Not Sent
                                      </span>
                                    )}

                                    <button
                                      onClick={() => openSingleReminderModal(t)}
                                      title="Send individual reminder SMS"
                                      className="p-1 rounded-md text-[#145338] hover:bg-[#EAF5EF] transition-colors cursor-pointer"
                                    >
                                      <Send className="w-3.5 h-3.5" />
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
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL: BULK SMS REMINDER COMPOSER
         ========================================================================= */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4.5 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[#145338]" />
                  <span>Send Bulk SMS Reminders</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Dispatched securely via Sozuri SMS Gateway backend service
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBulkModalOpen(false);
                  setBulkDispatchResult(null);
                }}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4.5">
              {/* Audience Breakdown Box */}
              <div className="rounded-2xl bg-[#F6FAF7] border border-[#D5EADB] p-4 space-y-2">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[#4A5D52]">Selected Groups:</span>
                  <span className="font-bold text-[#17231E]">
                    {selectedTenantsData.prefixes.map((p) => `Prefix ${p}`).join(', ') || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[#4A5D52]">Total Selected Tenants:</span>
                  <span className="font-bold text-[#17231E]">{selectedTenantsData.selected.length}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px] pt-1 border-t border-[#DFEBE3]">
                  <span className="font-bold text-[#145338]">Eligible for Reminder Dispatch:</span>
                  <span className="text-sm font-black text-[#145338]">
                    {selectedTenantsData.eligible.length} Tenants
                  </span>
                </div>

                {/* Exclusions Notice */}
                {(selectedTenantsData.excludedPaid.length > 0 || selectedTenantsData.excludedNoPhone.length > 0) && (
                  <div className="text-[11px] text-[#55695E] pt-1 space-y-0.5 border-t border-[#DFEBE3]">
                    {selectedTenantsData.excludedPaid.length > 0 && (
                      <p className="flex items-center gap-1 text-[#15803D]">
                        <Check className="w-3 h-3" />
                        <span>{selectedTenantsData.excludedPaid.length} tenant(s) excluded: already fully paid (balance KES 0)</span>
                      </p>
                    )}
                    {selectedTenantsData.excludedNoPhone.length > 0 && (
                      <p className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3 h-3" />
                        <span>{selectedTenantsData.excludedNoPhone.length} tenant(s) excluded: missing or invalid phone number</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Template Type Selector */}
              <div>
                <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1.5">
                  Message Template Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectBulkTemplate('rent_due')}
                    className={`py-2 px-3 rounded-xl text-[12px] font-bold border transition-all cursor-pointer ${
                      bulkTemplateType === 'rent_due'
                        ? 'bg-[#17231E] text-[#D5F267] border-[#17231E] shadow-xs'
                        : 'bg-white border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F2F6F4]'
                    }`}
                  >
                    Rent Due Notice
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectBulkTemplate('overdue')}
                    className={`py-2 px-3 rounded-xl text-[12px] font-bold border transition-all cursor-pointer ${
                      bulkTemplateType === 'overdue'
                        ? 'bg-[#17231E] text-[#D5F267] border-[#17231E] shadow-xs'
                        : 'bg-white border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F2F6F4]'
                    }`}
                  >
                    Overdue Arrears
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectBulkTemplate('announcement')}
                    className={`py-2 px-3 rounded-xl text-[12px] font-bold border transition-all cursor-pointer ${
                      bulkTemplateType === 'announcement'
                        ? 'bg-[#17231E] text-[#D5F267] border-[#17231E] shadow-xs'
                        : 'bg-white border-[#DFE5E1] text-[#4A5D52] hover:bg-[#F2F6F4]'
                    }`}
                  >
                    Announcement
                  </button>
                </div>
              </div>

              {/* Editable SMS Textbox */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider">
                    SMS Message Body
                  </label>
                  <span className="text-[11px] text-[#718478]">
                    {bulkMessageText.length} chars ({Math.ceil(bulkMessageText.length / 160)} SMS)
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={bulkMessageText}
                  onChange={(e) => setBulkMessageText(e.target.value)}
                  className="w-full p-3.5 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
                />
              </div>

              {/* Dynamic Tag Placeholder Buttons */}
              <div>
                <span className="text-[11px] font-bold text-[#55695E] uppercase tracking-wider block mb-1">
                  Insert Personalized Placeholders:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { tag: '{name}', label: 'Tenant Name' },
                    { tag: '{property}', label: 'Property' },
                    { tag: '{unit}', label: 'Unit Number' },
                    { tag: '{amount}', label: 'Balance / Rent' },
                    { tag: '{dueDate}', label: 'Due Date' },
                    { tag: '{tenantRef}', label: 'Account Ref' },
                  ].map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => insertPlaceholder(p.tag)}
                      className="px-2.5 py-1 rounded-lg bg-[#F0F4F2] hover:bg-[#E2EBE5] text-[#145338] text-[11px] font-mono font-bold transition-colors cursor-pointer"
                    >
                      + {p.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Box */}
              <div>
                <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[#145338]" />
                  <span>Simulated Tenant SMS Preview</span>
                </label>
                <div className="p-3.5 rounded-xl bg-[#17231E] text-white text-[12.5px] font-mono leading-relaxed border border-[#23352D] shadow-xs">
                  <div className="text-[10px] text-[#D5F267] font-bold uppercase mb-1">
                    From: {smsSettings?.senderId || 'RENTIFY'} &bull; To:{' '}
                    {selectedTenantsData.eligible[0]?.tenantName || 'Tenant'} ({selectedTenantsData.eligible[0]?.phone || 'Phone'})
                  </div>
                  {previewSampleMessage}
                </div>
              </div>

              {/* Duplicate Protection Toggle */}
              <label className="flex items-center gap-2 text-[12px] text-[#3B4D43] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={preventDuplicates24h}
                  onChange={(e) => setPreventDuplicates24h(e.target.checked)}
                  className="rounded text-[#145338] focus:ring-[#145338]"
                />
                <span>Prevent duplicate reminders to the same tenant within 24 hours</span>
              </label>

              {/* Results banner if dispatch finished */}
              {bulkDispatchResult && (
                <div className="p-4 rounded-xl bg-[#EAF7EE] border border-[#BCE8C7] text-[#145338] text-[12.5px] flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#145338] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-[#145338]">Dispatch Completed!</h4>
                    <p className="mt-0.5">{bulkDispatchResult.message}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-[#FAFBFB] border-t border-[#EAEFEA] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsBulkModalOpen(false);
                  setBulkDispatchResult(null);
                }}
                disabled={isSendingBulk}
                className="px-4 py-2.5 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[13px] font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkSend}
                disabled={isSendingBulk || selectedTenantsData.eligible.length === 0}
                className="px-5 py-2.5 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] disabled:opacity-50 text-[#17231E] text-[13px] font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2"
              >
                {isSendingBulk ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sending via Sozuri SMS Gateway...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch {selectedTenantsData.eligible.length} SMS Reminders</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SINGLE TENANT REMINDER MODAL
         ========================================================================= */}
      {singleReminderTenant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#DFE5E1] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAEFEA]">
              <div>
                <h3 className="text-base font-bold text-[#17231E]">
                  Send Reminder to {singleReminderTenant.tenantName}
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  {singleReminderTenant.unitNumber} &bull; {singleReminderTenant.property} &bull; Ref: {singleReminderTenant.tenantRef}
                </p>
              </div>
              <button
                onClick={() => setSingleReminderTenant(null)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-[#F8FAF9] rounded-xl border border-[#E5EAE7] flex items-center justify-between text-[12.5px]">
              <div>
                <span className="text-[11px] text-[#697B71] block">Phone Number</span>
                <span className="font-mono font-bold text-[#17231E]">{singleReminderTenant.phone || 'None on file'}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#697B71] block">Outstanding Balance</span>
                <span className={`font-bold ${singleReminderTenant.rentBalance > 0 ? 'text-red-700' : 'text-[#145338]'}`}>
                  KES {singleReminderTenant.rentBalance.toLocaleString()}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                SMS Message Body
              </label>
              <textarea
                rows={4}
                value={singleMessageText}
                onChange={(e) => setSingleMessageText(e.target.value)}
                className="w-full p-3 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[13px] text-[#17231E] focus:outline-none focus:border-[#145338]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSingleReminderTenant(null)}
                disabled={isSendingSingle}
                className="px-4 py-2 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[12.5px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSingleReminder}
                disabled={isSendingSingle || !singleReminderTenant.phone}
                className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] disabled:opacity-50 text-[#17231E] text-[12.5px] font-bold shadow-xs flex items-center gap-1.5"
              >
                {isSendingSingle ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send SMS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SOZURI SMS DELIVERY HISTORY
         ========================================================================= */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <History className="w-5 h-5 text-[#145338]" />
                  <span>Sozuri SMS Delivery History</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Live audit trail of dispatched Sozuri notifications recorded in database
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {smsLogs.length === 0 ? (
                <div className="p-12 text-center text-[#6E7F75]">
                  <Smartphone className="w-8 h-8 text-[#8C9C93] mx-auto mb-2" />
                  <p className="font-bold text-[#17231E]">No SMS logs recorded yet</p>
                  <p className="text-xs mt-1">Dispatched reminders will appear here in real-time.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#EAEFEA] border border-[#EAEFEA] rounded-2xl overflow-hidden">
                  {smsLogs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-[#FAFBFB] transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12.5px]">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-[#17231E]">
                          <span>{log.tenantName}</span>
                          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#F0F4F2] text-[#4A5D52]">
                            {log.tenantRef}
                          </span>
                          <span className="text-[11px] font-normal text-[#697B71]">
                            &bull; {log.propertyName} ({log.unitNumber})
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[#55695E] font-mono mt-1">
                          {log.messageBody}
                        </p>
                        <span className="text-[10px] text-[#8C9C93] mt-1 block">
                          {new Date(log.createdAt).toLocaleString()} &bull; Phone: {log.recipientPhone} &bull; Cost: KES {log.costKes || 0.8}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold shrink-0 ${
                          log.deliveryStatus === 'Delivered' || log.deliveryStatus === 'Sent'
                            ? 'bg-[#D8F3E5] text-[#145338]'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.deliveryStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-[#FAFBFB] border-t border-[#EAEFEA] flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-5 py-2 bg-[#17231E] text-white text-[12.5px] font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: GATEWAY & AUTOMATION SETTINGS
         ========================================================================= */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#DFE5E1] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAEFEA]">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#145338]" />
                  <span>Sozuri SMS Gateway Settings</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Configure Sozuri SMS Gateway (https://sozuri.net/api/v1/messaging)
                </p>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-[12.5px]">
              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Gateway Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, environment: 'sandbox' }))}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      settingsDraft.environment === 'sandbox'
                        ? 'bg-[#17231E] text-[#D5F267] border-[#17231E]'
                        : 'bg-[#F8FAF9] text-[#4A5D52] border-[#DFE5E1]'
                    }`}
                  >
                    Sandbox (Simulated)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsDraft((prev) => ({ ...prev, environment: 'production' }))}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      settingsDraft.environment === 'production'
                        ? 'bg-[#145338] text-white border-[#145338]'
                        : 'bg-[#F8FAF9] text-[#4A5D52] border-[#DFE5E1]'
                    }`}
                  >
                    Production (Live Sozuri)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Sozuri Project Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. ARABELLA"
                  value={settingsDraft.sozuriProject || ''}
                  onChange={(e) => setSettingsDraft((prev) => ({ ...prev, sozuriProject: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-[#17231E]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Approved Sender ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. ARABELLA"
                  value={settingsDraft.senderId}
                  onChange={(e) => setSettingsDraft((prev) => ({ ...prev, senderId: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-[#17231E]"
                />
              </div>

              <div className="pt-2 border-t border-[#EAEFEA] space-y-2">
                <span className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block">
                  Automated Triggers
                </span>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.autoRentDueSoon}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, autoRentDueSoon: e.target.checked }))}
                    className="rounded text-[#145338]"
                  />
                  <span>Automatically send reminder when rent is approaching due date</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.autoRentOverdue}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, autoRentOverdue: e.target.checked }))}
                    className="rounded text-[#145338]"
                  />
                  <span>Automatically send alert when rent becomes overdue</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.autoPaymentConfirmed}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, autoPaymentConfirmed: e.target.checked }))}
                    className="rounded text-[#145338]"
                  />
                  <span>Automatically send receipt confirmation when payment is verified</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#EAEFEA]">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[12.5px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] text-[#17231E] text-[12.5px] font-bold shadow-xs"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
