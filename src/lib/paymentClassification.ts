/**
 * Payment & Transaction Classification Helpers
 *
 * Ensures Security Deposit transactions are clearly classified and labelled
 * as "Security Deposit" (never "Lease"), keeps Rent payments labelled "Rent",
 * and separates deposits from monthly rent invoices, balances, and analytics
 * without modifying or deleting existing database records, receipt IDs, dates,
 * references, or amounts.
 */

export type TransactionType = 'Rent' | 'Security Deposit';

export interface ClassifiablePaymentLike {
  transactionType?: string | null;
  transaction_type?: string | null;
  paymentNote?: string | null;
  payment_note?: string | null;
  paymentId?: string | null;
  payment_code?: string | null;
  description?: string | null;
  title?: string | null;
  category?: string | null;
}

const DEPOSIT_EXPLICIT_REGEX =
  /\b(security\s*deposit|damage\s*deposit|caution\s*(fee|deposit)|refundable\s*deposit|deposit)\b/i;

const LEASE_AS_DEPOSIT_REGEX =
  /\blease(\s+(deposit|security|payment|fee|charge|bond|hold|amount))?\b/i;

const RENT_KEYWORD_REGEX = /\b(rent|rental|arrears|monthly\s*rent|installment)\b/i;

/**
 * Classifies a payment/transaction record into 'Security Deposit' or 'Rent'.
 * Preserves existing IDs, codes, dates, and amounts while accurately
 * detecting both explicit deposit records and legacy records where "Lease"
 * was used to label a security deposit transaction.
 */
export function classifyPaymentTransaction(
  payment?: ClassifiablePaymentLike | null
): TransactionType {
  if (!payment) return 'Rent';

  const explicitType = String(
    payment.transactionType || payment.transaction_type || ''
  )
    .trim()
    .toLowerCase();

  if (
    explicitType === 'security deposit' ||
    explicitType === 'deposit' ||
    explicitType === 'security_deposit'
  ) {
    return 'Security Deposit';
  }
  if (explicitType === 'rent' || explicitType === 'monthly rent') {
    return 'Rent';
  }

  const noteText = String(
    payment.paymentNote ||
      payment.payment_note ||
      payment.description ||
      payment.title ||
      ''
  ).trim();
  const codeText = String(
    payment.paymentId || payment.payment_code || ''
  ).trim();
  const categoryText = String(payment.category || '').trim();

  // Explicit deposit terminology in note, code prefix (DEP-/SEC-), or category
  if (
    DEPOSIT_EXPLICIT_REGEX.test(noteText) ||
    DEPOSIT_EXPLICIT_REGEX.test(categoryText) ||
    /^(DEP|SEC)[-_]/i.test(codeText)
  ) {
    return 'Security Deposit';
  }

  // Legacy mislabelling: note says "Lease", "Lease Payment", "Lease Fee",
  // "Lease Charge", "Lease Bond", etc., WITHOUT referring to Rent
  // (e.g., legacy fallback "Lease Rent Invoice" IS Rent, not Deposit).
  if (
    noteText &&
    LEASE_AS_DEPOSIT_REGEX.test(noteText) &&
    !RENT_KEYWORD_REGEX.test(noteText)
  ) {
    return 'Security Deposit';
  }

  return 'Rent';
}

export function isDepositTransaction(
  payment?: ClassifiablePaymentLike | null
): boolean {
  return classifyPaymentTransaction(payment) === 'Security Deposit';
}

export function isRentTransaction(
  payment?: ClassifiablePaymentLike | null
): boolean {
  return classifyPaymentTransaction(payment) === 'Rent';
}

/**
 * Returns a clean, user-facing payment note / description for display
 * without mutating stored database history, receipt IDs, dates, or amounts.
 * Replaces mislabelled "Lease" deposit notes with "Security Deposit"
 * and keeps rent transactions labelled "Rent" / "Monthly Rent".
 */
export function formatTransactionDisplayNote(
  payment?: ClassifiablePaymentLike | null
): string {
  const txType = classifyPaymentTransaction(payment);
  const rawNote = String(
    payment?.paymentNote || payment?.payment_note || ''
  ).trim();

  if (txType === 'Security Deposit') {
    if (!rawNote) return 'Security Deposit';
    if (
      /^(lease(\s+(deposit|security|payment|fee|charge|bond|hold|amount|agreement))?|deposit|security)$/i.test(
        rawNote
      )
    ) {
      return 'Security Deposit';
    }
    const cleaned = rawNote
      .replace(
        /\blease\s+(security\s+)?deposit\b/gi,
        'Security Deposit'
      )
      .replace(
        /\blease(\s+(security|payment|fee|charge|bond|hold|amount))?\b/gi,
        'Security Deposit'
      )
      .replace(/\b(security\s+deposit\s*){2,}/gi, 'Security Deposit ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!DEPOSIT_EXPLICIT_REGEX.test(cleaned)) {
      return `Security Deposit • ${cleaned}`;
    }
    return cleaned.replace(/\bdeposit\b/i, (m) =>
      cleaned.toLowerCase().includes('security deposit') ? m : 'Security Deposit'
    );
  }

  // Rent transaction
  if (!rawNote) return 'Rent Payment';
  if (/^lease\s+rent\s+invoice$/i.test(rawNote)) {
    return 'Monthly Rent';
  }
  return rawNote;
}

/**
 * Normalizes a new payment note when creating a transaction so new
 * deposit entries are always saved as "Security Deposit" (never "Lease")
 * and rent entries remain clearly labelled as Rent.
 */
export function normalizeNewPaymentNote(
  transactionType: TransactionType,
  rawNote?: string | null,
  periodLabel?: string | null
): string {
  const cleanNote = String(rawNote || '').trim();
  if (transactionType === 'Security Deposit') {
    const sanitized = cleanNote
      .replace(/\blease\s*(deposit|security|payment|fee|charge)?\b/gi, 'Security Deposit')
      .replace(/\b(security\s+deposit\s*){2,}/gi, 'Security Deposit ')
      .trim();
    if (!sanitized || /^rent\s*payment$/i.test(sanitized)) {
      return 'Security Deposit';
    }
    if (!DEPOSIT_EXPLICIT_REGEX.test(sanitized)) {
      return `Security Deposit • ${sanitized}`;
    }
    return sanitized;
  }

  // Rent
  if (!cleanNote || /^lease\s+rent\s+invoice$/i.test(cleanNote)) {
    return periodLabel || 'Rent Payment';
  }
  if (periodLabel && !cleanNote.includes(' - ')) {
    return `${cleanNote} (${periodLabel})`;
  }
  return cleanNote;
}
