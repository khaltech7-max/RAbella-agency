import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type DiagnosticCategory =
  | 'Authentication'
  | 'Environment Variables'
  | 'Database Access'
  | 'Routing';

export interface DiagnosticErrorDetails {
  failedRequest: string;
  statusCode: number | string;
  endpoint: string;
  supabaseError: string;
  category: DiagnosticCategory;
  hint?: string;
  timestamp: string;
}

export class SupabaseIntegrationError extends Error {
  public readonly diagnostics: DiagnosticErrorDetails;

  constructor(message: string, diagnostics: Omit<DiagnosticErrorDetails, 'timestamp'>) {
    super(message);
    this.name = 'SupabaseIntegrationError';
    this.diagnostics = {
      ...diagnostics,
      timestamp: new Date().toISOString(),
    };
  }
}

const envMeta = (import.meta as any).env || {};

const rawSupabaseUrl: string =
  envMeta.VITE_SUPABASE_URL ||
  envMeta.NEXT_PUBLIC_SUPABASE_URL ||
  envMeta.REACT_APP_SUPABASE_URL ||
  envMeta.__RESOLVED_SUPABASE_URL__ ||
  '';

const rawSupabaseAnonKey: string =
  envMeta.VITE_SUPABASE_ANON_KEY ||
  envMeta.VITE_SUPABASE_PUBLISHABLE_KEY ||
  envMeta.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  envMeta.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  envMeta.REACT_APP_SUPABASE_ANON_KEY ||
  envMeta.__RESOLVED_SUPABASE_ANON_KEY__ ||
  '';

/**
 * Normalizes a Supabase Project URL so accidental quotes, trailing slashes,
 * missing https://, or appended paths (/rest/v1, /auth/v1) do not cause 404 errors.
 */
function normalizeSupabaseUrl(raw: string): string {
  let cleaned = String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();

  if (!cleaned) return '';

  if (!/^https?:\/\//i.test(cleaned) && cleaned.includes('.supabase.co')) {
    cleaned = `https://${cleaned}`;
  }

  // Strip accidental API subpaths if a user pasted https://xyz.supabase.co/rest/v1 or /auth/v1
  cleaned = cleaned
    .replace(/\/+(rest|auth|realtime|storage|functions)\/v1.*$/i, '')
    .replace(/\/+$/, '');

  return cleaned;
}

function cleanApiKey(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

/**
 * Checks if a JWT key is accidentally a Supabase service_role secret key.
 * Client code must NEVER use service_role keys.
 */
function isServiceRoleKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3 && typeof atob === 'function') {
    try {
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      if (payload?.role === 'service_role') {
        return true;
      }
    } catch {
      // Not a standard base64 JWT payload
    }
  }
  return false;
}

export const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
export const supabaseAnonKey = cleanApiKey(rawSupabaseAnonKey);

const isPlaceholderUrl =
  !supabaseUrl ||
  supabaseUrl.includes('your-project-ref') ||
  supabaseUrl.includes('example.supabase.co') ||
  supabaseUrl === 'https://your-project-ref.supabase.co';

const isPlaceholderKey =
  !supabaseAnonKey ||
  supabaseAnonKey === 'your-supabase-anon-key' ||
  supabaseAnonKey === 'your-anon-key';

const isPointingToVercelOrSelf = (() => {
  if (!supabaseUrl) return false;
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.hostname.endsWith('.vercel.app')) return true;
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
})();

const hasForbiddenServiceRoleKey = isServiceRoleKey(supabaseAnonKey);

export const isSupabaseConfigured = Boolean(
  !isPlaceholderUrl &&
    !isPlaceholderKey &&
    !isPointingToVercelOrSelf &&
    !hasForbiddenServiceRoleKey &&
    /^https?:\/\//i.test(supabaseUrl)
);

/**
 * Masks the project URL slightly or returns the clean origin without any credentials.
 */
export function getSanitizedSupabaseEndpoint(pathSuffix = ''): string {
  if (!supabaseUrl) {
    return pathSuffix || '(VITE_SUPABASE_URL not configured)';
  }
  const suffix = pathSuffix.startsWith('/') ? pathSuffix : pathSuffix ? `/${pathSuffix}` : '';
  return `${supabaseUrl}${suffix}`;
}

export function getSupabaseConfigDiagnostics(): {
  configured: boolean;
  urlPresent: boolean;
  anonKeyPresent: boolean;
  isPointingToVercelOrSelf: boolean;
  hasForbiddenServiceRoleKey: boolean;
  sanitizedUrl: string;
  issueSummary: string | null;
} {
  let issueSummary: string | null = null;
  if (hasForbiddenServiceRoleKey) {
    issueSummary =
      'SECURITY BLOCK: A Supabase service_role / secret key was detected in VITE_SUPABASE_ANON_KEY. Use only the public anon/publishable key in frontend environment variables.';
  } else if (isPointingToVercelOrSelf) {
    issueSummary = `MISCONFIGURED URL: VITE_SUPABASE_URL (${supabaseUrl}) is pointing to your Vercel/app domain instead of your Supabase project URL (https://<project-ref>.supabase.co). This causes authentication requests to hit Vercel and fail with HTTP 404.`;
  } else if (isPlaceholderUrl && isPlaceholderKey) {
    issueSummary =
      'MISSING ENV VARS: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set in this build. In Vercel Project Settings -> Environment Variables, add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and redeploy.';
  } else if (isPlaceholderUrl) {
    issueSummary =
      'MISSING URL: VITE_SUPABASE_URL is missing or set to a placeholder. Set VITE_SUPABASE_URL=https://<project-ref>.supabase.co in Vercel and redeploy.';
  } else if (isPlaceholderKey) {
    issueSummary =
      'MISSING ANON KEY: VITE_SUPABASE_ANON_KEY is missing or set to a placeholder. Set VITE_SUPABASE_ANON_KEY to your Supabase public anon key in Vercel and redeploy.';
  }

  return {
    configured: isSupabaseConfigured,
    urlPresent: !isPlaceholderUrl,
    anonKeyPresent: !isPlaceholderKey,
    isPointingToVercelOrSelf,
    hasForbiddenServiceRoleKey,
    sanitizedUrl: supabaseUrl || '(not set)',
    issueSummary,
  };
}

/**
 * Logs and constructs a SupabaseIntegrationError with complete diagnostic fields:
 * - Which request failed
 * - HTTP status code
 * - Endpoint involved (without credentials)
 * - Actual error returned by Supabase
 * - Problem category (Authentication, Environment Variables, Database Access, or Routing)
 */
export function createDiagnosticError(params: {
  failedRequest: string;
  statusCode?: number | string;
  endpoint: string;
  supabaseError: string;
  category: DiagnosticCategory;
  hint?: string;
}): SupabaseIntegrationError {
  const statusStr = params.statusCode !== undefined ? String(params.statusCode) : 'N/A';
  const cleanEndpoint = String(params.endpoint || '')
    .replace(/apikey=[^&]+/gi, 'apikey=[REDACTED]')
    .replace(/token=[^&]+/gi, 'token=[REDACTED]');

  const formattedMessage = `${params.supabaseError} [Request: ${params.failedRequest} | Status: ${statusStr} | Endpoint: ${cleanEndpoint} | Category: ${params.category}]${
    params.hint ? ` — Hint: ${params.hint}` : ''
  }`;

  console.error('[Supabase Diagnostic Error]', {
    failedRequest: params.failedRequest,
    statusCode: statusStr,
    endpoint: cleanEndpoint,
    supabaseError: params.supabaseError,
    category: params.category,
    hint: params.hint,
  });

  return new SupabaseIntegrationError(formattedMessage, {
    failedRequest: params.failedRequest,
    statusCode: statusStr,
    endpoint: cleanEndpoint,
    supabaseError: params.supabaseError,
    category: params.category,
    hint: params.hint,
  });
}

// Client-side Supabase instance (strictly uses public anon key, NEVER service-role key)
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

