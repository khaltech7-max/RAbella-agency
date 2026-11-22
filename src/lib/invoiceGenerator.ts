import {
  RentPaymentRecord,
  TenantProfile,
  SystemSettingsRecord,
  UserAppearancePreferences,
} from '../data/rentalData';
import { buildDesignedInvoicePdfBytes } from './pdfInvoiceBuilder';
import {
  computeInvoiceFinancials,
  extractBillingPeriodFromPayment,
  formatYmdShort,
  getNairobiTodayYmd,
  parseBillingDateToYmd,
} from './anniversaryBilling';

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
  primaryColor: string;     // System deep forest: #17231E
  forestColor: string;      // System emerald forest: #145338
  accentColor: string;      // System electric lime: #D5F267
  mintColor: string;        // System soft mint: #D8F3E5
  canvasStart: string;      // System sage alabaster: #F7FAF8
  canvasMid: string;        // System soft sage: #ECF3EF
  canvasEnd: string;        // System mint-sage border tone: #DCE7E1
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
  primaryColor: '#17231E',
  forestColor: '#145338',
  accentColor: '#D5F267',
  mintColor: '#D8F3E5',
  canvasStart: '#F7FAF8',
  canvasMid: '#ECF3EF',
  canvasEnd: '#DDE8E2',
};

export function setSystemBrandingForInvoices(
  sys?: SystemSettingsRecord | null,
  prefs?: UserAppearancePreferences | null
): void {
  const primaryColor =
    prefs?.primaryColor ||
    sys?.appearanceDefaults?.primaryColor ||
    '#17231E';
  const accentColor =
    prefs?.accentColor ||
    sys?.appearanceDefaults?.accentColor ||
    '#D5F267';
  const mintColor =
    sys?.appearanceDefaults?.secondaryAccentColor ||
    '#D8F3E5';

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
    primaryColor,
    forestColor: '#145338',
    accentColor,
    mintColor,
    canvasStart: '#F7FAF8',
    canvasMid: '#ECF3EF',
    canvasEnd: '#DDE8E2',
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
      const rootStyle = getComputedStyle(document.documentElement);
      const cssAccent = rootStyle.getPropertyValue('--rms-accent').trim();
      const cssPrimary = rootStyle.getPropertyValue('--rms-primary').trim();
      if (cssAccent) cachedBranding.accentColor = cssAccent;
      if (cssPrimary) cachedBranding.primaryColor = cssPrimary;
    } catch {}
  }
  return cachedBranding;
}

export interface InvoiceDocumentData {
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
  const currentYear = new Date().getFullYear();
  const invoiceNumber =
    typeof indexOrCode === 'string' && indexOrCode.trim()
      ? indexOrCode.trim()
      : typeof indexOrCode === 'number'
      ? `INV-${currentYear}-${String(indexOrCode + 1).padStart(3, '0')}`
      : inv.paymentId || `INV-${currentYear}-001`;

  const monthlyRent = Number(tenantProfile?.monthlyRent || inv.amount || 0);
  const rawAmount = Number(inv.amount || monthlyRent || 0);
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

  // Filter all payments belonging to this tenant for the ledger history
  const tenantPayments = allPayments.filter(
    (p) => String(p.tenantRef || '').trim().toUpperCase() === cleanRef
  );

  const sourceList = tenantPayments.length > 0 ? tenantPayments : [inv];

  let runningBalance = 0;
  const ledgerEntries: LedgerHistoryEntry[] = sourceList.map((p, idx) => {
    const pPeriod = extractBillingPeriodFromPayment(p, moveInAnchor);
    const pFin = computeInvoiceFinancials({
      amountDue: p.amount,
      amountPaid: p.amountPaid,
      monthlyRent,
      dueDate: p.dueDate,
      storedStatus: p.status,
    });
    runningBalance += pFin.outstandingBalance;
    return {
      code: p.paymentId || `INV-${String(idx + 1).padStart(3, '0')}`,
      period: pPeriod
        ? `${formatYmdShort(pPeriod.periodStart)} – ${formatYmdShort(pPeriod.periodEnd)}`
        : formatYmdShort(p.dueDate),
      description: `${p.paymentNote || 'Residential Rent'} — ${p.property} (${p.unitNumber})`,
      billed: pFin.amountDue,
      paid: pFin.amountPaid,
      balance: runningBalance,
      status: pFin.status,
    };
  });

  const items: InvoiceLineItem[] = [
    {
      description: `Monthly Rent (${billingPeriodStartLabel} – ${billingPeriodEndLabel}) — ${inv.property} (${inv.unitNumber})`,
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

  const defaultNotes =
    brand.footerNote ||
    `Billing period: ${billingPeriodStartLabel} to ${billingPeriodEndLabel}. Payment is due on your monthly move-in anniversary (${dueDateLabel}). Kindly quote Account Ref ${cleanRef} on all M-Pesa PayBill (${brand.paybillNumber}) or Bank payments.`;

  return {
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
    bankName: brand.bankName,
    bankAccount: `M-Pesa PayBill ${brand.paybillNumber} • Account: ${cleanRef}`,
    paybillNumber: brand.paybillNumber,
    website: brand.website,
    supportPhone: brand.supportPhone,
    supportEmail: brand.supportEmail,
    notes: defaultNotes,
    primaryColor: brand.primaryColor,
    forestColor: brand.forestColor,
    accentColor: brand.accentColor,
    mintColor: brand.mintColor,
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
 * Builds the System Logo HTML matching the system's LayoutShell & AuthGatePage logo
 * (or renders the custom companyLogoUrl configured in System Settings).
 */
export function buildSystemLogoHtml(data: {
  companyName: string;
  companySubtitle: string;
  companyLogoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  forestColor?: string;
}): string {
  const primary = data.primaryColor || '#17231E';
  const accent = data.accentColor || '#D5F267';

  const customLogoImg =
    data.companyLogoUrl && data.companyLogoUrl.trim()
      ? `<img src="${data.companyLogoUrl}" alt="${data.companyName}" style="width: 44px; height: 44px; border-radius: 13px; object-fit: contain; background: ${accent}; padding: 4px; box-shadow: 0 4px 12px rgba(23,35,30,0.12);" />`
      : '';

  return `
    <div style="display: flex; align-items: center; gap: 12px;">
      ${customLogoImg}
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="display: flex; align-items: flex-end; gap: 4px; height: 30px;">
          <span style="display: inline-block; width: 6px; height: 18px; border-radius: 99px; background: #9FE249;"></span>
          <span style="display: inline-block; width: 6px; height: 26px; border-radius: 99px; background: ${accent};"></span>
          <span style="display: inline-block; width: 6px; height: 21px; border-radius: 99px; background: #145338;"></span>
        </div>
        <div>
          <div style="font-size: 23px; font-weight: 800; color: ${primary}; letter-spacing: -0.02em; line-height: 1.1;">
            ${data.companyName || 'ARabella agency'}
          </div>
          <div style="font-size: 13px; color: #145338; font-weight: 700; margin-top: 3px;">
            ${data.companySubtitle || 'Smart Property Management'}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generates a standalone, print-ready HTML document matching the reference Invoice layout
 * styled in the System Theme colors (#17231E Deep Forest, #145338 Emerald, #D5F267 Lime, #D8F3E5 Mint)
 * and using the System Logo.
 */
export function generateStandaloneInvoiceHtml(
  data: InvoiceDocumentData,
  options?: { autoPrint?: boolean; includeLedger?: boolean }
): string {
  const includeLedger = options?.includeLedger !== false;
  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;
  const primary = data.primaryColor || '#17231E';
  const forest = data.forestColor || '#145338';
  const accent = data.accentColor || '#D5F267';
  const mint = data.mintColor || '#D8F3E5';

  const statusColor =
    data.status === 'Paid'
      ? { bg: mint, text: forest, label: 'PAID & VERIFIED' }
      : data.status === 'Overdue'
      ? { bg: '#FEE2E2', text: '#991B1B', label: 'OVERDUE' }
      : { bg: accent, text: primary, label: 'PAYMENT PENDING' };

  const itemsRowsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 13px 12px; font-size: 14px; color: ${primary}; font-weight: 600; border-bottom: 1px solid #EEF3F0;">
          ${item.description}
        </td>
        <td style="padding: 13px 12px; font-size: 14px; color: #46544E; text-align: center; font-weight: 600; border-bottom: 1px solid #EEF3F0;">
          ${item.qty}
        </td>
        <td style="padding: 13px 12px; font-size: 14px; color: #46544E; text-align: right; font-weight: 600; border-bottom: 1px solid #EEF3F0; font-variant-numeric: tabular-nums;">
          ${item.price === 0 ? 'Included' : fmt(item.price)}
        </td>
        <td style="padding: 13px 12px; font-size: 14px; color: ${primary}; text-align: right; font-weight: 800; border-bottom: 1px solid #EEF3F0; font-variant-numeric: tabular-nums;">
          ${item.total === 0 ? 'KSh 0.00' : fmt(item.total)}
        </td>
      </tr>
    `
    )
    .join('');

  const totalLedgerBilled = data.ledgerEntries.reduce((s, e) => s + e.billed, 0);
  const totalLedgerPaid = data.ledgerEntries.reduce((s, e) => s + e.paid, 0);
  const totalLedgerBalance = Math.max(0, totalLedgerBilled - totalLedgerPaid);

  const ledgerSectionHtml =
    includeLedger && data.ledgerEntries.length > 0
      ? `
      <div style="margin-top: 34px; padding-top: 26px; border-top: 1.5px dashed #B8CEC2;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <div>
            <div style="font-size: 13px; font-weight: 800; color: ${primary}; letter-spacing: 0.08em; text-transform: uppercase;">
              TENANT STATEMENT OF ACCOUNT LEDGER (${data.tenantRef})
            </div>
            <div style="font-size: 12px; color: #4A6358; margin-top: 2px;">
              Chronological billing, payment allocation &amp; running balance history for ${data.tenantName}
            </div>
          </div>
        </div>

        <div style="background: #FFFFFF; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 24px rgba(23, 35, 30, 0.05); border: 1px solid #DCE7E1;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: linear-gradient(90deg, ${primary} 0%, ${forest} 60%, #1E704D 100%); color: #FFFFFF; font-size: 11px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase;">
                <th style="padding: 12px 16px; color: ${accent};">Ref / Code</th>
                <th style="padding: 12px 14px;">Period / Due</th>
                <th style="padding: 12px 14px;">Ledger Description</th>
                <th style="padding: 12px 14px; text-align: right;">Billed</th>
                <th style="padding: 12px 14px; text-align: right;">Paid</th>
                <th style="padding: 12px 14px; text-align: right;">Balance</th>
                <th style="padding: 12px 16px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${data.ledgerEntries
                .map(
                  (entry) => `
                <tr style="border-bottom: 1px solid #EEF3F0; font-size: 12.5px; color: ${primary};">
                  <td style="padding: 11px 16px; font-weight: 700; font-family: monospace; color: ${forest};">${entry.code}</td>
                  <td style="padding: 11px 14px; color: #5A6762;">${entry.period}</td>
                  <td style="padding: 11px 14px;">${entry.description}</td>
                  <td style="padding: 11px 14px; text-align: right; font-weight: 600;">${fmt(entry.billed)}</td>
                  <td style="padding: 11px 14px; text-align: right; font-weight: 700; color: ${forest};">${fmt(entry.paid)}</td>
                  <td style="padding: 11px 14px; text-align: right; font-weight: 700; color: ${
                    entry.balance > 0 ? '#B91C1C' : primary
                  };">${fmt(entry.balance)}</td>
                  <td style="padding: 11px 16px; text-align: center;">
                    <span style="display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 800; background: ${
                      entry.status === 'Paid'
                        ? mint
                        : entry.status === 'Overdue'
                        ? '#FEE2E2'
                        : accent
                    }; color: ${
                    entry.status === 'Paid'
                      ? forest
                      : entry.status === 'Overdue'
                      ? '#991B1B'
                      : primary
                  };">
                      ${entry.status}
                    </span>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
            <tfoot>
              <tr style="background: #F4F8F6; font-size: 12.5px; font-weight: 800; color: ${primary};">
                <td colspan="3" style="padding: 12px 16px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Cumulative Account Ledger Totals
                </td>
                <td style="padding: 12px 14px; text-align: right;">${fmt(totalLedgerBilled)}</td>
                <td style="padding: 12px 14px; text-align: right; color: ${forest};">${fmt(totalLedgerPaid)}</td>
                <td style="padding: 12px 14px; text-align: right; color: ${
                  totalLedgerBalance > 0 ? '#B91C1C' : forest
                };">${fmt(totalLedgerBalance)}</td>
                <td style="padding: 12px 16px; text-align: center;">
                  ${totalLedgerBalance <= 0 ? 'CLEARED' : 'DUE'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${data.invoiceNumber} - ${data.tenantName} (${data.tenantRef})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #DCE6E0;
      color: ${primary};
      padding: 28px 16px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .toolbar {
      max-width: 820px;
      margin: 0 auto 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: ${primary};
      color: #FFFFFF;
      padding: 12px 20px;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(23,35,30,0.18);
    }
    .toolbar-btn {
      background: ${accent};
      color: ${primary};
      border: none;
      padding: 9px 18px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .invoice-sheet {
      max-width: 820px;
      margin: 0 auto;
      background: linear-gradient(165deg, #F8FBF9 0%, #EEF4F1 55%, #E0EBE5 100%);
      border-radius: 24px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 20px 55px rgba(23, 35, 30, 0.14);
      border: 1px solid #D5E2DB;
    }
    .decorative-ring {
      position: absolute;
      top: -90px;
      right: -95px;
      width: 410px;
      height: 410px;
      border-radius: 50%;
      border: 48px solid transparent;
      background:
        linear-gradient(165deg, #F8FBF9, #EEF4F1) padding-box,
        linear-gradient(135deg, rgba(216,243,229,0.25) 0%, ${accent} 52%, ${forest} 100%) border-box;
      pointer-events: none;
      z-index: 0;
    }
    .invoice-content {
      position: relative;
      z-index: 1;
      padding: 54px 56px 40px;
    }
    @media print {
      body { background: #F8FBF9; padding: 0; }
      .toolbar { display: none !important; }
      .invoice-sheet { box-shadow: none; border-radius: 0; max-width: 100%; border: none; }
    }
    @media (max-width: 640px) {
      .invoice-content { padding: 32px 22px 28px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div style="font-size: 13px; font-weight: 600;">
      ${data.companyName} Official Invoice &amp; Tenant Statement • <strong style="color: ${accent};">${data.invoiceNumber}</strong> (${data.tenantRef})
    </div>
    <button class="toolbar-btn" onclick="window.print()">
      Print / Save as PDF
    </button>
  </div>

  <div class="invoice-sheet">
    <div class="decorative-ring"></div>

    <div class="invoice-content">
      <!-- Top System Brand Logo & INVOICE Title Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap;">
        ${buildSystemLogoHtml(data)}

        <!-- Right INVOICE Title -->
        <div style="text-align: right;">
          <div style="font-size: 42px; font-weight: 800; color: ${primary}; letter-spacing: 0.06em; line-height: 1;">
            INVOICE
          </div>
        </div>
      </div>

      <!-- Payable To / Bank Details & Invoice Number / Date Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 46px; gap: 24px; flex-wrap: wrap;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: ${primary}; letter-spacing: 0.05em; text-transform: uppercase;">
            PAYABLE TO
          </div>
          <div style="font-size: 15.5px; color: ${primary}; font-weight: 700; margin-top: 8px;">
            ${data.tenantName}
          </div>
          <div style="font-size: 14px; color: #46544E; margin-top: 4px;">
            ${data.unitNumber} • ${data.propertyName} (Ref: <strong style="color: ${forest};">${data.tenantRef}</strong>)
          </div>

          <div style="font-size: 15px; font-weight: 800; color: ${primary}; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 26px;">
            BANK DETAILS
          </div>
          <div style="font-size: 14.5px; color: ${primary}; font-weight: 600; margin-top: 8px;">
            ${data.bankName}
          </div>
          <div style="font-size: 14px; color: #46544E; margin-top: 4px; font-variant-numeric: tabular-nums;">
            ${data.bankAccount}
          </div>
        </div>

        <div style="text-align: right; min-width: 220px;">
          <div style="font-size: 14.5px; color: ${primary}; font-weight: 500;">
            Invoice Number: <strong style="font-weight: 800;">${data.invoiceNumber}</strong>
          </div>
          <div style="font-size: 14.5px; color: ${primary}; font-weight: 500; margin-top: 5px;">
            Invoice Date: <strong style="font-weight: 700;">${data.issueDate}</strong>
          </div>
          <div style="font-size: 14px; color: #46544E; font-weight: 500; margin-top: 5px;">
            Payment Due Date: <strong style="font-weight: 700; color: ${forest};">${data.dueDate}</strong>
          </div>
          <div style="margin-top: 8px;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 800; background: ${statusColor.bg}; color: ${statusColor.text};">
              Payment Status: ${data.status}
            </span>
          </div>
        </div>
      </div>

      <!-- Dedicated Billing Period Card -->
      <div style="margin-top: 22px; background: #FFFFFF; border-radius: 16px; padding: 14px 22px; border: 1px solid #DCE7E1; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="font-size: 10.5px; font-weight: 800; color: #5A6762; letter-spacing: 0.06em; text-transform: uppercase;">Billing Period Start</div>
          <div style="font-size: 14px; font-weight: 800; color: ${primary}; margin-top: 2px;">${data.billingPeriodStart}</div>
        </div>
        <div>
          <div style="font-size: 10.5px; font-weight: 800; color: #5A6762; letter-spacing: 0.06em; text-transform: uppercase;">Billing Period End</div>
          <div style="font-size: 14px; font-weight: 800; color: ${primary}; margin-top: 2px;">${data.billingPeriodEnd}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10.5px; font-weight: 800; color: #5A6762; letter-spacing: 0.06em; text-transform: uppercase;">Monthly Rent</div>
          <div style="font-size: 14px; font-weight: 800; color: ${forest}; margin-top: 2px;">${fmt(data.monthlyRent || data.subTotal)}</div>
        </div>
      </div>

      <!-- System Forest-to-Emerald Pill Header Bar -->
      <div style="margin-top: 24px; background: linear-gradient(90deg, ${primary} 0%, ${forest} 58%, #1E704D 100%); border-radius: 999px; padding: 15px 32px; color: #FFFFFF; box-shadow: 0 8px 20px rgba(20, 83, 56, 0.2);">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <th style="text-align: left; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; width: 48%; color: ${accent};">ITEM DESCRIPTION</th>
            <th style="text-align: center; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; width: 12%; color: #FFFFFF;">QTY</th>
            <th style="text-align: right; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; width: 20%; color: #FFFFFF;">PRICE</th>
            <th style="text-align: right; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; width: 20%; color: ${accent};">TOTAL</th>
          </tr>
        </table>
      </div>

      <!-- White Rounded Line Items Container -->
      <div style="margin-top: 16px; background: #FFFFFF; border-radius: 22px; padding: 18px 24px; box-shadow: 0 10px 28px rgba(23, 35, 30, 0.05); border: 1px solid #E4ECE8;">
        <table style="width: 100%; border-collapse: collapse;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 12%;" />
            <col style="width: 20%;" />
            <col style="width: 20%;" />
          </colgroup>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Notes & Sub Total / Grand Total Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; margin-top: 28px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; max-width: 350px; padding-top: 6px;">
          <div style="font-size: 14.5px; font-weight: 800; color: ${primary}; letter-spacing: 0.05em; text-transform: uppercase;">
            NOTES:
          </div>
          <p style="font-size: 12.5px; color: #46544E; line-height: 1.65; margin-top: 10px;">
            ${data.notes}
          </p>
        </div>

        <div style="background: #FFFFFF; border-radius: 20px; padding: 22px 30px; min-width: 310px; box-shadow: 0 10px 28px rgba(23, 35, 30, 0.05); border: 1px solid #E4ECE8;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px;">
            <span style="font-weight: 800; color: ${primary}; letter-spacing: 0.04em;">MONTHLY RENT</span>
            <span style="font-weight: 700; color: ${primary}; font-variant-numeric: tabular-nums;">${fmt(data.monthlyRent || data.subTotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; font-size: 14px;">
            <span style="font-weight: 800; color: ${primary}; letter-spacing: 0.04em;">AMOUNT PAID</span>
            <span style="font-weight: 700; color: ${forest}; font-variant-numeric: tabular-nums;">${fmt(data.amountPaid)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; font-size: 14px;">
            <span style="font-weight: 800; color: ${primary}; letter-spacing: 0.04em;">PAYMENT STATUS</span>
            <span style="font-weight: 800; color: ${statusColor.text};">${data.status}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0 4px; margin-top: 4px; border-top: 1.5px solid #E4ECE8; font-size: 15px;">
            <span style="font-weight: 800; color: ${primary}; letter-spacing: 0.04em;">OUTSTANDING BALANCE</span>
            <span style="font-weight: 800; color: ${primary}; background: ${accent}; padding: 3px 10px; border-radius: 8px; font-variant-numeric: tabular-nums;">${fmt(data.grandTotal)}</span>
          </div>
        </div>
      </div>

      ${ledgerSectionHtml}
    </div>

    <!-- Bottom System Forest-to-Lime Wave Banner with Dark Forest Contact Pill Bar -->
    <div style="margin-top: 26px; background: linear-gradient(90deg, ${forest} 0%, #1F7A53 45%, ${accent} 100%); padding: 30px 44px;">
      <div style="background: ${primary}; border-radius: 999px; padding: 15px 32px; color: #FFFFFF; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; box-shadow: 0 10px 24px rgba(23, 35, 30, 0.28);">
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600;">
          <span style="display: inline-flex; width: 26px; height: 26px; border-radius: 50%; background: ${accent}; color: ${primary}; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;">🌐</span>
          <span>${data.website}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600;">
          <span style="display: inline-flex; width: 26px; height: 26px; border-radius: 50%; background: ${accent}; color: ${primary}; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;">📞</span>
          <span>${data.supportPhone}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600;">
          <span style="display: inline-flex; width: 26px; height: 26px; border-radius: 50%; background: ${accent}; color: ${primary}; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;">✉️</span>
          <span>${data.supportEmail}</span>
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
 * Triggers a direct browser download of the designed System-Theme Invoice as a full-color PDF file (.pdf).
 */
export function downloadDesignedInvoiceFile(data: InvoiceDocumentData, filenamePrefix = 'Invoice'): void {
  const pdfBytes = buildDesignedInvoicePdfBytes({
    invoiceNumber: data.invoiceNumber,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    billingPeriodStart: data.billingPeriodStart,
    billingPeriodEnd: data.billingPeriodEnd,
    paymentStatus: data.status,
    monthlyRent: data.monthlyRent || data.subTotal,
    tenantName: data.tenantName,
    tenantRef: data.tenantRef,
    propertyName: data.propertyName,
    unitNumber: data.unitNumber,
    companyName: data.companyName,
    companySubtitle: data.companySubtitle,
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
 * Renders the Invoice & Tenant Ledger directly onto an HTML5 Canvas using the System Theme colors
 * (#17231E Deep Forest, #145338 Emerald, #D5F267 Lime, #D8F3E5 Mint) and System Logo, and downloads a PNG image.
 */
export function downloadDesignedInvoicePng(data: InvoiceDocumentData, filenamePrefix = 'Invoice'): void {
  const canvas = document.createElement('canvas');
  const width = 1000;
  const ledgerRowsCount = Math.min(8, data.ledgerEntries.length);
  const cardY = 478;
  const cardH = Math.max(195, data.items.length * 56 + 44);
  const notesY = cardY + cardH + 38;
  const ledgerY = notesY + 178;
  const tblY = ledgerY + 16;
  const tblH = 50 + ledgerRowsCount * 40;
  const contentBottom = ledgerRowsCount > 0 ? tblY + tblH + 38 : notesY + 178;
  const height = contentBottom + 115;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    downloadDesignedInvoiceFile(data, filenamePrefix);
    return;
  }

  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;
  const primary = data.primaryColor || '#17231E';
  const forest = data.forestColor || '#145338';
  const accent = data.accentColor || '#D5F267';

  // 1. System Sage-Alabaster Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#F8FBF9');
  bgGrad.addColorStop(0.55, '#EEF4F1');
  bgGrad.addColorStop(1, '#E0EBE5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Top-right decorative System Lime-to-Emerald gradient ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(width - 90, 110, 225, 0, Math.PI * 2);
  ctx.lineWidth = 54;
  const ringGrad = ctx.createLinearGradient(width - 320, 0, width, 340);
  ringGrad.addColorStop(0, 'rgba(216, 243, 229, 0.35)');
  ringGrad.addColorStop(0.52, accent);
  ringGrad.addColorStop(1, forest);
  ctx.strokeStyle = ringGrad;
  ctx.stroke();
  ctx.restore();

  // 3. System Brand Emblem (3 Ascending System Bars — no star badge)
  ctx.save();
  ctx.fillStyle = '#9FE249';
  ctx.beginPath();
  ctx.roundRect(70, 86, 7, 22, 3.5);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(81, 76, 7, 32, 3.5);
  ctx.fill();
  ctx.fillStyle = forest;
  ctx.beginPath();
  ctx.roundRect(92, 82, 7, 26, 3.5);
  ctx.fill();
  ctx.restore();

  // Brand name & subtitle from System Settings
  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = '800 27px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.companyName || 'ARabella agency', 112, 92);
  ctx.fillStyle = forest;
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.companySubtitle || 'Smart Property Management', 112, 115);

  // Right: INVOICE heading
  ctx.textAlign = 'right';
  ctx.fillStyle = primary;
  ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('INVOICE', width - 70, 108);

  // Number & Date
  ctx.fillStyle = primary;
  ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Number: ${data.invoiceNumber}`, width - 70, 210);
  ctx.font = '600 16.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Date: ${data.issueDate}`, width - 70, 238);
  ctx.fillStyle = forest;
  ctx.fillText(`Due Date: ${data.dueDate}`, width - 70, 266);

  // Left: PAYABLE TO & BANK DETAILS
  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PAYABLE TO', 70, 205);
  ctx.fillStyle = primary;
  ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.tenantName, 70, 233);
  ctx.fillStyle = '#46544E';
  ctx.font = '600 15.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${data.unitNumber} • ${data.propertyName} (Ref: ${data.tenantRef})`, 70, 258);

  ctx.fillStyle = primary;
  ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BANK DETAILS', 70, 305);
  ctx.fillStyle = primary;
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.bankName, 70, 332);
  ctx.fillStyle = '#46544E';
  ctx.font = '600 15.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.bankAccount, 70, 356);

  // 4. System Forest-to-Emerald Pill Header Bar
  const pillY = 405;
  const pillGrad = ctx.createLinearGradient(70, pillY, width - 70, pillY);
  pillGrad.addColorStop(0, primary);
  pillGrad.addColorStop(0.58, forest);
  pillGrad.addColorStop(1, '#1E704D');
  ctx.fillStyle = pillGrad;
  ctx.beginPath();
  ctx.roundRect(70, pillY, width - 140, 54, 27);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.font = '800 15.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ITEM DESCRIPTION', 104, pillY + 33);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('QTY', 560, pillY + 33);
  ctx.textAlign = 'right';
  ctx.fillText('PRICE', 730, pillY + 33);
  ctx.fillStyle = accent;
  ctx.fillText('TOTAL', width - 104, pillY + 33);

  // 5. White Rounded Line Items Card
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(70, cardY, width - 140, cardH, 24);
  ctx.fill();

  data.items.forEach((item, idx) => {
    const rowY = cardY + 46 + idx * 54;
    ctx.fillStyle = primary;
    ctx.font = '600 15.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.description.slice(0, 56), 104, rowY);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#46544E';
    ctx.fillText(String(item.qty), 560, rowY);
    ctx.textAlign = 'right';
    ctx.fillText(item.price === 0 ? 'Included' : fmt(item.price), 730, rowY);
    ctx.fillStyle = primary;
    ctx.font = '800 15.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(item.total === 0 ? 'KSh 0.00' : fmt(item.total), width - 104, rowY);
  });

  // 6. Notes & Totals Box
  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NOTES:', 75, notesY + 24);
  ctx.fillStyle = '#46544E';
  ctx.font = '500 13.5px "Plus Jakarta Sans", sans-serif';
  const noteLines = [
    `We prioritize resident satisfaction. Our team at ${data.companyName}`,
    'is dedicated to delivering exceptional property service and',
    `ensuring your comfort. Quote Account Ref ${data.tenantRef} on all`,
    `M-Pesa PayBill (${data.paybillNumber}) or Bank payments.`,
  ];
  noteLines.forEach((line, i) => {
    ctx.fillText(line, 75, notesY + 52 + i * 22);
  });

  // White Totals Card
  const totCardX = width - 430;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(totCardX, notesY, 360, 146, 22);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = '800 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('SUB TOTAL', totCardX + 28, notesY + 42);
  ctx.fillText('AMOUNT PAID', totCardX + 28, notesY + 80);
  ctx.fillText('GRAND TOTAL', totCardX + 28, notesY + 120);

  ctx.textAlign = 'right';
  ctx.font = '700 15.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fmt(data.subTotal), width - 98, notesY + 42);
  ctx.fillStyle = forest;
  ctx.fillText(fmt(data.amountPaid), width - 98, notesY + 80);
  ctx.fillStyle = primary;
  ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fmt(data.grandTotal), width - 98, notesY + 120);

  // 7. Tenant Account Ledger Section on Canvas
  if (ledgerRowsCount > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = primary;
    ctx.font = '800 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`TENANT ACCOUNT LEDGER STATEMENT (${data.tenantRef})`, 75, ledgerY);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(70, tblY, width - 140, tblH, 16);
    ctx.fill();

    ctx.fillStyle = pillGrad;
    ctx.beginPath();
    ctx.roundRect(70, tblY, width - 140, 42, [16, 16, 0, 0]);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = '800 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('REF / CODE', 94, tblY + 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('PERIOD', 235, tblY + 26);
    ctx.fillText('DESCRIPTION', 375, tblY + 26);
    ctx.textAlign = 'right';
    ctx.fillText('BILLED', 705, tblY + 26);
    ctx.fillText('PAID', 815, tblY + 26);
    ctx.fillStyle = accent;
    ctx.fillText('STATUS', width - 94, tblY + 26);

    data.ledgerEntries.slice(0, ledgerRowsCount).forEach((entry, idx) => {
      const rY = tblY + 68 + idx * 40;
      ctx.textAlign = 'left';
      ctx.fillStyle = forest;
      ctx.font = '700 12.5px monospace';
      ctx.fillText(entry.code, 94, rY);
      ctx.font = '500 12.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#5A6762';
      ctx.fillText(entry.period.slice(0, 16), 235, rY);
      ctx.fillStyle = primary;
      ctx.fillText(entry.description.slice(0, 32), 375, rY);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(entry.billed), 705, rY);
      ctx.fillStyle = forest;
      ctx.fillText(fmt(entry.paid), 815, rY);
      ctx.fillStyle = entry.status === 'Paid' ? forest : '#92400E';
      ctx.font = '800 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(entry.status.toUpperCase(), width - 94, rY);
    });
  }

  // 8. Bottom System Forest-to-Lime Gradient Footer & Deep Forest Contact Pill
  const footerH = 115;
  const footerY = height - footerH;
  const footGrad = ctx.createLinearGradient(0, footerY, width, footerY);
  footGrad.addColorStop(0, forest);
  footGrad.addColorStop(0.5, '#1F7A53');
  footGrad.addColorStop(1, accent);
  ctx.fillStyle = footGrad;
  ctx.fillRect(0, footerY, width, footerH);

  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.roundRect(70, footerY + 28, width - 140, 58, 29);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`🌐  ${data.website}`, 112, footerY + 63);
  ctx.textAlign = 'center';
  ctx.fillText(`📞  ${data.supportPhone}`, width / 2, footerY + 63);
  ctx.textAlign = 'right';
  ctx.fillText(`✉️  ${data.supportEmail}`, width - 112, footerY + 63);

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
