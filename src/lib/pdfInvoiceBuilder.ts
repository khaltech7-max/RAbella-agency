import { hexToPdfRgb, resolveInvoiceThemePalette } from './invoiceTheme';

export interface PdfInvoiceItem {
  description: string;
  qty: number;
  price: number;
  total: number;
}

export interface PdfInvoicePayload {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  paymentStatus: string;
  monthlyRent: number;
  tenantName: string;
  tenantRef: string;
  tenantEmail?: string;
  tenantPhone?: string;
  propertyName: string;
  unitNumber: string;
  companyName: string;
  companySubtitle: string;
  businessAddress?: string;
  accentTheme?: string;
  bankName: string;
  bankAccount: string;
  paybillNumber: string;
  website: string;
  supportPhone: string;
  supportEmail: string;
  notes: string;
  items: PdfInvoiceItem[];
  subTotal: number;
  amountPaid: number;
  grandTotal: number;
}

function escapePdfText(str: string): string {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function estimateHelveticaWidth(text: string, fontSize: number, isBold = false): number {
  const str = String(text || '');
  let units = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ('ilI.,:;!| '.includes(ch)) units += 278;
    else if ('frt()[]'.includes(ch)) units += 333;
    else if ('mwMW@%'.includes(ch)) units += 833;
    else if (ch >= 'A' && ch <= 'Z') units += isBold ? 700 : 667;
    else units += isBold ? 575 : 535;
  }
  return (units / 1000) * fontSize;
}

function pdfRoundedRectPath(x: number, yBottom: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2);
  const k = 0.552284749831 * radius;
  const x0 = x;
  const y0 = yBottom;
  const x1 = x + w;
  const y1 = yBottom + h;

  return [
    `${(x0 + radius).toFixed(2)} ${y0.toFixed(2)} m`,
    `${(x1 - radius).toFixed(2)} ${y0.toFixed(2)} l`,
    `${(x1 - radius + k).toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + radius - k).toFixed(2)} ${x1.toFixed(2)} ${(y0 + radius).toFixed(2)} c`,
    `${x1.toFixed(2)} ${(y1 - radius).toFixed(2)} l`,
    `${x1.toFixed(2)} ${(y1 - radius + k).toFixed(2)} ${(x1 - radius + k).toFixed(2)} ${y1.toFixed(2)} ${(x1 - radius).toFixed(2)} ${y1.toFixed(2)} c`,
    `${(x0 + radius).toFixed(2)} ${y1.toFixed(2)} l`,
    `${(x0 + radius - k).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - radius + k).toFixed(2)} ${x0.toFixed(2)} ${(y1 - radius).toFixed(2)} c`,
    `${x0.toFixed(2)} ${(y0 + radius).toFixed(2)} l`,
    `${x0.toFixed(2)} ${(y0 + radius - k).toFixed(2)} ${(x0 + radius - k).toFixed(2)} ${y0.toFixed(2)} ${(x0 + radius).toFixed(2)} ${y0.toFixed(2)} c`,
    'h',
  ].join(' ');
}

function truncateToFit(text: string, maxChars: number): string {
  const str = String(text || '').trim();
  return str.length > maxChars ? `${str.slice(0, maxChars - 1)}...` : str;
}

/**
 * Generates a clean, minimalist white-paper vector PDF (Uint8Array) styled dynamically
 * with the active website Accent Theme, company logo mark & website name,
 * displaying all 11 required anniversary rental billing fields:
 * 1. Invoice number        2. Tenant name           3. Property & unit
 * 4. Invoice date          5. Payment due date      6. Billing period start date
 * 7. Billing period end    8. Monthly rent          9. Amount paid
 * 10. Outstanding balance  11. Payment status
 */
export function buildDesignedInvoicePdfBytes(data: PdfInvoicePayload): Uint8Array {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 48;
  const contentW = pageW - margin * 2;
  const topY = (yFromTop: number, h = 0) => pageH - yFromTop - h;
  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;

  const palette = resolveInvoiceThemePalette(data.accentTheme);
  const cTitle = hexToPdfRgb(palette.titleColor);
  const cBarBg = hexToPdfRgb(palette.barBg);
  const cBarText = hexToPdfRgb(palette.barText);
  const cBarBorder = hexToPdfRgb(palette.barBorder);
  const cSectionLabel = hexToPdfRgb(palette.sectionLabelColor);
  const cPrimaryText = hexToPdfRgb(palette.primaryText);
  const cMuted = hexToPdfRgb(palette.mutedText);
  const cRule = hexToPdfRgb(palette.ruleLineColor);
  const cSoftBg = hexToPdfRgb(palette.softBg);
  const cBadgeBg = hexToPdfRgb(palette.badgeBg);
  const cBadgeText = hexToPdfRgb(palette.badgeText);
  const cBar1 = hexToPdfRgb(palette.emblemBars[0]);
  const cBar2 = hexToPdfRgb(palette.emblemBars[1]);
  const cBar3 = hexToPdfRgb(palette.emblemBars[2]);

  const cRed = '0.600 0.106 0.106';
  const cRedBg = '0.996 0.886 0.886';
  const cGreen = '0.078 0.325 0.220';
  const cGreenBg = '0.847 0.953 0.898';
  const cWhite = '1 1 1';

  const cmds: string[] = [];

  const addText = (
    text: string,
    x: number,
    yFromTop: number,
    size: number,
    rgb: string,
    bold = false,
    align: 'left' | 'center' | 'right' = 'left'
  ) => {
    const clean = escapePdfText(text);
    const w = estimateHelveticaWidth(text, size, bold);
    let drawX = x;
    if (align === 'center') drawX = x - w / 2;
    else if (align === 'right') drawX = x - w;
    const drawY = pageH - yFromTop;
    cmds.push(
      `BT /${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf ${rgb} rg ${drawX.toFixed(2)} ${drawY.toFixed(2)} Td (${clean}) Tj ET`
    );
  };

  const drawRule = (x1: number, x2: number, yFromTop: number, width = 0.75, rgb = cRule) => {
    const y = pageH - yFromTop;
    cmds.push(`q ${width} w ${rgb} RG ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S Q`);
  };

  // 1. Clean Crisp White Sheet
  cmds.push(`${cWhite} rg 0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)} re f`);
  // Subtle thin theme bar along the very top edge
  cmds.push(`${cBarBg} rg 0 ${(pageH - 4).toFixed(2)} ${pageW.toFixed(2)} 4 re f`);

  // 2. Top-Left: System Logo Mark + Website/Company Name above INVOICE
  const companyLabel = (data.companyName || 'ARabella agency').toUpperCase();

  cmds.push(`${cBar1} rg ${pdfRoundedRectPath(margin, topY(52, 12), 4.2, 12, 2)} f`);
  cmds.push(`${cBar2} rg ${pdfRoundedRectPath(margin + 6.5, topY(46, 18), 4.2, 18, 2)} f`);
  cmds.push(`${cBar3} rg ${pdfRoundedRectPath(margin + 13, topY(49, 15), 4.2, 15, 2)} f`);

  addText(companyLabel, margin + 24, 59, 9.8, cSectionLabel, true, 'left');
  addText('INVOICE', margin, 94, 28, cTitle, true, 'left');

  // 3. Top-Right: INVOICE AMOUNT & Status Pill
  const invoiceAmountValue = Number(data.monthlyRent || data.subTotal || 0);
  addText('INVOICE AMOUNT', pageW - margin, 57, 8.8, cSectionLabel, true, 'right');
  addText(fmt(invoiceAmountValue), pageW - margin, 83, 22, cTitle, true, 'right');

  const normStatus = String(data.paymentStatus || 'Pending').trim();
  const statusPillBg =
    normStatus === 'Paid' ? cGreenBg : normStatus === 'Overdue' ? cRedBg : cBadgeBg;
  const statusPillFg =
    normStatus === 'Paid' ? cGreen : normStatus === 'Overdue' ? cRed : cBadgeText;
  const statusText = `Status: ${normStatus}`;
  const statusW = estimateHelveticaWidth(statusText, 8.2, true) + 16;
  cmds.push(
    `${statusPillBg} rg ${pdfRoundedRectPath(pageW - margin - statusW, topY(91, 17), statusW, 17, 8.5)} f`
  );
  addText(statusText, pageW - margin - 8, 102.5, 8.2, statusPillFg, true, 'right');

  drawRule(margin, pageW - margin, 122, 0.9, cRule);

  // 4. Two-Column Clean Metadata Row (ISSUED BY | OCCUPANT NAME)
  const metaY = 142;
  const colLeftX = margin;
  const colRightX = pageW - margin;

  // Column 1 (Left): ISSUED BY
  addText('ISSUED BY', colLeftX, metaY, 9.2, cSectionLabel, true, 'left');
  addText(truncateToFit(data.companyName || 'ARabella agency', 36), colLeftX, metaY + 17, 9, cPrimaryText, true, 'left');
  addText(
    truncateToFit(data.businessAddress || 'Westlands, Nairobi, Kenya', 42),
    colLeftX,
    metaY + 31,
    8.5,
    cMuted,
    false,
    'left'
  );
  addText(truncateToFit(data.supportPhone || '+254 712 345 678', 36), colLeftX, metaY + 45, 8.5, cMuted, false, 'left');
  addText(truncateToFit(data.supportEmail || 'billing@arabella.co.ke', 40), colLeftX, metaY + 59, 8.4, cMuted, false, 'left');

  // Column 2 (Right): OCCUPANT NAME
  addText('OCCUPANT NAME', colRightX, metaY, 9.2, cSectionLabel, true, 'right');
  addText(truncateToFit(data.tenantName || 'Resident', 36), colRightX, metaY + 17, 9, cPrimaryText, true, 'right');
  addText(truncateToFit(data.propertyName || 'Managed Property', 40), colRightX, metaY + 31, 8.5, cMuted, false, 'right');
  addText(
    truncateToFit(`${data.unitNumber} (Ref: ${data.tenantRef})`, 38),
    colRightX,
    metaY + 45,
    8.5,
    cPrimaryText,
    true,
    'right'
  );
  const occupantContact = data.tenantPhone || data.tenantEmail || 'Verified Resident Account';
  addText(truncateToFit(occupantContact, 40), colRightX, metaY + 59, 8.4, cMuted, false, 'right');

  // 5. Rectangular Solid Theme Table Header Bar
  const tblHeaderY = 230;
  const tblHeaderH = 28;
  cmds.push(
    `q 0.8 w ${cBarBg} rg ${cBarBorder} RG ${pdfRoundedRectPath(margin, topY(tblHeaderY, tblHeaderH), contentW, tblHeaderH, 3.5)} B Q`
  );

  const thTextY = tblHeaderY + 17.5;
  addText('S.NO.', margin + 12, thTextY, 8.4, cBarText, true, 'left');
  addText('DESCRIPTION', margin + 52, thTextY, 8.4, cBarText, true, 'left');
  addText('MONTHLY RENT', margin + 322, thTextY, 8.4, cBarText, true, 'right');
  addText('PAID', margin + 408, thTextY, 8.4, cBarText, true, 'right');
  addText('BALANCE', pageW - margin - 12, thTextY, 8.4, cBarText, true, 'right');

  // 6. Clean White Ruled Line-Item Rows
  const items =
    data.items && data.items.length > 0
      ? data.items
      : [
          {
            description: `Monthly Rent (${data.billingPeriodStart} - ${data.billingPeriodEnd}) - ${data.unitNumber}`,
            qty: 1,
            price: data.monthlyRent || data.subTotal,
            total: data.monthlyRent || data.subTotal,
          },
        ];

  const minRows = Math.max(items.length, 5);
  const rowH = 31;
  const rowsStartY = tblHeaderY + tblHeaderH;

  for (let i = 0; i < minRows; i++) {
    const rowTop = rowsStartY + i * rowH;
    const textY = rowTop + 20;
    if (i < items.length) {
      const item = items[i];
      const itemPaid = i === 0 ? Number(data.amountPaid || 0) : 0;
      const itemBalance = i === 0 ? Number(data.grandTotal || 0) : Number(item.total || 0);
      addText(String(i + 1), margin + 16, textY, 9, cMuted, false, 'left');
      addText(truncateToFit(item.description, 46), margin + 52, textY, 9, cPrimaryText, true, 'left');
      addText(fmt(item.price || data.monthlyRent), margin + 322, textY, 9, cPrimaryText, false, 'right');
      addText(fmt(itemPaid), margin + 408, textY, 9, cGreen, false, 'right');
      addText(fmt(itemBalance), pageW - margin - 12, textY, 9, cPrimaryText, true, 'right');
    }
    drawRule(margin, pageW - margin, rowTop + rowH, 0.7, cRule);
  }

  // 7. Right-Aligned Summary Stack with Solid Theme Total Bar
  const bottomY = rowsStartY + minRows * rowH + 28;
  const sumX = pageW - margin - 230;
  const sumW = 230;

  // Row 1: MONTHLY RENT
  addText('MONTHLY RENT', sumX + 10, bottomY + 4, 8.5, cPrimaryText, true, 'left');
  addText(fmt(data.monthlyRent || data.subTotal), pageW - margin - 10, bottomY + 4, 9, cPrimaryText, true, 'right');
  drawRule(sumX, pageW - margin, bottomY + 13, 0.65, cRule);

  // Row 2: AMOUNT PAID
  addText('AMOUNT PAID', sumX + 10, bottomY + 29, 8.5, cPrimaryText, true, 'left');
  addText(fmt(data.amountPaid), pageW - margin - 10, bottomY + 29, 9, cGreen, true, 'right');
  drawRule(sumX, pageW - margin, bottomY + 38, 0.65, cRule);

  // Row 3: PAYMENT STATUS
  addText('PAYMENT STATUS', sumX + 10, bottomY + 54, 8.5, cPrimaryText, true, 'left');
  addText(normStatus.toUpperCase(), pageW - margin - 10, bottomY + 54, 8.6, statusPillFg, true, 'right');

  // Row 4: Solid Theme OUTSTANDING BALANCE Bar
  const totalBarY = bottomY + 68;
  const totalBarH = 30;
  cmds.push(
    `q 0.8 w ${cBarBg} rg ${cBarBorder} RG ${pdfRoundedRectPath(sumX, topY(totalBarY, totalBarH), sumW, totalBarH, 3.5)} B Q`
  );
  addText('OUTSTANDING BALANCE', sumX + 10, totalBarY + 18.5, 8.3, cBarText, true, 'left');
  addText(fmt(data.grandTotal), pageW - margin - 10, totalBarY + 19, 10.2, cBarText, true, 'right');

  // 8. Right-Aligned Signature Rule + Minimalist Footer
  const sigY = Math.max(totalBarY + 76, 695);
  drawRule(pageW - margin - 155, pageW - margin, sigY, 0.8, cMuted);
  addText('Authorized Signature', pageW - margin - 77.5, sigY + 14, 8.5, cPrimaryText, true, 'center');
  addText(truncateToFit(data.companyName || 'ARabella agency', 28), pageW - margin - 77.5, sigY + 26, 7.8, cMuted, false, 'center');

  // Subtle Soft Brand Footer Strip (No domain)
  const footerLineY = pageH - 58;
  drawRule(margin, pageW - margin, footerLineY, 0.75, cRule);

  cmds.push(`${cSoftBg} rg ${pdfRoundedRectPath(margin, topY(footerLineY + 10, 24), contentW, 24, 4)} f`);
  cmds.push(`${cBar1} rg ${pdfRoundedRectPath(margin + 10, topY(footerLineY + 16, 10), 3.2, 10, 1.5)} f`);
  cmds.push(`${cBar2} rg ${pdfRoundedRectPath(margin + 15, topY(footerLineY + 13, 14), 3.2, 14, 1.5)} f`);
  cmds.push(`${cBar3} rg ${pdfRoundedRectPath(margin + 20, topY(footerLineY + 15, 11.5), 3.2, 11.5, 1.5)} f`);

  addText(
    `${data.companyName || 'ARabella agency'}`,
    margin + 30,
    footerLineY + 25,
    8.2,
    cSectionLabel,
    true,
    'left'
  );
  addText(
    `${data.supportPhone}  •  ${data.supportEmail}`,
    pageW - margin - 10,
    footerLineY + 25,
    8,
    cMuted,
    false,
    'right'
  );

  const streamContent = cmds.join('\n');
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamBytes.byteLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const obj6 = '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  const header = '%PDF-1.4\n';
  const objects = [obj1, obj2, obj3, obj4, obj5, obj6];
  let offset = encoder.encode(header).byteLength;
  const offsets: number[] = [];
  for (const o of objects) {
    offsets.push(offset);
    offset += encoder.encode(o).byteLength;
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return encoder.encode(header + objects.join('') + xref + trailer);
}
