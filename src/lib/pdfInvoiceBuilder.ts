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
  propertyName: string;
  unitNumber: string;
  companyName: string;
  companySubtitle: string;
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

function pdfCirclePath(cx: number, cy: number, r: number): string {
  const k = 0.552284749831 * r;
  return [
    `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`,
    `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`,
    `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`,
    `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`,
    `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`,
    'h',
  ].join(' ');
}

/**
 * Generates a full-color vector PDF (Uint8Array) in the System Theme colors
 * displaying all 11 required anniversary rental billing fields:
 * 1. Invoice number        2. Tenant name           3. Property & unit
 * 4. Invoice date          5. Payment due date      6. Billing period start date
 * 7. Billing period end    8. Monthly rent          9. Amount paid
 * 10. Outstanding balance  11. Payment status
 */
export function buildDesignedInvoicePdfBytes(data: PdfInvoicePayload): Uint8Array {
  const pageW = 595.28;
  const pageH = 841.89;
  const topY = (yFromTop: number, h = 0) => pageH - yFromTop - h;
  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;

  // System Theme RGB values (0..1)
  const cPrimary = '0.090 0.137 0.118'; // #17231E Deep Forest
  const cForest = '0.078 0.325 0.220';  // #145338 Emerald
  const cAccent = '0.835 0.949 0.404';  // #D5F267 Electric Lime
  const cBar1 = '0.624 0.886 0.286';    // #9FE249 Soft Lime
  const cCanvas = '0.933 0.957 0.945';  // #EEF4F1 Soft Sage Canvas
  const cCanvasTop = '0.969 0.980 0.973'; // #F7FAF8 Alabaster Sage
  const cBorder = '0.847 0.890 0.867';  // #D8E3DD Card Border
  const cMuted = '0.275 0.329 0.306';   // #46544E Muted Slate
  const cRed = '0.600 0.106 0.106';     // #991B1B Overdue Red
  const cRedBg = '0.996 0.886 0.886';   // #FEE2E2 Soft Red
  const cMintBg = '0.847 0.953 0.898';  // #D8F3E5 Soft Mint
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

  // 1. Sage Canvas Background
  cmds.push(`${cCanvas} rg 0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)} re f`);
  cmds.push(`${cCanvasTop} rg 0 ${(pageH - 315).toFixed(2)} ${pageW.toFixed(2)} 315 re f`);

  // 2. Top-Right Decorative System Lime & Emerald Ring
  const ringCx = pageW - 48;
  const ringCy = pageH - 82;
  cmds.push(`q 32 w ${cAccent} RG ${pdfCirclePath(ringCx, ringCy, 128)} S Q`);
  cmds.push(`q 16 w ${cForest} RG ${pdfCirclePath(ringCx + 10, ringCy - 8, 126)} S Q`);

  // 3. System 3-Bar Emblem + Brand Name & Tagline
  cmds.push(`${cBar1} rg ${pdfRoundedRectPath(46, topY(62, 15), 4.8, 15, 2.4)} f`);
  cmds.push(`${cAccent} rg ${pdfRoundedRectPath(54, topY(54, 23), 4.8, 23, 2.4)} f`);
  cmds.push(`${cForest} rg ${pdfRoundedRectPath(62, topY(58, 19), 4.8, 19, 2.4)} f`);

  addText(data.companyName || 'ARabella agency', 75, 65, 18.5, cPrimary, true, 'left');
  addText(data.companySubtitle || 'Smart Property Management', 75, 81, 9.5, cForest, true, 'left');

  // 4. Top-Right INVOICE Title
  addText('INVOICE', pageW - 46, 74, 30, cPrimary, true, 'right');

  // 5. Left: PAYABLE TO & BANK DETAILS
  addText('PAYABLE TO', 46, 128, 10, cPrimary, true, 'left');
  addText(data.tenantName || 'Resident', 46, 145, 11, cPrimary, true, 'left');
  addText(
    `Property: ${data.propertyName} | Unit: ${data.unitNumber} (Ref: ${data.tenantRef})`,
    46,
    161,
    9.2,
    cMuted,
    false,
    'left'
  );

  addText('BANK DETAILS', 46, 192, 10, cPrimary, true, 'left');
  addText(data.bankName || 'ARabella agency Trust Account', 46, 208, 9.8, cPrimary, true, 'left');
  addText(
    data.bankAccount || `M-Pesa PayBill ${data.paybillNumber} - Account: ${data.tenantRef}`,
    46,
    223,
    9.2,
    cMuted,
    false,
    'left'
  );

  // Right: Invoice Number, Invoice Date, Payment Due Date, Payment Status
  addText(`Invoice Number: ${data.invoiceNumber}`, pageW - 46, 128, 10, cPrimary, true, 'right');
  addText(`Invoice Date: ${data.issueDate}`, pageW - 46, 144, 9.5, cPrimary, false, 'right');
  addText(`Payment Due Date: ${data.dueDate}`, pageW - 46, 160, 9.5, cForest, true, 'right');

  const normStatus = String(data.paymentStatus || 'Pending').trim();
  const statusText = `Payment Status: ${normStatus}`;
  const statusBg =
    normStatus === 'Paid' ? cMintBg : normStatus === 'Overdue' ? cRedBg : cAccent;
  const statusFg =
    normStatus === 'Paid' ? cForest : normStatus === 'Overdue' ? cRed : cPrimary;
  const statusW = estimateHelveticaWidth(statusText, 9, true) + 18;
  cmds.push(
    `${statusBg} rg ${pdfRoundedRectPath(pageW - 46 - statusW, topY(170, 20), statusW, 20, 10)} f`
  );
  addText(statusText, pageW - 55, 183, 9, statusFg, true, 'right');

  // 5b. Dedicated Billing Period Banner Card (Start Date & End Date clearly displayed)
  const bpYTop = 242;
  const bpH = 44;
  cmds.push(
    `q 1 w ${cWhite} rg ${cBorder} RG ${pdfRoundedRectPath(46, topY(bpYTop, bpH), pageW - 92, bpH, 12)} B Q`
  );
  addText('BILLING PERIOD START', 64, bpYTop + 17, 8, cMuted, true, 'left');
  addText(data.billingPeriodStart || data.dueDate, 64, bpYTop + 33, 10.5, cPrimary, true, 'left');

  addText('BILLING PERIOD END', 245, bpYTop + 17, 8, cMuted, true, 'left');
  addText(data.billingPeriodEnd || data.dueDate, 245, bpYTop + 33, 10.5, cPrimary, true, 'left');

  addText('MONTHLY RENT', pageW - 64, bpYTop + 17, 8, cMuted, true, 'right');
  addText(fmt(data.monthlyRent || data.subTotal), pageW - 64, bpYTop + 33, 10.5, cForest, true, 'right');

  // 6. Forest-to-Emerald Rounded Pill Table Header Bar
  const pillYTop = 302;
  const pillH = 34;
  cmds.push(`${cForest} rg ${pdfRoundedRectPath(46, topY(pillYTop, pillH), pageW - 92, pillH, 17)} f`);

  const headerTextY = pillYTop + 21;
  addText('ITEM DESCRIPTION', 66, headerTextY, 9.5, cAccent, true, 'left');
  addText('QTY', 336, headerTextY, 9.5, cWhite, true, 'center');
  addText('PRICE', 435, headerTextY, 9.5, cWhite, true, 'right');
  addText('TOTAL', pageW - 66, headerTextY, 9.5, cAccent, true, 'right');

  // 7. White Rounded Line Items Card
  const items =
    data.items && data.items.length > 0
      ? data.items
      : [
          {
            description: `Monthly Rent (${data.billingPeriodStart} - ${data.billingPeriodEnd})`,
            qty: 1,
            price: data.monthlyRent || data.subTotal,
            total: data.monthlyRent || data.subTotal,
          },
        ];

  const cardYTop = 348;
  const rowH = 34;
  const cardH = Math.max(76, items.length * rowH + 28);
  cmds.push(
    `q 1 w ${cWhite} rg ${cBorder} RG ${pdfRoundedRectPath(46, topY(cardYTop, cardH), pageW - 92, cardH, 14)} B Q`
  );

  items.forEach((item, idx) => {
    const rY = cardYTop + 28 + idx * rowH;
    if (idx > 0) {
      const divY = pageH - (rY - 19);
      cmds.push(
        `q 0.6 w 0.93 0.95 0.94 RG 64 ${divY.toFixed(2)} m ${(pageW - 64).toFixed(2)} ${divY.toFixed(2)} l S Q`
      );
    }
    const desc = String(item.description || '').slice(0, 56);
    addText(desc, 66, rY, 9.8, cPrimary, true, 'left');
    addText(String(item.qty || 1), 336, rY, 9.8, cMuted, false, 'center');
    addText(fmt(item.price), 435, rY, 9.8, cMuted, false, 'right');
    addText(fmt(item.total), pageW - 66, rY, 9.8, cPrimary, true, 'right');
  });

  // 8. Notes (Left) & White Rounded Totals Card (Right)
  const notesYTop = cardYTop + cardH + 26;
  addText('NOTES:', 48, notesYTop + 14, 10, cPrimary, true, 'left');

  const noteLines = [
    `Billing Cycle: ${data.billingPeriodStart} to ${data.billingPeriodEnd}.`,
    `Payment is due on your monthly move-in anniversary (${data.dueDate}).`,
    `Kindly quote Account Ref ${data.tenantRef} on all M-Pesa PayBill`,
    `(${data.paybillNumber}) or Bank payments for automatic reconciliation.`,
  ];
  noteLines.forEach((line, idx) => {
    addText(line, 48, notesYTop + 32 + idx * 14, 8.8, cMuted, false, 'left');
  });

  const totCardW = 240;
  const totCardH = 114;
  const totCardX = pageW - 46 - totCardW;
  cmds.push(
    `q 1 w ${cWhite} rg ${cBorder} RG ${pdfRoundedRectPath(totCardX, topY(notesYTop, totCardH), totCardW, totCardH, 14)} B Q`
  );

  addText('MONTHLY RENT', totCardX + 16, notesYTop + 24, 9.2, cPrimary, true, 'left');
  addText(fmt(data.monthlyRent || data.subTotal), pageW - 62, notesYTop + 24, 9.2, cPrimary, true, 'right');

  addText('AMOUNT PAID', totCardX + 16, notesYTop + 45, 9.2, cPrimary, true, 'left');
  addText(fmt(data.amountPaid), pageW - 62, notesYTop + 45, 9.2, cForest, true, 'right');

  addText('PAYMENT STATUS', totCardX + 16, notesYTop + 65, 9.2, cPrimary, true, 'left');
  addText(normStatus.toUpperCase(), pageW - 62, notesYTop + 65, 9.2, statusFg, true, 'right');

  const totDivY = pageH - (notesYTop + 76);
  cmds.push(
    `q 0.8 w ${cBorder} RG ${(totCardX + 16).toFixed(2)} ${totDivY.toFixed(2)} m ${(pageW - 62).toFixed(2)} ${totDivY.toFixed(2)} l S Q`
  );

  addText('OUTSTANDING BALANCE', totCardX + 16, notesYTop + 97, 9.2, cPrimary, true, 'left');

  // Electric Lime pill behind Outstanding Balance value
  const grandStr = fmt(data.grandTotal);
  const grandW = estimateHelveticaWidth(grandStr, 10, true) + 14;
  cmds.push(
    `${cAccent} rg ${pdfRoundedRectPath(pageW - 58 - grandW, topY(notesYTop + 83, 20), grandW, 20, 6)} f`
  );
  addText(grandStr, pageW - 65, notesYTop + 97, 10, cPrimary, true, 'right');

  // 9. Bottom System Forest-to-Lime Wave Footer & Deep Forest Contact Pill Bar
  const footerH = 78;
  cmds.push(`${cForest} rg 0 0 ${pageW.toFixed(2)} ${footerH.toFixed(2)} re f`);
  cmds.push(`${cAccent} rg 0 ${(footerH - 4).toFixed(2)} ${pageW.toFixed(2)} 4 re f`);

  const contactPillYTop = pageH - footerH + 20;
  const contactPillH = 38;
  cmds.push(
    `${cPrimary} rg ${pdfRoundedRectPath(46, topY(contactPillYTop, contactPillH), pageW - 92, contactPillH, 19)} f`
  );

  const contactTextY = contactPillYTop + 23;
  cmds.push(`${cAccent} rg ${pdfCirclePath(68, pageH - (contactPillYTop + 19), 8)} f`);
  addText('W', 68, contactPillYTop + 22, 7.5, cPrimary, true, 'center');
  addText(data.website || 'www.arabella-agency.co.ke', 82, contactTextY, 8.8, cWhite, true, 'left');

  cmds.push(`${cAccent} rg ${pdfCirclePath(252, pageH - (contactPillYTop + 19), 8)} f`);
  addText('P', 252, contactPillYTop + 22, 7.5, cPrimary, true, 'center');
  addText(data.supportPhone || '+254 712 345 678', 266, contactTextY, 8.8, cWhite, true, 'left');

  cmds.push(`${cAccent} rg ${pdfCirclePath(404, pageH - (contactPillYTop + 19), 8)} f`);
  addText('@', 404, contactPillYTop + 22, 7.5, cPrimary, true, 'center');
  addText(data.supportEmail || 'billing@arabella.co.ke', 418, contactTextY, 8.8, cWhite, true, 'left');

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
