import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Printer,
  FileText,
  Image as ImageIcon,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  InvoiceDocumentData,
  downloadDesignedInvoiceFile,
  downloadDesignedInvoicePng,
  printDesignedInvoicePdf,
} from '../lib/invoiceGenerator';

interface InvoicePreviewModalProps {
  invoiceData: InvoiceDocumentData | null;
  onClose: () => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoiceData,
  onClose,
}) => {
  const [downloadedType, setDownloadedType] = useState<'png' | 'html' | 'pdf' | null>(null);
  const [showLedger, setShowLedger] = useState<boolean>(false);
  const [fitScreen, setFitScreen] = useState<boolean>(true);

  if (!invoiceData || typeof document === 'undefined') return null;

  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;
  const primary = invoiceData.primaryColor || '#17231E';
  const forest = invoiceData.forestColor || '#145338';
  const accent = invoiceData.accentColor || '#D5F267';
  const mint = invoiceData.mintColor || '#D8F3E5';

  const statusBadge =
    invoiceData.status === 'Paid'
      ? { bg: mint, text: forest, label: 'Paid' }
      : invoiceData.status === 'Overdue'
      ? { bg: '#FEE2E2', text: '#991B1B', label: 'Overdue' }
      : { bg: accent, text: primary, label: 'Pending' };

  const totalLedgerBilled = invoiceData.ledgerEntries.reduce((s, e) => s + e.billed, 0);
  const totalLedgerPaid = invoiceData.ledgerEntries.reduce((s, e) => s + e.paid, 0);
  const totalLedgerBalance = Math.max(0, totalLedgerBilled - totalLedgerPaid);

  const handleDownloadPng = () => {
    downloadDesignedInvoicePng(invoiceData, 'Invoice');
    setDownloadedType('png');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const handleDownloadHtml = () => {
    downloadDesignedInvoiceFile(invoiceData, 'Invoice-Ledger');
    setDownloadedType('html');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const handlePrintPdf = () => {
    printDesignedInvoicePdf(invoiceData);
    setDownloadedType('pdf');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs overflow-y-auto flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Floating Top Action Toolbar */}
      <div
        className="w-full max-w-[780px] rounded-2xl px-4 py-2.5 mb-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xl border border-[#2A453A] shrink-0"
        style={{ backgroundColor: primary }}
      >
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold tracking-wider uppercase"
            style={{ backgroundColor: accent, color: primary }}
          >
            {invoiceData.invoiceNumber}
          </span>
          <span className="text-white text-[12.5px] font-bold truncate max-w-[180px] sm:max-w-xs">
            {invoiceData.tenantName} ({invoiceData.tenantRef})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFitScreen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors cursor-pointer"
            title={fitScreen ? 'Switch to expanded view' : 'Fit full invoice on screen'}
          >
            {fitScreen ? (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>Expand</span>
              </>
            ) : (
              <>
                <Minimize2 className="w-3 h-3" />
                <span>Fit Screen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowLedger((v) => !v)}
            className="px-2.5 py-1 rounded-full bg-[#21362D] hover:bg-[#2A453A] text-[#D8F3E5] text-[11px] font-bold transition-colors cursor-pointer"
          >
            {showLedger ? 'Hide Ledger' : 'View Ledger'}
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-[11px] font-bold shadow-xs cursor-pointer"
            style={{
              background: `linear-gradient(90deg, ${forest} 0%, #1F7A53 100%)`,
            }}
          >
            {downloadedType === 'png' ? (
              <>
                <Check className="w-3 h-3" />
                <span>PNG Saved</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-3 h-3" />
                <span>PNG</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-xs cursor-pointer"
            style={{ backgroundColor: accent, color: primary }}
          >
            {downloadedType === 'html' ? (
              <>
                <Check className="w-3 h-3" />
                <span>PDF Saved</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer"
          >
            <Printer className="w-3 h-3" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer ml-0.5"
            title="Close Invoice Preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Full Invoice Sheet Container — Fits Entire Invoice on Screen */}
      <div
        data-invoice-paper="true"
        className={`w-full ${
          fitScreen ? 'max-w-[700px]' : 'max-w-[820px]'
        } rounded-[22px] overflow-hidden relative shadow-2xl border border-[#D5E2DB] shrink-0 transition-all duration-200`}
        style={{
          background: 'linear-gradient(165deg, #F8FBF9 0%, #EEF4F1 55%, #E0EBE5 100%)',
          color: primary,
        }}
      >
        {/* Top-Right Decorative System Lime-to-Emerald Gradient Ring */}
        <div
          className={`pointer-events-none absolute rounded-full ${
            fitScreen
              ? '-top-20 -right-20 w-[290px] h-[290px]'
              : '-top-24 -right-24 w-[370px] h-[370px]'
          }`}
          style={{
            border: `${fitScreen ? '36px' : '44px'} solid transparent`,
            background: `linear-gradient(165deg, #F8FBF9, #EEF4F1) padding-box, linear-gradient(135deg, rgba(216,243,229,0.25) 0%, ${accent} 52%, ${forest} 100%) border-box`,
          }}
        />

        {/* Main Invoice Sheet Body */}
        <div
          className={`relative z-10 ${
            fitScreen ? 'px-6 sm:px-9 pt-6 pb-5' : 'px-6 sm:px-12 pt-9 pb-7'
          }`}
        >
          {/* Header: System Logo vs INVOICE */}
          <div className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {invoiceData.companyLogoUrl && invoiceData.companyLogoUrl.trim() ? (
                <img
                  src={invoiceData.companyLogoUrl}
                  alt={invoiceData.companyName}
                  className={`${
                    fitScreen ? 'w-10 h-10 rounded-[13px]' : 'w-12 h-12 rounded-[16px]'
                  } object-contain p-1 shadow-md shrink-0`}
                  style={{ backgroundColor: accent, border: `1.5px solid ${primary}` }}
                />
              ) : null}

              <div className="flex items-center gap-2.5">
                {/* System 3-Bar Emblem */}
                <div className="flex items-end gap-[4px] h-7">
                  <span className="w-[5.5px] h-[16px] rounded-full bg-[#9FE249]" />
                  <span
                    className="w-[5.5px] h-[24px] rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <span
                    className="w-[5.5px] h-[19px] rounded-full"
                    style={{ backgroundColor: forest }}
                  />
                </div>
                <div>
                  <div
                    className={`${
                      fitScreen ? 'text-[19px] sm:text-[21px]' : 'text-[22px] sm:text-[24px]'
                    } font-extrabold tracking-tight leading-tight`}
                    style={{ color: primary }}
                  >
                    {invoiceData.companyName || 'ARabella agency'}
                  </div>
                  <div
                    className="text-[11.5px] font-bold"
                    style={{ color: forest }}
                  >
                    {invoiceData.companySubtitle || 'Smart Property Management'}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right">
              <h1
                className={`${
                  fitScreen ? 'text-[28px] sm:text-[34px]' : 'text-[36px] sm:text-[42px]'
                } font-extrabold tracking-[0.06em] leading-none`}
                style={{ color: primary }}
              >
                INVOICE
              </h1>
            </div>
          </div>

          {/* Payable To / Bank Details & Number / Date Row */}
          <div
            className={`${
              fitScreen ? 'mt-5' : 'mt-8'
            } flex flex-row items-start justify-between gap-4`}
          >
            <div className={fitScreen ? 'space-y-3' : 'space-y-4'}>
              <div>
                <div
                  className="text-[12.5px] font-extrabold tracking-[0.05em] uppercase"
                  style={{ color: primary }}
                >
                  PAYABLE TO
                </div>
                <div
                  className="text-[14px] font-bold mt-0.5"
                  style={{ color: primary }}
                >
                  {invoiceData.tenantName}
                </div>
                <div className="text-[12.5px] text-[#46544E]">
                  {invoiceData.unitNumber} • {invoiceData.propertyName} (Ref:{' '}
                  <strong className="font-bold" style={{ color: forest }}>
                    {invoiceData.tenantRef}
                  </strong>
                  )
                </div>
              </div>

              <div>
                <div
                  className="text-[12.5px] font-extrabold tracking-[0.05em] uppercase"
                  style={{ color: primary }}
                >
                  BANK DETAILS
                </div>
                <div
                  className="text-[13px] font-semibold mt-0.5"
                  style={{ color: primary }}
                >
                  {invoiceData.bankName}
                </div>
                <div className="text-[12.5px] text-[#46544E] tabular-nums">
                  {invoiceData.bankAccount}
                </div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="text-[12.5px]" style={{ color: primary }}>
                Invoice Number: <strong className="font-extrabold">{invoiceData.invoiceNumber}</strong>
              </div>
              <div className="text-[12.5px]" style={{ color: primary }}>
                Invoice Date: <strong className="font-bold">{invoiceData.issueDate}</strong>
              </div>
              <div className="text-[12.5px] text-[#46544E]">
                Payment Due Date:{' '}
                <strong className="font-bold" style={{ color: forest }}>
                  {invoiceData.dueDate}
                </strong>
              </div>
              <div className="pt-0.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold"
                  style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
                >
                  Payment Status: {statusBadge.label}
                </span>
              </div>
            </div>
          </div>

          {/* Dedicated Billing Period Start & End Card */}
          <div
            className={`${
              fitScreen ? 'mt-3.5 px-4 py-2.5' : 'mt-5 px-5 py-3.5'
            } bg-white rounded-[14px] border border-[#DCE7E1] grid grid-cols-3 gap-3 items-center`}
          >
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#5A6762]">
                Billing Period Start
              </div>
              <div className="text-[12.5px] font-extrabold mt-0.5" style={{ color: primary }}>
                {invoiceData.billingPeriodStart}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#5A6762]">
                Billing Period End
              </div>
              <div className="text-[12.5px] font-extrabold mt-0.5" style={{ color: primary }}>
                {invoiceData.billingPeriodEnd}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#5A6762]">
                Monthly Rent
              </div>
              <div className="text-[12.5px] font-extrabold mt-0.5 tabular-nums" style={{ color: forest }}>
                {fmt(invoiceData.monthlyRent || invoiceData.subTotal)}
              </div>
            </div>
          </div>

          {/* System Forest-to-Emerald Pill Header Bar */}
          <div
            className={`${
              fitScreen ? 'mt-3.5 py-2.5 px-5' : 'mt-5 py-3.5 px-7'
            } rounded-full text-white shadow-md`}
            style={{
              background: `linear-gradient(90deg, ${primary} 0%, ${forest} 58%, #1E704D 100%)`,
            }}
          >
            <div className="grid grid-cols-12 items-center text-[11.5px] sm:text-[12.5px] font-extrabold tracking-[0.08em] uppercase">
              <div className="col-span-6 text-left" style={{ color: accent }}>
                ITEM DESCRIPTION
              </div>
              <div className="col-span-2 text-center">QTY</div>
              <div className="col-span-2 text-right">PRICE</div>
              <div className="col-span-2 text-right" style={{ color: accent }}>
                TOTAL
              </div>
            </div>
          </div>

          {/* White Rounded Line Items Card */}
          <div
            className={`${
              fitScreen ? 'mt-2.5 px-5 py-2.5' : 'mt-3.5 px-7 py-4'
            } bg-white rounded-[18px] shadow-xs border border-[#E4ECE8]`}
          >
            <div className="divide-y divide-[#EEF3F0]">
              {invoiceData.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-12 items-center ${
                    fitScreen ? 'py-2.5 text-[12.5px]' : 'py-3.5 text-[13.5px]'
                  }`}
                  style={{ color: primary }}
                >
                  <div className="col-span-6 font-semibold pr-2">{item.description}</div>
                  <div className="col-span-2 text-center font-semibold text-[#46544E] tabular-nums">
                    {item.qty}
                  </div>
                  <div className="col-span-2 text-right font-semibold text-[#46544E] tabular-nums">
                    {item.price === 0 ? 'Included' : fmt(item.price)}
                  </div>
                  <div
                    className="col-span-2 text-right font-extrabold tabular-nums"
                    style={{ color: primary }}
                  >
                    {item.total === 0 ? 'KSh 0.00' : fmt(item.total)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes & Sub Total / Grand Total Row */}
          <div
            className={`${
              fitScreen ? 'mt-4' : 'mt-6'
            } flex flex-col sm:flex-row items-start justify-between gap-4`}
          >
            <div className="max-w-xs pt-0.5">
              <div
                className="text-[12.5px] font-extrabold tracking-[0.05em] uppercase"
                style={{ color: primary }}
              >
                NOTES:
              </div>
              <p className="text-[11.5px] text-[#46544E] leading-relaxed mt-1">
                {invoiceData.notes}
              </p>
            </div>

            <div
              className={`w-full sm:w-72 bg-white rounded-[18px] ${
                fitScreen ? 'px-5 py-3 space-y-1.5' : 'px-6 py-4 space-y-2'
              } shadow-xs border border-[#E4ECE8] shrink-0`}
            >
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-extrabold tracking-[0.04em]" style={{ color: primary }}>
                  MONTHLY RENT
                </span>
                <span className="font-bold tabular-nums" style={{ color: primary }}>
                  {fmt(invoiceData.monthlyRent || invoiceData.subTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-extrabold tracking-[0.04em]" style={{ color: primary }}>
                  AMOUNT PAID
                </span>
                <span className="font-bold tabular-nums" style={{ color: forest }}>
                  {fmt(invoiceData.amountPaid)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-extrabold tracking-[0.04em]" style={{ color: primary }}>
                  PAYMENT STATUS
                </span>
                <span className="font-extrabold" style={{ color: statusBadge.text }}>
                  {statusBadge.label}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E4ECE8] flex items-center justify-between text-[12.5px]">
                <span className="font-extrabold tracking-[0.04em]" style={{ color: primary }}>
                  OUTSTANDING BALANCE
                </span>
                <span
                  className="font-extrabold px-2.5 py-0.5 rounded-lg tabular-nums"
                  style={{ backgroundColor: accent, color: primary }}
                >
                  {fmt(invoiceData.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Optional Chronological Tenant Account Ledger Section */}
          {showLedger && invoiceData.ledgerEntries.length > 0 && (
            <div className="mt-5 pt-4 border-t border-dashed border-[#B8CEC2]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div
                  className="text-[11.5px] font-extrabold tracking-[0.07em] uppercase flex items-center gap-1.5"
                  style={{ color: primary }}
                >
                  <FileText className="w-3.5 h-3.5" style={{ color: forest }} />
                  <span>TENANT STATEMENT OF ACCOUNT LEDGER ({invoiceData.tenantRef})</span>
                </div>
              </div>

              <div className="bg-white rounded-[14px] overflow-hidden shadow-xs border border-[#DCE7E1]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11.5px]">
                    <thead>
                      <tr
                        className="text-white text-[10px] font-extrabold uppercase tracking-wider"
                        style={{
                          background: `linear-gradient(90deg, ${primary} 0%, ${forest} 60%, #1E704D 100%)`,
                        }}
                      >
                        <th className="py-2 px-3" style={{ color: accent }}>
                          Ref / Code
                        </th>
                        <th className="py-2 px-2.5">Period / Due</th>
                        <th className="py-2 px-2.5">Ledger Description</th>
                        <th className="py-2 px-2.5 text-right">Billed</th>
                        <th className="py-2 px-2.5 text-right">Paid</th>
                        <th className="py-2 px-2.5 text-right">Balance</th>
                        <th className="py-2 px-3 text-center" style={{ color: accent }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]" style={{ color: primary }}>
                      {invoiceData.ledgerEntries.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FBF9]">
                          <td className="py-2 px-3 font-mono font-bold" style={{ color: forest }}>
                            {entry.code}
                          </td>
                          <td className="py-2 px-2.5 text-[#5A6762] tabular-nums">
                            {entry.period}
                          </td>
                          <td className="py-2 px-2.5">{entry.description}</td>
                          <td className="py-2 px-2.5 text-right font-semibold tabular-nums">
                            {fmt(entry.billed)}
                          </td>
                          <td
                            className="py-2 px-2.5 text-right font-bold tabular-nums"
                            style={{ color: forest }}
                          >
                            {fmt(entry.paid)}
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right font-bold tabular-nums ${
                              entry.balance > 0 ? 'text-[#B91C1C]' : ''
                            }`}
                          >
                            {fmt(entry.balance)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-[9.5px] font-extrabold"
                              style={{
                                backgroundColor:
                                  entry.status === 'Paid'
                                    ? mint
                                    : entry.status === 'Overdue'
                                    ? '#FEE2E2'
                                    : accent,
                                color:
                                  entry.status === 'Paid'
                                    ? forest
                                    : entry.status === 'Overdue'
                                    ? '#991B1B'
                                    : primary,
                              }}
                            >
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr
                        className="bg-[#F4F8F6] font-extrabold text-[11px]"
                        style={{ color: primary }}
                      >
                        <td colSpan={3} className="py-2 px-3 uppercase tracking-wider">
                          Cumulative Account Ledger Totals
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums">
                          {fmt(totalLedgerBilled)}
                        </td>
                        <td
                          className="py-2 px-2.5 text-right tabular-nums"
                          style={{ color: forest }}
                        >
                          {fmt(totalLedgerPaid)}
                        </td>
                        <td
                          className={`py-2 px-2.5 text-right tabular-nums ${
                            totalLedgerBalance > 0 ? 'text-[#B91C1C]' : ''
                          }`}
                          style={totalLedgerBalance <= 0 ? { color: forest } : undefined}
                        >
                          {fmt(totalLedgerBalance)}
                        </td>
                        <td className="py-2 px-3 text-center text-[10px]">
                          {totalLedgerBalance <= 0 ? 'CLEARED' : 'DUE'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom System Forest-to-Lime Wave Band & Deep Forest Contact Pill Bar */}
        <div
          className={fitScreen ? 'px-6 sm:px-9 py-3.5' : 'px-6 sm:px-11 py-5'}
          style={{
            background: `linear-gradient(90deg, ${forest} 0%, #1F7A53 45%, ${accent} 100%)`,
          }}
        >
          <div
            className="rounded-full px-5 sm:px-7 py-2.5 text-white flex flex-wrap items-center justify-between gap-2 shadow-lg text-[11.5px] sm:text-[12.5px]"
            style={{ backgroundColor: primary }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: accent, color: primary }}
              >
                🌐
              </span>
              <span>{invoiceData.website}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: accent, color: primary }}
              >
                📞
              </span>
              <span>{invoiceData.supportPhone}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: accent, color: primary }}
              >
                ✉️
              </span>
              <span>{invoiceData.supportEmail}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
