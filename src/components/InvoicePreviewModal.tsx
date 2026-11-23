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
import {
  resolveInvoiceFontStack,
  resolveInvoiceThemePalette,
} from '../lib/invoiceTheme';
import { useThemePalette } from '../lib/useThemeState';

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
  const themeState = useThemePalette();

  if (!invoiceData || typeof document === 'undefined') return null;

  const liveAccentTheme = themeState.accentTheme || invoiceData.accentTheme || 'lime';
  const palette = resolveInvoiceThemePalette(liveAccentTheme);
  const fontStack = resolveInvoiceFontStack(invoiceData.fontFamily);
  const [b1, b2, b3] = palette.emblemBars;

  const syncedData: InvoiceDocumentData = {
    ...invoiceData,
    accentTheme: palette.accentTheme,
    primaryColor: palette.primaryText,
    forestColor: palette.titleColor,
    accentColor: palette.barBg,
    mintColor: palette.softBg,
  };

  const fmt = (n: number) => `KSh ${Number(n || 0).toLocaleString()}`;

  const statusBadge =
    syncedData.status === 'Paid'
      ? { bg: '#D8F3E5', text: '#145338', label: 'Paid' }
      : syncedData.status === 'Overdue'
      ? { bg: '#FEE2E2', text: '#991B1B', label: 'Overdue' }
      : { bg: palette.badgeBg, text: palette.badgeText, label: 'Pending' };

  const totalLedgerBilled = syncedData.ledgerEntries.reduce((s, e) => s + e.billed, 0);
  const totalLedgerPaid = syncedData.ledgerEntries.reduce((s, e) => s + e.paid, 0);
  const totalLedgerBalance = Math.max(0, totalLedgerBilled - totalLedgerPaid);
  const billedDisplayAmount = Number(syncedData.monthlyRent || syncedData.subTotal || 0);
  const blankRowsCount = Math.max(0, 4 - syncedData.items.length);

  const handleDownloadPng = () => {
    downloadDesignedInvoicePng(syncedData, 'Invoice');
    setDownloadedType('png');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const handleDownloadPdf = () => {
    downloadDesignedInvoiceFile(syncedData, 'Invoice-Ledger');
    setDownloadedType('html');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const handlePrintPdf = () => {
    printDesignedInvoicePdf(syncedData);
    setDownloadedType('pdf');
    setTimeout(() => setDownloadedType(null), 2000);
  };

  const toolbarBg = themeState.isDark ? '#212121' : '#17231E';
  const toolbarBorder = themeState.isDark ? '#323232' : '#2A453A';

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs overflow-y-auto flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Floating Top Action Toolbar */}
      <div
        className={`w-full ${fitScreen ? 'max-w-[700px]' : 'max-w-[820px]'} rounded-2xl px-4 py-2.5 mb-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xl shrink-0 transition-all duration-200`}
        style={{
          backgroundColor: toolbarBg,
          border: `1px solid ${toolbarBorder}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold tracking-wider uppercase"
            style={{
              backgroundColor: palette.barBg,
              color: palette.barText,
              border: `1px solid ${palette.barBorder}`,
            }}
          >
            {syncedData.invoiceNumber}
          </span>
          <span className="text-white text-[12.5px] font-bold truncate max-w-[180px] sm:max-w-xs">
            {syncedData.tenantName} ({syncedData.tenantRef})
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
            className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors cursor-pointer"
          >
            {showLedger ? 'Hide Ledger' : 'View Ledger'}
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer"
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
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-xs cursor-pointer"
            style={{
              backgroundColor: palette.barBg,
              color: palette.barText,
              border: `1px solid ${palette.barBorder}`,
            }}
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

      {/* Clean White-Paper Minimalist Invoice Sheet Matching Website Theme */}
      <div
        data-invoice-paper="true"
        className={`w-full ${
          fitScreen ? 'max-w-[700px]' : 'max-w-[820px]'
        } bg-white rounded-[8px] overflow-hidden relative shadow-2xl shrink-0 transition-all duration-200`}
        style={{
          border: `1px solid ${palette.ruleLineColor}`,
          color: palette.primaryText,
          fontFamily: fontStack,
        }}
      >
        {/* Top Theme Hairline Bar */}
        <div
          className="w-full h-[5px]"
          style={{ backgroundColor: palette.barBg }}
        />

        {/* Sheet Inner Padding */}
        <div
          className={
            fitScreen ? 'px-6 sm:px-9 pt-6 pb-5' : 'px-6 sm:px-12 pt-9 pb-7'
          }
        >
          {/* Header Row: Logo + Website Name + INVOICE (Left) | INVOICE AMOUNT + Status (Right) */}
          <div
            className="flex flex-row items-start justify-between gap-4 pb-4"
            style={{ borderBottom: `1px solid ${palette.ruleLineColor}` }}
          >
            <div>
              {/* Company Logo + Brand/Website Eyebrow */}
              <div className="flex items-center gap-2.5">
                {syncedData.showCompanyLogo !== false &&
                syncedData.companyLogoUrl &&
                syncedData.companyLogoUrl.trim() ? (
                  <img
                    src={syncedData.companyLogoUrl}
                    alt={syncedData.companyName}
                    className={`${
                      fitScreen ? 'w-8 h-8' : 'w-9 h-9'
                    } rounded-[8px] object-contain p-0.5 bg-white shrink-0`}
                    style={{ border: `1px solid ${palette.ruleLineColor}` }}
                  />
                ) : (
                  <div className="flex items-end gap-[3px] h-5 shrink-0">
                    <span
                      className="w-[4.5px] h-[12px] rounded-full"
                      style={{ backgroundColor: b1 }}
                    />
                    <span
                      className="w-[4.5px] h-[19px] rounded-full"
                      style={{ backgroundColor: b2 }}
                    />
                    <span
                      className="w-[4.5px] h-[15px] rounded-full"
                      style={{ backgroundColor: b3 }}
                    />
                  </div>
                )}

                <div>
                  <div
                    className="text-[12.5px] sm:text-[13.5px] font-extrabold uppercase tracking-[0.08em] leading-tight"
                    style={{ color: palette.sectionLabelColor }}
                  >
                    {syncedData.companyName || 'ARabella agency'}
                  </div>
                </div>
              </div>

              <h1
                className={`${
                  fitScreen ? 'text-[26px] sm:text-[30px]' : 'text-[32px] sm:text-[36px]'
                } font-extrabold tracking-[0.04em] leading-none mt-2.5`}
                style={{ color: palette.titleColor }}
              >
                INVOICE
              </h1>
            </div>

            <div className="text-right">
              <div
                className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em]"
                style={{ color: palette.sectionLabelColor }}
              >
                INVOICE AMOUNT
              </div>
              <div
                className={`${
                  fitScreen ? 'text-[22px] sm:text-[25px]' : 'text-[26px] sm:text-[30px]'
                } font-extrabold tabular-nums mt-0.5 leading-tight`}
                style={{ color: palette.titleColor }}
              >
                {fmt(billedDisplayAmount)}
              </div>
              <div className="mt-1.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold"
                  style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
                >
                  Payment Status: {statusBadge.label}
                </span>
              </div>
            </div>
          </div>

          {/* 2-Column Clean Metadata Row (ISSUED BY | OCCUPANT NAME) */}
          <div
            className={`${
              fitScreen ? 'mt-4' : 'mt-6'
            } grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6`}
          >
            {/* Column 1: ISSUED BY */}
            <div>
              <div
                className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] mb-1.5"
                style={{ color: palette.sectionLabelColor }}
              >
                ISSUED BY
              </div>
              <div className="space-y-0.5 text-[11.5px] leading-snug">
                <div className="font-bold" style={{ color: palette.primaryText }}>
                  {syncedData.companyName}
                </div>
                <div style={{ color: palette.mutedText }}>
                  {syncedData.businessAddress || 'Westlands, Nairobi, Kenya'}
                </div>
                <div style={{ color: palette.mutedText }}>
                  {syncedData.supportPhone}
                </div>
                <div className="truncate" style={{ color: palette.mutedText }}>
                  {syncedData.supportEmail}
                </div>
              </div>
            </div>

            {/* Column 2: OCCUPANT NAME */}
            <div className="sm:text-right">
              <div
                className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] mb-1.5"
                style={{ color: palette.sectionLabelColor }}
              >
                OCCUPANT NAME
              </div>
              <div className="space-y-0.5 text-[11.5px] leading-snug">
                <div className="font-bold" style={{ color: palette.primaryText }}>
                  {syncedData.tenantName}
                </div>
                <div style={{ color: palette.mutedText }}>
                  {syncedData.propertyName}
                </div>
                <div className="font-semibold" style={{ color: palette.primaryText }}>
                  {syncedData.unitNumber} (Ref: {syncedData.tenantRef})
                </div>
                <div className="truncate" style={{ color: palette.mutedText }}>
                  {syncedData.tenantPhone || syncedData.tenantEmail || 'Verified Resident Account'}
                </div>
              </div>
            </div>
          </div>

          {/* Sharp Rectangular Theme Table + Ruled Rows */}
          <div className={fitScreen ? 'mt-4' : 'mt-6'}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr
                    style={{
                      backgroundColor: palette.barBg,
                      color: palette.barText,
                      border: `1px solid ${palette.barBorder}`,
                    }}
                  >
                    <th className="py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-[0.06em] w-[9%] rounded-l-[4px]">
                      S.NO.
                    </th>
                    <th className="py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-[0.06em] w-[45%]">
                      DESCRIPTION
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-extrabold uppercase tracking-[0.06em] w-[16%]">
                      MONTHLY RENT
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-extrabold uppercase tracking-[0.06em] w-[15%]">
                      PAID
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-extrabold uppercase tracking-[0.06em] w-[15%] rounded-r-[4px]">
                      BALANCE
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {syncedData.items.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{ borderBottom: `1px solid ${palette.ruleLineColor}` }}
                    >
                      <td
                        className="py-2.5 px-3 text-[12px] font-semibold"
                        style={{ color: palette.mutedText }}
                      >
                        {idx + 1}
                      </td>
                      <td
                        className="py-2.5 px-3 text-[12px] font-semibold"
                        style={{ color: palette.primaryText }}
                      >
                        {item.description}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right text-[12px] tabular-nums"
                        style={{ color: palette.primaryText }}
                      >
                        {fmt(item.price || syncedData.monthlyRent)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[12px] font-semibold tabular-nums text-[#145338]">
                        {idx === 0 ? fmt(syncedData.amountPaid) : fmt(0)}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right text-[12px] font-bold tabular-nums"
                        style={{ color: palette.primaryText }}
                      >
                        {idx === 0 ? fmt(syncedData.grandTotal) : fmt(item.total)}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: blankRowsCount }).map((_, idx) => (
                    <tr
                      key={`blank-${idx}`}
                      style={{ borderBottom: `1px solid ${palette.ruleLineColor}` }}
                    >
                      <td colSpan={5} className={fitScreen ? 'h-7' : 'h-8'}>
                        &nbsp;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right-Aligned Summary Stack with Solid Theme Total Bar */}
          <div
            className={`${
              fitScreen ? 'mt-5' : 'mt-7'
            } flex justify-end`}
          >
            <div className="w-full sm:w-[270px] shrink-0">
              <div
                className="flex items-center justify-between py-2 px-2.5 text-[11.5px]"
                style={{ borderBottom: `1px solid ${palette.ruleLineColor}` }}
              >
                <span className="font-bold tracking-[0.04em]" style={{ color: palette.primaryText }}>
                  MONTHLY RENT
                </span>
                <span className="font-bold tabular-nums" style={{ color: palette.primaryText }}>
                  {fmt(syncedData.monthlyRent || syncedData.subTotal)}
                </span>
              </div>

              <div
                className="flex items-center justify-between py-2 px-2.5 text-[11.5px]"
                style={{ borderBottom: `1px solid ${palette.ruleLineColor}` }}
              >
                <span className="font-bold tracking-[0.04em]" style={{ color: palette.primaryText }}>
                  AMOUNT PAID
                </span>
                <span className="font-bold tabular-nums text-[#145338]">
                  {fmt(syncedData.amountPaid)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 px-2.5 text-[11.5px]">
                <span className="font-bold tracking-[0.04em]" style={{ color: palette.primaryText }}>
                  PAYMENT STATUS
                </span>
                <span className="font-extrabold uppercase" style={{ color: statusBadge.text }}>
                  {statusBadge.label}
                </span>
              </div>

              {/* Solid Theme OUTSTANDING BALANCE Bar */}
              <div
                className="mt-1.5 rounded-[4px] px-3 py-2.5 flex items-center justify-between"
                style={{
                  backgroundColor: palette.barBg,
                  color: palette.barText,
                  border: `1px solid ${palette.barBorder}`,
                }}
              >
                <span className="text-[11px] font-extrabold tracking-[0.04em]">
                  OUTSTANDING BALANCE
                </span>
                <span className="text-[13px] font-extrabold tabular-nums">
                  {fmt(syncedData.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Optional Chronological Tenant Account Ledger Section */}
          {showLedger && syncedData.ledgerEntries.length > 0 && (
            <div
              className="mt-6 pt-4"
              style={{ borderTop: `1px dashed ${palette.ruleLineColor}` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div
                  className="text-[11px] font-extrabold tracking-[0.06em] uppercase flex items-center gap-1.5"
                  style={{ color: palette.sectionLabelColor }}
                >
                  <FileText className="w-3.5 h-3.5" style={{ color: palette.titleColor }} />
                  <span>TENANT ACCOUNT LEDGER STATEMENT ({syncedData.tenantRef})</span>
                </div>
              </div>

              <div
                className="rounded-[4px] overflow-hidden"
                style={{ border: `1px solid ${palette.ruleLineColor}` }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr
                        className="text-[9.5px] font-extrabold uppercase tracking-wider"
                        style={{
                          backgroundColor: palette.barBg,
                          color: palette.barText,
                        }}
                      >
                        <th className="py-2 px-2.5">Ref / Code</th>
                        <th className="py-2 px-2">Period</th>
                        <th className="py-2 px-2">Description</th>
                        <th className="py-2 px-2 text-right">Billed</th>
                        <th className="py-2 px-2 text-right">Paid</th>
                        <th className="py-2 px-2 text-right">Balance</th>
                        <th className="py-2 px-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncedData.ledgerEntries.map((entry, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: `1px solid ${palette.ruleLineColor}`,
                            color: palette.primaryText,
                          }}
                        >
                          <td
                            className="py-1.5 px-2.5 font-mono font-bold"
                            style={{ color: palette.titleColor }}
                          >
                            {entry.code}
                          </td>
                          <td
                            className="py-1.5 px-2 tabular-nums"
                            style={{ color: palette.mutedText }}
                          >
                            {entry.period}
                          </td>
                          <td className="py-1.5 px-2">{entry.description}</td>
                          <td className="py-1.5 px-2 text-right font-semibold tabular-nums">
                            {fmt(entry.billed)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold tabular-nums text-[#145338]">
                            {fmt(entry.paid)}
                          </td>
                          <td
                            className={`py-1.5 px-2 text-right font-bold tabular-nums ${
                              entry.balance > 0 ? 'text-[#B91C1C]' : ''
                            }`}
                          >
                            {fmt(entry.balance)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-[10px]">
                            {entry.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr
                        className="font-extrabold text-[10.5px]"
                        style={{
                          backgroundColor: palette.softBg,
                          color: palette.primaryText,
                        }}
                      >
                        <td colSpan={3} className="py-2 px-2.5 uppercase tracking-wider">
                          Cumulative Ledger Totals
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {fmt(totalLedgerBilled)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#145338]">
                          {fmt(totalLedgerPaid)}
                        </td>
                        <td
                          className={`py-2 px-2 text-right tabular-nums ${
                            totalLedgerBalance > 0 ? 'text-[#B91C1C]' : 'text-[#145338]'
                          }`}
                        >
                          {fmt(totalLedgerBalance)}
                        </td>
                        <td className="py-2 px-2.5 text-center text-[10px]">
                          {totalLedgerBalance <= 0 ? 'CLEARED' : 'DUE'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Right-Aligned Signature Rule */}
          <div className={`${fitScreen ? 'mt-5' : 'mt-8'} flex justify-end`}>
            <div className="w-44 text-center">
              <div
                className="pt-1.5 text-[11px] font-bold"
                style={{
                  borderTop: `1px solid ${palette.mutedText}`,
                  color: palette.primaryText,
                }}
              >
                Authorized Signature
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: palette.mutedText }}
              >
                {syncedData.companyName}
              </div>
            </div>
          </div>

          {/* Clean Subtle Brand Footer */}
          <div
            className={`${
              fitScreen ? 'mt-4' : 'mt-6'
            } px-3.5 py-2 rounded-[4px] flex flex-wrap items-center justify-between gap-2 text-[10.5px]`}
            style={{
              backgroundColor: palette.softBg,
              border: `1px solid ${palette.softBorder}`,
            }}
          >
            <div className="font-bold" style={{ color: palette.sectionLabelColor }}>
              {syncedData.companyName}
            </div>
            <div style={{ color: palette.mutedText }}>
              {syncedData.supportPhone} • {syncedData.supportEmail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
