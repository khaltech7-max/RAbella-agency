import {
  RentPaymentRecord,
  TenantProfile,
  SystemSettingsRecord,
  UserAppearancePreferences,
  PayHeroPaybillMapping,
  PayHeroTransactionRecord,
} from '../data/rentalData';
import { buildDesignedInvoicePdfBytes } from './pdfInvoiceBuilder';
import {
  resolveInvoiceFontStack,
  resolveInvoiceThemePalette,
} from './invoiceTheme';
import {
  computeInvoiceFinancials,
  extractBillingPeriodFromPayment,
  formatYmdShort,
  getNairobiTodayYmd,
  parseBillingDateToYmd,
} from './anniversaryBilling';

import {
  classifyPaymentTransaction,
  formatTransactionDisplayNote,
  isDepositTransaction,
} from './paymentClassification';

export interface InvoiceLineItem {
  description: string;
  qty: number;
  price: number;
  total: number;
}

export interface LedgerHistoryEntry {
  code: string;
  period: string;
  description: string;
  type?: 'Rent' | 'Security Deposit' | 'Other Income';
  billed: number;
  paid: number;
  balance: number;
  status: string;
}

export interface SystemInvoiceBranding {
  companyName: string;
  companySubtitle: string;
  companyLogoUrl: string;
  showCompanyLogo: boolean;
  bankName: string;
  paybillNumber: string;
  website: string;
  supportPhone: string;
  supportEmail: string;
  businessAddress: string;
  accentTheme: string;
  fontFamily: string;
  primaryColor: string;
  forestColor: string;
  accentColor: string;
  mintColor: string;
  canvasStart: string;
  canvasMid: string;
  canvasEnd: string;
  footerNote?: string;
}

const BRANDING_CACHE_KEY = 'rms_system_invoice_branding_v1';

let cachedBranding: SystemInvoiceBranding = {
  companyName: 'ARabella agency',
  companySubtitle: 'Smart Property Management',
  companyLogoUrl: '',
  showCompanyLogo: true,
  bankName: 'ARabella agency Trust Account',
  paybillNumber: '400200',
  website: 'www.arabella-agency.co.ke',
  supportPhone: '+254 712 345 678',
  supportEmail: 'billing@arabella.co.ke',
  businessAddress: 'Westlands, Nairobi, Kenya',
  accentTheme: 'lime',
  fontFamily: 'Plus Jakarta Sans',
  primaryColor: '#17231E',
  forestColor: '#145338',
  accentColor: '#D5F267',
  mintColor: '#D8F3E5',
  canvasStart: '#FFFFFF',
  canvasMid: '#FFFFFF',
  canvasEnd: '#F8FAF9',
};

export function setSystemBrandingForInvoices(
  sys?: SystemSettingsRecord | null,
  prefs?: UserAppearancePreferences | null
): void {
  const accentTheme =
    prefs?.accentTheme ||
    (typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-accent-theme') || 'lime'
      : 'lime');
  const fontFamily =
    prefs?.fontFamily ||
    sys?.appearanceDefaults?.fontFamily ||
    cachedBranding.fontFamily ||
    'Plus Jakarta Sans';
  const palette = resolveInvoiceThemePalette(accentTheme);

  cachedBranding = {
    companyName: sys?.general?.companyName || cachedBranding.companyName || 'ARabella agency',
    companySubtitle:
      sys?.general?.companyTagline || cachedBranding.companySubtitle || 'Smart Property Management',
    companyLogoUrl: sys?.general?.companyLogoUrl || '',
    showCompanyLogo:
      sys?.invoice?.showCompanyLogoOnReceipt !== undefined
        ? Boolean(sys.invoice.showCompanyLogoOnReceipt)
        : true,
    bankName: `${sys?.general?.companyName || 'ARabella agency'} Trust Account`,
    paybillNumber: sys?.payment?.defaultPaybillNumber || '400200',
    website: 'www.arabella-agency.co.ke',
    supportPhone: sys?.general?.businessPhone || '+254 712 345 678',
    supportEmail: sys?.general?.businessEmail || 'billing@arabella.co.ke',
    businessAddress: sys?.general?.businessAddress || 'Westlands, Nairobi, Kenya',
    accentTheme: palette.accentTheme,
    fontFamily,
    primaryColor: palette.primaryText,
    forestColor: palette.titleColor,
    accentColor: palette.barBg,
    mintColor: palette.softBg,
    canvasStart: '#FFFFFF',
    canvasMid: '#FFFFFF',
    canvasEnd: palette.softBg,
    footerNote: sys?.invoice?.receiptFooterNote || undefined,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(cachedBranding));
    } catch {}
  }
}

export function getSystemBrandingForInvoices(): SystemInvoiceBranding {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SystemInvoiceBranding>;
        cachedBranding = { ...cachedBranding, ...parsed };
      }
      const root = document.documentElement;
      const domAccentTheme = root.getAttribute('data-accent-theme');
      const domFontVar =
        root.style.getPropertyValue('--rms-font-family') ||
        getComputedStyle(root).getPropertyValue('--rms-font-family');
      if (domAccentTheme) {
        cachedBranding.accentTheme = domAccentTheme;
      }
      if (domFontVar) {
        const cleanFont = domFontVar.replace(/['"]/g, '').split(',')[0].trim();
        if (cleanFont) cachedBranding.fontFamily = cleanFont;
      }
      const palette = resolveInvoiceThemePalette(cachedBranding.accentTheme);
      cachedBranding.primaryColor = palette.primaryText;
      cachedBranding.forestColor = palette.titleColor;
      cachedBranding.accentColor = palette.barBg;
      cachedBranding.mintColor = palette.softBg;
    } catch {}
  }
  return cachedBranding;
}

const PAYHERO_CONTEXT_CACHE_KEY = 'rms_payhero_invoice_context_v1';
let cachedPayHeroPaybills: PayHeroPaybillMapping[] = [];
let cachedPayHeroTransactions: PayHeroTransactionRecord[] = [];

export function setPayHeroInvoiceContext(
  paybills?: PayHeroPaybillMapping[] | null,
  transactions?: PayHeroTransactionRecord[] | null
): void {
  if (Array.isArray(paybills)) {
    cachedPayHeroPaybills = paybills;
  }
  if (Array.isArray(transactions)) {
    cachedPayHeroTransactions = transactions;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        PAYHERO_CONTEXT_CACHE_KEY,
        JSON.stringify({
          paybills: cachedPayHeroPaybills,
          transactions: cachedPayHeroTransactions.slice(0, 100),
        })
      );
    } catch {}
  }
}

function getCachedPayHeroContext(): {
  paybills: PayHeroPaybillMapping[];
  transactions: PayHeroTransactionRecord[];
} {
  if (cachedPayHeroPaybills.length === 0 && cachedPayHeroTransactions.length === 0 && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(PAYHERO_CONTEXT_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.paybills)) cachedPayHeroPaybills = parsed.paybills;
        if (Array.isArray(parsed?.transactions)) cachedPayHeroTransactions = parsed.transactions;
      }
    } catch {}
  }
  return {
    paybills: cachedPayHeroPaybills,
    transactions: cachedPayHeroTransactions,
  };
}

export interface InvoiceDocumentData {
  transactionType?: 'Rent' | 'Security Deposit' | 'Other Income';
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  monthlyRent: number;
  status: 'Paid' | 'Pending' | 'Overdue' | string;
  tenantName: string;
  tenantRef: string;
  tenantEmail?: string;
  tenantPhone?: string;
  propertyName: string;
  unitNumber: string;
  unitType?: string;
  leaseTerm?: string;
  companyName: string;
  companySubtitle: string;
  companyLogoUrl?: string;
  showCompanyLogo?: boolean;
  businessAddress?: string;
  accentTheme?: string;
  fontFamily?: string;
  bankName: string;
  bankAccount: string;
  paybillNumber: string;
  website: string;
  supportPhone: string;
  supportEmail: string;
  notes: string;
  primaryColor: string;
  forestColor: string;
  accentColor: string;
  mintColor: string;
  items: InvoiceLineItem[];
  subTotal: number;
  taxRatePercent?: number;
  taxAmount?: number;
  amountPaid: number;
  grandTotal: number;
  balanceDue: number;
  ledgerEntries: LedgerHistoryEntry[];
}

export function buildInvoiceDataFromPayment(
  inv: RentPaymentRecord,
  indexOrCode?: number | string,
  allPayments: RentPaymentRecord[] = [],
  tenantProfile?: TenantProfile
): InvoiceDocumentData {
  const brand = getSystemBrandingForInvoices();
  const palette = resolveInvoiceThemePalette(brand.accentTheme);
  const currentYear = new Date().getFullYear();
  const invoiceNumber =
    typeof indexOrCode === 'string' && indexOrCode.trim()
      ? indexOrCode.trim()
      : typeof indexOrCode === 'number'
      ? `INV-${currentYear}-${String(indexOrCode + 1).padStart(3, '0')}`
      : inv.paymentId || `INV-${currentYear}-001`;

  const txType = classifyPaymentTransaction(inv);
  const isDeposit = txType === 'Security Deposit';
  const rawAmount = Number(inv.amount || tenantProfile?.monthlyRent || 0);
  const monthlyRent = isDeposit ? rawAmount : Number(tenantProfile?.monthlyRent || inv.amount || 0);
  const moveInAnchor = tenantProfile?.moveInDate || tenantProfile?.leaseStart || inv.billingPeriodStart || inv.dueDate;
  const resolvedPeriod = extractBillingPeriodFromPayment(inv, moveInAnchor);

  const periodStartYmd = resolvedPeriod?.periodStart || parseBillingDateToYmd(inv.dueDate) || getNairobiTodayYmd();
  const periodEndYmd = resolvedPeriod?.periodEnd || periodStartYmd;
  const dueYmd = parseBillingDateToYmd(inv.dueDate) || periodStartYmd;
  const invoiceDateYmd =
    parseBillingDateToYmd(inv.invoiceDate) ||
    parseBillingDateToYmd(inv.createdAt) ||
    periodStartYmd ||
    getNairobiTodayYmd();

  const billingPeriodStartLabel = formatYmdShort(periodStartYmd);
  const billingPeriodEndLabel = formatYmdShort(periodEndYmd);
  const dueDateLabel = formatYmdShort(dueYmd);
  const issueDateLabel = formatYmdShort(invoiceDateYmd);

  const financials = computeInvoiceFinancials({
    amountDue: rawAmount,
    amountPaid: inv.amountPaid,
    amount: rawAmount,
    monthlyRent,
    dueDate: dueYmd,
    storedStatus: inv.status,
  });

  const cleanRef = String(inv.tenantRef || tenantProfile?.tenantRef || 'A-001')
    .trim()
    .toUpperCase();

  // Keep Deposit transactions strictly separate from Monthly Rent invoices in ledger history
  const tenantPayments = allPayments.filter(
    (p) =>
      String(p.tenantRef || '').trim().toUpperCase() === cleanRef &&
      (isDeposit ? isDepositTransaction(p) : !isDepositTransaction(p))
  );

  const sourceList = tenantPayments.length > 0 ? tenantPayments : [inv];

  let runningBalance = 0;
  const ledgerEntries: LedgerHistoryEntry[] = sourceList.map((p, idx) => {
    const pIsDeposit = isDepositTransaction(p);
    const pPeriod = pIsDeposit ? null : extractBillingPeriodFromPayment(p, moveInAnchor);
    const pFin = computeInvoiceFinancials({
      amountDue: p.amount,
      amountPaid: p.amountPaid,
      monthlyRent: pIsDeposit ? p.amount : monthlyRent,
      dueDate: p.dueDate,
      storedStatus: p.status,
    });
    runningBalance += pFin.outstandingBalance;
    return {
      code: p.paymentId || `${pIsDeposit ? 'DEP' : 'INV'}-${String(idx + 1).padStart(3, '0')}`,
      period: pPeriod
        ? `${formatYmdShort(pPeriod.periodStart)} – ${formatYmdShort(pPeriod.periodEnd)}`
        : formatYmdShort(p.paidDate && p.paidDate !== '-' ? p.paidDate : p.dueDate),
      description: `${formatTransactionDisplayNote(p)} — ${p.property} (${p.unitNumber})`,
      type: classifyPaymentTransaction(p),
      billed: pFin.amountDue,
      paid: pFin.amountPaid,
      balance: runningBalance,
      status: pFin.status,
    };
  });

  const items: InvoiceLineItem[] = [
    {
      description: isDeposit
        ? `${formatTransactionDisplayNote(inv)} — ${inv.property} (${inv.unitNumber})`
        : `Monthly Rent (${billingPeriodStartLabel} – ${billingPeriodEndLabel}) — ${inv.property} (${inv.unitNumber})`,
      qty: 1,
      price: rawAmount,
      total: rawAmount,
    },
  ];

  const subTotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRatePercent = 0;
  const taxAmount = 0;
  const amountPaid = financials.amountPaid;
  const grandTotal = financials.outstandingBalance;

  const payheroCtx = getCachedPayHeroContext();
  const propNameLower = String(inv.property || tenantProfile?.property || '').trim().toLowerCase();
  const matchedPaybill =
    payheroCtx.paybills.find(
      (pb) =>
        pb.status !== 'Inactive' &&
        ((tenantProfile?.propertyId && pb.propertyId === tenantProfile.propertyId) ||
          (propNameLower && String(pb.propertyName || '').trim().toLowerCase() === propNameLower))
    ) ||
    payheroCtx.paybills.find((pb) => pb.status !== 'Inactive' && pb.isDefault) ||
    payheroCtx.paybills.find((pb) => pb.status !== 'Inactive');

  const resolvedPaybillNumber = matchedPaybill?.paybillNumber || brand.paybillNumber;
  const resolvedBankName = matchedPaybill?.paybillName
    ? `${matchedPaybill.paybillName} (${brand.companyName})`
    : brand.bankName;

  const defaultNotes = isDeposit
    ? brand.footerNote ||
      `Security Deposit receipt for ${inv.property} (${inv.unitNumber}), Account Ref ${cleanRef}. Deposit funds are held separately from monthly rent billing.`
    : brand.footerNote ||
      `Billing period: ${billingPeriodStartLabel} to ${billingPeriodEndLabel}. Payment is due on your monthly move-in anniversary (${dueDateLabel}). Kindly quote Account Ref ${cleanRef} on all M-Pesa PayBill (${resolvedPaybillNumber}) or Bank payments.`;

  return {
    transactionType: txType,
    invoiceNumber,
    issueDate: issueDateLabel,
    dueDate: dueDateLabel,
    billingPeriodStart: billingPeriodStartLabel,
    billingPeriodEnd: billingPeriodEndLabel,
    monthlyRent: financials.monthlyRent,
    status: financials.status,
    tenantName: inv.tenantName || tenantProfile?.name || 'Resident',
    tenantRef: cleanRef,
    tenantEmail: tenantProfile?.email,
    tenantPhone: tenantProfile?.phone,
    propertyName: inv.property || tenantProfile?.property || 'Managed Property',
    unitNumber: inv.unitNumber || tenantProfile?.unitNumber || 'Unit 101',
    unitType: inv.unitType || tenantProfile?.unitType || 'Apartment',
    leaseTerm: inv.leaseTerm || '12 Months',
    companyName: brand.companyName,
    companySubtitle: brand.companySubtitle,
    companyLogoUrl: brand.companyLogoUrl,
    showCompanyLogo: brand.showCompanyLogo,
    businessAddress: brand.businessAddress,
    accentTheme: palette.accentTheme,
    fontFamily: brand.fontFamily,
    bankName: resolvedBankName,
    bankAccount: `M-Pesa PayBill ${resolvedPaybillNumber} • Account: ${cleanRef}`,
    paybillNumber: resolvedPaybillNumber,
    website: brand.website,
    supportPhone: brand.supportPhone,
    supportEmail: brand.supportEmail,
    notes: defaultNotes,
    primaryColor: palette.primaryText,
    forestColor: palette.titleColor,
    accentColor: palette.barBg,
    mintColor: palette.softBg,
    items,
    subTotal,
    taxRatePercent,
    taxAmount,
    amountPaid,
    grandTotal,
    balanceDue: grandTotal,
    ledgerEntries,
  };
}

/**
 * Clean inline Brand Logo + Website Name HTML header block styled to the active website theme.
 */
export function buildSystemLogoHtml(data: {
  companyName: string;
  companySubtitle: string;
  companyLogoUrl?: string;
  showCompanyLogo?: boolean;
  website?: string;
  accentTheme?: string;
}): string {
  const palette = resolveInvoiceThemePalette(data.accentTheme);
  const [b1, b2, b3] = palette.emblemBars;

  const customLogoImg =
    data.showCompanyLogo !== false && data.companyLogoUrl && data.companyLogoUrl.trim()
      ? `<img src="${data.companyLogoUrl}" alt="${data.companyName}" style="width: 34px; height: 34px; border-radius: 8px; object-fit: contain; border: 1px solid ${palette.ruleLineColor}; background: #FFFFFF; padding: 2px;" />`
      : `<div style="display: inline-flex; align-items: flex-end; gap: 3px; height: 22px;">
          <span style="display: inline-block; width: 4.5px; height: 13px; border-radius: 99px; background: ${b1};"></span>
          <span style="display: inline-block; width: 4.5px; height: 20px; border-radius: 99px; background: ${b2};"></span>
          <span style="display: inline-block; width: 4.5px; height: 16px; border-radius: 99px; background: ${b3};"></span>
        </div>`;

  return `
    <div style="display: inline-flex; align-items: center; gap: 10px;">
      ${customLogoImg}
      <div style="font-size: 13.5px; font-weight: 800; color: ${palette.sectionLabelColor}; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.15;">
        ${data.companyName || 'ARabella agency'}
      </div>
    </div>
  `;
}

/**
 * Generates a clean, minimalist white-paper printable HTML invoice matching the reference sheet layout,
 * using the user's logo, website name, active website accent theme, and active font family.
 */
export function generateStandaloneInvoiceHtml(
  data: InvoiceDocumentData,
  options?: { autoPrint?: boolean; includeLedger?: boolean }
): string {
  const includeLedger = options?.includeLedger !== false;
  const isDeposit = data.transactionType === 'Security Deposit';
  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;
  const palette = resolveInvoiceThemePalette(data.accentTheme);
  const fontStack = resolveInvoiceFontStack(data.fontFamily);

  const statusColor =
    data.status === 'Paid'
      ? { bg: '#D8F3E5', text: '#145338', label: 'Paid' }
      : data.status === 'Overdue'
      ? { bg: '#FEE2E2', text: '#991B1B', label: 'Overdue' }
      : { bg: palette.badgeBg, text: palette.badgeText, label: 'Pending' };

  const billedDisplayAmount = Number(data.monthlyRent || data.subTotal || 0);
  const blankRowsCount = Math.max(0, 4 - data.items.length);

  const itemsRowsHtml = [
    ...data.items.map(
      (item, idx) => `
      <tr>
        <td style="padding: 12px 14px; font-size: 13px; color: ${palette.mutedText}; font-weight: 600; border-bottom: 1px solid ${palette.ruleLineColor};">
          ${idx + 1}
        </td>
        <td style="padding: 12px 14px; font-size: 13px; color: ${palette.primaryText}; font-weight: 600; border-bottom: 1px solid ${palette.ruleLineColor};">
          ${item.description}
        </td>
        <td style="padding: 12px 14px; font-size: 13px; color: ${palette.primaryText}; text-align: right; font-weight: 500; border-bottom: 1px solid ${palette.ruleLineColor}; font-variant-numeric: tabular-nums;">
          ${fmt(item.price || data.monthlyRent)}
        </td>
        <td style="padding: 12px 14px; font-size: 13px; color: #145338; text-align: right; font-weight: 600; border-bottom: 1px solid ${palette.ruleLineColor}; font-variant-numeric: tabular-nums;">
          ${idx === 0 ? fmt(data.amountPaid) : fmt(0)}
        </td>
        <td style="padding: 12px 14px; font-size: 13px; color: ${palette.primaryText}; text-align: right; font-weight: 700; border-bottom: 1px solid ${palette.ruleLineColor}; font-variant-numeric: tabular-nums;">
          ${idx === 0 ? fmt(data.grandTotal) : fmt(item.total)}
        </td>
      </tr>
    `
    ),
    ...Array.from({ length: blankRowsCount }).map(
      () => `
      <tr>
        <td colspan="5" style="height: 36px; border-bottom: 1px solid ${palette.ruleLineColor};">&nbsp;</td>
      </tr>
    `
    ),
  ].join('');

  const totalLedgerBilled = data.ledgerEntries.reduce((s, e) => s + e.billed, 0);
  const totalLedgerPaid = data.ledgerEntries.reduce((s, e) => s + e.paid, 0);
  const totalLedgerBalance = Math.max(0, totalLedgerBilled - totalLedgerPaid);

  const ledgerSectionHtml =
    includeLedger && data.ledgerEntries.length > 0
      ? `
      <div style="margin-top: 32px; padding-top: 22px; border-top: 1px dashed ${palette.ruleLineColor};">
        <div style="margin-bottom: 10px;">
          <div style="font-size: 12px; font-weight: 800; color: ${palette.sectionLabelColor}; letter-spacing: 0.06em; text-transform: uppercase;">
            TENANT ACCOUNT LEDGER STATEMENT (${data.tenantRef})
          </div>
          <div style="font-size: 11.5px; color: ${palette.mutedText}; margin-top: 2px;">
            Billing &amp; payment history for ${data.tenantName} — ${data.propertyName} (${data.unitNumber})
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid ${palette.ruleLineColor};">
          <thead>
            <tr style="background: ${palette.barBg}; color: ${palette.barText}; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;">
              <th style="padding: 9px 12px;">Ref / Code</th>
              <th style="padding: 9px 10px;">Period</th>
              <th style="padding: 9px 10px;">Description</th>
              <th style="padding: 9px 10px; text-align: right;">Billed</th>
              <th style="padding: 9px 10px; text-align: right;">Paid</th>
              <th style="padding: 9px 10px; text-align: right;">Balance</th>
              <th style="padding: 9px 12px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.ledgerEntries
              .map(
                (entry) => `
              <tr style="border-bottom: 1px solid ${palette.ruleLineColor}; font-size: 12px; color: ${palette.primaryText};">
                <td style="padding: 9px 12px; font-weight: 700; font-family: monospace; color: ${palette.titleColor};">${entry.code}</td>
                <td style="padding: 9px 10px; color: ${palette.mutedText};">${entry.period}</td>
                <td style="padding: 9px 10px;">${entry.description}</td>
                <td style="padding: 9px 10px; text-align: right; font-weight: 600;">${fmt(entry.billed)}</td>
                <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: #145338;">${fmt(entry.paid)}</td>
                <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: ${entry.balance > 0 ? '#B91C1C' : palette.primaryText};">${fmt(entry.balance)}</td>
                <td style="padding: 9px 12px; text-align: center; font-weight: 700; font-size: 11px;">${entry.status}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr style="background: ${palette.softBg}; font-size: 12px; font-weight: 800; color: ${palette.primaryText};">
              <td colspan="3" style="padding: 9px 12px; text-transform: uppercase; letter-spacing: 0.04em;">Cumulative Ledger Totals</td>
              <td style="padding: 9px 10px; text-align: right;">${fmt(totalLedgerBilled)}</td>
              <td style="padding: 9px 10px; text-align: right; color: #145338;">${fmt(totalLedgerPaid)}</td>
              <td style="padding: 9px 10px; text-align: right; color: ${totalLedgerBalance > 0 ? '#B91C1C' : '#145338'};">${fmt(totalLedgerBalance)}</td>
              <td style="padding: 9px 12px; text-align: center;">${totalLedgerBalance <= 0 ? 'CLEARED' : 'DUE'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isDeposit ? 'Security Deposit Receipt' : 'Invoice'} ${data.invoiceNumber} - ${data.tenantName} (${data.tenantRef})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontStack};
      background: #EDF1F0;
      color: ${palette.primaryText};
      padding: 28px 16px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .toolbar {
      max-width: 820px;
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #17231E;
      color: #FFFFFF;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.14);
    }
    .toolbar-btn {
      background: ${palette.barBg};
      color: ${palette.barText};
      border: 1px solid ${palette.barBorder};
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .invoice-sheet {
      max-width: 820px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(23, 35, 30, 0.12);
      border: 1px solid ${palette.ruleLineColor};
    }
    .top-accent-bar {
      height: 5px;
      width: 100%;
      background: ${palette.barBg};
    }
    .invoice-content {
      padding: 44px 48px 36px;
    }
    @media print {
      body { background: #FFFFFF; padding: 0; }
      .toolbar { display: none !important; }
      .invoice-sheet { box-shadow: none; border-radius: 0; max-width: 100%; border: none; }
    }
    @media (max-width: 640px) {
      .invoice-content { padding: 28px 20px 24px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div style="font-size: 13px; font-weight: 600;">
      ${data.companyName} Invoice • <strong>${data.invoiceNumber}</strong> (${data.tenantRef})
    </div>
    <button class="toolbar-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="invoice-sheet">
    <div class="top-accent-bar"></div>
    <div class="invoice-content">
      <!-- Top Row: Logo + Website Name + Title (Left) | Amount + Status (Right) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; padding-bottom: 20px; border-bottom: 1px solid ${palette.ruleLineColor};">
        <div>
          ${buildSystemLogoHtml(data)}
          <div style="font-size: ${isDeposit ? '26px' : '34px'}; font-weight: 800; color: ${palette.titleColor}; letter-spacing: 0.04em; line-height: 1.05; margin-top: 10px;">
            ${isDeposit ? 'SECURITY DEPOSIT RECEIPT' : 'INVOICE'}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: 800; color: ${palette.sectionLabelColor}; letter-spacing: 0.08em; text-transform: uppercase;">
            ${isDeposit ? 'DEPOSIT AMOUNT' : 'INVOICE AMOUNT'}
          </div>
          <div style="font-size: 28px; font-weight: 800; color: ${palette.titleColor}; margin-top: 4px; font-variant-numeric: tabular-nums;">
            ${fmt(billedDisplayAmount)}
          </div>
          <div style="margin-top: 6px;">
            <span style="display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; background: ${statusColor.bg}; color: ${statusColor.text};">
              Payment Status: ${statusColor.label}
            </span>
          </div>
        </div>
      </div>

      <!-- 2-Column Metadata Row (ISSUED BY | OCCUPANT NAME) -->
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 24px;">
        <div>
          <div style="font-size: 11px; font-weight: 800; color: ${palette.sectionLabelColor}; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;">
            ISSUED BY
          </div>
          <div style="font-size: 12.5px; color: ${palette.primaryText}; font-weight: 700; line-height: 1.65;">
            ${data.companyName}
          </div>
          <div style="font-size: 12px; color: ${palette.mutedText}; line-height: 1.65;">
            ${data.businessAddress || 'Westlands, Nairobi, Kenya'}
          </div>
          <div style="font-size: 12px; color: ${palette.mutedText}; line-height: 1.65;">
            ${data.supportPhone}
          </div>
          <div style="font-size: 12px; color: ${palette.mutedText}; line-height: 1.65;">
            ${data.supportEmail}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: 800; color: ${palette.sectionLabelColor}; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;">
            OCCUPANT NAME
          </div>
          <div style="font-size: 12.5px; color: ${palette.primaryText}; font-weight: 700; line-height: 1.65;">
            ${data.tenantName}
          </div>
          <div style="font-size: 12px; color: ${palette.mutedText}; line-height: 1.65;">
            ${data.propertyName}
          </div>
          <div style="font-size: 12px; color: ${palette.primaryText}; font-weight: 600; line-height: 1.65;">
            ${data.unitNumber} (Ref: ${data.tenantRef})
          </div>
          <div style="font-size: 12px; color: ${palette.mutedText}; line-height: 1.65;">
            ${data.tenantPhone || data.tenantEmail || 'Verified Resident Account'}
          </div>
        </div>
      </div>

      <!-- Sharp Rectangular Theme-Colored Line Items Table -->
      <div style="margin-top: 26px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: ${palette.barBg}; color: ${palette.barText}; border: 1px solid ${palette.barBorder};">
              <th style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; width: 9%; border-top-left-radius: 4px; border-bottom-left-radius: 4px;">S.NO.</th>
              <th style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; width: 45%;">DESCRIPTION</th>
              <th style="padding: 10px 14px; text-align: right; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; width: 16%;">${isDeposit ? 'SECURITY DEPOSIT' : 'MONTHLY RENT'}</th>
              <th style="padding: 10px 14px; text-align: right; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; width: 15%;">PAID</th>
              <th style="padding: 10px 14px; text-align: right; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; width: 15%; border-top-right-radius: 4px; border-bottom-right-radius: 4px;">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Right-Aligned Totals Summary Stack with Solid Theme Total Bar -->
      <div style="display: flex; justify-content: flex-end; margin-top: 26px;">
        <div style="width: 280px; max-width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid ${palette.ruleLineColor}; font-size: 12px;">
            <span style="font-weight: 700; color: ${palette.primaryText}; letter-spacing: 0.04em;">${isDeposit ? 'SECURITY DEPOSIT' : 'MONTHLY RENT'}</span>
            <span style="font-weight: 700; color: ${palette.primaryText}; font-variant-numeric: tabular-nums;">${fmt(data.monthlyRent || data.subTotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid ${palette.ruleLineColor}; font-size: 12px;">
            <span style="font-weight: 700; color: ${palette.primaryText}; letter-spacing: 0.04em;">AMOUNT PAID</span>
            <span style="font-weight: 700; color: #145338; font-variant-numeric: tabular-nums;">${fmt(data.amountPaid)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; font-size: 12px;">
            <span style="font-weight: 700; color: ${palette.primaryText}; letter-spacing: 0.04em;">PAYMENT STATUS</span>
            <span style="font-weight: 800; color: ${statusColor.text};">${statusColor.label.toUpperCase()}</span>
          </div>

          <div style="margin-top: 6px; background: ${palette.barBg}; color: ${palette.barText}; border: 1px solid ${palette.barBorder}; border-radius: 4px; padding: 11px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
            <span style="font-weight: 800; letter-spacing: 0.04em;">OUTSTANDING BALANCE</span>
            <span style="font-weight: 800; font-variant-numeric: tabular-nums; font-size: 14px;">${fmt(data.grandTotal)}</span>
          </div>
        </div>
      </div>

      ${ledgerSectionHtml}

      <!-- Signature & Subtle Brand Footer -->
      <div style="margin-top: 34px; display: flex; justify-content: flex-end;">
        <div style="width: 190px; text-align: center;">
          <div style="border-top: 1px solid ${palette.mutedText}; padding-top: 6px; font-size: 11.5px; font-weight: 700; color: ${palette.primaryText};">
            Authorized Signature
          </div>
          <div style="font-size: 10.5px; color: ${palette.mutedText}; margin-top: 2px;">
            ${data.companyName}
          </div>
        </div>
      </div>

      <div style="margin-top: 24px; padding: 10px 14px; background: ${palette.softBg}; border: 1px solid ${palette.softBorder}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 11px;">
        <div style="font-weight: 700; color: ${palette.sectionLabelColor};">
          ${data.companyName}
        </div>
        <div style="color: ${palette.mutedText};">
          ${data.supportPhone} &bull; ${data.supportEmail}
        </div>
      </div>
    </div>
  </div>
  ${
    options?.autoPrint
      ? `<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 350); });</script>`
      : ''
  }
</body>
</html>`;
}

/**
 * Triggers a direct browser download of the clean Theme-Synced Invoice as a vector PDF file (.pdf).
 */
export function downloadDesignedInvoiceFile(data: InvoiceDocumentData, filenamePrefix = 'Invoice'): void {
  const pdfBytes = buildDesignedInvoicePdfBytes({
    transactionType: data.transactionType,
    invoiceNumber: data.invoiceNumber,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    billingPeriodStart: data.billingPeriodStart,
    billingPeriodEnd: data.billingPeriodEnd,
    paymentStatus: data.status,
    monthlyRent: data.monthlyRent || data.subTotal,
    tenantName: data.tenantName,
    tenantRef: data.tenantRef,
    tenantEmail: data.tenantEmail,
    tenantPhone: data.tenantPhone,
    propertyName: data.propertyName,
    unitNumber: data.unitNumber,
    companyName: data.companyName,
    companySubtitle: data.companySubtitle,
    businessAddress: data.businessAddress,
    accentTheme: data.accentTheme,
    bankName: data.bankName,
    bankAccount: data.bankAccount,
    paybillNumber: data.paybillNumber,
    website: data.website,
    supportPhone: data.supportPhone,
    supportEmail: data.supportEmail,
    notes: data.notes,
    items: data.items,
    subTotal: data.subTotal,
    amountPaid: data.amountPaid,
    grandTotal: data.grandTotal,
  });
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanPrefix = String(filenamePrefix || 'Invoice').replace(/-Ledger$/i, '');
  const cleanCode = String(data.invoiceNumber || 'INV').replace(/[^a-zA-Z0-9_-]/g, '-');
  const cleanRef = String(data.tenantRef || 'A-001').replace(/[^a-zA-Z0-9_-]/g, '-');
  a.download = `${cleanPrefix}-${cleanCode}-${cleanRef}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders the minimalist white-paper Invoice & Tenant Ledger directly onto an HTML5 Canvas
 * styled dynamically to the active website theme, logo mark & website name, and downloads PNG.
 */
export function downloadDesignedInvoicePng(data: InvoiceDocumentData, filenamePrefix = 'Invoice'): void {
  const canvas = document.createElement('canvas');
  const width = 1000;
  const palette = resolveInvoiceThemePalette(data.accentTheme);
  const fontFace = `"${data.fontFamily || 'Plus Jakarta Sans'}", "Inter", sans-serif`;

  const ledgerRowsCount = Math.min(8, data.ledgerEntries.length);
  const itemRowsCount = Math.max(data.items.length, 4);
  const tableHeaderY = 345;
  const rowsStartY = tableHeaderY + 46;
  const rowHeight = 48;
  const bottomY = rowsStartY + itemRowsCount * rowHeight + 44;
  const ledgerY = bottomY + 210;
  const tblY = ledgerY + 24;
  const tblH = 44 + ledgerRowsCount * 38;
  const sigStartY = ledgerRowsCount > 0 ? tblY + tblH + 54 : bottomY + 225;
  const height = sigStartY + 125;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    downloadDesignedInvoiceFile(data, filenamePrefix);
    return;
  }

  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;
  const margin = 70;

  // 1. Crisp White Sheet & Top Accent Hairline
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.barBg;
  ctx.fillRect(0, 0, width, 7);

  // 2. Top-Left: System Logo Mark + Website/Company Name + INVOICE
  const [b1, b2, b3] = palette.emblemBars;
  ctx.fillStyle = b1;
  ctx.beginPath();
  ctx.roundRect(margin, 72, 7, 18, 3);
  ctx.fill();
  ctx.fillStyle = b2;
  ctx.beginPath();
  ctx.roundRect(margin + 10, 62, 7, 28, 3);
  ctx.fill();
  ctx.fillStyle = b3;
  ctx.beginPath();
  ctx.roundRect(margin + 20, 67, 7, 23, 3);
  ctx.fill();

  const isDeposit = data.transactionType === 'Security Deposit';
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.sectionLabelColor;
  ctx.font = `800 19px ${fontFace}`;
  ctx.fillText(String(data.companyName || 'ARabella agency').toUpperCase(), margin + 38, 84);

  ctx.fillStyle = palette.titleColor;
  ctx.font = `800 ${isDeposit ? 34 : 46}px ${fontFace}`;
  ctx.fillText(isDeposit ? 'SECURITY DEPOSIT' : 'INVOICE', margin, 148);

  // 3. Top-Right: INVOICE / DEPOSIT AMOUNT & Status Badge
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.sectionLabelColor;
  ctx.font = `800 14px ${fontFace}`;
  ctx.fillText(isDeposit ? 'DEPOSIT AMOUNT' : 'INVOICE AMOUNT', width - margin, 80);

  ctx.fillStyle = palette.titleColor;
  ctx.font = `800 36px ${fontFace}`;
  ctx.fillText(fmt(data.monthlyRent || data.subTotal), width - margin, 120);

  const normStatus = String(data.status || 'Pending').trim();
  const statusBg = normStatus === 'Paid' ? '#D8F3E5' : normStatus === 'Overdue' ? '#FEE2E2' : palette.badgeBg;
  const statusFg = normStatus === 'Paid' ? '#145338' : normStatus === 'Overdue' ? '#991B1B' : palette.badgeText;
  const statusLabel = `Payment Status: ${normStatus}`;
  ctx.font = `800 13.5px ${fontFace}`;
  const pillW = ctx.measureText(statusLabel).width + 26;
  ctx.fillStyle = statusBg;
  ctx.beginPath();
  ctx.roundRect(width - margin - pillW, 134, pillW, 28, 14);
  ctx.fill();
  ctx.fillStyle = statusFg;
  ctx.fillText(statusLabel, width - margin - 13, 153);

  // Header Divider Rule
  ctx.strokeStyle = palette.ruleLineColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(margin, 180);
  ctx.lineTo(width - margin, 180);
  ctx.stroke();

  // 4. 2-Column Clean Metadata Row (ISSUED BY | OCCUPANT NAME)
  const mY = 212;

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.sectionLabelColor;
  ctx.font = `800 14px ${fontFace}`;
  ctx.fillText('ISSUED BY', margin, mY);
  ctx.fillStyle = palette.primaryText;
  ctx.font = `700 14.5px ${fontFace}`;
  ctx.fillText(data.companyName || 'ARabella agency', margin, mY + 26);
  ctx.fillStyle = palette.mutedText;
  ctx.font = `500 14px ${fontFace}`;
  ctx.fillText((data.businessAddress || 'Westlands, Nairobi, Kenya').slice(0, 42), margin, mY + 48);
  ctx.fillText(data.supportPhone, margin, mY + 70);
  ctx.fillText(data.supportEmail.slice(0, 42), margin, mY + 92);

  ctx.textAlign = 'right';
  ctx.fillStyle = palette.sectionLabelColor;
  ctx.font = `800 14px ${fontFace}`;
  ctx.fillText('OCCUPANT NAME', width - margin, mY);
  ctx.fillStyle = palette.primaryText;
  ctx.font = `700 14.5px ${fontFace}`;
  ctx.fillText(data.tenantName, width - margin, mY + 26);
  ctx.fillStyle = palette.mutedText;
  ctx.font = `500 14px ${fontFace}`;
  ctx.fillText(data.propertyName.slice(0, 40), width - margin, mY + 48);
  ctx.fillStyle = palette.primaryText;
  ctx.font = `700 14px ${fontFace}`;
  ctx.fillText(`${data.unitNumber} (Ref: ${data.tenantRef})`, width - margin, mY + 70);
  ctx.fillStyle = palette.mutedText;
  ctx.font = `500 13.5px ${fontFace}`;
  ctx.fillText((data.tenantPhone || data.tenantEmail || 'Verified Resident Account').slice(0, 40), width - margin, mY + 92);

  // 5. Rectangular Theme Table Header Bar
  ctx.fillStyle = palette.barBg;
  ctx.beginPath();
  ctx.roundRect(margin, tableHeaderY, width - margin * 2, 44, 5);
  ctx.fill();
  ctx.strokeStyle = palette.barBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.barText;
  ctx.font = `800 13.5px ${fontFace}`;
  ctx.textAlign = 'left';
  ctx.fillText('S.NO.', margin + 18, tableHeaderY + 27);
  ctx.fillText('DESCRIPTION', margin + 84, tableHeaderY + 27);
  ctx.textAlign = 'right';
  ctx.fillText(isDeposit ? 'DEPOSIT' : 'MONTHLY RENT', width - margin - 270, tableHeaderY + 27);
  ctx.fillText('PAID', width - margin - 140, tableHeaderY + 27);
  ctx.fillText('BALANCE', width - margin - 18, tableHeaderY + 27);

  // 6. Ruled Item Rows
  for (let i = 0; i < itemRowsCount; i++) {
    const rTop = rowsStartY + i * rowHeight;
    if (i < data.items.length) {
      const item = data.items[i];
      const textY = rTop + 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.mutedText;
      ctx.font = `600 14.5px ${fontFace}`;
      ctx.fillText(String(i + 1), margin + 22, textY);
      ctx.fillStyle = palette.primaryText;
      ctx.font = `600 14.5px ${fontFace}`;
      ctx.fillText(item.description.slice(0, 44), margin + 84, textY);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(item.price || data.monthlyRent), width - margin - 270, textY);
      ctx.fillStyle = '#145338';
      ctx.fillText(i === 0 ? fmt(data.amountPaid) : fmt(0), width - margin - 140, textY);
      ctx.fillStyle = palette.primaryText;
      ctx.font = `800 14.5px ${fontFace}`;
      ctx.fillText(i === 0 ? fmt(data.grandTotal) : fmt(item.total), width - margin - 18, textY);
    }
    ctx.strokeStyle = palette.ruleLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, rTop + rowHeight);
    ctx.lineTo(width - margin, rTop + rowHeight);
    ctx.stroke();
  }

  // 7. Right-Aligned Summary Stack (Terms & Conditions and Payment Information removed)

  // Right Summary Stack
  const sumX = width - margin - 350;
  const sumW = 350;

  const drawSumRow = (label: string, val: string, y: number, valColor: string) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.primaryText;
    ctx.font = `700 14px ${fontFace}`;
    ctx.fillText(label, sumX + 12, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = valColor;
    ctx.font = `800 14.5px ${fontFace}`;
    ctx.fillText(val, width - margin - 12, y);
    ctx.strokeStyle = palette.ruleLineColor;
    ctx.beginPath();
    ctx.moveTo(sumX, y + 14);
    ctx.lineTo(width - margin, y + 14);
    ctx.stroke();
  };

  drawSumRow(isDeposit ? 'SECURITY DEPOSIT' : 'MONTHLY RENT', fmt(data.monthlyRent || data.subTotal), bottomY + 12, palette.primaryText);
  drawSumRow('AMOUNT PAID', fmt(data.amountPaid), bottomY + 52, '#145338');
  drawSumRow('PAYMENT STATUS', normStatus.toUpperCase(), bottomY + 92, statusFg);

  // Solid Theme OUTSTANDING BALANCE Bar
  const barY = bottomY + 118;
  ctx.fillStyle = palette.barBg;
  ctx.beginPath();
  ctx.roundRect(sumX, barY, sumW, 46, 5);
  ctx.fill();
  ctx.strokeStyle = palette.barBorder;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.barText;
  ctx.font = `800 14px ${fontFace}`;
  ctx.fillText('OUTSTANDING BALANCE', sumX + 14, barY + 28);
  ctx.textAlign = 'right';
  ctx.font = `800 17px ${fontFace}`;
  ctx.fillText(fmt(data.grandTotal), width - margin - 14, barY + 29);

  // 8. Optional Ledger Table
  if (ledgerRowsCount > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.sectionLabelColor;
    ctx.font = `800 14px ${fontFace}`;
    ctx.fillText(`TENANT ACCOUNT LEDGER STATEMENT (${data.tenantRef})`, margin, ledgerY);

    ctx.fillStyle = palette.barBg;
    ctx.beginPath();
    ctx.roundRect(margin, tblY, width - margin * 2, 40, [4, 4, 0, 0]);
    ctx.fill();

    ctx.fillStyle = palette.barText;
    ctx.font = `800 12px ${fontFace}`;
    ctx.fillText('REF / CODE', margin + 16, tblY + 25);
    ctx.fillText('PERIOD', margin + 150, tblY + 25);
    ctx.fillText('DESCRIPTION', margin + 300, tblY + 25);
    ctx.textAlign = 'right';
    ctx.fillText('BILLED', width - margin - 190, tblY + 25);
    ctx.fillText('PAID', width - margin - 95, tblY + 25);
    ctx.fillText('STATUS', width - margin - 16, tblY + 25);

    data.ledgerEntries.slice(0, ledgerRowsCount).forEach((entry, idx) => {
      const rY = tblY + 64 + idx * 36;
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.titleColor;
      ctx.font = '700 12px monospace';
      ctx.fillText(entry.code, margin + 16, rY);
      ctx.font = `500 12px ${fontFace}`;
      ctx.fillStyle = palette.mutedText;
      ctx.fillText(entry.period.slice(0, 18), margin + 150, rY);
      ctx.fillStyle = palette.primaryText;
      ctx.fillText(entry.description.slice(0, 30), margin + 300, rY);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(entry.billed), width - margin - 190, rY);
      ctx.fillStyle = '#145338';
      ctx.fillText(fmt(entry.paid), width - margin - 95, rY);
      ctx.fillStyle = entry.status === 'Paid' ? '#145338' : '#92400E';
      ctx.font = `800 11.5px ${fontFace}`;
      ctx.fillText(entry.status.toUpperCase(), width - margin - 16, rY);
    });
  }

  // 9. Signature & Clean Footer Strip
  ctx.strokeStyle = palette.mutedText;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(width - margin - 210, sigStartY);
  ctx.lineTo(width - margin, sigStartY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = palette.primaryText;
  ctx.font = `700 13px ${fontFace}`;
  ctx.fillText('Authorized Signature', width - margin - 105, sigStartY + 20);
  ctx.fillStyle = palette.mutedText;
  ctx.font = `500 12px ${fontFace}`;
  ctx.fillText(data.companyName || 'ARabella agency', width - margin - 105, sigStartY + 38);

  const footY = height - 62;
  ctx.fillStyle = palette.softBg;
  ctx.beginPath();
  ctx.roundRect(margin, footY, width - margin * 2, 36, 5);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.sectionLabelColor;
  ctx.font = `700 12.5px ${fontFace}`;
  ctx.fillText(`${data.companyName}`, margin + 16, footY + 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.mutedText;
  ctx.font = `500 12px ${fontFace}`;
  ctx.fillText(`${data.supportPhone}  •  ${data.supportEmail}`, width - margin - 16, footY + 22);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanCode = String(data.invoiceNumber || 'INV').replace(/[^a-zA-Z0-9_-]/g, '-');
    const cleanRef = String(data.tenantRef || 'A-001').replace(/[^a-zA-Z0-9_-]/g, '-');
    a.download = `${filenamePrefix}-${cleanCode}-${cleanRef}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Opens the designed Invoice & Ledger in a dedicated print-to-PDF window
 */
export function printDesignedInvoicePdf(data: InvoiceDocumentData): void {
  const html = generateStandaloneInvoiceHtml(data, { autoPrint: true, includeLedger: true });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {}
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 5000);
  }, 500);
}
