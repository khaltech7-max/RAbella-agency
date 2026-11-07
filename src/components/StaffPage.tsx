import React, { useState } from 'react';
import {
  UserPlus,
  Shield,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  Clock,
  Ban,
  KeyRound,
  RefreshCw,
  Trash2,
  Edit3,
  Search,
  X,
  Lock,
  Copy,
  Check,
  UserCheck,
  UserMinus,
  FileText,
  Activity,
  Briefcase,
  Eye,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import {
  UserSession,
  UserRole,
  AccountStatus,
  InvitationStatus,
  PropertyRecord,
  SecurityAuditLogRecord,
  BrandedEmailRecord,
  ActivityLogRecord,
  getRoleDisplayLabel,
  getRolePermissionsSummary,
  getAllowedPagesForRole,
} from '../data/rentalData';
import { AvatarBadge } from './UnitIllustration';

interface StaffPageProps {
  users: UserSession[];
  currentUser: UserSession;
  properties: PropertyRecord[];
  securityLogs?: SecurityAuditLogRecord[];
  brandedEmails?: BrandedEmailRecord[];
  activities?: ActivityLogRecord[];
  onCreateStaff: (data: {
    fullName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    role: UserRole;
    assignedPropertyId?: string;
    assignedPropertyName?: string;
    assignedPropertyIds?: string[];
    customPermissions?: string[];
    mfaEnabled?: boolean;
    status?: AccountStatus;
  }) => Promise<
    | {
        staff: UserSession;
        message: string;
        inviteLink?: string;
        brandedEmail?: BrandedEmailRecord;
      }
    | undefined
  >;
  onUpdateStaff: (
    id: string,
    data: Partial<{
      fullName: string;
      phone: string;
      jobTitle: string;
      role: UserRole;
      assignedPropertyId: string;
      assignedPropertyName: string;
      assignedPropertyIds: string[];
      customPermissions: string[];
      mfaEnabled: boolean;
      status: AccountStatus;
    }>
  ) => Promise<void>;
  onResendInvite: (
    id: string
  ) => Promise<
    | {
        staff: UserSession;
        message: string;
        inviteToken?: string;
        inviteLink?: string;
        brandedEmail?: BrandedEmailRecord;
      }
    | undefined
  >;
  onRevokeInvite?: (
    id: string
  ) => Promise<{ staff: UserSession; message: string } | undefined>;
  onOffboardStaff?: (
    id: string,
    data: {
      targetStatus: 'Suspended' | 'Deactivated';
      transferToStaffId?: string;
      reason?: string;
    }
  ) => Promise<
    | {
        staff: UserSession;
        message: string;
        transferredPropertiesCount: number;
      }
    | undefined
  >;
  onRecoverPassword: (
    email: string
  ) => Promise<
    | {
        success: boolean;
        message: string;
        recoveryToken?: string;
        recoveryLink?: string;
      }
    | undefined
  >;
  onDeleteStaff: (id: string) => Promise<void>;
  onSwitchUserSession?: (role: UserRole, userId?: string) => Promise<void>;
  globalSearch?: string;
}

const STAFF_ROLES: { value: UserRole; label: string; desc: string; defaultTitle: string }[] = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    defaultTitle: 'Platform Executive & Super Administrator',
    desc: 'Full platform administration, account provisioning, role assignments, and audit logs',
  },
  {
    value: 'administrator',
    label: 'Administrator',
    defaultTitle: 'Operations Administrator',
    desc: 'Manage authorized properties, tenants, operations, and staff within granted permissions',
  },
  {
    value: 'property_manager',
    label: 'Property Manager',
    defaultTitle: 'Senior Property Manager',
    desc: 'Manage assigned properties, tenants, leases, occupancy, and operational reports',
  },
  {
    value: 'accountant',
    label: 'Accountant',
    defaultTitle: 'Portfolio Accountant',
    desc: 'Access financial dashboards, rent payment confirmations, expenses, and financial reports',
  },
  {
    value: 'caretaker',
    label: 'Caretaker',
    defaultTitle: 'Resident Building Caretaker',
    desc: 'Access assigned property operations, unit readiness, and caretaker responsibilities',
  },
  {
    value: 'maintenance_staff',
    label: 'Maintenance Staff',
    defaultTitle: 'Facilities & Maintenance Technician',
    desc: 'Access assigned maintenance tasks, update work order statuses, and view property notes',
  },
  {
    value: 'tenant',
    label: 'Tenant',
    defaultTitle: 'Residential Leaseholder',
    desc: 'Access Tenant Portal only to view own tenancy records, payments, and submit maintenance requests',
  },
];

const ACCOUNT_STATUSES: AccountStatus[] = [
  'Pending Invitation',
  'Active',
  'Suspended',
  'Deactivated',
];

function normalizeDisplayStatus(status?: AccountStatus): string {
  if (!status) return 'Active';
  if (status === 'Invited') return 'Pending Invitation';
  return status;
}

function isPendingInviteStatus(status?: AccountStatus): boolean {
  return status === 'Invited' || status === 'Pending Invitation';
}

function formatTimestamp(ts?: string): string {
  if (!ts) return 'Never signed in';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-KE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadgeStyle(status?: AccountStatus): string {
  const norm = normalizeDisplayStatus(status);
  switch (norm) {
    case 'Active':
      return 'bg-[#D8F3E5] text-[#156943] border-[#B6E6CE]';
    case 'Pending Invitation':
      return 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
    case 'Suspended':
      return 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]';
    case 'Deactivated':
      return 'bg-[#E5E7EB] text-[#4B5563] border-[#D1D5DB]';
    default:
      return 'bg-[#D8F3E5] text-[#156943] border-[#B6E6CE]';
  }
}

export function getInvitationStatus(user: UserSession): InvitationStatus {
  if (user.invitationStatus) return user.invitationStatus;
  if (user.inviteUsed || (normalizeDisplayStatus(user.status) === 'Active' && Boolean(user.activatedAt))) {
    return 'Accepted';
  }
  if (user.inviteRevoked) return 'Expired';
  if (user.inviteExpiresAt && new Date(user.inviteExpiresAt).getTime() < Date.now()) return 'Expired';
  if (isPendingInviteStatus(user.status) || Boolean(user.inviteToken)) return 'Pending';
  return 'Pending';
}

export function getInvitationBadge(status: InvitationStatus): { label: string; style: string; iconColor: string } {
  switch (status) {
    case 'Pending':
      return {
        label: 'Pending',
        style: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
        iconColor: 'text-[#D97706]',
      };
    case 'Accepted':
      return {
        label: 'Accepted',
        style: 'bg-[#D8F3E5] text-[#156943] border-[#B6E6CE]',
        iconColor: 'text-[#16A34A]',
      };
    case 'Expired':
      return {
        label: 'Expired',
        style: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]',
        iconColor: 'text-[#DC2626]',
      };
    case 'Failed':
      return {
        label: 'Failed',
        style: 'bg-[#FFE4E6] text-[#9F1239] border-[#FECDD3]',
        iconColor: 'text-[#E11D48]',
      };
    default:
      return {
        label: status,
        style: 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]',
        iconColor: 'text-[#6B7280]',
      };
  }
}

type AccessCentreTab =
  | 'users'
  | 'invitations'
  | 'permissions'
  | 'audit'
  | 'emails';

export const StaffPage: React.FC<StaffPageProps> = ({
  users,
  currentUser,
  properties,
  securityLogs = [],
  brandedEmails = [],
  activities = [],
  onCreateStaff,
  onUpdateStaff,
  onResendInvite,
  onRevokeInvite,
  onOffboardStaff,
  onRecoverPassword,
  onDeleteStaff,
  onSwitchUserSession,
  globalSearch = '',
}) => {
  const [activeTab, setActiveTab] = useState<AccessCentreTab>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [invitationFilter, setInvitationFilter] = useState<
    'ALL' | 'Pending' | 'Accepted' | 'Expired' | 'Failed'
  >('ALL');

  // Create Management Account Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('Senior Property Manager');
  const [role, setRole] = useState<UserRole>('property_manager');
  const [assignedPropertyId, setAssignedPropertyId] = useState<string>('');
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
  const [status, setStatus] = useState<AccountStatus>('Pending Invitation');
  const [submitting, setSubmitting] = useState(false);

  // Edit Management Account Modal State
  const [editingStaff, setEditingStaff] = useState<UserSession | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('property_manager');
  const [editPropertyId, setEditPropertyId] = useState<string>('');
  const [editMfaEnabled, setEditMfaEnabled] = useState<boolean>(false);
  const [editStatus, setEditStatus] = useState<AccountStatus>('Active');

  // Employee Departure / Offboarding Modal State
  const [offboardingStaff, setOffboardingStaff] = useState<UserSession | null>(null);
  const [offboardStatus, setOffboardStatus] = useState<'Deactivated' | 'Suspended'>(
    'Deactivated'
  );
  const [transferToStaffId, setTransferToStaffId] = useState<string>('');
  const [offboardReason, setOffboardReason] = useState<string>(
    'Employee departure — property assignments transferred and historical records preserved.'
  );

  // Branded Email Preview Modal State
  const [previewEmail, setPreviewEmail] = useState<BrandedEmailRecord | null>(null);

  // Action Notification Banner State
  const [actionNotice, setActionNotice] = useState<{
    title: string;
    message: string;
    token?: string;
    inviteUrl?: string;
    email?: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const combinedSearch = (searchQuery || globalSearch).trim().toLowerCase();

  const filteredUsers = users.filter((u) => {
    const uStatus = normalizeDisplayStatus(u.status);
    const matchesSearch =
      !combinedSearch ||
      u.fullName.toLowerCase().includes(combinedSearch) ||
      u.email.toLowerCase().includes(combinedSearch) ||
      (u.jobTitle || '').toLowerCase().includes(combinedSearch) ||
      (u.phone || '').toLowerCase().includes(combinedSearch) ||
      (u.assignedPropertyName || '').toLowerCase().includes(combinedSearch) ||
      getRoleDisplayLabel(u.role, u.tenantRef).toLowerCase().includes(combinedSearch);

    const matchesRole =
      roleFilter === 'ALL' ||
      u.role === roleFilter ||
      (roleFilter === 'super_admin' &&
        (u.role === 'super_admin' || u.role === 'owner'));

    const matchesStatus =
      statusFilter === 'ALL' ||
      uStatus === statusFilter ||
      (statusFilter === 'Pending Invitation' && isPendingInviteStatus(u.status));

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalAccounts = users.length;
  const activeCount = users.filter(
    (u) => normalizeDisplayStatus(u.status) === 'Active'
  ).length;
  const invitedCount = users.filter((u) => isPendingInviteStatus(u.status)).length;
  const restrictedCount = users.filter(
    (u) => u.status === 'Suspended' || u.status === 'Deactivated'
  ).length;

  const allInvitedUsers = users.filter(
    (u) =>
      Boolean(u.invitedAt) ||
      Boolean(u.inviteToken) ||
      Boolean(u.invitationStatus) ||
      isPendingInviteStatus(u.status) ||
      Boolean(u.inviteRevoked) ||
      Boolean(u.activatedAt)
  );

  const pendingInvitesCount = allInvitedUsers.filter(
    (u) => getInvitationStatus(u) === 'Pending'
  ).length;
  const acceptedInvitesCount = allInvitedUsers.filter(
    (u) => getInvitationStatus(u) === 'Accepted'
  ).length;
  const expiredInvitesCount = allInvitedUsers.filter(
    (u) => getInvitationStatus(u) === 'Expired'
  ).length;
  const failedInvitesCount = allInvitedUsers.filter(
    (u) => getInvitationStatus(u) === 'Failed'
  ).length;

  const filteredInvitations = allInvitedUsers.filter((u) => {
    if (invitationFilter === 'ALL') return true;
    return getInvitationStatus(u) === invitationFilter;
  });

  const pendingInviteUsers = allInvitedUsers;

  const isSuperAdmin =
    currentUser.role === 'super_admin' || currentUser.role === 'owner';

  const handleRoleSelectInCreate = (nextRole: UserRole) => {
    setRole(nextRole);
    const found = STAFF_ROLES.find((r) => r.value === nextRole);
    if (found) {
      setJobTitle(found.defaultTitle);
    }
    if (nextRole === 'super_admin' || nextRole === 'administrator') {
      setMfaEnabled(true);
    } else {
      setMfaEnabled(false);
    }
  };

  const handleOpenEdit = (staff: UserSession) => {
    setEditingStaff(staff);
    setEditName(staff.fullName);
    setEditPhone(staff.phone || '');
    setEditJobTitle(
      staff.jobTitle ||
        STAFF_ROLES.find(
          (r) => r.value === (staff.role === 'owner' ? 'super_admin' : staff.role)
        )?.defaultTitle ||
        'Management Staff'
    );
    setEditRole(staff.role === 'owner' ? 'super_admin' : staff.role);
    setEditPropertyId(staff.assignedPropertyId || '');
    setEditMfaEnabled(Boolean(staff.mfaEnabled));
    setEditStatus(
      isPendingInviteStatus(staff.status)
        ? 'Pending Invitation'
        : staff.status || 'Active'
    );
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      const selectedProp = properties.find((p) => p.id === assignedPropertyId);
      const res = await onCreateStaff({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        jobTitle: jobTitle.trim(),
        role,
        assignedPropertyId: selectedProp?.id || undefined,
        assignedPropertyName: selectedProp?.name || 'All Properties',
        assignedPropertyIds: selectedProp?.id ? [selectedProp.id] : [],
        customPermissions: getAllowedPagesForRole(role),
        mfaEnabled,
        status,
      });

      setInviteModalOpen(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setJobTitle('Senior Property Manager');
      setRole('property_manager');
      setAssignedPropertyId('');
      setMfaEnabled(false);
      setStatus('Pending Invitation');

      if (res) {
        setActionNotice({
          title: 'Management Account & Invitation Processed',
          message: res.message || 'Staff invitation processed successfully.',
          token: res.staff?.inviteToken,
          inviteUrl: res.inviteLink || res.staff?.inviteUrl,
          email: res.staff?.email || email.trim().toLowerCase(),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setSubmitting(true);
    try {
      const selectedProp = properties.find((p) => p.id === editPropertyId);
      await onUpdateStaff(editingStaff.id, {
        fullName: editName.trim(),
        phone: editPhone.trim(),
        jobTitle: editJobTitle.trim(),
        role: editRole,
        assignedPropertyId: selectedProp?.id || '',
        assignedPropertyName: selectedProp?.name || 'All Properties',
        assignedPropertyIds: selectedProp?.id ? [selectedProp.id] : [],
        mfaEnabled: editMfaEnabled,
        status: editStatus,
      });
      setEditingStaff(null);
      setActionNotice({
        title: 'Management Account & Permissions Updated',
        message: `${editName.trim()} (${getRoleDisplayLabel(editRole)}) is now ${normalizeDisplayStatus(
          editStatus
        )}.`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOffboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offboardingStaff || !onOffboardStaff) return;
    setSubmitting(true);
    try {
      const res = await onOffboardStaff(offboardingStaff.id, {
        targetStatus: offboardStatus,
        transferToStaffId: transferToStaffId || undefined,
        reason: offboardReason.trim(),
      });
      setOffboardingStaff(null);
      setTransferToStaffId('');
      if (res) {
        setActionNotice({
          title: 'Employee Departure Completed & Sessions Revoked',
          message: res.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyToken = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top 4 KPI Cards matching Rentify Mint & White Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div
          onClick={() => {
            setStatusFilter('ALL');
            setActiveTab('users');
          }}
          className="rounded-2xl bg-[#D8F3E5] p-4 flex flex-col justify-between cursor-pointer hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#3C5A4B]">
              Management & Portal Accounts
            </span>
            <span className="w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center text-[#17231E]">
              <Shield className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold text-[#17231E] font-mono-num">
              {totalAccounts}
            </span>
            <span className="text-[11px] font-semibold text-[#156943]">
              RBAC Protected
            </span>
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('Active');
            setActiveTab('users');
          }}
          className="rounded-2xl bg-white p-4 border border-[#E4ECE8] flex flex-col justify-between cursor-pointer hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Active Accounts
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#F4F8F6] flex items-center justify-center text-[#156943]">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold text-[#17231E] font-mono-num">
              {activeCount}
            </span>
            <span className="text-[11px] font-medium text-[#6E7A75]">
              Verified & Enabled
            </span>
          </div>
        </div>

        <div
          onClick={() => {
            setActiveTab('invitations');
          }}
          className="rounded-2xl bg-white p-4 border border-[#E4ECE8] flex flex-col justify-between cursor-pointer hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Pending Invitations
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#92400E]">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold text-[#17231E] font-mono-num">
              {invitedCount}
            </span>
            <span className="text-[11px] font-medium text-[#92400E]">
              Single-Use Expiring Links
            </span>
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('Suspended');
            setActiveTab('users');
          }}
          className="rounded-2xl bg-white p-4 border border-[#E4ECE8] flex flex-col justify-between cursor-pointer hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#6E7A75]">
              Suspended / Deactivated
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C]">
              <Ban className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold text-[#17231E] font-mono-num">
              {restrictedCount}
            </span>
            <span className="text-[11px] font-medium text-[#B91C1C]">
              Sessions Revoked
            </span>
          </div>
        </div>
      </div>

      {/* Super Admin Management Access Centre Navigation Bar */}
      <div className="bg-white rounded-2xl p-2 border border-[#E4ECE8] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#D5F267] text-[#17231E]'
                : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Management Users ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'invitations'
                ? 'bg-[#D5F267] text-[#17231E]'
                : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Invitations ({invitedCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'permissions'
                ? 'bg-[#D5F267] text-[#17231E]'
                : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Roles, Properties & Permissions</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-[#D5F267] text-[#17231E]'
                : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Login Activity & Audit Logs ({securityLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'emails'
                ? 'bg-[#D5F267] text-[#17231E]'
                : 'text-[#5A6762] hover:bg-[#F4F8F6] hover:text-[#17231E]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Branded ARabella agency Emails ({brandedEmails.length})</span>
          </button>
        </div>

        <button
          onClick={() => setInviteModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] hover:bg-[#c8e757] text-[#17231E] text-[12px] font-bold transition-colors cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create Management Account
        </button>
      </div>

      {/* Action / Invitation Notification Banner */}
      {actionNotice && (
        <div className="rounded-2xl bg-[#EAF7F0] border border-[#9FD9BC] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#156943] shrink-0" />
              <h4 className="text-[13px] font-bold text-[#17231E]">
                {actionNotice.title}
              </h4>
            </div>
            <p className="text-[12px] text-[#355245]">{actionNotice.message}</p>
            {actionNotice.email && (
              <p className="text-[11.5px] text-[#17231E] font-medium">
                Employee (<span className="font-bold">{actionNotice.email}</span>) can open the invitation link or enter their single-use setup code on the{' '}
                <span className="font-bold">Activate Invite</span> tab of the ARabella agency Login page.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actionNotice.token && (
              <button
                onClick={() => handleCopyToken(actionNotice.token!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#B6E6CE] text-[11.5px] font-bold text-[#17231E] hover:bg-[#F4F8F6] cursor-pointer"
              >
                {copiedToken ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#156943]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Single-Use Code: {actionNotice.token}
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => setActionNotice(null)}
              className="p-1.5 rounded-lg text-[#5A6762] hover:bg-white/60 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: MANAGEMENT USERS & DIRECTORY */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#17231E]">
                Management Users & Role Directory
              </h2>
              <p className="text-[11.5px] text-[#7A8681]">
                Create management accounts, assign roles & properties, manage suspensions, and handle employee departures.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#88948F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, title, email, property..."
                  className="pl-8 pr-3 py-2 rounded-xl bg-[#F4F8F6] text-[12px] text-[#17231E] placeholder-[#88948F] focus:outline-none focus:ring-2 focus:ring-[#D5F267] w-56"
                />
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F4F8F6] text-[12px] font-semibold text-[#17231E] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                {ACCOUNT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase tracking-wider">
                  <th className="py-3 px-3">Employee & Job Title</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Assigned Role</th>
                  <th className="py-3 px-3">Assigned Property</th>
                  <th className="py-3 px-3">Account Status</th>
                  <th className="py-3 px-3">Last Login</th>
                  <th className="py-3 px-3 text-right">Management Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3F0] text-[12.5px]">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-[#7A8681] text-[13px]"
                    >
                      No management or resident accounts match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((staff) => {
                    const isPrimaryOwner =
                      staff.email.toLowerCase() === 'ochiengpeterson507@gmail.com';
                    const currentStatus = normalizeDisplayStatus(staff.status);
                    const normalizedRole: UserRole =
                      staff.role === 'owner' ? 'super_admin' : staff.role;

                    return (
                      <tr
                        key={staff.id}
                        className="hover:bg-[#F9FBFA] transition-colors"
                      >
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <AvatarBadge
                              name={staff.fullName}
                              bg={
                                staff.role === 'owner' ||
                                staff.role === 'super_admin'
                                  ? '#D5F267'
                                  : '#D8F3E5'
                              }
                              className="w-9 h-9 shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#17231E]">
                                  {staff.fullName}
                                </span>
                                {staff.id === currentUser.id && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#D5F267] text-[#17231E] text-[9.5px] font-bold">
                                    You
                                  </span>
                                )}
                                {staff.mfaEnabled && (
                                  <span
                                    title="2FA Security Verification Enabled"
                                    className="px-1.5 py-0.5 rounded bg-[#E1F3B8] text-[#124E0E] text-[9.5px] font-bold"
                                  >
                                    2FA
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#5A6762] flex items-center gap-1">
                                <Briefcase className="w-3 h-3 text-[#7A8681]" />
                                {staff.jobTitle || staff.roleLabel}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="space-y-0.5 text-[11.5px]">
                            <p className="flex items-center gap-1.5 text-[#17231E] font-medium">
                              <Mail className="w-3 h-3 text-[#7A8681]" />
                              {staff.email}
                            </p>
                            <p className="flex items-center gap-1.5 text-[#6E7A75]">
                              <Phone className="w-3 h-3 text-[#7A8681]" />
                              {staff.phone || 'Not provided'}
                            </p>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <select
                            disabled={isPrimaryOwner || !isSuperAdmin}
                            value={normalizedRole}
                            onChange={async (e) => {
                              const newRole = e.target.value as UserRole;
                              await onUpdateStaff(staff.id, { role: newRole });
                              setActionNotice({
                                title: 'Role Assignment Updated',
                                message: `${staff.fullName}'s role was updated to ${getRoleDisplayLabel(
                                  newRole
                                )}.`,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[11.5px] font-bold text-[#17231E] disabled:opacity-70 cursor-pointer"
                          >
                            {STAFF_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#7A8681] shrink-0" />
                            <select
                              disabled={
                                staff.role === 'super_admin' ||
                                staff.role === 'owner'
                              }
                              value={staff.assignedPropertyId || ''}
                              onChange={async (e) => {
                                const propId = e.target.value;
                                const propObj = properties.find(
                                  (p) => p.id === propId
                                );
                                await onUpdateStaff(staff.id, {
                                  assignedPropertyId: propObj?.id || '',
                                  assignedPropertyName:
                                    propObj?.name || 'All Properties',
                                });
                                setActionNotice({
                                  title: 'Property Assignment Updated',
                                  message: `${staff.fullName} is now assigned to ${
                                    propObj?.name || 'All Properties'
                                  }.`,
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-[#F4F8F6] border border-[#E4ECE8] text-[11.5px] font-semibold text-[#17231E] disabled:opacity-60 cursor-pointer max-w-[165px] truncate"
                            >
                              <option value="">All Properties</option>
                              {properties.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.codePrefix}-)
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${getStatusBadgeStyle(
                                  staff.status
                                )}`}
                              >
                                {currentStatus}
                              </span>
                              {!isPrimaryOwner && (
                                <select
                                  value={currentStatus}
                                  onChange={async (e) => {
                                    const nextStatus = e.target.value as AccountStatus;
                                    await onUpdateStaff(staff.id, {
                                      status: nextStatus,
                                    });
                                    setActionNotice({
                                      title: 'Account Status Changed',
                                      message: `${staff.fullName}'s account status is now ${nextStatus}.`,
                                    });
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-[#F4F8F6] text-[11px] font-semibold text-[#5A6762] cursor-pointer border border-[#E4ECE8]"
                                  title="Change Account Status"
                                >
                                  {ACCOUNT_STATUSES.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {(staff.invitationStatus || isPendingInviteStatus(staff.status) || staff.invitedAt) && (
                              <div className="flex items-center gap-1">
                                {(() => {
                                  const invSt = getInvitationStatus(staff);
                                  const b = getInvitationBadge(invSt);
                                  return (
                                    <span
                                      className={`px-2 py-0.2 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 ${b.style}`}
                                      title={`Invitation status: ${invSt}`}
                                    >
                                      <span className="w-1 h-1 rounded-full bg-current"></span>
                                      {b.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-[11.5px] text-[#5A6762]">
                          <div>
                            <p className="font-medium text-[#17231E]">
                              {formatTimestamp(staff.lastLoginAt)}
                            </p>
                            {staff.invitedAt && isPendingInviteStatus(staff.status) && (
                              <p className="text-[10.5px] text-[#92400E]">
                                Invited {formatTimestamp(staff.invitedAt)}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Resend Invitation */}
                            <button
                              onClick={async () => {
                                const res = await onResendInvite(staff.id);
                                if (res) {
                                  setActionNotice({
                                    title: 'Single-Use Invitation Resent',
                                    message: res.message,
                                    token: res.inviteToken,
                                    inviteUrl: res.inviteLink,
                                    email: staff.email,
                                  });
                                }
                              }}
                              title="Resend Single-Use Invitation"
                              className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#D5F267] text-[#17231E] transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>

                            {/* Password Recovery */}
                            <button
                              onClick={async () => {
                                const res = await onRecoverPassword(staff.email);
                                if (res) {
                                  setActionNotice({
                                    title: 'Password Recovery Dispatched',
                                    message: res.message,
                                    token: res.recoveryToken,
                                    email: staff.email,
                                  });
                                }
                              }}
                              title="Dispatch Password Reset Link"
                              className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#D8F3E5] text-[#17231E] transition-colors cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit Staff Details */}
                            <button
                              onClick={() => handleOpenEdit(staff)}
                              title="Edit Account & Permissions"
                              className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#E4ECE8] text-[#17231E] transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Employee Departure / Offboard Workflow */}
                            {!isPrimaryOwner && onOffboardStaff && (
                              <button
                                onClick={() => {
                                  setOffboardingStaff(staff);
                                  setOffboardStatus('Deactivated');
                                  setTransferToStaffId('');
                                }}
                                title="Employee Departure / Offboard & Transfer Properties"
                                className="p-1.5 rounded-lg bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] transition-colors cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Switch Role Session (Only if Active) */}
                            {onSwitchUserSession && currentStatus === 'Active' && (
                              <button
                                onClick={() =>
                                  onSwitchUserSession(staff.role, staff.id)
                                }
                                title={`Preview Dashboard as ${staff.fullName}`}
                                className="p-1.5 rounded-lg bg-[#F4F8F6] hover:bg-[#D5F267] text-[#156943] transition-colors cursor-pointer"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete Account */}
                            {isSuperAdmin && !isPrimaryOwner && (
                              <button
                                onClick={() => onDeleteStaff(staff.id)}
                                title="Remove Account"
                                className="p-1.5 rounded-lg bg-[#FEE2E2]/60 hover:bg-[#FEE2E2] text-[#B91C1C] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
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
      )}

      {/* TAB 2: MANAGEMENT INVITATIONS & RESEND DELIVERY TRACKING */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-[#17231E]">
                  Staff Invitations & Resend Delivery Tracking
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] text-[10.5px] font-bold border border-[#C8E6C9]">
                  Resend + Supabase Auth
                </span>
              </div>
              <p className="text-[11.5px] text-[#7A8681] mt-0.5">
                Every management invitation is delivered via Resend with Supabase Auth credentials and single-use setup links valid for 72 hours.
              </p>
            </div>

            <button
              onClick={() => setInviteModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#17231E] hover:bg-[#22332C] text-[#D5F267] text-[12px] font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-all shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite New Staff
            </button>
          </div>

          {/* SUMMARY CARDS FOR INVITATION STATUSES */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div
              onClick={() => setInvitationFilter('ALL')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                invitationFilter === 'ALL'
                  ? 'bg-[#F4F8F6] border-[#17231E] shadow-sm'
                  : 'bg-[#FAFCFB] border-[#E6ECE9] hover:border-[#CBD5E1]'
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6E7A75]">
                Total Invitations
              </p>
              <p className="text-[20px] font-extrabold text-[#17231E] mt-0.5">
                {allInvitedUsers.length}
              </p>
              <p className="text-[10.5px] text-[#7A8681] mt-0.5">All tracked invitations</p>
            </div>

            <div
              onClick={() => setInvitationFilter('Pending')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                invitationFilter === 'Pending'
                  ? 'bg-[#FEFCE8] border-[#EAB308] shadow-sm'
                  : 'bg-[#FEFCE8]/40 border-[#FDE68A] hover:border-[#EAB308]'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#92400E]">
                  Pending
                </p>
                <Clock className="w-3.5 h-3.5 text-[#D97706]" />
              </div>
              <p className="text-[20px] font-extrabold text-[#92400E] mt-0.5">
                {pendingInvitesCount}
              </p>
              <p className="text-[10.5px] text-[#B45309] mt-0.5">Awaiting activation</p>
            </div>

            <div
              onClick={() => setInvitationFilter('Accepted')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                invitationFilter === 'Accepted'
                  ? 'bg-[#F0FDF4] border-[#22C55E] shadow-sm'
                  : 'bg-[#F0FDF4]/50 border-[#BBF7D0] hover:border-[#22C55E]'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">
                  Accepted
                </p>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
              </div>
              <p className="text-[20px] font-extrabold text-[#166534] mt-0.5">
                {acceptedInvitesCount}
              </p>
              <p className="text-[10.5px] text-[#15803D] mt-0.5">Active & verified</p>
            </div>

            <div
              onClick={() => setInvitationFilter('Expired')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                invitationFilter === 'Expired' || invitationFilter === 'Failed'
                  ? 'bg-[#FEF2F2] border-[#EF4444] shadow-sm'
                  : 'bg-[#FEF2F2]/40 border-[#FECACA] hover:border-[#EF4444]'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#991B1B]">
                  Expired / Failed
                </p>
                <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
              </div>
              <p className="text-[20px] font-extrabold text-[#991B1B] mt-0.5">
                {expiredInvitesCount + failedInvitesCount}
              </p>
              <p className="text-[10.5px] text-[#B91C1C] mt-0.5">
                {expiredInvitesCount} expired, {failedInvitesCount} failed
              </p>
            </div>
          </div>

          {/* FILTER BUTTONS */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#EEF3F0] pb-2">
            {(['ALL', 'Pending', 'Accepted', 'Expired', 'Failed'] as const).map((filterOpt) => {
              const count =
                filterOpt === 'ALL'
                  ? allInvitedUsers.length
                  : filterOpt === 'Pending'
                  ? pendingInvitesCount
                  : filterOpt === 'Accepted'
                  ? acceptedInvitesCount
                  : filterOpt === 'Expired'
                  ? expiredInvitesCount
                  : failedInvitesCount;

              const active = invitationFilter === filterOpt;

              return (
                <button
                  key={filterOpt}
                  onClick={() => setInvitationFilter(filterOpt)}
                  className={`px-3 py-1.5 rounded-xl text-[11.5px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#17231E] text-[#D5F267]'
                      : 'bg-[#F4F8F6] text-[#5A6762] hover:bg-[#EAEFEA] hover:text-[#17231E]'
                  }`}
                >
                  <span>{filterOpt === 'ALL' ? 'All Invitations' : filterOpt}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      active ? 'bg-[#2E3C36] text-[#D5F267]' : 'bg-[#E0E7E3] text-[#5A6762]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* INVITATIONS TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase tracking-wider">
                  <th className="py-3 px-3">Invited Employee</th>
                  <th className="py-3 px-3">Assigned Role & Property</th>
                  <th className="py-3 px-3">Invited By & Date</th>
                  <th className="py-3 px-3">Resend Email Delivery</th>
                  <th className="py-3 px-3">Invitation Status</th>
                  <th className="py-3 px-3 text-right">Invitation Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3F0] text-[12.5px]">
                {filteredInvitations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-[#7A8681] text-[13px]"
                    >
                      No invitations found under the &ldquo;{invitationFilter}&rdquo; filter.
                    </td>
                  </tr>
                ) : (
                  filteredInvitations.map((inv) => {
                    const invStatus = getInvitationStatus(inv);
                    const badge = getInvitationBadge(invStatus);
                    const isRevoked = Boolean(inv.inviteRevoked);
                    const canResend = invStatus === 'Pending' || invStatus === 'Expired' || invStatus === 'Failed';

                    return (
                      <tr key={inv.id} className="hover:bg-[#F9FBFA] transition-colors">
                        <td className="py-3.5 px-3">
                          <p className="font-bold text-[#17231E]">{inv.fullName}</p>
                          <p className="text-[11px] text-[#6E7A75] font-mono">{inv.email}</p>
                        </td>

                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-[#17231E]">
                            {getRoleDisplayLabel(inv.role)}
                          </p>
                          <p className="text-[11px] text-[#6E7A75]">
                            {inv.assignedPropertyName || 'All Properties'}
                          </p>
                        </td>

                        <td className="py-3.5 px-3 text-[11.5px] text-[#5A6762]">
                          <p className="font-medium text-[#17231E]">
                            {inv.invitedBy || 'Super Administrator'}
                          </p>
                          <p className="text-[10.5px] text-[#7A8681]">
                            {inv.invitedAt ? formatTimestamp(inv.invitedAt) : 'Recently'}
                          </p>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-[#16A34A]" />
                              <span className="text-[11.5px] font-semibold text-[#17231E]">
                                {inv.invitationDeliveryStatus || (inv.resendMessageId ? 'Delivered' : 'Dispatched')}
                              </span>
                            </div>
                            {inv.resendMessageId && (
                              <p className="text-[10px] text-[#6E7A75] font-mono">
                                ID: {inv.resendMessageId.slice(0, 16)}...
                              </p>
                            )}
                            {inv.invitationError && (
                              <p className="text-[10px] text-[#DC2626] line-clamp-1" title={inv.invitationError}>
                                {inv.invitationError}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold w-fit ${badge.style}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {badge.label}
                            </span>
                            {invStatus === 'Accepted' && inv.activatedAt && (
                              <span className="text-[10px] text-[#15803D] font-medium">
                                Active since {formatTimestamp(inv.activatedAt)}
                              </span>
                            )}
                            {invStatus === 'Pending' && inv.inviteExpiresAt && (
                              <span className="text-[10px] text-[#92400E]">
                                Expires {formatTimestamp(inv.inviteExpiresAt)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {inv.inviteToken && !isRevoked && (
                              <button
                                onClick={() =>
                                  handleCopyToken(
                                    `${window.location.origin}/activate-invite?email=${encodeURIComponent(
                                      inv.email
                                    )}&token=${encodeURIComponent(inv.inviteToken!)}`
                                  )
                                }
                                title="Copy single-use invitation link"
                                className="px-2.5 py-1.5 rounded-xl bg-[#F4F8F6] hover:bg-[#D5F267] text-[#17231E] text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all border border-[#E4ECE8]"
                              >
                                <Copy className="w-3 h-3" />
                                Copy Link
                              </button>
                            )}

                            {canResend && (
                              <button
                                onClick={async () => {
                                  const res = await onResendInvite(inv.id);
                                  if (res) {
                                    setActionNotice({
                                      title: 'Invitation Regenerated & Resent',
                                      message: res.message,
                                      token: res.inviteToken,
                                      email: inv.email,
                                    });
                                  }
                                }}
                                title="Resend invitation email via Resend"
                                className="px-2.5 py-1.5 rounded-xl bg-[#D8F3E5] hover:bg-[#BCEAD2] text-[#156943] text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all border border-[#B6E6CE]"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resend Invite
                              </button>
                            )}

                            {onRevokeInvite && !isRevoked && invStatus !== 'Accepted' && (
                              <button
                                onClick={async () => {
                                  const res = await onRevokeInvite(inv.id);
                                  if (res) {
                                    setActionNotice({
                                      title: 'Invitation Revoked',
                                      message: res.message,
                                    });
                                  }
                                }}
                                title="Revoke this invitation"
                                className="px-2.5 py-1.5 rounded-xl bg-[#FEE2E2] hover:bg-[#FECACA] text-[#B91C1C] text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all border border-[#FECACA]"
                              >
                                <Ban className="w-3 h-3" />
                                Revoke
                              </button>
                            )}

                            {invStatus === 'Accepted' && (
                              <span className="px-2.5 py-1.5 rounded-xl bg-[#F4F8F6] text-[#15803D] text-[11px] font-bold flex items-center gap-1 border border-[#E4ECE8]">
                                <CheckCircle2 className="w-3 h-3 text-[#16A34A]" />
                                Setup Complete
                              </span>
                            )}
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
      )}

      {/* TAB 3: ROLES, PROPERTIES & PERMISSIONS MATRIX */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[15px] font-bold text-[#17231E] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#156943]" />
                Role-Based Access Control (RBAC) & Property Scoping Matrix
              </h3>
              <p className="text-[11.5px] text-[#7A8681]">
                Enforced independently on both frontend routes and backend API authorization policies.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {STAFF_ROLES.map((roleDef) => {
              const allowedModules = getAllowedPagesForRole(roleDef.value);
              const perms = getRolePermissionsSummary(roleDef.value);
              return (
                <div
                  key={roleDef.value}
                  className="rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13.5px] font-bold text-[#17231E]">
                        {roleDef.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#D8F3E5] text-[#156943] text-[10px] font-bold">
                        {allowedModules.length} Authorized Modules
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6E7A75] mb-2.5">
                      {roleDef.desc}
                    </p>
                    <ul className="space-y-1 text-[11.5px] text-[#17231E]">
                      {perms.map((p, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#156943] shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#E4ECE8] flex flex-wrap gap-1">
                    {allowedModules.map((mod) => (
                      <span
                        key={mod}
                        className="px-2 py-0.5 rounded bg-white border border-[#E4ECE8] text-[10px] font-semibold text-[#5A6762] capitalize"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: LOGIN ACTIVITY & SECURITY AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-4">
          <div>
            <h2 className="text-[16px] font-bold text-[#17231E]">
              Login Activity & Security Audit Trail
            </h2>
            <p className="text-[11.5px] text-[#7A8681]">
              Immutable audit log of management & tenant sign-ins, failed login attempts, invitations, role updates, suspensions, and employee offboarding. Passwords and tokens are never logged.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase tracking-wider">
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-3">Security Event</th>
                  <th className="py-3 px-3">Actor</th>
                  <th className="py-3 px-3">Target Account</th>
                  <th className="py-3 px-3">Portal</th>
                  <th className="py-3 px-3">Outcome</th>
                  <th className="py-3 px-3">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
                {securityLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-[#7A8681] text-[13px]"
                    >
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  securityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F9FBFA]">
                      <td className="py-3 px-3 text-[11px] text-[#6E7A75] whitespace-nowrap">
                        {formatTimestamp(log.createdAt)}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#17231E] capitalize">
                        {log.eventType.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-[#17231E]">
                          {log.actorName}
                        </span>
                        {log.actorRole && (
                          <span className="block text-[10.5px] text-[#7A8681]">
                            {log.actorRole}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[#355245]">
                        {log.targetEmail || log.actorEmail || '—'}
                      </td>
                      <td className="py-3 px-3 uppercase text-[10.5px] font-bold text-[#5A6762]">
                        {log.portal}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            log.status === 'Success'
                              ? 'bg-[#D8F3E5] text-[#156943]'
                              : log.status === 'Blocked'
                              ? 'bg-[#FEE2E2] text-[#B91C1C]'
                              : 'bg-[#FEF3C7] text-[#92400E]'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#374247] max-w-md">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: BRANDED RENTIFY EMAIL CENTER */}
      {activeTab === 'emails' && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4ECE8] space-y-4">
          <div>
            <h2 className="text-[16px] font-bold text-[#17231E]">
              Branded ARabella agency Transactional Emails
            </h2>
            <p className="text-[11.5px] text-[#7A8681]">
              All automated ARabella agency management invitation, activation, password reset, suspension, and reactivation notifications.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E6ECE9] text-[11px] font-bold text-[#7A8681] uppercase tracking-wider">
                  <th className="py-3 px-3">Sent At</th>
                  <th className="py-3 px-3">Template Type</th>
                  <th className="py-3 px-3">Recipient</th>
                  <th className="py-3 px-3">Email Subject</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3F0] text-[12px]">
                {brandedEmails.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-[#7A8681] text-[13px]"
                    >
                      No branded transactional emails dispatched yet. Create or invite a management account to preview the ARabella agency email template.
                    </td>
                  </tr>
                ) : (
                  brandedEmails.map((em) => (
                    <tr key={em.id} className="hover:bg-[#F9FBFA]">
                      <td className="py-3 px-3 text-[11px] text-[#6E7A75] whitespace-nowrap">
                        {formatTimestamp(em.createdAt)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-[#E1F3B8] text-[#124E0E] text-[10.5px] font-bold uppercase">
                          {em.templateType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-[#17231E]">{em.recipientName}</p>
                        <p className="text-[11px] text-[#6E7A75]">{em.recipientEmail}</p>
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#17231E]">
                        {em.subject}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-[#D8F3E5] text-[#156943] text-[10.5px] font-bold">
                          {em.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setPreviewEmail(em)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F4F8F6] hover:bg-[#D5F267] text-[#17231E] text-[11.5px] font-bold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Branded Email
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE MANAGEMENT ACCOUNT MODAL */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4ECE8] max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#D5F267] flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-[#17231E]" />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#17231E]">
                    Create Management Account & Dispatch Invite
                  </h3>
                  <p className="text-[11px] text-[#7A8681]">
                    Generates a single-use 72-hour ARabella agency invitation link
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-3 text-[12px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Grace Wanjiku"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Senior Property Manager"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@rentify.co.ke"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 712 345 678"
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] focus:outline-none focus:ring-2 focus:ring-[#D5F267]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Assigned Role *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleSelectInCreate(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-semibold"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Invitation Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AccountStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-semibold"
                  >
                    <option value="Pending Invitation">
                      Pending Invitation (Send Single-Use Invite)
                    </option>
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Assigned Property (Where Applicable)
                </label>
                <select
                  value={assignedPropertyId}
                  onChange={(e) => setAssignedPropertyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                >
                  <option value="">All Properties (Portfolio-Wide)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.address} (Prefix {p.codePrefix}-)
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#17231E] text-[12px]">
                    Require 2FA Security Verification on Login
                  </p>
                  <p className="text-[11px] text-[#6E7A75]">
                    Recommended for Super Admin &amp; Administrator accounts
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={mfaEnabled}
                  onChange={(e) => setMfaEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#64B723] cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[11.5px] text-[#166534] flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#14532D]">Automated Resend Delivery &amp; Supabase Auth</p>
                  <p className="text-[#166534] mt-0.5 text-[11px] leading-relaxed">
                    A secure Supabase Auth invitation is created and delivered directly via Resend with a 72-hour single-use link. The employee sets their password on the account setup screen and accesses dashboard sections permitted by their role.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] font-bold cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {submitting ? 'Generating Invitation...' : 'Create & Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MANAGEMENT ACCOUNT MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4ECE8]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#D8F3E5] flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-[#17231E]" />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#17231E]">
                    Edit Management Account
                  </h3>
                  <p className="text-[11px] text-[#7A8681]">{editingStaff.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-[12px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-semibold"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#5A6762] mb-1">
                    Account Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-semibold"
                  >
                    {ACCOUNT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  Assigned Property
                </label>
                <select
                  value={editPropertyId}
                  onChange={(e) => setEditPropertyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                >
                  <option value="">All Properties (Portfolio-Wide)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.address}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8] flex items-center justify-between">
                <span className="font-semibold text-[#17231E]">
                  Require 2FA Security Verification
                </span>
                <input
                  type="checkbox"
                  checked={editMfaEnabled}
                  onChange={(e) => setEditMfaEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#64B723] cursor-pointer"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] font-bold cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMPLOYEE DEPARTURE / OFFBOARDING MODAL (SECTION 11) */}
      {offboardingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4ECE8] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#92400E]">
                  <UserMinus className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#17231E]">
                    Management Employee Departure Workflow
                  </h3>
                  <p className="text-[11px] text-[#7A8681]">
                    Offboard {offboardingStaff.fullName} ({offboardingStaff.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOffboardingStaff(null)}
                className="p-1 rounded-lg text-[#76827D] hover:bg-[#EEF3F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOffboardSubmit} className="space-y-3.5 text-[12px]">
              <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[11.5px] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Zero Data Loss & Immediate Session Revocation
                </p>
                <p>
                  Completing this workflow immediately revokes all active sessions for{' '}
                  <strong>{offboardingStaff.fullName}</strong>, transfers their property assignments, and preserves 100% of their historical operational &amp; financial records.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  1. Account Departure Action
                </label>
                <select
                  value={offboardStatus}
                  onChange={(e) =>
                    setOffboardStatus(
                      e.target.value as 'Deactivated' | 'Suspended'
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-bold"
                >
                  <option value="Deactivated">
                    Deactivate Account (Permanent Departure)
                  </option>
                  <option value="Suspended">
                    Suspend Account (Temporary Administrative Hold)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  2. Transfer Assigned Property ({offboardingStaff.assignedPropertyName || 'All Properties'}) To:
                </label>
                <select
                  value={transferToStaffId}
                  onChange={(e) => setTransferToStaffId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E] font-semibold"
                >
                  <option value="">
                    Unassign from Property (Return to Super Admin)
                  </option>
                  {users
                    .filter(
                      (u) =>
                        u.id !== offboardingStaff.id &&
                        normalizeDisplayStatus(u.status) === 'Active' &&
                        u.role !== 'tenant'
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} — {getRoleDisplayLabel(u.role)} ({u.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#5A6762] mb-1">
                  3. Departure Audit Note
                </label>
                <textarea
                  rows={2}
                  value={offboardReason}
                  onChange={(e) => setOffboardReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F8F6] text-[#17231E]"
                />
              </div>

              {/* Employee Recent Activity Review */}
              <div className="p-3 rounded-xl bg-[#F8FAF9] border border-[#E4ECE8]">
                <p className="text-[11px] font-bold text-[#5A6762] mb-1.5 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  4. Historical Operational Records Preview (Preserved)
                </p>
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-[#374247]">
                  {activities
                    .filter((a) =>
                      a.description
                        .toLowerCase()
                        .includes(offboardingStaff.fullName.toLowerCase())
                    )
                    .slice(0, 4)
                    .map((a) => (
                      <div key={a.id} className="py-1 border-b border-[#EEF3F0]">
                        <span className="font-semibold">{a.title}:</span> {a.description}
                      </div>
                    ))}
                  <p className="text-[10.5px] text-[#156943] font-semibold pt-1">
                    ✓ All confirmed rent payments, recorded expenses, leases, and maintenance logs remain intact.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOffboardingStaff(null)}
                  className="px-4 py-2 rounded-xl bg-[#EEF3F0] text-[#5A6762] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold cursor-pointer"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  {submitting
                    ? 'Processing Departure...'
                    : `Confirm ${offboardStatus} & Revoke Sessions`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BRANDED RENTIFY EMAIL HTML PREVIEW MODAL */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-[#E4ECE8] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E4ECE8]">
              <div>
                <span className="px-2 py-0.5 rounded bg-[#E1F3B8] text-[#124E0E] text-[10px] font-bold uppercase">
                  {previewEmail.templateType.replace(/_/g, ' ')}
                </span>
                <h3 className="text-[15px] font-bold text-[#17231E] mt-1">
                  {previewEmail.subject}
                </h3>
                <p className="text-[11.5px] text-[#6E7A75]">
                  To: {previewEmail.recipientName} &lt;{previewEmail.recipientEmail}&gt; •{' '}
                  {formatTimestamp(previewEmail.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setPreviewEmail(null)}
                className="p-1.5 rounded-lg text-[#76827D] hover:bg-[#EEF3F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto rounded-xl border border-[#E4ECE8] bg-[#F6F9F3] p-4"
              dangerouslySetInnerHTML={{ __html: previewEmail.htmlBody }}
            />

            <div className="pt-3 mt-3 border-t border-[#E4ECE8] flex justify-end">
              <button
                onClick={() => setPreviewEmail(null)}
                className="px-4 py-2 rounded-xl bg-[#D5F267] text-[#17231E] text-[12px] font-bold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
