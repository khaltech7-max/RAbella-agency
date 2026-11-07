import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { rentalApi } from '../lib/apiClient';

export type PublicAuthView = 'login' | 'recover' | 'setup';
export type PortalMode = 'management' | 'tenant';

interface AuthGatePageProps {
  initialView?: PublicAuthView;
  initialPortal?: PortalMode;
  redirectNotice?: string | null;
  redirectMessage?: string | null;
  onLogin: (
    email: string,
    password: string,
    options?: {
      portal?: PortalMode;
      rememberMe?: boolean;
      mfaCode?: string;
    }
  ) => Promise<{ mfaRequired?: boolean; mfaChallengeCode?: string; message?: string } | void>;
  onSetupPassword: (data: {
    email: string;
    password: string;
    inviteToken?: string;
  }) => Promise<{ redirectToLogin?: boolean; message?: string } | void>;
  onRecoverPassword: (
    email: string,
    portal?: PortalMode
  ) => Promise<
    | {
        success: boolean;
        message: string;
        recoveryToken?: string;
        recoveryLink?: string;
      }
    | undefined
  >;
}

function evaluatePasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
  valid: boolean;
} {
  if (!pw) return { score: 0, label: 'Enter a strong password', color: '#94A19B', valid: false };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) {
    return {
      score: 1,
      label: 'Weak — Use at least 6+ characters',
      color: '#DC2626',
      valid: pw.length >= 6,
    };
  }
  if (score === 2) {
    return {
      score: 2,
      label: 'Fair — Add uppercase & numbers for stronger security',
      color: '#D97706',
      valid: true,
    };
  }
  if (score === 3) {
    return {
      score: 3,
      label: 'Good — Strong management password',
      color: '#4D9A1D',
      valid: true,
    };
  }
  return {
    score: 4,
    label: 'Excellent — Enterprise-grade password strength',
    color: '#15803D',
    valid: true,
  };
}

export const AuthGatePage: React.FC<AuthGatePageProps> = ({
  initialView = 'login',
  initialPortal,
  redirectNotice,
  redirectMessage,
  onLogin,
  onSetupPassword,
  onRecoverPassword,
}) => {
  const [portal, setPortal] = useState<PortalMode>(() => {
    if (initialPortal) return initialPortal;
    if (typeof window !== 'undefined' && window.location.pathname === '/tenant-login') {
      return 'tenant';
    }
    return 'management';
  });
  const [view, setView] = useState<PublicAuthView>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDemoHint, setMfaDemoHint] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [contactAdminOpen, setContactAdminOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [verifiedInviteInfo, setVerifiedInviteInfo] = useState<{
    fullName: string;
    roleLabel: string;
    jobTitle?: string;
    assignedPropertyName?: string;
    expiresAt?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeNotice = redirectMessage || redirectNotice || null;
  const pwStrength = useMemo(() => evaluatePasswordStrength(password), [password]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // Auto-read invitation or password recovery query parameters (?email=...&token=...&portal=...) or Supabase Auth hash (#access_token=...&type=invite)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
    const hashParams = new URLSearchParams(hash);

    const qEmail = params.get('email');
    const qToken = params.get('token') || params.get('code') || params.get('token_hash');
    const qPortal = params.get('portal');
    const hashType = hashParams.get('type');
    const hashAccessToken = hashParams.get('access_token');
    const hashError = hashParams.get('error_description') || hashParams.get('error');

    if (
      window.location.pathname === '/activate-invite' ||
      window.location.pathname === '/setup-account' ||
      hashType === 'invite' ||
      hashType === 'recovery'
    ) {
      setView('setup');
    }

    if (hashError) {
      setErrorMsg(decodeURIComponent(hashError));
    }

    if (hashAccessToken) {
      try {
        const payloadBase64 = hashAccessToken.split('.')[1];
        if (payloadBase64) {
          const decoded = JSON.parse(atob(payloadBase64));
          if (decoded?.email) {
            setEmail(decoded.email);
          }
        }
      } catch {}
    }

    if (qPortal === 'tenant' || window.location.pathname === '/tenant-login') {
      setPortal('tenant');
    } else if (qPortal === 'management') {
      setPortal('management');
    }

    if (qEmail) setEmail(qEmail);
    if (qToken) {
      setInviteToken(qToken);
      setView('setup');
    }

    if (qEmail && qToken) {
      setValidatingInvite(true);
      rentalApi
        .validateInvite(qEmail, qToken)
        .then((res) => {
          if (res.valid) {
            setVerifiedInviteInfo({
              fullName: res.fullName,
              roleLabel: res.roleLabel,
              jobTitle: res.jobTitle,
              assignedPropertyName: res.assignedPropertyName,
              expiresAt: res.expiresAt,
            });
          }
        })
        .catch((err: any) => {
          setErrorMsg(err?.message || 'Invitation link is invalid or has expired.');
        })
        .finally(() => {
          setValidatingInvite(false);
        });
    }
  }, []);

  const switchPortal = (nextPortal: PortalMode) => {
    setPortal(nextPortal);
    setErrorMsg(null);
    setSuccessMsg(null);
    setMfaStep(false);
    if (typeof window !== 'undefined') {
      const nextPath =
        view === 'recover'
          ? '/recover-password'
          : view === 'setup'
          ? '/activate-invite'
          : nextPortal === 'tenant'
          ? '/tenant-login'
          : '/login';
      window.history.replaceState(null, '', nextPath);
    }
  };

  const switchPublicView = (nextView: PublicAuthView) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setMfaStep(false);
    setView(nextView);
    const targetPath =
      nextView === 'recover'
        ? '/recover-password'
        : nextView === 'setup'
        ? '/activate-invite'
        : portal === 'tenant'
        ? '/tenant-login'
        : '/login';
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
  };

  const sanitizeProviderMessage = (msg: string) => {
    return msg
      .replace(/supabase\s*auth/gi, 'ARabella agency Security')
      .replace(/supabase/gi, 'ARabella agency');
  };

  const handleValidateInviteClick = async () => {
    if (!email.trim() || !inviteToken.trim()) {
      setErrorMsg('Please enter both your Email Address and Invitation Code to verify.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setValidatingInvite(true);
    try {
      const res = await rentalApi.validateInvite(email.trim(), inviteToken.trim());
      setVerifiedInviteInfo({
        fullName: res.fullName,
        roleLabel: res.roleLabel,
        jobTitle: res.jobTitle,
        assignedPropertyName: res.assignedPropertyName,
        expiresAt: res.expiresAt,
      });
      setSuccessMsg(res.message);
    } catch (err: any) {
      setVerifiedInviteInfo(null);
      setErrorMsg(
        sanitizeProviderMessage(
          err?.message || 'Invitation token is invalid, expired, or already used.'
        )
      );
    } finally {
      setValidatingInvite(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (view === 'login') {
        const loginRes = await onLogin(email.trim(), password, {
          portal,
          rememberMe,
          mfaCode: mfaStep ? mfaCode.trim() : undefined,
        });
        if (loginRes && loginRes.mfaRequired) {
          setMfaStep(true);
          if (loginRes.mfaChallengeCode) {
            setMfaDemoHint(loginRes.mfaChallengeCode);
          }
          setSuccessMsg(
            loginRes.message ||
              'Security verification required: Enter your 6-digit verification code to continue.'
          );
        }
      } else if (view === 'recover') {
        const res = await onRecoverPassword(email.trim(), portal);
        setSuccessMsg(
          sanitizeProviderMessage(
            res?.message ||
              'If an account is registered with this email address, a secure password reset code has been dispatched.'
          )
        );
        if (res?.recoveryToken) {
          setInviteToken(res.recoveryToken);
        }
        setView('setup');
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/activate-invite');
        }
      } else if (view === 'setup') {
        if (!pwStrength.valid || password.length < 6) {
          setErrorMsg('Password must be at least 6 characters long.');
          return;
        }
        if (confirmPassword && password !== confirmPassword) {
          setErrorMsg('Passwords do not match. Please re-enter.');
          return;
        }
        const setupRes = await onSetupPassword({
          email: email.trim(),
          password,
          inviteToken: inviteToken.trim() || undefined,
        });
        if (setupRes && setupRes.redirectToLogin) {
          setPassword('');
          setConfirmPassword('');
          setInviteToken('');
          setVerifiedInviteInfo(null);
          setView('login');
          setSuccessMsg(
            sanitizeProviderMessage(
              setupRes.message ||
                'Account activated! Please sign in below with your new password to enter your dashboard.'
            )
          );
          if (typeof window !== 'undefined') {
            window.history.replaceState(
              null,
              '',
              portal === 'tenant' ? '/tenant-login' : '/login'
            );
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(
        sanitizeProviderMessage(
          err?.message || 'Authentication failed. Please verify your credentials and try again.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#F7FAF2] via-[#F2F7EC] to-[#E8F2DF] text-[#111C21] flex flex-col justify-between select-none">
      {/* Desktop & Tablet Property-Inspired Architectural & Skyline Environment */}
      <div
        className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `url('/assets/aistudio/rentify_login_bg_clean.png')`,
        }}
        aria-hidden="true"
      />

      {/* Mobile Subtle Decorative Lime-Green Curved Shapes (Clean & Uncluttered) */}
      <div className="md:hidden absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -right-20 top-24 w-72 h-72 rounded-full bg-[#C7EE6B]/25 blur-2xl" />
        <div className="absolute -left-20 bottom-20 w-72 h-72 rounded-full bg-[#DCEFC0]/40 blur-2xl" />
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-0 left-0 w-full h-36 object-cover"
          preserveAspectRatio="none"
        >
          <path
            fill="#E3F2B6"
            d="M0,224L80,213.3C160,203,320,181,480,192C640,203,800,245,960,240C1120,235,1280,181,1360,154.7L1440,128L1440,320L0,320Z"
          />
          <path
            fill="#8ED81B"
            d="M0,288L120,277.3C240,267,480,245,720,245.3C960,245,1200,267,1320,277.3L1440,288L1440,320L0,320Z"
          />
          <path fill="#3B8D17" d="M0,304L1440,240L1440,320L0,320Z" />
        </svg>
      </div>

      {/* Top Brand Header Bar */}
      <header className="relative z-10 w-full max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12 pt-3.5 sm:pt-5 flex items-start justify-between gap-4">
        {/* Rentify Logo (Preserved Proportions & Colors from Reference) */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-end gap-[4.5px] sm:gap-[5px] h-7 sm:h-9">
            <span className="w-[7px] sm:w-[8px] h-[20px] sm:h-[25px] rounded-full bg-[#9FE249]" />
            <span className="w-[7px] sm:w-[8px] h-[28px] sm:h-[35px] rounded-full bg-[#B4EC39]" />
            <span className="w-[7px] sm:w-[8px] h-[23px] sm:h-[29px] rounded-full bg-[#439A1D]" />
          </div>
          <span className="text-[24px] sm:text-[30px] font-extrabold tracking-tight text-[#0F1E26] leading-none">
            ARabella agency
          </span>
        </div>

        {/* Right Brand Tagline: Smart Property Management / Made Simple */}
        <div className="text-right leading-tight pt-0.5">
          <p className="text-[11.5px] sm:text-[14px] italic font-medium text-[#152228] tracking-tight">
            Smart Property Management
          </p>
          <div className="inline-flex flex-col items-end">
            <span className="text-[13px] sm:text-[17px] italic font-semibold text-[#53A518] mt-0.5">
              Made Simple
            </span>
            <svg
              viewBox="0 0 180 18"
              className="w-24 sm:w-32 h-2.5 sm:h-3 -mt-0.5"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 15C52 5 118 2 176 5"
                stroke="#64B723"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </header>

      {/* Center White Authentication Card (Compact, Balanced, Fits Standard Screens) */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-2 sm:py-3">
        <div className="w-[92%] sm:w-full max-w-[430px] bg-white/98 backdrop-blur-xs rounded-[24px] sm:rounded-[28px] px-5 py-5 sm:px-7 sm:py-6 shadow-[0_16px_45px_rgba(16,34,24,0.12)] border border-white border-b-[3px] border-b-[#9FE224]">
          {/* Card Top Header: Circular Light-Green Property Icon + Welcome Back */}
          <div className="flex items-center gap-3 sm:gap-3.5 mb-3.5">
            <div className="w-[46px] h-[46px] sm:w-[52px] sm:h-[52px] rounded-full bg-[#E1F3B8] flex items-center justify-center shrink-0">
              {/* Refined Property House Icon matching reference */}
              <svg
                viewBox="0 0 48 48"
                className="w-6 h-6 sm:w-7 sm:h-7"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 23.5L24 8.5L42 23.5"
                  stroke="#124E0E"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.5 23.5L24 13L36.5 23.5V39C36.5 39.8284 35.8284 40.5 35 40.5H13C12.1716 40.5 11.5 39.8284 11.5 39V23.5Z"
                  fill="#124E0E"
                />
                <rect x="20" y="25.5" width="3.3" height="3.3" rx="0.4" fill="#E1F3B8" />
                <rect x="24.7" y="25.5" width="3.3" height="3.3" rx="0.4" fill="#E1F3B8" />
                <rect x="20" y="30.2" width="3.3" height="3.3" rx="0.4" fill="#E1F3B8" />
                <rect x="24.7" y="30.2" width="3.3" height="3.3" rx="0.4" fill="#E1F3B8" />
              </svg>
            </div>

            <div className="min-w-0">
              <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#111C21] tracking-tight leading-tight">
                {view === 'recover' ? 'Reset Password' : 'Welcome Back'}
              </h1>
              <p className="text-[12px] sm:text-[12.5px] text-[#3B474C] font-normal mt-0.5">
                {view === 'login'
                  ? 'Sign in to access your ARabella agency account'
                  : view === 'setup'
                  ? 'Activate your invitation & set password'
                  : 'Enter your email to receive a reset code'}
              </p>
            </div>
          </div>

          {/* Segmented Authentication Navigation Tabs: Only Sign In & Activate Invite */}
          <div
            role="tablist"
            aria-label="Authentication options"
            className="grid grid-cols-2 p-1 rounded-full bg-[#F2F4F6] mb-3 text-[11.5px] sm:text-[12px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'login' || view === 'recover'}
              onClick={() => switchPublicView('login')}
              className={`py-1.5 px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                view === 'login' || view === 'recover'
                  ? 'bg-[#A6E221] text-[#111C15] font-bold shadow-[0_2px_6px_rgba(166,226,33,0.30)]'
                  : 'text-[#232F34] hover:text-[#111C21] font-semibold'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={view === 'setup'}
              onClick={() => switchPublicView('setup')}
              className={`py-1.5 px-3 rounded-full flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                view === 'setup'
                  ? 'bg-[#A6E221] text-[#111C15] font-bold shadow-[0_2px_6px_rgba(166,226,33,0.30)]'
                  : 'text-[#232F34] hover:text-[#111C21] font-semibold'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0 stroke-[2.1]" />
              <span>Activate Invite</span>
            </button>
          </div>

          {/* Redirect Notice if unauthenticated user tried accessing a protected route */}
          {activeNotice && !errorMsg && !successMsg && (
            <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-[#F4FCE3] border border-[#C6EC7A] text-[#285E12] text-[12px] font-semibold flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#49961D]" />
              <span>{sanitizeProviderMessage(activeNotice)}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="mb-3 px-3.5 py-2.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-[12px] font-semibold flex items-start gap-2"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div
              role="status"
              className="mb-3 px-3.5 py-2.5 rounded-xl bg-[#ECFCCB] border border-[#BEF264] text-[#285E12] text-[12px] font-semibold flex items-start gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#49961D]" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Verified Invitation Card (Step 5 of Invitation Flow) */}
          {view === 'setup' && verifiedInviteInfo && (
            <div className="mb-3 p-3 rounded-xl bg-[#F4FAF6] border border-[#A7E3C1] text-[11.5px] space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#14532D] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#15803D]" />
                  Verified: {verifiedInviteInfo.fullName}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#D5F267] text-[#17231E] text-[10px] font-bold">
                  {verifiedInviteInfo.roleLabel}
                </span>
              </div>
              <p className="text-[#355245] text-[11px]">
                {verifiedInviteInfo.jobTitle ? `${verifiedInviteInfo.jobTitle} • ` : ''}
                Scope: {verifiedInviteInfo.assignedPropertyName || 'All Properties'}
              </p>
            </div>
          )}

          {/* Authentication Form with Compact Heights & Tight Gaps */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            {/* Email Address Field */}
            <div>
              <label
                htmlFor="rentify-auth-email"
                className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#142024] mb-1"
              >
                <Mail className="w-3.5 h-3.5 text-[#142024] stroke-[2.1]" />
                <span>Email Address</span>
              </label>
              <input
                id="rentify-auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full h-11 px-4 py-2 rounded-full bg-[#F5F6F8] border border-[#E2E6EA] text-[13px] sm:text-[13.5px] text-[#111C21] placeholder-[#7B8790] focus:bg-white focus:border-[#9BE022] focus:outline-none focus:ring-2 focus:ring-[#A6E221]/25 transition-all"
              />
            </div>

            {/* Invitation or Recovery Code Field (Activate Invite Tab) */}
            {view === 'setup' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="rentify-auth-code"
                    className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#142024]"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#142024] stroke-[2.1]" />
                    <span>Invitation Code</span>
                  </label>
                  <button
                    type="button"
                    disabled={validatingInvite}
                    onClick={handleValidateInviteClick}
                    className="text-[11px] font-bold text-[#2E6F18] hover:underline cursor-pointer"
                  >
                    {validatingInvite ? 'Validating...' : 'Validate Code'}
                  </button>
                </div>
                <input
                  id="rentify-auth-code"
                  type="text"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder="Enter invitation code (e.g. INV-XXXX)"
                  className="w-full h-11 px-4 py-2 rounded-full bg-[#F5F6F8] border border-[#E2E6EA] text-[13px] sm:text-[13.5px] text-[#111C21] font-mono placeholder:font-sans placeholder-[#7B8790] focus:bg-white focus:border-[#9BE022] focus:outline-none focus:ring-2 focus:ring-[#A6E221]/25 transition-all"
                />
              </div>
            )}

            {/* Password Field (Sign In & Activate Invite Tabs) */}
            {view !== 'recover' && (
              <div>
                <label
                  htmlFor="rentify-auth-password"
                  className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#142024] mb-1"
                >
                  <Lock className="w-3.5 h-3.5 text-[#142024] stroke-[2.1]" />
                  <span>{view === 'setup' ? 'Create New Password' : 'Password'}</span>
                </label>
                <div className="relative">
                  <input
                    id="rentify-auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={
                      view === 'setup' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-4 pr-10 py-2 rounded-full bg-[#F5F6F8] border border-[#E2E6EA] text-[13px] sm:text-[13.5px] text-[#111C21] placeholder-[#7B8790] focus:bg-white focus:border-[#9BE022] focus:outline-none focus:ring-2 focus:ring-[#A6E221]/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#374247] hover:text-[#111C21] transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Password Strength Meter during Invitation Activation / Reset */}
                {view === 'setup' && password.length > 0 && (
                  <div className="mt-1.5 px-2">
                    <div className="grid grid-cols-4 gap-1.5 h-1 mb-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className="rounded-full transition-all"
                          style={{
                            backgroundColor:
                              pwStrength.score >= step ? pwStrength.color : '#E2E8F0',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-[10.5px] font-semibold"
                      style={{ color: pwStrength.color }}
                    >
                      {pwStrength.label}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password Field (Activate Invite Tab) */}
            {view === 'setup' && (
              <div>
                <label
                  htmlFor="rentify-auth-confirm-password"
                  className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#142024] mb-1"
                >
                  <Lock className="w-3.5 h-3.5 text-[#142024] stroke-[2.1]" />
                  <span>Confirm New Password</span>
                </label>
                <div className="relative">
                  <input
                    id="rentify-auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    className="w-full h-11 pl-4 pr-10 py-2 rounded-full bg-[#F5F6F8] border border-[#E2E6EA] text-[13px] sm:text-[13.5px] text-[#111C21] placeholder-[#7B8790] focus:bg-white focus:border-[#9BE022] focus:outline-none focus:ring-2 focus:ring-[#A6E221]/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#374247] hover:text-[#111C21] transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Optional Privileged Role Multi-Factor Authentication (MFA) Step */}
            {view === 'login' && mfaStep && (
              <div className="p-3 rounded-2xl bg-[#F4FAF6] border border-[#9BE022] space-y-1.5">
                <label
                  htmlFor="rentify-mfa-code"
                  className="flex items-center justify-between text-[12px] font-bold text-[#142024]"
                >
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2E6F18]" />
                    Security Verification Code (2FA)
                  </span>
                  {mfaDemoHint && (
                    <span className="font-mono text-[10.5px] bg-[#E1F3B8] px-2 py-0.5 rounded text-[#124E0E]">
                      Code: {mfaDemoHint}
                    </span>
                  )}
                </label>
                <input
                  id="rentify-mfa-code"
                  type="text"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter 6-digit security code"
                  className="w-full h-10 px-4 py-2 rounded-full bg-white border border-[#CBE896] text-[13px] font-mono tracking-widest text-center text-[#111C21] focus:outline-none focus:ring-2 focus:ring-[#A6E221]"
                />
              </div>
            )}

            {/* Remember Me & Forgot Password Row */}
            {view === 'login' && (
              <div className="flex items-center justify-between pt-0.5 px-1">
                <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#374247] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#64B723] cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => switchPublicView('recover')}
                  className="text-[12px] font-bold text-[#2E6F18] hover:text-[#1E4F0E] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {view === 'recover' && (
              <div className="flex items-center justify-end pt-0.5 px-1">
                <button
                  type="button"
                  onClick={() => switchPublicView('login')}
                  className="text-[12px] font-bold text-[#2E6F18] hover:text-[#1E4F0E] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              </div>
            )}

            {/* Primary CTA Button (Compact 44px Height, Easy to Click) */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 py-2.5 px-5 rounded-full bg-gradient-to-r from-[#A9E522] to-[#9BE01C] hover:from-[#9BD618] hover:to-[#8DC912] active:scale-[0.995] disabled:opacity-60 disabled:cursor-not-allowed text-[#111C15] font-bold text-[14px] shadow-[0_6px_16px_rgba(155,224,28,0.30)] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 stroke-[2.3]" />
                <span>
                  {loading
                    ? view === 'login'
                      ? 'Signing In...'
                      : view === 'recover'
                      ? 'Sending Recovery Code...'
                      : 'Activating Account...'
                    : view === 'login'
                    ? mfaStep
                      ? 'Verify & Enter Dashboard'
                      : 'Sign In to Dashboard'
                    : view === 'recover'
                    ? 'Send Recovery Code'
                    : 'Set Password & Activate'}
                </span>
                {!loading && <ArrowRight className="w-3.5 h-3.5 stroke-[2.3]" />}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Bottom Branded Footer: RENT • MANAGE • LIVE BETTER */}
      <footer className="relative z-10 w-full max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12 pb-3 sm:pb-4 pt-1 flex items-center justify-center md:justify-start">
        <div className="inline-flex items-center gap-2 text-[#17241B]">
          <svg
            viewBox="0 0 28 28"
            className="w-5 h-5 text-[#68B823] shrink-0"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 13.5L14 5L24 13.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.5 12V22.5C6.5 23.0523 6.94772 23.5 7.5 23.5H11.5V17.5H16.5V23.5H20.5C21.0523 23.5 21.5 23.0523 21.5 22.5V12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex items-center gap-2 text-[10.5px] sm:text-[11.5px] font-bold tracking-[0.14em] uppercase">
            <span>RENT</span>
            <span className="text-[#68B823] text-[13px] leading-none">•</span>
            <span>MANAGE</span>
            <span className="text-[#68B823] text-[13px] leading-none">•</span>
            <span>LIVE BETTER</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
