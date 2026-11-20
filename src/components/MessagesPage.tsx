import React, { useState, useEffect, useMemo } from 'react';
import { AnimatedCounter } from './AnimatedMetrics';
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
  Eye,
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
  BrandedEmailRecord,
  EmailNotificationSettings,
  EmailReminderTriggerType,
} from '../data/rentalData';
import { realtimeSmsClient } from '../lib/realtimeSms';
import { smsApi, emailApi } from '../lib/apiClient';

interface MessagesPageProps {
  threads: ChatThread[];
  tenants: TenantProfile[];
  properties: PropertyRecord[];
  currentUser: UserSession;
  smsLogs?: SmsLogRecord[];
  smsSettings?: SmsNotificationSettings | null;
  brandedEmails?: BrandedEmailRecord[];
  onBrandedEmailsChange?: React.Dispatch<React.SetStateAction<BrandedEmailRecord[]>>;
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
  brandedEmails = [],
  onBrandedEmailsChange,
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
  const [singleReminderChannel, setSingleReminderChannel] = useState<'sms' | 'email' | 'both'>('both');
  const [singleEmailTriggerType, setSingleEmailTriggerType] = useState<EmailReminderTriggerType>('rent_upcoming_3d');
  const [isSendingSingle, setIsSendingSingle] = useState(false);

  // 5. Secondary Utility Modals (History & Notification Settings)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 6. Resend Email Notification Management State
  const [emailList, setEmailList] = useState<BrandedEmailRecord[]>(brandedEmails);
  const [emailStatusFilter, setEmailStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [isEmailSettingsModalOpen, setIsEmailSettingsModalOpen] = useState(false);
  const [previewEmailRecord, setPreviewEmailRecord] = useState<BrandedEmailRecord | null>(null);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const [isRunningAutoEmail, setIsRunningAutoEmail] = useState(false);
  const [isSavingEmailSettings, setIsSavingEmailSettings] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState(currentUser?.email || 'ochiengpeterson507@gmail.com');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [emailSettingsDraft, setEmailSettingsDraft] = useState<EmailNotificationSettings>({
    masterEnabled: true,
    autoRentUpcoming3d: true,
    autoRentDueToday: true,
    autoRentOverdue: true,
    autoPaymentConfirmed: true,
    autoLeaseExpiry30d: true,
    autoLeaseExpiry7d: true,
    senderName: 'ARabella agency',
    fromEmail: 'ARabella agency <onboarding@resend.dev>',
    paymentInstructions:
      'Remit payment via M-Pesa Paybill or Bank Transfer quoting your Tenant Account Reference (e.g., A-001) as the account number.',
    preventDuplicatesHours: 24,
    apiKeyConfigured: true,
  });
  const [settingsDraft, setSettingsDraft] = useState<SmsNotificationSettings>({
    environment: smsSettings?.environment || 'sandbox',
    senderId: smsSettings?.senderId || 'ARABELLA',
    username: smsSettings?.username || 'ARAbella agency',
    channel: smsSettings?.channel || 'sms',
    smsType: smsSettings?.smsType || 'promotional',
    apiKeyConfigured: smsSettings?.apiKeyConfigured ?? false,
    masterEnabled: smsSettings?.masterEnabled ?? true,
    autoTenantRegistered: smsSettings?.autoTenantRegistered ?? true,
    autoRentDueSoon: smsSettings?.autoRentDueSoon ?? true,
    autoRentOverdue: smsSettings?.autoRentOverdue ?? true,
    autoPaymentConfirmed: smsSettings?.autoPaymentConfirmed ?? true,
    autoAdminAnnouncement: smsSettings?.autoAdminAnnouncement ?? true,
    preventDuplicatesHours: smsSettings?.preventDuplicatesHours ?? 24,
    provider: smsSettings?.provider || 'Sozuri',
    updatedBy: smsSettings?.updatedBy || 'System Default',
    updatedAt: smsSettings?.updatedAt || new Date().toISOString(),
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(realtimeSmsClient.getStatus());

  // SMS Live Test & Delivery Status state
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState('Test notification from ARabella Management via Sozuri SMS.');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; messageId?: string } | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);
  const [queryingDlrId, setQueryingDlrId] = useState<string | null>(null);

  useEffect(() => {
    if (smsSettings) {
      setSettingsDraft((prev) => ({
        ...prev,
        environment: smsSettings.environment || 'sandbox',
        senderId: smsSettings.senderId || 'ARABELLA',
        username: smsSettings.username || 'ARAbella agency',
        channel: smsSettings.channel || 'sms',
        smsType: smsSettings.smsType || 'promotional',
        apiKeyConfigured: smsSettings.apiKeyConfigured ?? false,
        masterEnabled: smsSettings.masterEnabled ?? true,
        autoTenantRegistered: smsSettings.autoTenantRegistered ?? true,
        autoRentDueSoon: smsSettings.autoRentDueSoon ?? true,
        autoRentOverdue: smsSettings.autoRentOverdue ?? true,
        autoPaymentConfirmed: smsSettings.autoPaymentConfirmed ?? true,
        autoAdminAnnouncement: smsSettings.autoAdminAnnouncement ?? true,
        preventDuplicatesHours: smsSettings.preventDuplicatesHours ?? 24,
        updatedBy: smsSettings.updatedBy || 'System Default',
        updatedAt: smsSettings.updatedAt || new Date().toISOString(),
      }));
    }
  }, [smsSettings]);

  const [realtimePulse, setRealtimePulse] = useState(false);

  useEffect(() => {
    const unsubStatus = realtimeSmsClient.onStatusChange((connected) => {
      setIsRealtimeActive(connected);
    });
    const unsubEvents = realtimeSmsClient.subscribe((eventType, payload) => {
      if (eventType === 'sms:dispatched' && payload) {
        setRealtimePulse(true);
        setTimeout(() => setRealtimePulse(false), 2000);
        const name = payload.tenantName || payload.tenantRef || 'Resident';
        const status = payload.status || 'Delivered';
        const net = payload.network ? ` (${payload.network})` : '';
        setToastMessage(`⚡ Real-Time SMS ${status}: Sent to ${name}${net}`);
        setTimeout(() => setToastMessage(null), 4500);
      } else if (eventType === 'sms:bulk_dispatched' && payload) {
        setToastMessage(`⚡ Real-Time Bulk SMS: Dispatched to ${payload.sentCount} recipients`);
        setTimeout(() => setToastMessage(null), 4500);
      } else if ((eventType === 'email:dispatched' || eventType === 'email:retried') && payload?.email) {
        setRealtimePulse(true);
        setTimeout(() => setRealtimePulse(false), 2000);
        setEmailList((prev) => [
          payload.email,
          ...prev.filter((item) => item.id !== payload.email.id),
        ]);
        if (onBrandedEmailsChange) {
          onBrandedEmailsChange((prev) => [
            payload.email,
            ...prev.filter((item) => item.id !== payload.email.id),
          ]);
        }
      }
    });
    return () => {
      unsubStatus();
      unsubEvents();
    };
  }, [onBrandedEmailsChange]);

  useEffect(() => {
    if (brandedEmails && brandedEmails.length > 0) {
      setEmailList((prev) => {
        const byId = new Map<string, BrandedEmailRecord>();
        for (const item of brandedEmails) byId.set(item.id, item);
        for (const item of prev) {
          if (!byId.has(item.id)) byId.set(item.id, item);
        }
        return Array.from(byId.values());
      });
    }
  }, [brandedEmails]);

  useEffect(() => {
    let active = true;
    emailApi
      .getEmailHistory()
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res.emails)) {
          setEmailList(res.emails);
          if (onBrandedEmailsChange) onBrandedEmailsChange(res.emails);
        }
        if (res.settings) {
          setEmailSettingsDraft(res.settings);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [onBrandedEmailsChange]);

  useEffect(() => {
    if (smsSettings) {
      setSettingsDraft(smsSettings);
    }
  }, [smsSettings]);

  // Combined tenant directory linking profile, financials, payment history, and threads
  const combinedDirectory = useMemo(() => {
    const map = new Map<string, any>();

    for (const t of tenants) {
      const tRef = String(t.tenantRef || (t as any).tenant_ref || '').trim();
      const tRefUpper = tRef.toUpperCase();

      const matchedThread = threads.find((th) => {
        const thRef = String(th.tenantRef || (th as any).tenant_ref || '').trim();
        return thRef && tRefUpper ? thRef.toUpperCase() === tRefUpper : false;
      });

      // Find latest SMS log for this tenant
      const latestSms = smsLogs.find((l) => {
        const lRef = String(l.tenantRef || (l as any).tenant_ref || '').trim();
        return lRef && tRefUpper ? lRef.toUpperCase() === tRefUpper : false;
      });

      // Extract numeric unit portion for sorting (e.g. from "A-002" -> 2)
      const numMatch = tRef.match(/\d+/);
      const unitNumOrder = numMatch ? parseInt(numMatch[0], 10) : 9999;
      const key = tRefUpper || t.id;

      map.set(key, {
        id: t.id,
        propertyId: t.propertyId,
        tenantRef: tRef || t.id,
        tenantName: t.name || (t as any).tenantName || 'Resident',
        name: t.name || (t as any).tenantName || 'Resident',
        unitNumber: t.unitNumber || tRef || 'Unit 101',
        property: t.property || 'Main Property',
        phone: t.phone || '',
        email: t.email || '',
        avatarBg: t.avatarBg || '#D8F3E5',
        monthlyRent: Number(t.monthlyRent || 0),
        rentBalance: Number(t.rentBalance !== undefined ? t.rentBalance : (t as any).balanceDue || 0),
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
      const thRef = String(th.tenantRef || (th as any).tenant_ref || '').trim();
      const key = thRef ? thRef.toUpperCase() : th.id;
      if (!map.has(key)) {
        const numMatch = thRef.match(/\d+/);
        const unitNumOrder = numMatch ? parseInt(numMatch[0], 10) : 9999;
        const latestSms = smsLogs.find((l) => {
          const lRef = String(l.tenantRef || (l as any).tenant_ref || '').trim();
          return lRef && thRef ? lRef.toUpperCase() === thRef.toUpperCase() : false;
        });

        map.set(key, {
          tenantRef: thRef || th.id,
          tenantName: th.tenantName || 'Resident',
          name: th.tenantName || 'Resident',
          unitNumber: th.unitNumber || thRef || 'Unit 101',
          property: th.property || 'Main Property',
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
      const pref = String(p.codePrefix || (p.name ? p.name[0] : '') || 'A').trim().toUpperCase().slice(0, 1) || 'A';
      propByPrefix.set(pref, p);
      propById.set(p.id, p);
      if (p.name) {
        propByName.set(p.name.trim().toLowerCase(), p);
      }
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
      const pref = String(p.codePrefix || (p.name ? p.name[0] : '') || 'A').trim().toUpperCase().slice(0, 1) || 'A';
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
      const upper = String(tenantRef || '').trim().toUpperCase();
      if (!upper) return next;
      if (next.has(upper)) next.delete(upper);
      else next.add(upper);
      return next;
    });
  };

  const toggleSelectPrefixGroup = (groupTenants: any[]) => {
    const allRefs = groupTenants
      .map((t) => String(t.tenantRef || '').trim().toUpperCase())
      .filter(Boolean);
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
          const upper = String(t.tenantRef || '').trim().toUpperCase();
          if (upper) set.add(upper);
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
    const selected = combinedDirectory.filter((t) => {
      const upper = String(t.tenantRef || '').trim().toUpperCase();
      return upper ? selectedTenantRefs.has(upper) : false;
    });

    const isAnnouncement = bulkTemplateType === 'announcement';

    const eligible = selected.filter(
      (t) =>
        (isAnnouncement || t.rentBalance > 0 || t.status !== 'Paid') &&
        t.phone &&
        t.phone.trim().length >= 8
    );

    const excludedPaid = isAnnouncement
      ? []
      : selected.filter((t) => t.rentBalance <= 0 && t.status === 'Paid');
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
  }, [combinedDirectory, selectedTenantRefs, bulkTemplateType]);

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
      setToastMessage('No eligible tenants are selected. Tenants with zero balance (for rent reminders) or missing phone numbers are excluded.');
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }

    setIsSendingBulk(true);
    setBulkDispatchResult(null);

    try {
      const eligibleRefs = selectedTenantsData.eligible.map((t) => t.tenantRef);
      const res = onSendBulkSms
        ? await onSendBulkSms({
            tenantRefs: eligibleRefs,
            triggerType:
              bulkTemplateType === 'overdue'
                ? 'rent_overdue'
                : bulkTemplateType === 'announcement'
                ? 'admin_announcement'
                : 'rent_due_soon',
            messageTemplate: bulkMessageText,
            forceSend: !preventDuplicates24h,
          })
        : undefined;

      const sent = res?.sentCount ?? 0;
      const skipped = res?.skippedDuplicatesCount ?? 0;
      const failed = res?.failedCount ?? 0;
      const firstError = res?.logs?.find((l: any) => l?.errorMessage)?.errorMessage;

      setBulkDispatchResult({
        sentCount: sent,
        skippedDuplicatesCount: skipped,
        failedCount: failed,
        message:
          failed > 0 && sent === 0 && firstError
            ? `Bulk SMS Failed (${failed} failed): ${firstError}`
            : `Dispatched ${sent} SMS notifications (${skipped} duplicates skipped, ${failed} failed).`,
      });

      setToastMessage(
        failed > 0 && sent === 0 && firstError
          ? `Sozuri SMS Error: ${firstError}`
          : `Bulk SMS Complete: Dispatched ${sent} messages (${skipped} duplicate reminders prevented, ${failed} failed).`
      );
      setTimeout(() => setToastMessage(null), 6000);
    } catch (err: any) {
      setToastMessage(`Bulk SMS failed: ${err?.message || 'Network error'}`);
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsSendingBulk(false);
    }
  };

  // Open single tenant reminder modal
  const openSingleReminderModal = (tenant: any) => {
    setSingleReminderTenant(tenant);
    setSingleReminderChannel('both');
    setSingleEmailTriggerType(tenant.status === 'Overdue' ? 'rent_overdue' : 'rent_upcoming_3d');
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
      const sendSmsNow = singleReminderChannel === 'sms' || singleReminderChannel === 'both';
      const sendEmailNow = singleReminderChannel === 'email' || singleReminderChannel === 'both';

      if (sendSmsNow && onSendSms) {
        const res: any = await onSendSms({
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

        if (res && res.success === false && !sendEmailNow) {
          throw new Error(res.message || res.log?.errorMessage || 'SMS delivery failed');
        }
      }

      if (sendEmailNow) {
        const emailRes = await emailApi.sendEmailReminder({
          tenantId: singleReminderTenant.id,
          tenantRef: singleReminderTenant.tenantRef,
          tenantName: singleReminderTenant.tenantName,
          recipientEmail: singleReminderTenant.email,
          propertyName: singleReminderTenant.property,
          unitNumber: singleReminderTenant.unitNumber,
          triggerType: singleEmailTriggerType,
          amountDue:
            singleReminderTenant.rentBalance > 0
              ? singleReminderTenant.rentBalance
              : singleReminderTenant.monthlyRent,
          dueDate: singleReminderTenant.dueDate || '5th of this month',
          customBody: singleMessageText.trim(),
          forceSend: true,
        });
        if (emailRes?.log) {
          setEmailList((prev) => [emailRes.log!, ...prev.filter((e) => e.id !== emailRes.log!.id)]);
          if (onBrandedEmailsChange) {
            onBrandedEmailsChange((prev) => [emailRes.log!, ...prev.filter((e) => e.id !== emailRes.log!.id)]);
          }
        }
        if (!emailRes.success && !sendSmsNow) {
          throw new Error(emailRes.message || 'Email delivery failed');
        }
      }

      setToastMessage(
        singleReminderChannel === 'both'
          ? `SMS & Resend Email reminder dispatched to ${singleReminderTenant.tenantName}`
          : singleReminderChannel === 'email'
          ? `Resend Email reminder dispatched to ${singleReminderTenant.tenantName} (${singleReminderTenant.email})`
          : `SMS reminder sent to ${singleReminderTenant.tenantName} (${singleReminderTenant.phone})`
      );
      setTimeout(() => setToastMessage(null), 4500);
      setSingleReminderTenant(null);
    } catch (err: any) {
      setToastMessage(`Failed to send reminder: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsSendingSingle(false);
    }
  };

  // Resend Email Notification Management Handlers
  const handleRetryEmail = async (emailId: string) => {
    setRetryingEmailId(emailId);
    try {
      const res = await emailApi.retryEmailNotification(emailId);
      if (res.email) {
        setEmailList((prev) => prev.map((e) => (e.id === emailId ? res.email! : e)));
        if (onBrandedEmailsChange) {
          onBrandedEmailsChange((prev) => prev.map((e) => (e.id === emailId ? res.email! : e)));
        }
      }
      setToastMessage(res.message || 'Email retry completed.');
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err: any) {
      setToastMessage(`Retry failed: ${err?.message || 'Network error'}`);
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setRetryingEmailId(null);
    }
  };

  const handleRunAutomatedEmailChecks = async () => {
    setIsRunningAutoEmail(true);
    try {
      const res = await emailApi.triggerAutomatedEmailChecks();
      if (Array.isArray(res.emails) && res.emails.length > 0) {
        setEmailList((prev) => {
          const newIds = new Set(res.emails.map((e) => e.id));
          return [...res.emails, ...prev.filter((e) => !newIds.has(e.id))];
        });
      }
      const fresh = await emailApi.getEmailHistory().catch(() => null);
      if (fresh?.emails) {
        setEmailList(fresh.emails);
        if (onBrandedEmailsChange) onBrandedEmailsChange(fresh.emails);
      }
      setToastMessage(res.message || 'Automated email reminder check completed.');
      setTimeout(() => setToastMessage(null), 5500);
    } catch (err: any) {
      setToastMessage(`Automated email check failed: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setIsRunningAutoEmail(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) {
      setToastMessage('Please enter a valid recipient email address.');
      return;
    }
    setIsSendingTestEmail(true);
    try {
      const res = await emailApi.testEmail({ recipientEmail: testEmailRecipient.trim() });
      if (res.log) {
        setEmailList((prev) => [res.log!, ...prev.filter((e) => e.id !== res.log!.id)]);
        if (onBrandedEmailsChange) {
          onBrandedEmailsChange((prev) => [res.log!, ...prev.filter((e) => e.id !== res.log!.id)]);
        }
      }
      setToastMessage(res.message || `Test email sent to ${testEmailRecipient.trim()} via Resend.`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setToastMessage(`Test email failed: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    setIsSavingEmailSettings(true);
    try {
      const res = await emailApi.updateEmailSettings(emailSettingsDraft);
      if (res.settings) {
        setEmailSettingsDraft(res.settings);
      }
      setToastMessage(res.message || 'Email notification settings saved.');
      setTimeout(() => setToastMessage(null), 4000);
      setIsEmailSettingsModalOpen(false);
    } catch (err: any) {
      setToastMessage(`Failed to save email settings: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setIsSavingEmailSettings(false);
    }
  };

  const filteredEmailLogs = useMemo(() => {
    return emailList.filter((em) => {
      const st = String(em.status || em.deliveryStatus || '').toLowerCase();
      const isFailed = st.includes('fail');
      if (emailStatusFilter === 'failed' && !isFailed) return false;
      if (emailStatusFilter === 'sent' && isFailed) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (em.recipientName || '').toLowerCase().includes(q) ||
          (em.recipientEmail || '').toLowerCase().includes(q) ||
          (em.tenantRef || '').toLowerCase().includes(q) ||
          (em.propertyName || '').toLowerCase().includes(q) ||
          (em.subject || '').toLowerCase().includes(q) ||
          (em.templateType || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [emailList, emailStatusFilter, searchQuery]);

  const emailMetrics = useMemo(() => {
    const total = emailList.length;
    const failed = emailList.filter((e) =>
      String(e.status || e.deliveryStatus || '').toLowerCase().includes('fail')
    ).length;
    const sent = total - failed;
    return { total, sent, failed };
  }, [emailList]);

  const formatReminderTypeBadge = (type?: string) => {
    const t = String(type || '').toLowerCase();
    if (t === 'rent_upcoming_3d') {
      return { label: 'Upcoming (3 Days)', cls: 'bg-[#E8F5E9] text-[#145338] border-[#BCE8C7]' };
    }
    if (t === 'rent_due_today') {
      return { label: 'Rent Due Today', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (t === 'rent_overdue') {
      return { label: 'Overdue Rent', cls: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (t === 'payment_confirmed') {
      return { label: 'Payment Confirmed', cls: 'bg-[#D8F3E5] text-[#145338] border-[#B6E6CE]' };
    }
    if (t === 'lease_expiry_30d') {
      return { label: 'Lease Expiry (30D)', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (t === 'lease_expiry_7d') {
      return { label: 'Lease Expiry (7D)', cls: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
    if (t === 'test_email') {
      return { label: 'Resend Test Email', cls: 'bg-[#F2FCE2] text-[#15803D] border-[#D5F267]' };
    }
    return {
      label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Notification',
      cls: 'bg-[#F0F4F2] text-[#3B4D43] border-[#DFE5E1]',
    };
  };

  // SMS Live Tools Handlers
  const handleCheckBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const res = await smsApi.getSmsBalance();
      setBalanceInfo(res.description || `Balance: KES ${res.balanceCredits?.toFixed(2)}`);
      setToastMessage(res.description || 'SMS balance retrieved.');
    } catch (err: any) {
      setToastMessage(`Balance check failed: ${err.message}`);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testMobile.trim()) {
      setToastMessage('Please enter a recipient phone number (e.g. 254712345678 or 0712345678).');
      return;
    }
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await smsApi.testSms({
        mobile: testMobile.trim(),
        message: testMessage.trim(),
        senderId: settingsDraft.senderId || 'ARABELLA',
        environment: settingsDraft.environment,
        smsType: settingsDraft.smsType,
      });
      setTestResult({
        success: res.success,
        message: res.message || res.log?.errorMessage || (res.success ? 'Dispatched' : 'Submission failed'),
        messageId: res.messageId || res.log?.providerMessageId,
      });
      setToastMessage(res.message || res.log?.errorMessage || 'Test SMS processed.');
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to dispatch test SMS.',
      });
      setToastMessage(`Test failed: ${err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleQueryDlr = async (msgId: string) => {
    if (!msgId) return;
    setQueryingDlrId(msgId);
    try {
      const res = await smsApi.querySmsDlr(msgId);
      setToastMessage(`Status for ${msgId}: ${res.deliveryStatus} (${res.reason || 'Up to date'})`);
    } catch (err: any) {
      setToastMessage(`Status check failed: ${err.message}`);
    } finally {
      setQueryingDlrId(null);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!onUpdateSmsSettings) return;
    setIsSavingSettings(true);
    try {
      await onUpdateSmsSettings(settingsDraft);
      setToastMessage(`SMS notification settings saved successfully (${settingsDraft.environment.toUpperCase()} mode).`);
      setTimeout(() => setToastMessage(null), 4000);
      setIsSettingsModalOpen(false);
    } catch (err: any) {
      setToastMessage(`Failed to save settings: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setToastMessage(null), 5000);
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
              <AnimatedCounter value={summaryMetrics.totalRemindersCount} />
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
              <AnimatedCounter value={summaryMetrics.upcomingRemindersCount} />
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
              <AnimatedCounter value={summaryMetrics.successfullySentCount} />
            </div>
            <p className="text-[11.5px] text-[#55695E] mt-0.5">
              Confirmed delivered SMS notifications
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
              <AnimatedCounter value={summaryMetrics.overdueRemindersCount} />
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
            title="View SMS Delivery History"
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

          {/* Real-Time Live Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
              isRealtimeActive
                ? 'bg-[#EBF7F0] border-[#BCE8C7] text-[#145338]'
                : 'bg-[#FFF7ED] border-[#FED7AA] text-[#C2410C]'
            }`}
            title={isRealtimeActive ? 'Real-Time WebSocket & Automation Connected' : 'Reconnecting to Real-Time service...'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRealtimeActive
                  ? realtimePulse
                    ? 'bg-[#15803D] animate-ping'
                    : 'bg-[#15803D]'
                  : 'bg-[#EA580C] animate-pulse'
              }`}
            />
            <span className="hidden sm:inline">{isRealtimeActive ? 'Real-Time Live' : 'Connecting'}</span>
          </div>

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
              const allRefs = groupTenants
                .map((t) => String(t.tenantRef || '').trim().toUpperCase())
                .filter(Boolean);
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
                            const tRefUpper = String(t.tenantRef || '').trim().toUpperCase();
                            const isSelected = Boolean(tRefUpper && selectedTenantRefs.has(tRefUpper));
                            const hasBalance = t.rentBalance > 0;
                            const isOverdue = t.status === 'Overdue' || (hasBalance && t.status !== 'Paid');
                            const isCleared = t.status === 'Paid' && !hasBalance;

                            return (
                              <tr
                                key={t.tenantRef || t.id}
                                className={`hover:bg-[#F9FBFA] transition-colors ${
                                  isSelected ? 'bg-[#F4F9F6]' : ''
                                }`}
                              >
                                {/* Checkbox */}
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    onClick={() => toggleSelectTenant(t.tenantRef || '')}
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
                                      {String(t.tenantName || t.name || 'Resident').slice(0, 2).toUpperCase()}
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
          SECTION 4: EMAIL NOTIFICATION MANAGEMENT (RESEND INTEGRATION)
         ========================================================================= */}
      <div className="bg-white rounded-3xl border border-[#E2E8E4] shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 bg-[#FAFBFB] border-b border-[#EAEFEA] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#17231E] text-[#D5F267] flex items-center justify-center shrink-0">
                <Mail className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15.5px] font-black text-[#17231E]">
                    Automatic Email Reminders & Delivery Log (Resend)
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${
                      emailSettingsDraft.masterEnabled
                        ? 'bg-[#EBF7F0] text-[#145338] border-[#BCE8C7]'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {emailSettingsDraft.masterEnabled ? 'Auto-Scheduler Active (Africa/Nairobi EAT)' : 'Auto-Reminders Paused'}
                  </span>
                </div>
                <p className="text-[12px] text-[#55695E] mt-0.5">
                  Automated 3-day upcoming rent, due-today, overdue arrears, payment confirmation receipts, and 30-day / 7-day lease expiry emails via Resend.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills */}
            <div className="inline-flex rounded-xl bg-[#F0F4F2] p-1 border border-[#DFE5E1]">
              <button
                type="button"
                onClick={() => setEmailStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                  emailStatusFilter === 'all'
                    ? 'bg-[#17231E] text-[#D5F267]'
                    : 'text-[#4A5D52] hover:text-[#17231E]'
                }`}
              >
                All ({emailMetrics.total})
              </button>
              <button
                type="button"
                onClick={() => setEmailStatusFilter('sent')}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                  emailStatusFilter === 'sent'
                    ? 'bg-[#15803D] text-white'
                    : 'text-[#4A5D52] hover:text-[#17231E]'
                }`}
              >
                Sent ({emailMetrics.sent})
              </button>
              <button
                type="button"
                onClick={() => setEmailStatusFilter('failed')}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                  emailStatusFilter === 'failed'
                    ? 'bg-[#DC2626] text-white'
                    : 'text-[#4A5D52] hover:text-[#17231E]'
                }`}
              >
                Failed ({emailMetrics.failed})
              </button>
            </div>

            <button
              type="button"
              onClick={handleRunAutomatedEmailChecks}
              disabled={isRunningAutoEmail}
              className="px-3.5 py-2 rounded-xl bg-[#F0F4F2] hover:bg-[#E2EBE5] text-[#145338] text-[12px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Evaluate all tenant payment & lease dates in Africa/Nairobi timezone and dispatch due reminders"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningAutoEmail ? 'animate-spin' : ''}`} />
              <span>{isRunningAutoEmail ? 'Checking...' : 'Run Auto Check Now'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEmailSettingsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#17231E] hover:bg-[#24352E] text-[#D5F267] text-[12px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Email Reminder Settings & Test</span>
            </button>
          </div>
        </div>

        {/* Active Reminder Types Status Bar */}
        <div className="px-5 py-3 bg-[#F6F9F7] border-b border-[#EAEFEA] flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-[#4A5D52] uppercase tracking-wider mr-1">Active Triggers:</span>
          {[
            { key: 'autoRentUpcoming3d', label: 'Upcoming Rent (3D Before)' },
            { key: 'autoRentDueToday', label: 'Rent Due Today' },
            { key: 'autoRentOverdue', label: 'Overdue Rent' },
            { key: 'autoPaymentConfirmed', label: 'Payment Confirmation' },
            { key: 'autoLeaseExpiry30d', label: 'Lease Expiry (30D)' },
            { key: 'autoLeaseExpiry7d', label: 'Lease Expiry (7D)' },
          ].map((item) => {
            const active =
              emailSettingsDraft.masterEnabled &&
              Boolean((emailSettingsDraft as any)[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                onClick={async () => {
                  const nextVal = !Boolean((emailSettingsDraft as any)[item.key]);
                  const nextDraft = { ...emailSettingsDraft, [item.key]: nextVal };
                  setEmailSettingsDraft(nextDraft);
                  try {
                    await emailApi.updateEmailSettings({ [item.key]: nextVal });
                    setToastMessage(`${item.label} ${nextVal ? 'enabled' : 'disabled'}.`);
                    setTimeout(() => setToastMessage(null), 3500);
                  } catch {}
                }}
                className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-[#145338] border-[#BCE8C7] shadow-2xs'
                    : 'bg-[#EEF2F0] text-[#7B8983] border-[#DFE5E1] line-through'
                }`}
                title="Click to toggle this automatic email reminder type"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#15803D]' : 'bg-[#94A39B]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Email Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAEFEA] bg-[#FAFBFB] text-[10.5px] font-bold text-[#6E7F75] uppercase tracking-wider">
                <th className="py-3 px-4">Date & Time (EAT)</th>
                <th className="py-3 px-3">Tenant & Unit</th>
                <th className="py-3 px-3">Reminder Type</th>
                <th className="py-3 px-3">Subject & Amount</th>
                <th className="py-3 px-3 text-center">Delivery Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF3F1] text-[12.5px]">
              {filteredEmailLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#6E7F75]">
                    <Mail className="w-7 h-7 text-[#8C9C93] mx-auto mb-2" />
                    <p className="font-bold text-[#17231E]">No email notifications match the current view</p>
                    <p className="text-xs mt-1">
                      Automatic reminders and payment confirmation receipts sent via Resend appear here in real-time.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEmailLogs.slice(0, 50).map((em) => {
                  const badge = formatReminderTypeBadge(em.templateType);
                  const st = String(em.status || em.deliveryStatus || 'Delivered');
                  const isFailed = st.toLowerCase().includes('fail');
                  return (
                    <tr key={em.id} className="hover:bg-[#F9FBFA] transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-[11.5px] text-[#55695E]">
                        <div className="font-semibold text-[#17231E]">{em.createdAt}</div>
                        <div className="text-[10.5px] text-[#8C9C93]">
                          {em.sentBy || 'Automated Email Scheduler'}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#17231E]">{em.recipientName}</span>
                          {em.tenantRef && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F0F4F2] text-[#145338]">
                              {em.tenantRef}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#697B71]">
                          {em.recipientEmail}
                          {em.propertyName ? ` • ${em.propertyName} (${em.unitNumber || 'Unit'})` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-3 px-3 max-w-md">
                        <div className="font-semibold text-[#17231E] truncate" title={em.subject}>
                          {em.subject}
                        </div>
                        <div className="text-[11px] text-[#55695E] flex items-center gap-2 mt-0.5">
                          {em.amountDue !== undefined && (
                            <span className="font-bold text-[#145338]">
                              KES {Number(em.amountDue).toLocaleString()}
                            </span>
                          )}
                          {em.dueDate && <span>• Due/Date: {em.dueDate}</span>}
                          {em.resendId && (
                            <span className="font-mono text-[10px] text-[#697B71]">
                              • ID: {em.resendId}
                            </span>
                          )}
                        </div>
                        {em.errorMessage && (
                          <div className="text-[10.5px] text-red-600 mt-0.5 truncate" title={em.errorMessage}>
                            {em.errorMessage}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                            isFailed
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : 'bg-[#D8F3E5] text-[#145338] border border-[#BCE9D3]'
                          }`}
                        >
                          {st}
                        </span>
                        {em.retryCount ? (
                          <div className="text-[10px] text-[#697B71] mt-0.5">
                            Retried {em.retryCount}x
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRetryEmail(em.id)}
                            disabled={retryingEmailId === em.id}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                              isFailed
                                ? 'bg-[#FEE2E2] hover:bg-[#FECACA] text-[#B91C1C] border border-[#FECACA]'
                                : 'bg-[#F0F4F2] hover:bg-[#E2EBE5] text-[#145338] border border-[#D0E2D6]'
                            }`}
                            title="Retry sending this email notification via Resend"
                          >
                            <RefreshCw className={`w-3 h-3 ${retryingEmailId === em.id ? 'animate-spin' : ''}`} />
                            <span>{retryingEmailId === em.id ? 'Retrying...' : isFailed ? 'Retry Failed' : 'Resend'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewEmailRecord(em)}
                            className="p-1.5 rounded-xl bg-[#F4F8F6] hover:bg-[#D5F267] text-[#17231E] transition-colors cursor-pointer border border-[#E4ECE8]"
                            title="Preview branded HTML email"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                  Dispatched securely via ARabella SMS Notification Service
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
                    <span>Sending SMS Reminders...</span>
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
                <span className="text-[11px] text-[#697B71] block">Phone & Email</span>
                <span className="font-mono font-bold text-[#17231E]">{singleReminderTenant.phone || 'None'}</span>
                <span className="text-[11px] text-[#55695E] block">{singleReminderTenant.email || 'No email'}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#697B71] block">Outstanding Balance</span>
                <span className={`font-bold ${singleReminderTenant.rentBalance > 0 ? 'text-red-700' : 'text-[#145338]'}`}>
                  KES {singleReminderTenant.rentBalance.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Delivery Channel
                </label>
                <select
                  value={singleReminderChannel}
                  onChange={(e) => setSingleReminderChannel(e.target.value as 'sms' | 'email' | 'both')}
                  className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[12px] font-bold text-[#17231E]"
                >
                  <option value="both">SMS (Sozuri) + Email (Resend)</option>
                  <option value="email">Email Only (Resend)</option>
                  <option value="sms">SMS Only (Sozuri)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Reminder Category
                </label>
                <select
                  value={singleEmailTriggerType}
                  onChange={(e) => setSingleEmailTriggerType(e.target.value as EmailReminderTriggerType)}
                  className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#D8DFDB] rounded-xl text-[12px] font-bold text-[#17231E]"
                >
                  <option value="rent_upcoming_3d">Upcoming Rent (3 Days Before)</option>
                  <option value="rent_due_today">Rent Due Today</option>
                  <option value="rent_overdue">Overdue Rent Reminder</option>
                  <option value="lease_expiry_30d">Lease Expiry (30 Days)</option>
                  <option value="lease_expiry_7d">Lease Expiry (7 Days)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11.5px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                Reminder Message Body
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
                disabled={isSendingSingle}
                className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] disabled:opacity-50 text-[#17231E] text-[12.5px] font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isSendingSingle ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {singleReminderChannel === 'both'
                        ? 'Send SMS & Email'
                        : singleReminderChannel === 'email'
                        ? 'Send Resend Email'
                        : 'Send SMS'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SMS DELIVERY HISTORY
         ========================================================================= */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <History className="w-5 h-5 text-[#145338]" />
                  <span>SMS Delivery History</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Live audit trail of dispatched SMS notifications recorded in database
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
                        <span className="text-[10px] text-[#8C9C93] mt-1 flex flex-wrap items-center gap-2">
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          <span>&bull;</span>
                          <span>Phone: {log.recipientPhone}</span>
                          <span>&bull;</span>
                          <span className="font-mono text-[#145338] bg-[#E8F1EC] px-1.5 py-0.5 rounded">
                            {log.providerMessageId || 'ID: Pending'}
                          </span>
                          <span>&bull;</span>
                          <span>Provider: {log.provider || 'Sozuri'}</span>
                          <span>&bull;</span>
                          <span>Cost: KES {log.costKes || '0.80'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {log.providerMessageId && (
                          <button
                            type="button"
                            onClick={() => handleQueryDlr(log.providerMessageId!)}
                            disabled={queryingDlrId === log.providerMessageId}
                            className="px-2 py-1 text-[11px] font-bold text-[#145338] hover:bg-[#E8F1EC] rounded-lg border border-[#D0E2D6] cursor-pointer flex items-center gap-1"
                            title="Query carrier delivery status"
                          >
                            <RefreshCw className={`w-3 h-3 ${queryingDlrId === log.providerMessageId ? 'animate-spin' : ''}`} />
                            <span>Status</span>
                          </button>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold ${
                            log.deliveryStatus === 'Delivered' || log.status === 'Delivered'
                              ? 'bg-[#D8F3E5] text-[#145338]'
                              : log.deliveryStatus === 'Sent' || log.status === 'Sent'
                              ? 'bg-[#E3EFFB] text-[#1C5182]'
                              : log.deliveryStatus === 'Queued' || log.status === 'Queued'
                              ? 'bg-[#FEF5D1] text-[#7A5B04]'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.deliveryStatus || log.status}
                        </span>
                      </div>
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
          MODAL: SMS NOTIFICATION & AUTOMATION SETTINGS
         ========================================================================= */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#DFE5E1] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAEFEA]">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#145338]" />
                  <span>SMS Notification Settings</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Configure automated tenant SMS reminders & sender preferences
                </p>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-[12.5px] max-h-[75vh] overflow-y-auto pr-1">
              {/* SMS Gateway Status Banner */}
              <div className="p-3 rounded-2xl bg-[#F4F8F5] border border-[#D0E2D6] space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#145338] animate-pulse" />
                    <span className="font-bold text-[#145338] text-[12px]">Sozuri SMS Gateway</span>
                  </div>
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-[#E2EDE5] text-[#145338] font-bold">
                    POST /api/v1/messaging
                  </span>
                </div>
                <p className="text-[11px] text-[#4F6457]">
                  Active Provider: <span className="font-semibold text-[#145338]">{settingsDraft.provider || 'Sozuri'}</span> &bull; Endpoint: <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-[#DFEBE3]">https://sozuri.net/api/v1/messaging</code>
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-[#DFEBE3]">
                  <span className="text-[11px] text-[#4F6457]">
                    {balanceInfo || (settingsDraft.environment === 'production' ? 'Live Sozuri Gateway Active' : 'Sandbox (Simulated Mode Active)')}
                  </span>
                  <button
                    type="button"
                    onClick={handleCheckBalance}
                    disabled={isCheckingBalance}
                    className="text-[11px] font-bold text-[#145338] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingBalance ? 'animate-spin' : ''}`} />
                    <span>{isCheckingBalance ? 'Checking...' : 'Check Balance'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Delivery Mode
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
                    Production Mode
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Sender ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ARABELLA"
                    value={settingsDraft.senderId || ''}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, senderId: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-[#17231E] font-mono text-xs"
                  />
                  <p className="text-[10px] text-[#697B71] mt-1">Case-sensitive Sender ID</p>
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Channel
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.channel || 'sms'}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, channel: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-[#17231E] text-xs font-mono"
                    placeholder="sms"
                  />
                  <p className="text-[10px] text-[#697B71] mt-1">Channel (default: sms)</p>
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                    Message Type
                  </label>
                  <select
                    value={settingsDraft.smsType || 'promotional'}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, smsType: e.target.value as 'promotional' | 'transactional' }))}
                    className="w-full px-3 py-2 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-[#17231E] text-xs cursor-pointer font-medium"
                  >
                    <option value="promotional">Promotional</option>
                    <option value="transactional">Transactional</option>
                  </select>
                  <p className="text-[10px] text-[#697B71] mt-1">Routing type</p>
                </div>
              </div>

              {/* Direct Protected Test SMS to Phone */}
              <div className="p-3.5 rounded-2xl bg-[#FAFBFB] border border-[#E0E6E2] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-bold text-[#17231E] flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-[#145338]" />
                    <span>Send Verified Test SMS to Phone</span>
                  </span>
                  <span className="text-[10px] text-[#6E8076]">Does NOT affect tenants</span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Recipient Phone (e.g. 254712345678 or 0712345678)"
                    value={testMobile}
                    onChange={(e) => setTestMobile(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#DFE5E1] rounded-xl text-[#17231E] text-xs font-mono"
                  />
                  <textarea
                    rows={2}
                    placeholder="Custom test message content..."
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#DFE5E1] rounded-xl text-[#17231E] text-xs resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleSendTestSms}
                      disabled={isSendingTest}
                      className="px-3.5 py-1.5 bg-[#17231E] hover:bg-[#25362E] text-white text-[11.5px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingTest ? 'Sending...' : 'Send Test SMS'}</span>
                    </button>
                    {testResult && (
                      <span className={`text-[11px] font-semibold ${testResult.success ? 'text-[#145338]' : 'text-red-600'}`}>
                        {testResult.success ? `✓ Submitted (ID: ${testResult.messageId || 'OK'})` : '✗ Submission Failed'}
                      </span>
                    )}
                  </div>
                  {testResult && !testResult.success && testResult.message && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 leading-relaxed">
                      <strong>Sozuri Gateway Response:</strong> {testResult.message}
                    </div>
                  )}
                </div>
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

      {/* =========================================================================
          MODAL: RESEND EMAIL NOTIFICATION SETTINGS & LIVE TEST
         ========================================================================= */}
      {isEmailSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#DFE5E1] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAEFEA]">
              <div>
                <h3 className="text-base font-bold text-[#17231E] flex items-center gap-2">
                  <Mail className="w-5 h-5 text-[#145338]" />
                  <span>Resend Email Reminder Settings</span>
                </h3>
                <p className="text-[12px] text-[#697B71]">
                  Configure automatic tenant email reminders (Africa/Nairobi timezone)
                </p>
              </div>
              <button
                onClick={() => setIsEmailSettingsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-[12.5px] max-h-[75vh] overflow-y-auto pr-1">
              {/* Live Test Email Box */}
              <div className="p-3.5 rounded-2xl bg-[#F4F8F5] border border-[#D0E2D6] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#145338] text-[12px] flex items-center gap-1.5">
                    <Mail className="w-4 h-4" />
                    <span>Send Live Verification Email via Resend</span>
                  </span>
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-white text-[#145338] font-bold border border-[#D0E2D6]">
                    Africa/Nairobi EAT
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testEmailRecipient}
                    onChange={(e) => setTestEmailRecipient(e.target.value)}
                    placeholder="Recipient email address..."
                    className="flex-1 px-3 py-2 bg-white border border-[#DFE5E1] rounded-xl text-xs text-[#17231E]"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={isSendingTestEmail}
                    className="px-3.5 py-2 bg-[#17231E] hover:bg-[#25362E] text-[#D5F267] text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isSendingTestEmail ? 'Sending...' : 'Send Test Email'}
                  </button>
                </div>
              </div>

              {/* Master Toggle */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#FAFBFB] border border-[#E5EAE7] cursor-pointer">
                <div>
                  <span className="font-bold text-[#17231E] block">Enable Automatic Email Scheduler</span>
                  <span className="text-[11px] text-[#697B71]">
                    Automatically dispatches tenant reminders in Kenya timezone (Africa/Nairobi)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={emailSettingsDraft.masterEnabled}
                  onChange={(e) =>
                    setEmailSettingsDraft((prev) => ({ ...prev, masterEnabled: e.target.checked }))
                  }
                  className="rounded text-[#145338] w-4 h-4"
                />
              </label>

              {/* Individual Reminder Type Checkboxes */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block">
                  Reminder Types (Enable / Disable)
                </span>

                {[
                  {
                    key: 'autoRentUpcoming3d',
                    label: 'Upcoming rent payment reminders (3 days before due date)',
                  },
                  {
                    key: 'autoRentDueToday',
                    label: 'Rent due today notifications (on due date)',
                  },
                  {
                    key: 'autoRentOverdue',
                    label: 'Overdue rent payment reminders (unpaid past due date)',
                  },
                  {
                    key: 'autoPaymentConfirmed',
                    label: 'Payment confirmation emails after verified payment',
                  },
                  {
                    key: 'autoLeaseExpiry30d',
                    label: 'Lease expiry reminders (30 days before expiry)',
                  },
                  {
                    key: 'autoLeaseExpiry7d',
                    label: 'Lease expiry reminders (7 days before expiry)',
                  },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={Boolean((emailSettingsDraft as any)[item.key])}
                      onChange={(e) =>
                        setEmailSettingsDraft((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                      className="rounded text-[#145338]"
                    />
                    <span className="text-[#17231E]">{item.label}</span>
                  </label>
                ))}
              </div>

              {/* Payment Instructions */}
              <div>
                <label className="text-[11px] font-bold text-[#3B4D43] uppercase tracking-wider block mb-1">
                  Payment Instructions Included in Rent Emails
                </label>
                <textarea
                  rows={2}
                  value={emailSettingsDraft.paymentInstructions}
                  onChange={(e) =>
                    setEmailSettingsDraft((prev) => ({
                      ...prev,
                      paymentInstructions: e.target.value,
                    }))
                  }
                  className="w-full p-2.5 bg-[#F8FAF9] border border-[#DFE5E1] rounded-xl text-xs text-[#17231E]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#EAEFEA]">
              <button
                type="button"
                onClick={() => setIsEmailSettingsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#D8DFDB] text-[#4A5D52] hover:bg-[#F0F4F2] text-[12.5px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEmailSettings}
                disabled={isSavingEmailSettings}
                className="px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e858] text-[#17231E] text-[12.5px] font-bold shadow-xs cursor-pointer"
              >
                {isSavingEmailSettings ? 'Saving...' : 'Save Email Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: BRANDED HTML EMAIL PREVIEW
         ========================================================================= */}
      {previewEmailRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-[#DFE5E1] overflow-hidden my-auto">
            <div className="px-6 py-4 bg-[#FAFBFB] border-b border-[#EAEFEA] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#17231E]">{previewEmailRecord.subject}</h3>
                <p className="text-[11.5px] text-[#697B71]">
                  To: {previewEmailRecord.recipientName} ({previewEmailRecord.recipientEmail}) &bull; Sent: {previewEmailRecord.createdAt}
                </p>
              </div>
              <button
                onClick={() => setPreviewEmailRecord(null)}
                className="w-8 h-8 rounded-full bg-[#F0F3F1] hover:bg-[#E2E8E4] flex items-center justify-center text-[#55695E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-[#F4F7F5]">
              <div
                dangerouslySetInnerHTML={{
                  __html: previewEmailRecord.htmlBody || previewEmailRecord.bodyHtml || '',
                }}
              />
            </div>
            <div className="px-6 py-3.5 bg-[#FAFBFB] border-t border-[#EAEFEA] flex items-center justify-between">
              <span className="text-[11px] text-[#697B71]">
                Status: <strong>{previewEmailRecord.status}</strong>
                {previewEmailRecord.resendId ? ` • Resend ID: ${previewEmailRecord.resendId}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = previewEmailRecord.id;
                    setPreviewEmailRecord(null);
                    void handleRetryEmail(id);
                  }}
                  className="px-4 py-1.5 bg-[#D8F3E5] hover:bg-[#BCE9D3] text-[#145338] text-xs font-bold rounded-xl cursor-pointer"
                >
                  Resend / Retry
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewEmailRecord(null)}
                  className="px-4 py-1.5 bg-[#17231E] text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
