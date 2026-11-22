/**
 * Anniversary-Based Rental Billing Engine
 *
 * Calculates monthly rental billing cycles strictly from each tenant's actual
 * move-in date (lease_start), never defaulting to the 1st of the calendar month.
 *
 * Example:
 *   Move-in date: 22 November 2026
 *   Cycle 0: 22 November 2026 – 21 December 2026 (Due: 22 November 2026)
 *   Cycle 1: 22 December 2026 – 21 January 2027  (Due: 22 December 2026)
 *   Cycle 2: 22 January 2027  – 21 February 2027 (Due: 22 January 2027)
 *
 * Month-end clamping rule (e.g., move-in on 31st):
 *   Cycle 0: 31 Jan 2026 – 27 Feb 2026 (Due: 31 Jan 2026, Next: 28 Feb 2026)
 *   Cycle 1: 28 Feb 2026 – 30 Mar 2026 (Due: 28 Feb 2026, Next: 31 Mar 2026)
 *   Cycle 2: 31 Mar 2026 – 29 Apr 2026 (Due: 31 Mar 2026, Next: 30 Apr 2026)
 *   Cycle 3: 30 Apr 2026 – 30 May 2026 (Due: 30 Apr 2026, Next: 31 May 2026)
 */

export interface AnniversaryBillingCycle {
  cycleIndex: number;
  anniversaryDay: number;
  periodStart: string;       // YYYY-MM-DD
  periodEnd: string;         // YYYY-MM-DD
  dueDate: string;           // YYYY-MM-DD (same as periodStart)
  nextBillingDate: string;   // YYYY-MM-DD (next cycle's periodStart)
  periodStartLabel: string;  // e.g., "22 Nov 2026"
  periodEndLabel: string;    // e.g., "21 Dec 2026"
  dueDateLabel: string;      // e.g., "22 Nov 2026"
  nextBillingLabel: string;  // e.g., "22 Dec 2026"
  periodRangeLabel: string;  // e.g., "22 Nov 2026 – 21 Dec 2026"
  periodLongRangeLabel: string; // e.g., "22 November 2026 – 21 December 2026"
}

export interface DerivedInvoiceFinancials {
  monthlyRent: number;
  amountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  status: 'Paid' | 'Pending' | 'Overdue';
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Returns number of days in a Gregorian calendar month (month is 1..12). */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Formats (year, month 1..12, day 1..31) to YYYY-MM-DD. */
export function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parses YYYY-MM-DD into numeric components. Returns null if invalid. */
export function splitYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const maxD = getDaysInMonth(year, month);
  if (day < 1 || day > maxD) return null;
  return { year, month, day };
}

/** Returns Nairobi (Africa/Nairobi, UTC+3) current date as YYYY-MM-DD. */
export function getNairobiTodayYmd(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return toYmd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Parses a move-in date, due date, or stored lease date string into YYYY-MM-DD
 * without local-timezone off-by-one shifts.
 * Rejects fixed placeholder strings like "05 Monthly", "5th of this month", "Active", "-".
 */
export function parseBillingDateToYmd(raw?: string | null): string | null {
  const str = String(raw || '').trim();
  if (!str) return null;
  const lower = str.toLowerCase();
  if (
    lower === '-' ||
    lower === 'active' ||
    lower === 'ongoing' ||
    lower === 'monthly' ||
    lower.includes('monthly') ||
    lower.includes('of this month')
  ) {
    return null;
  }

  // 1. Exact YYYY-MM-DD or ISO timestamp starting with YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= getDaysInMonth(y, m)) {
      return toYmd(y, m, d);
    }
  }

  // 2. "22 November 2026" or "22 Nov 2026" or "22 Nov, 2026"
  const dmyText = str.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmyText) {
    const d = Number(dmyText[1]);
    const m = MONTH_NAME_TO_INDEX[dmyText[2].toLowerCase()];
    const y = Number(dmyText[3]);
    if (m && d >= 1 && d <= getDaysInMonth(y, m)) {
      return toYmd(y, m, d);
    }
  }

  // 3. "Nov 22, 2026" or "November 22 2026"
  const mdyText = str.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (mdyText) {
    const m = MONTH_NAME_TO_INDEX[mdyText[1].toLowerCase()];
    const d = Number(mdyText[2]);
    const y = Number(mdyText[3]);
    if (m && d >= 1 && d <= getDaysInMonth(y, m)) {
      return toYmd(y, m, d);
    }
  }

  // 4. "DD/MM/YYYY" or "DD-MM-YYYY" (Kenya / UK convention used across RMS invoices)
  const dmySlash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmySlash) {
    const a = Number(dmySlash[1]);
    const b = Number(dmySlash[2]);
    const y = Number(dmySlash[3]);
    // Prefer DD/MM/YYYY unless b > 12 (then MM/DD/YYYY)
    let m = b;
    let d = a;
    if (b > 12 && a <= 12) {
      m = a;
      d = b;
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= getDaysInMonth(y, m)) {
      return toYmd(y, m, d);
    }
  }

  // 5. Fallback Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return getNairobiTodayYmd(parsed);
  }
  return null;
}

/** Formats YYYY-MM-DD as "22 Nov 2026". */
export function formatYmdShort(ymd?: string | null): string {
  if (!ymd) return '-';
  const parsed = splitYmd(ymd) || (parseBillingDateToYmd(ymd) ? splitYmd(parseBillingDateToYmd(ymd)!) : null);
  if (!parsed) return String(ymd);
  return `${parsed.day} ${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`;
}

/** Formats YYYY-MM-DD as "22 November 2026". */
export function formatYmdLong(ymd?: string | null): string {
  if (!ymd) return '-';
  const parsed = splitYmd(ymd) || (parseBillingDateToYmd(ymd) ? splitYmd(parseBillingDateToYmd(ymd)!) : null);
  if (!parsed) return String(ymd);
  return `${parsed.day} ${MONTH_LONG[parsed.month - 1]} ${parsed.year}`;
}

/** Formats ordinal day label e.g. 1 -> "1st", 2 -> "2nd", 22 -> "22nd", 31 -> "31st". */
export function formatOrdinalDay(day: number): string {
  const n = Math.max(1, Math.min(31, Math.floor(day)));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Adds `deltaDays` (positive or negative) to a YYYY-MM-DD string safely in UTC. */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const parts = splitYmd(ymd);
  if (!parts) return ymd;
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Difference in whole calendar days: targetYmd - baseYmd. */
export function diffDaysBetweenYmd(targetYmd: string, baseYmd: string): number | null {
  const a = splitYmd(baseYmd);
  const b = splitYmd(targetYmd);
  if (!a || !b) return null;
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86400000);
}

/**
 * Returns the clamped anniversary date (YYYY-MM-DD) for a target (year, month 1..12)
 * given the tenant's original move-in anniversary day (1..31).
 * For months with fewer days (e.g., Feb 28/29, Apr 30), clamps to the last day of that month.
 */
export function getClampedAnniversaryDate(year: number, month: number, anniversaryDay: number): string {
  // Normalize month overflow/underflow
  const totalMonths = year * 12 + (month - 1);
  const normYear = Math.floor(totalMonths / 12);
  const normMonth = ((totalMonths % 12) + 12) % 12 + 1;
  const maxDay = getDaysInMonth(normYear, normMonth);
  const clampedDay = Math.min(Math.max(1, Math.floor(anniversaryDay)), maxDay);
  return toYmd(normYear, normMonth, clampedDay);
}

/** Derives the tenant's billing anniversary day (1..31) from their move-in date. */
export function getBillingAnniversaryDay(moveInDateRaw?: string | null, fallbackYmd?: string): number {
  const ymd = parseBillingDateToYmd(moveInDateRaw) || (fallbackYmd ? parseBillingDateToYmd(fallbackYmd) : null);
  if (!ymd) return 1;
  const parts = splitYmd(ymd);
  return parts ? parts.day : 1;
}

/**
 * Computes the exact AnniversaryBillingCycle for cycle index `k >= 0`
 * anchored strictly to `moveInDateRaw` (tenant's actual move-in date).
 */
export function getBillingCycleForIndex(
  moveInDateRaw: string,
  cycleIndex: number
): AnniversaryBillingCycle | null {
  const moveInYmd = parseBillingDateToYmd(moveInDateRaw);
  if (!moveInYmd) return null;
  const startParts = splitYmd(moveInYmd);
  if (!startParts) return null;

  const k = Math.max(0, Math.floor(cycleIndex));
  const anniversaryDay = startParts.day;
  const periodStart = getClampedAnniversaryDate(startParts.year, startParts.month + k, anniversaryDay);
  const nextBillingDate = getClampedAnniversaryDate(startParts.year, startParts.month + k + 1, anniversaryDay);
  const periodEnd = addDaysToYmd(nextBillingDate, -1);

  const periodStartLabel = formatYmdShort(periodStart);
  const periodEndLabel = formatYmdShort(periodEnd);
  const nextBillingLabel = formatYmdShort(nextBillingDate);

  return {
    cycleIndex: k,
    anniversaryDay,
    periodStart,
    periodEnd,
    dueDate: periodStart,
    nextBillingDate,
    periodStartLabel,
    periodEndLabel,
    dueDateLabel: periodStartLabel,
    nextBillingLabel,
    periodRangeLabel: `${periodStartLabel} – ${periodEndLabel}`,
    periodLongRangeLabel: `${formatYmdLong(periodStart)} – ${formatYmdLong(periodEnd)}`,
  };
}

/**
 * Finds the active AnniversaryBillingCycle covering `referenceDateRaw`.
 * If `referenceDateRaw` is before move-in date, returns Cycle 0 (first billing period).
 */
export function getBillingCycleForDate(
  moveInDateRaw: string,
  referenceDateRaw?: string | null
): AnniversaryBillingCycle | null {
  const moveInYmd = parseBillingDateToYmd(moveInDateRaw);
  if (!moveInYmd) return null;
  const refYmd = parseBillingDateToYmd(referenceDateRaw) || getNairobiTodayYmd();

  const startParts = splitYmd(moveInYmd);
  const refParts = splitYmd(refYmd);
  if (!startParts || !refParts) return null;

  if (refYmd < moveInYmd) {
    return getBillingCycleForIndex(moveInYmd, 0);
  }

  let approxMonths = (refParts.year - startParts.year) * 12 + (refParts.month - startParts.month);
  if (approxMonths < 0) approxMonths = 0;

  // Check approxMonths - 1, approxMonths, approxMonths + 1 to handle clamped month-end dates cleanly
  for (let k = Math.max(0, approxMonths - 1); k <= approxMonths + 2; k++) {
    const cycle = getBillingCycleForIndex(moveInYmd, k);
    if (cycle && refYmd >= cycle.periodStart && refYmd <= cycle.periodEnd) {
      return cycle;
    }
  }

  return getBillingCycleForIndex(moveInYmd, approxMonths);
}

/**
 * Returns every anniversary billing cycle whose due date (periodStart) is on or before `upToDateRaw`.
 * If `leaseEndRaw` is a valid calendar date, stops generating cycles whose periodStart is after leaseEnd.
 * Guarantees at least Cycle 0 is returned if `includeInitialIfFuture` is true (e.g., future move-in lease).
 */
export function getAllDueCyclesThroughDate(
  moveInDateRaw: string,
  upToDateRaw?: string | null,
  options?: {
    leaseEndRaw?: string | null;
    includeInitialIfFuture?: boolean;
    maxCycles?: number;
  }
): AnniversaryBillingCycle[] {
  const moveInYmd = parseBillingDateToYmd(moveInDateRaw);
  if (!moveInYmd) return [];
  const upToYmd = parseBillingDateToYmd(upToDateRaw) || getNairobiTodayYmd();
  const leaseEndYmd = parseBillingDateToYmd(options?.leaseEndRaw);
  const maxCycles = options?.maxCycles ?? 240;

  if (upToYmd < moveInYmd) {
    if (options?.includeInitialIfFuture) {
      const first = getBillingCycleForIndex(moveInYmd, 0);
      return first ? [first] : [];
    }
    return [];
  }

  const cycles: AnniversaryBillingCycle[] = [];
  for (let k = 0; k < maxCycles; k++) {
    const cycle = getBillingCycleForIndex(moveInYmd, k);
    if (!cycle) break;
    if (cycle.periodStart > upToYmd) break;
    if (leaseEndYmd && cycle.periodStart > leaseEndYmd) break;
    cycles.push(cycle);
  }
  return cycles;
}

/**
 * Calculates the next upcoming billing date (YYYY-MM-DD) for a tenant from their move-in date.
 * - If `referenceDateRaw` is before move-in and Cycle 0 is already issued/paid, returns Cycle 1's start.
 * - If `referenceDateRaw` is during Cycle k, returns Cycle k+1's start (`cycle.nextBillingDate`).
 */
export function getNextBillingDate(
  moveInDateRaw: string,
  referenceDateRaw?: string | null,
  alreadyIssuedDueDatesYmd: string[] = []
): string | null {
  const moveInYmd = parseBillingDateToYmd(moveInDateRaw);
  if (!moveInYmd) return null;
  const refYmd = parseBillingDateToYmd(referenceDateRaw) || getNairobiTodayYmd();
  const issuedSet = new Set(alreadyIssuedDueDatesYmd.map((d) => parseBillingDateToYmd(d)).filter(Boolean));

  if (refYmd < moveInYmd) {
    const c0 = getBillingCycleForIndex(moveInYmd, 0);
    if (!c0) return null;
    return issuedSet.has(c0.periodStart) ? c0.nextBillingDate : c0.periodStart;
  }

  const active = getBillingCycleForDate(moveInYmd, refYmd);
  if (!active) return null;
  // If the current cycle is already issued (or today is past periodStart), next billing is active.nextBillingDate
  if (issuedSet.has(active.periodStart) || refYmd >= active.periodStart) {
    return active.nextBillingDate;
  }
  return active.periodStart;
}

/** Deterministic unique key used to prevent duplicate invoices for the same tenancy & billing period. */
export function buildBillingPeriodKey(
  tenantRef: string,
  periodStartYmd: string,
  periodEndYmd: string
): string {
  const cleanRef = String(tenantRef || '').trim().toUpperCase();
  return `${cleanRef}::${periodStartYmd}::${periodEndYmd}`;
}

/** Standard deterministic invoice code for an anniversary billing cycle. */
export function buildAnniversaryInvoiceCode(tenantRef: string, periodStartYmd: string): string {
  const cleanRef = String(tenantRef || 'A001')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const compactDate = String(periodStartYmd || '').replace(/[^0-9]/g, '');
  return `INV-${cleanRef}-${compactDate || Date.now().toString().slice(-6)}`;
}

/** Human-readable payment note containing the exact billing period so it survives legacy schemas too. */
export function formatBillingPeriodNote(periodStartYmd: string, periodEndYmd: string): string {
  return `Monthly Rent (${formatYmdShort(periodStartYmd)} - ${formatYmdShort(periodEndYmd)})`;
}

/**
 * Extracts billing period start & end (YYYY-MM-DD) from an existing payment record,
 * using explicit DB columns first, then note parsing, then deriving from move-in date + due date.
 */
export function extractBillingPeriodFromPayment(
  payment: {
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
    billing_period_start?: string | null;
    billing_period_end?: string | null;
    dueDate?: string | null;
    due_date?: string | null;
    paymentNote?: string | null;
    payment_note?: string | null;
  },
  moveInDateRaw?: string | null
): { periodStart: string; periodEnd: string } | null {
  const explicitStart = parseBillingDateToYmd(payment.billingPeriodStart || payment.billing_period_start);
  const explicitEnd = parseBillingDateToYmd(payment.billingPeriodEnd || payment.billing_period_end);
  if (explicitStart && explicitEnd) {
    return { periodStart: explicitStart, periodEnd: explicitEnd };
  }

  // Try parsing from payment note e.g. "(22 Nov 2026 - 21 Dec 2026)" or "(2026-11-22 - 2026-12-21)"
  const note = String(payment.paymentNote || payment.payment_note || '');
  const noteRangeMatch = note.match(
    /\((\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})\)/
  );
  if (noteRangeMatch) {
    const s = parseBillingDateToYmd(noteRangeMatch[1]);
    const e = parseBillingDateToYmd(noteRangeMatch[2]);
    if (s && e) return { periodStart: s, periodEnd: e };
  }

  const moveInYmd = parseBillingDateToYmd(moveInDateRaw);
  const dueYmd = parseBillingDateToYmd(payment.dueDate || payment.due_date);

  if (moveInYmd && dueYmd) {
    const cycle = getBillingCycleForDate(moveInYmd, dueYmd);
    if (cycle) {
      return { periodStart: cycle.periodStart, periodEnd: cycle.periodEnd };
    }
  }

  if (dueYmd) {
    const fallbackCycle = getBillingCycleForIndex(dueYmd, 0);
    if (fallbackCycle) {
      return { periodStart: fallbackCycle.periodStart, periodEnd: fallbackCycle.periodEnd };
    }
  }

  if (moveInYmd) {
    const c0 = getBillingCycleForIndex(moveInYmd, 0);
    if (c0) return { periodStart: c0.periodStart, periodEnd: c0.periodEnd };
  }

  return null;
}

/**
 * Checks whether an existing payment already corresponds to a given anniversary cycle,
 * guaranteeing duplicate invoices are never created for the same tenancy & billing period.
 */
export function isDuplicateCyclePayment(
  existingPayments: Array<{
    tenantRef?: string;
    tenant_ref?: string;
    billingPeriodKey?: string | null;
    billing_period_key?: string | null;
    billingPeriodStart?: string | null;
    billing_period_start?: string | null;
    billingPeriodEnd?: string | null;
    billing_period_end?: string | null;
    dueDate?: string | null;
    due_date?: string | null;
    paymentNote?: string | null;
    payment_note?: string | null;
  }>,
  tenantRef: string,
  cycle: AnniversaryBillingCycle,
  moveInDateRaw?: string | null
): boolean {
  const cleanRef = String(tenantRef || '').trim().toUpperCase();
  const targetKey = buildBillingPeriodKey(cleanRef, cycle.periodStart, cycle.periodEnd);

  return existingPayments.some((p) => {
    const pRef = String(p.tenantRef || p.tenant_ref || '').trim().toUpperCase();
    if (pRef !== cleanRef) return false;

    const pKey = String(p.billingPeriodKey || p.billing_period_key || '').trim().toUpperCase();
    if (pKey && pKey === targetKey) return true;

    const pStart = parseBillingDateToYmd(p.billingPeriodStart || p.billing_period_start);
    const pEnd = parseBillingDateToYmd(p.billingPeriodEnd || p.billing_period_end);
    if (pStart === cycle.periodStart && pEnd === cycle.periodEnd) return true;

    const pDue = parseBillingDateToYmd(p.dueDate || p.due_date);
    if (pDue && pDue === cycle.periodStart) return true;

    // Also match if payment note encodes this exact period
    const extracted = extractBillingPeriodFromPayment(p, moveInDateRaw);
    if (extracted && extracted.periodStart === cycle.periodStart && extracted.periodEnd === cycle.periodEnd) {
      return true;
    }

    return false;
  });
}

/**
 * Computes consistent invoice financial totals & payment status from verified payment amounts
 * and due date relative to Nairobi today.
 */
export function computeInvoiceFinancials(input: {
  amountDue?: number | null;
  amountPaid?: number | null;
  amount?: number | null;
  monthlyRent?: number | null;
  dueDate?: string | null;
  storedStatus?: string | null;
  referenceYmd?: string | null;
}): DerivedInvoiceFinancials {
  const refYmd = parseBillingDateToYmd(input.referenceYmd) || getNairobiTodayYmd();
  const rawDue = Number(input.amountDue ?? input.amount ?? input.monthlyRent ?? 0);
  const amountDue = Math.max(0, isFinite(rawDue) ? rawDue : 0);
  const monthlyRent = Math.max(0, Number(input.monthlyRent ?? amountDue) || amountDue);

  const storedStatus = String(input.storedStatus || '').trim();
  let amountPaid: number;
  if (input.amountPaid !== undefined && input.amountPaid !== null && Number(input.amountPaid) > 0) {
    amountPaid = Math.max(0, Number(input.amountPaid));
  } else if (storedStatus === 'Paid') {
    amountPaid = amountDue;
  } else {
    amountPaid = 0;
  }

  const outstandingBalance = Math.max(0, amountDue - amountPaid);
  const dueYmd = parseBillingDateToYmd(input.dueDate);

  let status: 'Paid' | 'Pending' | 'Overdue';
  if (amountDue > 0 && amountPaid >= amountDue) {
    status = 'Paid';
  } else if (amountDue === 0 && storedStatus === 'Paid') {
    status = 'Paid';
  } else if (dueYmd && dueYmd < refYmd) {
    status = 'Overdue';
  } else if (storedStatus === 'Overdue' && !dueYmd) {
    status = 'Overdue';
  } else {
    status = 'Pending';
  }

  return {
    monthlyRent,
    amountDue,
    amountPaid,
    outstandingBalance,
    status,
  };
}
