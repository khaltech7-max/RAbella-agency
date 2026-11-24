/**
 * Single-source-of-truth helpers for classifying payment & receipt records
 * into "Rent", "Security Deposit", or "Other Income", plus portfolio-wide
 * and property-level financial accounting calculations that strictly separate
 * earned revenue from tenant security deposit liabilities.
 *
 * Existing database records are NEVER mutated or deleted; legacy notes such as
 * "Move-in payment (Rent: KSh 15,000 + Lease: KSh 15,000)" or "[Lease] ..."
 * are normalized at the display / classification boundary.
 */

export type TransactionType = 'Rent' | 'Security Deposit' | 'Other Income';

export interface ClassifiablePaymentLike {
  id?: string;
  invoiceId?: string;
  receiptId?: string;
  tenantId?: string;
  tenantName?: string;
  unitNumber?: string;
  propertyName?: string;
  notes?: string | null;
  note?: string | null;
  description?: string | null;
  billingPeriodKey?: string | null;
  transactionType?: TransactionType | string | null;
  amount?: number;
  amountPaid?: number;
  balanceDue?: number;
  status?: string;
  paymentDate?: string | null;
  dueDate?: string | null;
  rawDate?: string | null;
}

const DEPOSIT_KEYWORDS_REGEX =
  /\b(security\s*deposit|deposit\s*payment|tenant\s*deposit|refundable\s*deposit|caution\s*money|deposit\s*receipt|initial\s*deposit)\b/i;

const OTHER_INCOME_KEYWORDS_REGEX =
  /\b(other\s*income|late\s*fee|penalty|fine|service\s*charge|utility\s*fee|water\s*bill|electricity\s*bill|garbage\s*fee|parking\s*fee|damage\s*(fee|charge|recovery|deduction|repair)|forfeited\s*deposit|deposit\s*deduction|admin\s*fee|reconnection\s*fee)\b/i;

const LEGACY_LEASE_TAG_REGEX = /^\s*\[\s*lease\s*\]/i;
const DEPOSIT_TAG_REGEX = /^\s*\[\s*(?:security\s*)?deposit\s*\]/i;
const OTHER_INCOME_TAG_REGEX = /^\s*\[\s*other\s*income\s*\]/i;
const RENT_TAG_REGEX = /^\s*\[\s*rent\s*\]/i;

// Matches legacy "Lease: KSh 15,000" or "Lease Deposit: KSh 15,000" when not combined with positive Rent
const LEGACY_STANDALONE_LEASE_DEPOSIT_REGEX =
  /^\s*(?:lease(?:\s+deposit|\s+fee|\s+payment)?|deposit)\s*(?:payment|receipt|charge|amount)?\s*(?:[:\-].*)?$/i;

/**
 * Determines whether a payment or receipt record represents a "Rent",
 * "Security Deposit", or "Other Income" transaction.
 */
export function classifyPaymentTransaction(payment?: ClassifiablePaymentLike | null): TransactionType {
  if (!payment) return 'Rent';

  // 1. Explicit transactionType field if already set
  const explicit = String(payment.transactionType || '').trim().toLowerCase();
  if (explicit === 'security deposit' || explicit === 'deposit') {
    return 'Security Deposit';
  }
  if (explicit === 'other income' || explicit === 'other') {
    return 'Other Income';
  }

  const rawText = [
    payment.notes,
    payment.note,
    payment.description,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const bKey = String(payment.billingPeriodKey || '').trim().toUpperCase();
  const invId = String(payment.invoiceId || '').trim().toUpperCase();

  // 2. Billing period key or invoice prefix explicitly marking a deposit
  if (
    bKey.startsWith('DEP') ||
    bKey.includes('DEPOSIT') ||
    invId.startsWith('DEP-')
  ) {
    return 'Security Deposit';
  }

  // 2b. Billing period key or invoice prefix explicitly marking other income
  if (
    bKey.startsWith('OTH') ||
    bKey.includes('OTHER_INCOME') ||
    invId.startsWith('OTH-')
  ) {
    return 'Other Income';
  }

  if (!rawText) {
    return 'Rent';
  }

  // 3. Explicit prefix tags: [Security Deposit], [Deposit], [Other Income], or legacy [Lease]
  if (DEPOSIT_TAG_REGEX.test(rawText) || LEGACY_LEASE_TAG_REGEX.test(rawText)) {
    return 'Security Deposit';
  }
  if (OTHER_INCOME_TAG_REGEX.test(rawText)) {
    return 'Other Income';
  }
  if (RENT_TAG_REGEX.test(rawText)) {
    return 'Rent';
  }

  // 4. Combined move-in note inspection: e.g., "Move-in payment (Rent: KSh 0 + Security Deposit: KSh 15,000)"
  // If rent is 0 and deposit/lease > 0, it's a pure Security Deposit transaction.
  const combinedMatch = rawText.match(
    /Rent:\s*(?:KSh|KES)?\s*([\d,]+(?:\.\d+)?)\s*\+\s*(?:Security\s*Deposit|Deposit|Lease):\s*(?:KSh|KES)?\s*([\d,]+(?:\.\d+)?)/i
  );
  if (combinedMatch) {
    const rentVal = Number(combinedMatch[1].replace(/,/g, '')) || 0;
    const depVal = Number(combinedMatch[2].replace(/,/g, '')) || 0;
    if (rentVal === 0 && depVal > 0) {
      return 'Security Deposit';
    }
    return 'Rent';
  }

  // 5. Explicit deposit keywords without an active monthly rent billing period key (YYYY-MM)
  const hasMonthlyRentPeriodKey = /^\d{4}-\d{2}$/.test(bKey);
  if (!hasMonthlyRentPeriodKey) {
    if (DEPOSIT_KEYWORDS_REGEX.test(rawText) || LEGACY_STANDALONE_LEASE_DEPOSIT_REGEX.test(rawText)) {
      // Ensure it doesn't explicitly say "Monthly Rent" as primary subject
      if (!/\bmonthly\s+rent\b/i.test(rawText)) {
        return 'Security Deposit';
      }
    }
    if (OTHER_INCOME_KEYWORDS_REGEX.test(rawText) && !/\bmonthly\s+rent\b/i.test(rawText)) {
      return 'Other Income';
    }
  } else {
    // Even if a YYYY-MM key exists, if the note is exclusively a Security Deposit receipt
    if (
      /^\s*(?:security\s*deposit|deposit\s*payment|tenant\s*deposit|caution\s*money|lease\s*deposit)\b/i.test(rawText) &&
      !/\brent\b/i.test(rawText)
    ) {
      return 'Security Deposit';
    }
    if (
      /^\s*(?:other\s*income|late\s*fee|penalty|damage\s*(?:fee|charge|deduction|recovery)|service\s*charge|utility\s*fee|parking\s*fee)\b/i.test(rawText) &&
      !/\bmonthly\s+rent\b/i.test(rawText)
    ) {
      return 'Other Income';
    }
  }

  return 'Rent';
}

export function isDepositTransaction(payment?: ClassifiablePaymentLike | null): boolean {
  return classifyPaymentTransaction(payment) === 'Security Deposit';
}

export function isOtherIncomeTransaction(payment?: ClassifiablePaymentLike | null): boolean {
  return classifyPaymentTransaction(payment) === 'Other Income';
}

export function isRentTransaction(payment?: ClassifiablePaymentLike | null): boolean {
  return classifyPaymentTransaction(payment) === 'Rent';
}

/**
 * Cleans up legacy "Lease" wording in payment notes for UI display while
 * preserving the underlying transaction metadata and amounts.
 *
 * Examples:
 * - "[Lease] Move-in deposit" -> "Security Deposit — Move-in deposit"
 * - "Move-in payment (Rent: KSh 15,000 + Lease: KSh 15,000)" -> "Move-in payment (Rent: KSh 15,000 + Security Deposit: KSh 15,000)"
 * - "Lease payment" -> "Security Deposit"
 */
export function formatTransactionDisplayNote(
  rawNoteOrPayment?: string | ClassifiablePaymentLike | null,
  fallbackType?: TransactionType
): string {
  const note =
    typeof rawNoteOrPayment === 'object' && rawNoteOrPayment !== null
      ? String(
          rawNoteOrPayment.notes ??
            rawNoteOrPayment.note ??
            rawNoteOrPayment.description ??
            (rawNoteOrPayment as any).payment_note ??
            (rawNoteOrPayment as any).paymentNote ??
            ''
        ).trim()
      : String(rawNoteOrPayment || '').trim();
  const resolvedFallback =
    fallbackType ||
    (typeof rawNoteOrPayment === 'object' && rawNoteOrPayment !== null
      ? classifyPaymentTransaction(rawNoteOrPayment)
      : undefined);
  if (!note) {
    if (resolvedFallback === 'Security Deposit') return 'Security Deposit';
    if (resolvedFallback === 'Other Income') return 'Other Income';
    return 'Monthly Rent';
  }

  let formatted = note
    // Replace legacy [Lease] prefix tag with [Security Deposit]
    .replace(/^\s*\[\s*lease\s*\]\s*/i, '[Security Deposit] ')
    // Replace "+ Lease:" inside move-in payment descriptions with "+ Security Deposit:"
    .replace(/\+\s*Lease\s*:/gi, '+ Security Deposit:')
    // Replace "(Lease:" with "(Security Deposit:"
    .replace(/\(\s*Lease\s*:/gi, '(Security Deposit:')
    // Replace standalone "Lease Deposit" or "Lease Fee" with "Security Deposit"
    .replace(/\bLease\s+Deposit\b/gi, 'Security Deposit')
    .replace(/\bLease\s+Fee\b/gi, 'Security Deposit');

  // If the entire note was just "Lease" or "Lease payment", display "Security Deposit"
  if (/^\s*lease(?:\s+payment|\s+charge|\s+receipt)?\s*$/i.test(formatted)) {
    formatted = 'Security Deposit';
  }

  return formatted;
}

/**
 * Formats a note to save on newly created payment records so that the
 * transaction type is unambiguous without requiring schema changes.
 */
export function normalizeNewPaymentNote(
  note: string | undefined | null,
  transactionType: TransactionType = 'Rent'
): string {
  const cleaned = formatTransactionDisplayNote(note, transactionType).trim();
  if (transactionType === 'Security Deposit') {
    if (
      !DEPOSIT_TAG_REGEX.test(cleaned) &&
      !/\b(?:security\s*deposit|deposit)\b/i.test(cleaned)
    ) {
      return cleaned ? `[Security Deposit] ${cleaned}` : 'Security Deposit';
    }
    return cleaned || 'Security Deposit';
  }
  if (transactionType === 'Other Income') {
    if (
      !OTHER_INCOME_TAG_REGEX.test(cleaned) &&
      !OTHER_INCOME_KEYWORDS_REGEX.test(cleaned)
    ) {
      return cleaned ? `[Other Income] ${cleaned}` : 'Other Income';
    }
    return cleaned || 'Other Income';
  }
  return cleaned || 'Monthly Rent';
}

/**
 * Helper to compute the actual collected amount on a payment record.
 * Accounts for partial payments (`amountPaid`) as well as fully `Paid` status.
 */
export function getCollectedPaymentAmount(payment?: ClassifiablePaymentLike | null): number {
  if (!payment) return 0;
  if (payment.amountPaid !== undefined && payment.amountPaid !== null) {
    const paid = Number(payment.amountPaid);
    if (!Number.isNaN(paid) && paid > 0) return paid;
    if (payment.status === 'Paid') return Number(payment.amount || 0);
    return 0;
  }
  return payment.status === 'Paid' ? Number(payment.amount || 0) : 0;
}

/**
 * Helper to compute the unpaid balance due on a payment record.
 * Never returns negative values; returns 0 for paid invoices.
 */
export function getOutstandingPaymentAmount(payment?: ClassifiablePaymentLike | null): number {
  if (!payment || payment.status === 'Paid') return 0;
  if (payment.balanceDue !== undefined && payment.balanceDue !== null) {
    const bal = Number(payment.balanceDue);
    if (!Number.isNaN(bal) && bal >= 0) return bal;
  }
  const total = Number(payment.amount || 0);
  const paid = Number(payment.amountPaid || 0);
  return Math.max(0, total - paid);
}

export interface TenantFinancialLike {
  id?: string;
  name?: string;
  unitNumber?: string;
  propertyName?: string;
  status?: string;
  monthlyRent?: number;
  securityDeposit?: number;
  depositStatus?: 'Held' | 'Returned' | 'Partially Returned' | 'Forfeited' | 'Not Paid' | string;
  depositReturnedAmount?: number;
  depositDeductionAmount?: number;
  depositDeductionReason?: string;
  rentBalance?: number;
}

export interface ExpenseFinancialLike {
  id?: string;
  propertyId?: string;
  propertyName?: string;
  category?: string;
  amount?: number;
  date?: string;
  rawDate?: string;
}

export interface PropertyFinancialLike {
  id: string;
  name: string;
  codePrefix?: string;
}

export interface PropertyFinancialStatement {
  propertyId: string;
  propertyName: string;
  codePrefix: string;
  rentCollected: number;
  otherIncome: number;
  otherIncomeFromPayments: number;
  depositDeductions: number;
  totalRevenue: number;
  depositsHeld: number;
  depositsReceived: number;
  depositsRefunded: number;
  depositsHeldCount: number;
  totalMoneyReceived: number;
  outstandingRent: number;
  expenses: number;
  netOperatingIncome: number;
}

export interface PortfolioFinancialSummary {
  /** Earned rental revenue collected from rent payments only */
  rentCollected: number;
  /** Direct 'Other Income' payment receipts (late fees, service charges, utilities, etc.) */
  otherIncomeFromPayments: number;
  /** Retained security deposit deductions & forfeited deposits transferred from liability to revenue */
  depositDeductions: number;
  /** Total Other Income = otherIncomeFromPayments + depositDeductions */
  otherIncome: number;
  /** Total Earned Revenue = rentCollected + otherIncome (strictly excludes Deposits Held) */
  totalRevenue: number;
  /** Current active security deposit liability held in escrow (Gross Deposits Received - Refunded - Deducted) */
  depositsHeld: number;
  /** Total gross security deposits collected from tenants */
  depositsReceived: number;
  /** Total security deposits refunded to tenants upon move-out (reduces deposit liability, NOT revenue) */
  depositsRefunded: number;
  /** Number of tenants with currently held security deposits */
  depositsHeldCount: number;
  /** Total actual incoming cash received = rentCollected + otherIncomeFromPayments + depositsReceived */
  totalMoneyReceived: number;
  /** Total unpaid rent across pending and overdue rent invoices (excludes security deposits) */
  outstandingRent: number;
  /** Pending rent amount (not yet overdue) */
  pendingRentAmount: number;
  /** Overdue rent amount */
  overdueRentAmount: number;
  /** Count of paid rent invoices */
  paidRentInvoicesCount: number;
  /** Count of pending rent invoices */
  pendingRentInvoicesCount: number;
  /** Count of overdue rent invoices */
  overdueRentInvoicesCount: number;
  /** Total operating expenses */
  totalExpenses: number;
  /** Net Operating Income (NOI) = totalRevenue - totalExpenses */
  netOperatingIncome: number;
  /** Per-property financial breakdown */
  propertyFinancials: PropertyFinancialStatement[];
}

/**
 * Single-source-of-truth accounting engine for the entire RMS portfolio and per-property statements.
 *
 * Accounting Rules Enforced:
 * 1. Total Revenue = Rent Collected + Other Income (earned income only).
 * 2. Tenant security deposits are tracked as a Liability (Deposits Held), NOT revenue.
 * 3. Total Money Received = all actual incoming payments (Rent Collected + Other Income Payments + Gross Deposits Received).
 * 4. Refunded deposits reduce the Deposit Liability (Deposits Held), NEVER rental revenue.
 * 5. Deposit deductions / forfeitures reduce the Deposit Liability and are transferred to Other Income (and thus Total Revenue).
 * 6. Outstanding Rent includes only unpaid rental invoices (pending + overdue), never deposits.
 */
export function computePortfolioFinancialSummary(
  tenants: TenantFinancialLike[] = [],
  payments: ClassifiablePaymentLike[] = [],
  expenses: ExpenseFinancialLike[] = [],
  properties: PropertyFinancialLike[] = []
): PortfolioFinancialSummary {
  const normalizePropKey = (name?: string | null) => String(name || '').trim().toLowerCase();

  // Map property lookup by name and id
  const propMapByName = new Map<string, PropertyFinancialLike>();
  const propMapById = new Map<string, PropertyFinancialLike>();
  for (const p of properties) {
    if (p && p.name) {
      propMapByName.set(normalizePropKey(p.name), p);
    }
    if (p && p.id) {
      propMapById.set(String(p.id), p);
    }
  }

  // Group payments by classification
  let rentCollected = 0;
  let otherIncomeFromPayments = 0;
  let pendingRentAmount = 0;
  let overdueRentAmount = 0;
  let paidRentInvoicesCount = 0;
  let pendingRentInvoicesCount = 0;
  let overdueRentInvoicesCount = 0;

  // Track deposit payments per tenant ID or tenant name+unit so we don't double count against tenant.securityDeposit
  const depositPaymentsByTenantKey = new Map<string, { amount: number; propertyName: string }>();
  let orphanDepositPaymentsTotal = 0;
  const orphanDepositByProp = new Map<string, number>();

  // Per-property accumulators
  const propStats = new Map<
    string,
    {
      propertyId: string;
      propertyName: string;
      codePrefix: string;
      rentCollected: number;
      otherIncomeFromPayments: number;
      depositDeductions: number;
      depositsHeld: number;
      depositsReceived: number;
      depositsRefunded: number;
      depositsHeldCount: number;
      outstandingRent: number;
      expenses: number;
    }
  >();

  const ensurePropBucket = (rawPropName?: string | null, rawPropId?: string | null) => {
    const matched: PropertyFinancialLike | undefined =
      (rawPropId ? propMapById.get(String(rawPropId)) : undefined) ||
      (rawPropName ? propMapByName.get(normalizePropKey(rawPropName)) : undefined);

    const key = matched
      ? normalizePropKey(matched.name)
      : normalizePropKey(rawPropName) || 'unassigned';

    if (!propStats.has(key)) {
      const displayName = matched?.name || (rawPropName ? String(rawPropName).trim() : 'General Portfolio');
      const prefix =
        matched?.codePrefix ||
        displayName
          .replace(/[^A-Za-z]/g, '')
          .slice(0, 3)
          .toUpperCase() ||
        'PRP';
      propStats.set(key, {
        propertyId: matched?.id || key,
        propertyName: displayName,
        codePrefix: prefix,
        rentCollected: 0,
        otherIncomeFromPayments: 0,
        depositDeductions: 0,
        depositsHeld: 0,
        depositsReceived: 0,
        depositsRefunded: 0,
        depositsHeldCount: 0,
        outstandingRent: 0,
        expenses: 0,
      });
    }
    return propStats.get(key)!;
  };

  // Seed all known properties first so property-level statements always list every property
  for (const p of properties) {
    ensurePropBucket(p.name, p.id);
  }

  // Index tenants by ID and by (name + unit)
  const tenantById = new Map<string, TenantFinancialLike>();
  const tenantByNameUnit = new Map<string, TenantFinancialLike>();
  for (const t of tenants) {
    if (t.id) tenantById.set(String(t.id), t);
    const nk = `${String(t.name || '').trim().toLowerCase()}::${String(t.unitNumber || '').trim().toLowerCase()}`;
    tenantByNameUnit.set(nk, t);
  }

  for (const p of payments) {
    const txType = classifyPaymentTransaction(p);
    const collected = getCollectedPaymentAmount(p);
    const outstanding = getOutstandingPaymentAmount(p);
    const bucket = ensurePropBucket(p.propertyName);

    if (txType === 'Rent') {
      rentCollected += collected;
      bucket.rentCollected += collected;

      if (p.status === 'Paid') {
        paidRentInvoicesCount += 1;
      } else if (p.status === 'Overdue') {
        overdueRentInvoicesCount += 1;
        overdueRentAmount += outstanding;
        bucket.outstandingRent += outstanding;
      } else if (p.status === 'Pending') {
        pendingRentInvoicesCount += 1;
        pendingRentAmount += outstanding;
        bucket.outstandingRent += outstanding;
      }
    } else if (txType === 'Other Income') {
      otherIncomeFromPayments += collected;
      bucket.otherIncomeFromPayments += collected;
    } else if (txType === 'Security Deposit') {
      if (collected > 0) {
        const matchedTenant =
          (p.tenantId && tenantById.get(String(p.tenantId))) ||
          tenantByNameUnit.get(
            `${String(p.tenantName || '').trim().toLowerCase()}::${String(p.unitNumber || '').trim().toLowerCase()}`
          );
        if (matchedTenant && matchedTenant.id) {
          const tKey = String(matchedTenant.id);
          const prev = depositPaymentsByTenantKey.get(tKey);
          depositPaymentsByTenantKey.set(tKey, {
            amount: (prev?.amount || 0) + collected,
            propertyName: matchedTenant.propertyName || p.propertyName || '',
          });
        } else {
          orphanDepositPaymentsTotal += collected;
          const pk = normalizePropKey(p.propertyName) || 'unassigned';
          orphanDepositByProp.set(pk, (orphanDepositByProp.get(pk) || 0) + collected);
        }
      }
    }
  }

  // Now evaluate every tenant's Security Deposit lifecycle (Liability vs Refunded vs Deducted/Forfeited)
  let depositsHeld = 0;
  let depositsReceived = 0;
  let depositsRefunded = 0;
  let depositDeductions = 0;
  let depositsHeldCount = 0;

  const processedTenantIds = new Set<string>();

  for (const t of tenants) {
    const tId = String(t.id || '');
    if (tId) processedTenantIds.add(tId);

    const txDep = tId ? depositPaymentsByTenantKey.get(tId)?.amount || 0 : 0;
    const rawSecDep = Number(t.securityDeposit || 0);
    const depStatus = String(t.depositStatus || (rawSecDep > 0 ? 'Held' : 'Not Paid')).trim();

    // If deposit was never paid and there are no paid deposit receipts for this tenant, skip
    if (depStatus === 'Not Paid' && txDep === 0) {
      continue;
    }

    const grossTenantDeposit = Math.max(rawSecDep, txDep);
    if (grossTenantDeposit <= 0 && Number(t.depositReturnedAmount || 0) <= 0 && Number(t.depositDeductionAmount || 0) <= 0) {
      continue;
    }

    const bucket = ensurePropBucket(t.propertyName);

    let tenantRefunded = 0;
    let tenantDeducted = 0;
    let tenantHeld = 0;

    if (depStatus === 'Returned') {
      tenantDeducted = Math.max(0, Number(t.depositDeductionAmount || 0));
      tenantRefunded =
        Number(t.depositReturnedAmount || 0) > 0
          ? Number(t.depositReturnedAmount)
          : Math.max(0, grossTenantDeposit - tenantDeducted);
      tenantHeld = 0;
    } else if (depStatus === 'Partially Returned') {
      tenantRefunded = Math.max(0, Number(t.depositReturnedAmount || 0));
      tenantDeducted =
        Number(t.depositDeductionAmount || 0) > 0
          ? Number(t.depositDeductionAmount)
          : Math.max(0, grossTenantDeposit - tenantRefunded);
      tenantHeld = 0;
    } else if (depStatus === 'Forfeited') {
      tenantRefunded = 0;
      tenantDeducted =
        Number(t.depositDeductionAmount || 0) > 0
          ? Number(t.depositDeductionAmount)
          : grossTenantDeposit;
      tenantHeld = 0;
    } else {
      // 'Held' (active deposit liability)
      tenantDeducted = Math.max(0, Number(t.depositDeductionAmount || 0));
      tenantRefunded = Math.max(0, Number(t.depositReturnedAmount || 0));
      tenantHeld = Math.max(0, grossTenantDeposit - tenantRefunded - tenantDeducted);
      if (tenantHeld > 0) {
        depositsHeldCount += 1;
        bucket.depositsHeldCount += 1;
      }
    }

    const effectiveGross = Math.max(grossTenantDeposit, tenantHeld + tenantRefunded + tenantDeducted);

    depositsReceived += effectiveGross;
    depositsHeld += tenantHeld;
    depositsRefunded += tenantRefunded;
    depositDeductions += tenantDeducted;

    bucket.depositsReceived += effectiveGross;
    bucket.depositsHeld += tenantHeld;
    bucket.depositsRefunded += tenantRefunded;
    bucket.depositDeductions += tenantDeducted;
  }

  // Add any orphan deposit payments not linked to a tenant record
  if (orphanDepositPaymentsTotal > 0) {
    depositsReceived += orphanDepositPaymentsTotal;
    depositsHeld += orphanDepositPaymentsTotal;
    for (const [pk, amt] of orphanDepositByProp.entries()) {
      const bucket = propStats.get(pk) || ensurePropBucket(pk);
      bucket.depositsReceived += amt;
      bucket.depositsHeld += amt;
    }
  }

  // Fallback check: if there are active tenants with rentBalance > 0 that didn't have pending/overdue invoice rows
  const totalInvoiceOutstanding = pendingRentAmount + overdueRentAmount;
  const tenantBalanceOutstanding = tenants
    .filter((t) => t.status !== 'Past')
    .reduce((sum, t) => sum + Math.max(0, Number(t.rentBalance || 0)), 0);

  const outstandingRent = Math.max(totalInvoiceOutstanding, tenantBalanceOutstanding);

  // Sum operating expenses
  let totalExpenses = 0;
  for (const e of expenses) {
    const amt = Number(e.amount || 0);
    if (amt > 0) {
      totalExpenses += amt;
      const bucket = ensurePropBucket(e.propertyName, e.propertyId);
      bucket.expenses += amt;
    }
  }

  const otherIncome = otherIncomeFromPayments + depositDeductions;
  const totalRevenue = rentCollected + otherIncome;
  const totalMoneyReceived = rentCollected + otherIncomeFromPayments + depositsReceived;
  const netOperatingIncome = totalRevenue - totalExpenses;

  const propertyFinancials: PropertyFinancialStatement[] = Array.from(propStats.values())
    .filter(
      (b) =>
        properties.some((p) => normalizePropKey(p.name) === normalizePropKey(b.propertyName)) ||
        b.rentCollected > 0 ||
        b.otherIncomeFromPayments > 0 ||
        b.depositDeductions > 0 ||
        b.depositsReceived > 0 ||
        b.outstandingRent > 0 ||
        b.expenses > 0
    )
    .map((b) => {
      const propOtherIncome = b.otherIncomeFromPayments + b.depositDeductions;
      const propTotalRevenue = b.rentCollected + propOtherIncome;
      const propTotalMoneyReceived = b.rentCollected + b.otherIncomeFromPayments + b.depositsReceived;
      return {
        propertyId: b.propertyId,
        propertyName: b.propertyName,
        codePrefix: b.codePrefix,
        rentCollected: b.rentCollected,
        otherIncome: propOtherIncome,
        otherIncomeFromPayments: b.otherIncomeFromPayments,
        depositDeductions: b.depositDeductions,
        totalRevenue: propTotalRevenue,
        depositsHeld: b.depositsHeld,
        depositsReceived: b.depositsReceived,
        depositsRefunded: b.depositsRefunded,
        depositsHeldCount: b.depositsHeldCount,
        totalMoneyReceived: propTotalMoneyReceived,
        outstandingRent: b.outstandingRent,
        expenses: b.expenses,
        netOperatingIncome: propTotalRevenue - b.expenses,
      };
    });

  return {
    rentCollected,
    otherIncomeFromPayments,
    depositDeductions,
    otherIncome,
    totalRevenue,
    depositsHeld,
    depositsReceived,
    depositsRefunded,
    depositsHeldCount,
    totalMoneyReceived,
    outstandingRent,
    pendingRentAmount,
    overdueRentAmount,
    paidRentInvoicesCount,
    pendingRentInvoicesCount,
    overdueRentInvoicesCount,
    totalExpenses,
    netOperatingIncome,
    propertyFinancials,
  };
}
