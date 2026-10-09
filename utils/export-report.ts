import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { CashierSaleRecord, PurchaseRecord, PurchaseSummary } from '@/types';
import { toDisplayDate } from '@/utils/date';

const escapeHtml = (val: unknown): string => {
  const str = String(val ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const escapeCsvCell = (val: unknown): string => {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
};

async function exportHtmlAsPdf(html: string, dialogTitle: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const printWin = window.open('', '_blank', 'width=960,height=800');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 300);
      return;
    }
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}

async function exportCsvAsExcel(
  csvRows: (string | number)[][],
  baseFileName: string,
  dialogTitle: string
) {
  const csvContent =
    '\uFEFF' +
    csvRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n');

  const safeFileName = `${sanitizeFileName(baseFileName)}.csv`;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', safeFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, safeFileName);
  file.create({ overwrite: true });
  file.write(csvContent);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle,
      UTI: 'public.comma-separated-values-text',
    });
  } else {
    Alert.alert('Saved', `Excel file saved to: ${file.uri}`);
  }
}

// ─── 1. PURCHASES PDF & EXCEL EXPORT ─────────────────────────────────────────

export async function exportPurchasesPdf(
  purchases: PurchaseRecord[],
  branchName: string,
  periodLabel: string,
  summary: PurchaseSummary
) {
  if (purchases.length === 0) {
    Alert.alert('No Records', 'There are no purchase records to export.');
    return;
  }

  const grandTotal = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const rowsHtml = purchases
    .map(
      (p, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${escapeHtml(toDisplayDate(p.date))}</td>
        <td><strong>${escapeHtml(p.item_name)}</strong></td>
        <td>${escapeHtml(p.branch_name || branchName)}</td>
        <td>${escapeHtml(p.quantity_weight || '-')}</td>
        <td>${escapeHtml(p.comment || '-')}</td>
        <td>${escapeHtml(p.created_by || '-')}</td>
        <td style="text-align: right; font-weight: 700; color: #16A34A;">
          ₹${(Number(p.amount) || 0).toLocaleString()}
        </td>
      </tr>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Purchase Report - ${escapeHtml(branchName)}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1E293B;
            margin: 0;
            padding: 0;
            font-size: 11px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563EB;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .company {
            font-size: 20px;
            font-weight: 800;
            color: #1E40AF;
            margin: 0;
          }
          .subtitle {
            font-size: 12px;
            color: #475569;
            margin-top: 4px;
          }
          .summary-row {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
          }
          .summary-box {
            flex: 1;
            background: #F8FAFC;
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .summary-label {
            font-size: 10px;
            text-transform: uppercase;
            color: #64748B;
            font-weight: 700;
          }
          .summary-val {
            font-size: 16px;
            font-weight: 800;
            margin-top: 4px;
            color: #0F172A;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background-color: #1E293B;
            color: #FFFFFF;
            padding: 8px 6px;
            text-align: left;
            font-size: 10px;
            text-transform: uppercase;
          }
          td {
            padding: 7px 6px;
            border-bottom: 1px solid #E2E8F0;
            font-size: 11px;
          }
          tr:nth-child(even) {
            background-color: #F8FAFC;
          }
          .total-row td {
            background-color: #EFF6FF;
            border-top: 2px solid #2563EB;
            font-weight: 800;
            font-size: 12px;
            padding: 10px 6px;
          }
          .footer {
            margin-top: 20px;
            text-align: right;
            font-size: 10px;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="company">KSM Pvt Ltd — Purchase Report</h1>
            <div class="subtitle">Branch: <strong>${escapeHtml(branchName)}</strong> &bull; Period: <strong>${escapeHtml(periodLabel)}</strong></div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            Generated: ${escapeHtml(new Date().toLocaleString())}
          </div>
        </div>

        <div class="summary-row">
          <div class="summary-box">
            <div class="summary-label">Records Exported</div>
            <div class="summary-val">${purchases.length} Items</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Today's Total</div>
            <div class="summary-val" style="color: #16A34A;">₹${summary.todayTotal.toLocaleString()}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Current Month Total</div>
            <div class="summary-val" style="color: #2563EB;">₹${summary.monthTotal.toLocaleString()}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Filtered Grand Total</div>
            <div class="summary-val" style="color: #15803D;">₹${grandTotal.toLocaleString()}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 34px; text-align: center;">#</th>
              <th style="width: 78px;">Date</th>
              <th>Item Name</th>
              <th>Branch</th>
              <th>Rate / Qty / Tax Breakdown</th>
              <th>Note / Bill</th>
              <th>Recorded By</th>
              <th style="width: 90px; text-align: right;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="7" style="text-align: right;">GRAND TOTAL (${purchases.length} Purchases):</td>
              <td style="text-align: right; color: #15803D;">₹${grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          KSM Pvt Ltd &bull; Online Database Verified Report
        </div>
      </body>
    </html>
  `;

  await exportHtmlAsPdf(html, `Purchases Report - ${branchName}`);
}

export async function exportPurchasesExcel(
  purchases: PurchaseRecord[],
  branchName: string,
  periodLabel: string
) {
  if (purchases.length === 0) {
    Alert.alert('No Records', 'There are no purchase records to export.');
    return;
  }

  const grandTotal = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const csvRows: (string | number)[][] = [
    ['KSM Pvt Ltd - Purchase Report'],
    ['Branch', branchName, 'Period', periodLabel, 'Generated At', new Date().toLocaleString()],
    [],
    [
      'Sr No',
      'Date (DD-MM-YYYY)',
      'Branch',
      'Item Name',
      'Rate / Qty / Tax Details',
      'Comment / Bill Ref',
      'Recorded By',
      'Total Amount (Rs)',
    ],
  ];

  purchases.forEach((p, idx) => {
    csvRows.push([
      idx + 1,
      toDisplayDate(p.date),
      p.branch_name || branchName,
      p.item_name,
      p.quantity_weight || '',
      p.comment || '',
      p.created_by || '',
      Number(p.amount) || 0,
    ]);
  });

  csvRows.push([]);
  csvRows.push(['', '', '', '', '', '', 'GRAND TOTAL', grandTotal]);

  await exportCsvAsExcel(
    csvRows,
    `Purchases_${branchName}_${periodLabel}`,
    `Export Purchases Excel - ${branchName}`
  );
}

// ─── 2. CASHIER SALES PDF & EXCEL EXPORT ─────────────────────────────────────

export interface CashierSalesExportTotals {
  totalSale: number;
  todayOnline: number;
  cashAmount: number;
  ajjKaKharcha: number;
  counterBalance: number;
  mistakenBill: number;
  fatteNote: number;
  counterTotal: number;
  resultBalance: number;
}

export async function exportCashierSalesPdf(
  records: CashierSaleRecord[],
  branchName: string,
  periodLabel: string,
  totals: CashierSalesExportTotals
) {
  if (records.length === 0) {
    Alert.alert('No Records', 'There are no cashier sale records to export.');
    return;
  }

  const rowsHtml = records
    .map((r, idx) => {
      const machinesText = (r.machines || [])
        .map((m) => `${escapeHtml(m.name)}: ₹${(Number(m.amount) || 0).toLocaleString()}`)
        .join('<br/>');
      const isNeg = (Number(r.result_balance) || 0) < 0;

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${escapeHtml(toDisplayDate(r.date))}</td>
          <td><strong>${escapeHtml(r.branch_name || branchName)}</strong><br/><span style="color:#64748B;font-size:9px;">${escapeHtml(r.cashier_name)}</span></td>
          <td style="font-size: 10px;">${machinesText || '-'}</td>
          <td style="text-align: right; font-weight: 700; color: #2563EB;">₹${(Number(r.total_sale) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.today_online) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.cash_amount) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.ajj_ka_kharcha) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.ajj_ka_counter_balance) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.mistaken_bill) || 0).toLocaleString()}</td>
          <td style="text-align: right;">₹${(Number(r.fatte_note) || 0).toLocaleString()}</td>
          <td style="text-align: right; font-weight: 700; color: #16A34A;">₹${(Number(r.counter_total) || 0).toLocaleString()}</td>
          <td style="text-align: right; font-weight: 800; color: ${isNeg ? '#DC2626' : '#16A34A'}; background: ${isNeg ? '#FEF2F2' : '#F0FDF4'};">
            ${(Number(r.result_balance) || 0).toLocaleString()}
          </td>
        </tr>
      `;
    })
    .join('');

  const isTotalNeg = totals.resultBalance < 0;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Cashier Sales Report - ${escapeHtml(branchName)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1E293B;
            margin: 0;
            padding: 0;
            font-size: 10px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563EB;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .company {
            font-size: 18px;
            font-weight: 800;
            color: #1E40AF;
            margin: 0;
          }
          .subtitle {
            font-size: 11px;
            color: #475569;
            margin-top: 3px;
          }
          .kpi-row {
            display: flex;
            gap: 10px;
            margin-bottom: 14px;
          }
          .kpi-box {
            flex: 1;
            background: #F8FAFC;
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            padding: 8px 10px;
          }
          .kpi-label {
            font-size: 9px;
            text-transform: uppercase;
            color: #64748B;
            font-weight: 700;
          }
          .kpi-val {
            font-size: 15px;
            font-weight: 800;
            margin-top: 3px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background-color: #1E293B;
            color: #FFFFFF;
            padding: 7px 5px;
            text-align: left;
            font-size: 9px;
            text-transform: uppercase;
          }
          td {
            padding: 6px 5px;
            border-bottom: 1px solid #E2E8F0;
            font-size: 10px;
            vertical-align: top;
          }
          tr:nth-child(even) {
            background-color: #F8FAFC;
          }
          .total-row td {
            background-color: #EFF6FF;
            border-top: 2px solid #2563EB;
            font-weight: 800;
            font-size: 10.5px;
            padding: 8px 5px;
          }
          .footer {
            margin-top: 14px;
            text-align: right;
            font-size: 9px;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="company">KSM Pvt Ltd — Cashier Sales & Counter Report</h1>
            <div class="subtitle">Branch Scope: <strong>${escapeHtml(branchName)}</strong> &bull; Period: <strong>${escapeHtml(periodLabel)}</strong></div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            Generated: ${escapeHtml(new Date().toLocaleString())}
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-box">
            <div class="kpi-label">Total Machine Sale</div>
            <div class="kpi-val" style="color: #2563EB;">₹${totals.totalSale.toLocaleString()}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Counter & Expenses Total</div>
            <div class="kpi-val" style="color: #16A34A;">₹${totals.counterTotal.toLocaleString()}</div>
          </div>
          <div class="kpi-box" style="background: ${isTotalNeg ? '#FEF2F2' : '#F0FDF4'}; border-color: ${isTotalNeg ? '#EF4444' : '#16A34A'};">
            <div class="kpi-label" style="color: ${isTotalNeg ? '#991B1B' : '#14532D'};">Net Result Balance</div>
            <div class="kpi-val" style="color: ${isTotalNeg ? '#DC2626' : '#16A34A'};">${totals.resultBalance.toLocaleString()}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 26px; text-align: center;">#</th>
              <th style="width: 68px;">Date</th>
              <th>Branch & Cashier</th>
              <th>Machines Breakdown</th>
              <th style="text-align: right;">Total Sale</th>
              <th style="text-align: right;">Online</th>
              <th style="text-align: right;">Cash</th>
              <th style="text-align: right;">Kharcha</th>
              <th style="text-align: right;">Counter Bal</th>
              <th style="text-align: right;">Mistaken Bill</th>
              <th style="text-align: right;">Fatte Note</th>
              <th style="text-align: right;">Counter Total</th>
              <th style="text-align: right;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">GRAND TOTAL (${records.length} Entries):</td>
              <td style="text-align: right; color: #2563EB;">₹${totals.totalSale.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.todayOnline.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.cashAmount.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.ajjKaKharcha.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.counterBalance.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.mistakenBill.toLocaleString()}</td>
              <td style="text-align: right;">₹${totals.fatteNote.toLocaleString()}</td>
              <td style="text-align: right; color: #16A34A;">₹${totals.counterTotal.toLocaleString()}</td>
              <td style="text-align: right; color: ${isTotalNeg ? '#DC2626' : '#16A34A'};">${totals.resultBalance.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          KSM Pvt Ltd &bull; Online Database Verified Cashier Sales Report
        </div>
      </body>
    </html>
  `;

  await exportHtmlAsPdf(html, `Cashier Sales Report - ${branchName}`);
}

export async function exportCashierSalesExcel(
  records: CashierSaleRecord[],
  branchName: string,
  periodLabel: string,
  totals: CashierSalesExportTotals
) {
  if (records.length === 0) {
    Alert.alert('No Records', 'There are no cashier sale records to export.');
    return;
  }

  const csvRows: (string | number)[][] = [
    ['KSM Pvt Ltd - Cashier Sales & Counter Report'],
    ['Branch Scope', branchName, 'Period', periodLabel, 'Generated At', new Date().toLocaleString()],
    [],
    [
      'Sr No',
      'Date (DD-MM-YYYY)',
      'Branch',
      'Cashier Name',
      'Cashier Username',
      'Machine Sales Breakdown',
      'Total Machine Sale (Rs)',
      'Today Online (Paytm/GPay)',
      'Cash',
      'Ajj Ka Kharcha',
      'Ajj Ka Counter Balance',
      'Mistaken Bill',
      'Fatte Note',
      'Counter Total (Rs)',
      'Result Balance',
    ],
  ];

  records.forEach((r, idx) => {
    const machinesStr = (r.machines || [])
      .map((m) => `${m.name}: Rs.${Number(m.amount) || 0}`)
      .join(' | ');

    csvRows.push([
      idx + 1,
      toDisplayDate(r.date),
      r.branch_name || branchName,
      r.cashier_name || '',
      r.cashier_username || '',
      machinesStr,
      Number(r.total_sale) || 0,
      Number(r.today_online) || 0,
      Number(r.cash_amount) || 0,
      Number(r.ajj_ka_kharcha) || 0,
      Number(r.ajj_ka_counter_balance) || 0,
      Number(r.mistaken_bill) || 0,
      Number(r.fatte_note) || 0,
      Number(r.counter_total) || 0,
      Number(r.result_balance) || 0,
    ]);
  });

  csvRows.push([]);
  csvRows.push([
    '',
    '',
    '',
    '',
    '',
    'GRAND TOTAL',
    totals.totalSale,
    totals.todayOnline,
    totals.cashAmount,
    totals.ajjKaKharcha,
    totals.counterBalance,
    totals.mistakenBill,
    totals.fatteNote,
    totals.counterTotal,
    totals.resultBalance,
  ]);

  await exportCsvAsExcel(
    csvRows,
    `Cashier_Sales_${branchName}_${periodLabel}`,
    `Export Cashier Sales Excel - ${branchName}`
  );
}
