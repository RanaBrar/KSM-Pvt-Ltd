import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { deletePayment, getMonthlyReport, getPayments, invalidateQueryCache } from '@/services/api';
import { EmployeeMonthlyReport, MonthlySummary, PaymentRecord } from '@/types';
import { toDisplayDate } from '@/utils/date';

// ── Payslip HTML generator ──────────────────────────────────────────────────
function generatePayslipHTML(
  item: EmployeeMonthlyReport,
  monthLabel: string,
  empPayments: PaymentRecord[]
): string {
  const emp = item.employee;
  const isSettled = item.pendingSalary === 0 && item.earnedSalary > 0;
  const statusColor = isSettled ? '#15803d' : item.pendingSalary > 0 ? '#b45309' : '#4b5563';
  const statusBg = isSettled ? '#dcfce7' : item.pendingSalary > 0 ? '#fef3c7' : '#f3f4f6';
  const statusText = isSettled ? 'FULLY PAID' : item.pendingSalary > 0 ? 'PAYMENT PENDING' : 'NO WAGES';

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const paymentRows = empPayments.length > 0
    ? empPayments.map((p) => `
        <tr>
          <td style="padding:5px 8px;">${toDisplayDate(p.payment_date)}</td>
          <td style="padding:5px 8px;">${p.payment_mode?.replace('_', ' ').toUpperCase() || 'CASH'}</td>
          <td style="padding:5px 8px;color:#15803d;font-weight:700;">₹${fmt(p.amount)}</td>
          <td style="padding:5px 8px;color:#64748b;">${p.notes || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:6px;">No payments recorded this month</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Payslip — ${emp.name} — ${monthLabel}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 10mm 8mm 10mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #1e293b;
    font-size: 12px;
    line-height: 1.35;
  }
  .page {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .header {
    background-color: #1e40af !important;
    color: #ffffff !important;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .company-name {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #ffffff !important;
  }
  .doc-title {
    font-size: 11px;
    color: #dbeafe !important;
    margin-top: 2px;
  }
  .month-badge {
    background-color: rgba(255, 255, 255, 0.22) !important;
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #ffffff !important;
    border-radius: 16px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 700;
  }
  .body {
    padding: 14px 18px;
  }
  .emp-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 10px;
  }
  .emp-name {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
  }
  .emp-meta {
    font-size: 11px;
    color: #64748b;
    margin-top: 2px;
  }
  .emp-id {
    font-size: 10px;
    font-weight: 700;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 4px;
    padding: 1px 6px;
    display: inline-block;
    margin-top: 4px;
  }
  .status-pill {
    font-size: 11px;
    font-weight: 800;
    border-radius: 14px;
    padding: 4px 12px;
    background-color: ${statusBg} !important;
    color: ${statusColor} !important;
    border: 1px solid rgba(0,0,0,0.06);
  }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #475569;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    margin-top: 8px;
    margin-bottom: 5px;
  }
  .att-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .att-box {
    background: #f8fafc;
    border-radius: 8px;
    padding: 8px;
    text-align: center;
    border: 1px solid #e2e8f0;
  }
  .att-num {
    font-size: 20px;
    font-weight: 900;
    line-height: 1.1;
  }
  .att-label {
    font-size: 10px;
    color: #64748b;
    font-weight: 600;
    margin-top: 2px;
  }
  .present .att-num { color: #16a34a; }
  .half .att-num { color: #d97706; }
  .absent .att-num { color: #dc2626; }
  .formula-box {
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 11px;
    color: #1e40af;
    margin-bottom: 8px;
  }
  .wage-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .wage-table th {
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 5px 8px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  .wage-table td {
    padding: 5px 8px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 11px;
  }
  .wage-table .total-row td {
    font-weight: 800;
    font-size: 12px;
    background: #f8fafc;
    border-top: 1px solid #cbd5e1;
  }
  .amount {
    text-align: right;
    font-weight: 700;
  }
  .summary-box {
    background: #f8fafc;
    border-radius: 8px;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 11px;
    border-bottom: 1px solid #f1f5f9;
  }
  .summary-row:last-child {
    border-bottom: none;
    font-weight: 800;
    font-size: 13px;
    padding-top: 5px;
    margin-top: 3px;
    border-top: 1px dashed #cbd5e1;
  }
  .green { color: #16a34a; }
  .red { color: #dc2626; }
  .pending-alert {
    background-color: #fef3c7 !important;
    border: 1px solid #fcd34d;
    border-radius: 6px;
    padding: 6px 10px;
    margin-bottom: 8px;
    color: #92400e;
    font-weight: 700;
    font-size: 11px;
  }
  .settled-badge {
    background-color: #dcfce7 !important;
    border: 1px solid #86efac;
    border-radius: 6px;
    padding: 6px 10px;
    margin-bottom: 8px;
    color: #14532d;
    font-weight: 700;
    font-size: 11px;
  }
  .pay-table {
    width: 100%;
    border-collapse: collapse;
    page-break-inside: avoid;
  }
  .pay-table th {
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    padding: 5px 8px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  .pay-table td {
    border-bottom: 1px solid #f1f5f9;
    font-size: 11px;
  }
  .footer {
    text-align: center;
    padding: 8px 14px;
    color: #94a3b8;
    font-size: 10px;
    border-top: 1px solid #e2e8f0;
    background: #fafafa;
    page-break-inside: avoid;
    page-break-before: avoid;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">KSM Pvt. Ltd.</div>
      <div class="doc-title">Employee Salary Payslip</div>
    </div>
    <div class="month-badge">${monthLabel}</div>
  </div>

  <div class="body">
    <!-- Employee Info -->
    <div class="emp-card">
      <div>
        <div class="emp-name">${emp.name}</div>
        <div class="emp-meta">${emp.designation || 'Staff Member'}${emp.branch_name ? ' · ' + emp.branch_name : ''}</div>
        <div class="emp-id">${emp.employee_id_code}</div>
      </div>
      <div class="status-pill">${statusText}</div>
    </div>

    <!-- Attendance Summary -->
    <div class="section-title">Attendance Summary — ${monthLabel}</div>
    <div class="att-grid">
      <div class="att-box present">
        <div class="att-num">${item.presentDays}</div>
        <div class="att-label">Present (Full)</div>
      </div>
      <div class="att-box half">
        <div class="att-num">${item.halfDays}</div>
        <div class="att-label">Half Day (×0.5)</div>
      </div>
      <div class="att-box absent">
        <div class="att-num">${item.absentDays}</div>
        <div class="att-label">Absent</div>
      </div>
    </div>

    <!-- Salary Calculation -->
    <div class="section-title">Salary Calculation</div>
    <div class="formula-box">
      (${item.presentDays} full days × ₹${fmt(item.dailySalary)}) ${item.halfDays > 0 ? `+ (${item.halfDays} half days × ₹${fmt(item.dailySalary * 0.5)})` : ''} ${item.bonusAmount > 0 ? `+ Bonus ₹${fmt(item.bonusAmount)}` : ''} = <strong>₹${fmt(item.totalPayable || item.earnedSalary)}</strong>
    </div>

    <table class="wage-table">
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td>Daily Rate</td><td class="amount">₹${fmt(item.dailySalary)} / day</td></tr>
        <tr><td>Full Days Present (×${item.presentDays})</td><td class="amount">₹${fmt(item.presentDays * item.dailySalary)}</td></tr>
        ${item.halfDays > 0 ? `<tr><td>Half Days Present (×${item.halfDays} × 0.5)</td><td class="amount">₹${fmt(item.halfDays * item.dailySalary * 0.5)}</td></tr>` : ''}
        ${item.bonusAmount > 0 ? `<tr><td style="color:#d97706;font-weight:700;">🎁 Bonus Awarded</td><td class="amount" style="color:#d97706;">+₹${fmt(item.bonusAmount)}</td></tr>` : ''}
        <tr class="total-row"><td>Total Payable Wages</td><td class="amount">₹${fmt(item.totalPayable || item.earnedSalary)}</td></tr>
      </tbody>
    </table>

    <!-- Financial Summary -->
    <div class="section-title">Payment Summary</div>
    <div class="summary-box">
      <div class="summary-row"><span>Earned Wages</span><span>₹${fmt(item.earnedSalary)}</span></div>
      ${item.bonusAmount > 0 ? `<div class="summary-row"><span style="color:#d97706;font-weight:700;">Bonus (+)</span><span style="color:#d97706;font-weight:700;">+₹${fmt(item.bonusAmount)}</span></div>` : ''}
      <div class="summary-row"><span>Total Paid</span><span class="green">₹${fmt(item.totalPaid)}</span></div>
      <div class="summary-row"><span>Balance Pending</span><span class="${item.pendingSalary > 0 ? 'red' : 'green'}">₹${fmt(item.pendingSalary)}</span></div>
    </div>

    ${item.pendingSalary > 0
      ? `<div class="pending-alert">⚠️ Pending balance of ₹${fmt(item.pendingSalary)} is yet to be paid for ${monthLabel}.</div>`
      : (item.totalPayable || item.earnedSalary) > 0
        ? `<div class="settled-badge">✅ All wages for ${monthLabel} have been fully paid.</div>`
        : ''}

    <!-- Payment Records -->
    <div class="section-title">Payment Transactions — ${monthLabel}</div>
    <table class="pay-table">
      <thead><tr><th>Date</th><th>Mode</th><th>Amount</th><th>Notes</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </div>

  <div class="footer">
    Generated by KSM Pvt. Ltd. Management App · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
  </div>
</div>
</body>
</html>`;
}

export default function ReportsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeBranchFilter, isAdmin } = useAuth();

  const now = new Date();
  const initialYear = now.getFullYear();
  const initialMonth = now.getMonth() + 1;

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [reports, setReports] = useState<EmployeeMonthlyReport[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'employees' | 'ledger'>('employees');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const monthYearStr = `${year}-${month < 10 ? '0' + month : month}`;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const formattedMonthTitle = `${monthNames[month - 1]} ${year}`;

  const loadData = async () => {
    try {
      const branchScope = activeBranchFilter === 'all' ? undefined : activeBranchFilter;
      const [rep, pays] = await Promise.all([
        getMonthlyReport(monthYearStr, branchScope),
        getPayments(undefined, branchScope, monthYearStr),
      ]);
      setReports(rep.reports);
      setSummary(rep.summary);
      setPayments(pays);
    } catch (err) {
      console.warn('Reports load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [monthYearStr, activeBranchFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  const shiftMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setMonth(newMonth);
    setYear(newYear);
  };

  const handleDeletePayment = (payment: PaymentRecord) => {
    Alert.alert(
      'Delete Payment',
      `Delete payment of ₹${payment.amount} for ${payment.employee_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePayment(payment.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleSharePayslip = async (item: EmployeeMonthlyReport) => {
    try {
      const empPayments = payments.filter((p) => p.employee_id === item.employee.id);
      const html = generatePayslipHTML(item, formattedMonthTitle, empPayments);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Payslip — ${item.employee.name} — ${formattedMonthTitle}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing not available', 'PDF sharing is not supported on this device.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate payslip PDF.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Wages & Reports" subtitle="Monthly Salary Calculation" />

      {/* Month Selector */}
      <View style={[styles.monthBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.monthNavBtn, { backgroundColor: colors.borderLight }]}
          onPress={() => shiftMonth(-1)}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.monthCenter}>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{formattedMonthTitle}</Text>
          <Text style={[styles.monthSubtitle, { color: colors.textSecondary }]}>
            {summary?.totalEmployees || 0} Staff Members Recorded
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.monthNavBtn, { backgroundColor: colors.borderLight }]}
          onPress={() => shiftMonth(1)}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Financial Summary Card */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>
                Financial Overview • {formattedMonthTitle}
              </Text>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>Earned</Text>
                  <Text style={[styles.sumVal, { color: colors.text }]}>
                    ₹{(summary?.totalEarned || 0).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>Bonus (+)</Text>
                  <Text style={[styles.sumVal, { color: '#D97706' }]}>
                    ₹{(summary?.totalBonus || 0).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>Paid Out</Text>
                  <Text style={[styles.sumVal, { color: colors.success }]}>
                    ₹{(summary?.totalPaid || 0).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>Pending</Text>
                  <Text
                    style={[
                      styles.sumVal,
                      { color: (summary?.totalPending || 0) > 0 ? colors.danger : colors.success },
                    ]}
                  >
                    ₹{(summary?.totalPending || 0).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: colors.success,
                      width: `${
                        (summary?.totalEarned || 0) + (summary?.totalBonus || 0) > 0
                          ? Math.min(
                              100,
                              Math.round(
                                ((summary?.totalPaid || 0) /
                                  ((summary?.totalEarned || 0) + (summary?.totalBonus || 0))) *
                                  100
                              )
                            )
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                Disbursed:{' '}
                {(summary?.totalEarned || 0) + (summary?.totalBonus || 0) > 0
                  ? Math.round(
                      ((summary?.totalPaid || 0) /
                        ((summary?.totalEarned || 0) + (summary?.totalBonus || 0))) *
                        100
                    )
                  : 0}
                % of total payable wages (incl. bonus)
              </Text>
            </View>

            {/* Sub-tabs: Employee Salary List vs Payment Ledger */}
            <View style={[styles.subTabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[
                  styles.subTabBtn,
                  activeTab === 'employees' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('employees')}
              >
                <Ionicons
                  name="calculator-outline"
                  size={16}
                  color={activeTab === 'employees' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.subTabBtnText,
                    { color: activeTab === 'employees' ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  Salary Calculation ({reports.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.subTabBtn,
                  activeTab === 'ledger' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('ledger')}
              >
                <Ionicons
                  name="receipt-outline"
                  size={16}
                  color={activeTab === 'ledger' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.subTabBtnText,
                    { color: activeTab === 'ledger' ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  Payment Ledger ({payments.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* View 1: Employee Salary Breakdown */}
            {activeTab === 'employees' ? (
              reports.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="wallet-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No staff records found for this month.
                  </Text>
                </View>
              ) : (
                reports.map((item) => {
                  const emp = item.employee;
                  const totalPayable = item.totalPayable ?? item.earnedSalary + (item.bonusAmount || 0);
                  const isSettled = item.pendingSalary === 0 && totalPayable > 0;
                  const hasPending = item.pendingSalary > 0;

                  return (
                    <View
                      key={emp.id}
                      style={[
                        styles.reportCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      {/* Header */}
                      <View style={styles.reportHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.nameRow}>
                            <Text style={[styles.repName, { color: colors.text }]}>{emp.name}</Text>
                            <Text style={[styles.repCode, { backgroundColor: colors.borderLight, color: colors.primary }]}>
                              {emp.employee_id_code}
                            </Text>
                          </View>
                          <Text style={[styles.repRole, { color: colors.textSecondary }]}>
                            Rate: ₹{item.dailySalary}/day • {emp.designation}
                            {isAdmin && emp.branch_name ? ` • ${emp.branch_name}` : ''}
                          </Text>
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            styles.settleBadge,
                            {
                              backgroundColor: isSettled
                                ? colors.successLight
                                : hasPending
                                ? colors.warningLight
                                : colors.borderLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.settleBadgeText,
                              {
                                color: isSettled
                                  ? colors.success
                                  : hasPending
                                  ? colors.warning
                                  : colors.textSecondary,
                              },
                            ]}
                          >
                            {isSettled ? 'Settled' : hasPending ? 'Pending' : 'No Wages'}
                          </Text>
                        </View>
                      </View>

                      {/* Attendance Breakdown Pills */}
                      <View style={[styles.attPillsRow, { backgroundColor: colors.borderLight }]}>
                        <View style={styles.attPill}>
                          <Text style={[styles.attPillNum, { color: colors.success }]}>
                            {item.presentDays}
                          </Text>
                          <Text style={[styles.attPillLabel, { color: colors.textSecondary }]}>
                            Present (Full)
                          </Text>
                        </View>

                        <View style={styles.attPill}>
                          <Text style={[styles.attPillNum, { color: colors.warning }]}>
                            {item.halfDays}
                          </Text>
                          <Text style={[styles.attPillLabel, { color: colors.textSecondary }]}>
                            Half Day (0.5)
                          </Text>
                        </View>

                        <View style={styles.attPill}>
                          <Text style={[styles.attPillNum, { color: colors.danger }]}>
                            {item.absentDays}
                          </Text>
                          <Text style={[styles.attPillLabel, { color: colors.textSecondary }]}>
                            Absent
                          </Text>
                        </View>
                      </View>

                      {/* Salary Math Formula breakdown */}
                      <View style={styles.formulaRow}>
                        <Ionicons name="calculator-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.formulaText, { color: colors.textSecondary }]}>
                          ({item.presentDays} × ₹{item.dailySalary})
                          {item.halfDays > 0 ? ` + (${item.halfDays} × ₹${item.dailySalary * 0.5})` : ''}
                          {item.bonusAmount > 0 ? (
                            <Text style={{ color: '#D97706', fontWeight: '700' }}>
                              {` + Bonus ₹${item.bonusAmount.toLocaleString()}`}
                            </Text>
                          ) : null}{' '}
                          = <Text style={{ fontWeight: '700', color: colors.text }}>₹{totalPayable.toLocaleString()}</Text>
                        </Text>
                      </View>

                      {/* Financial Tally */}
                      <View style={[styles.financialTally, { borderTopColor: colors.borderLight }]}>
                        <View style={styles.tallyItem}>
                          <Text style={[styles.finLabel, { color: colors.textSecondary }]}>Earned</Text>
                          <Text style={[styles.finVal, { color: colors.text }]}>
                            ₹{item.earnedSalary.toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.tallyItem}>
                          <Text style={[styles.finLabel, { color: colors.textSecondary }]}>Bonus</Text>
                          <Text style={[styles.finVal, { color: '#D97706' }]}>
                            +₹{(item.bonusAmount || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.tallyItem}>
                          <Text style={[styles.finLabel, { color: colors.textSecondary }]}>Paid</Text>
                          <Text style={[styles.finVal, { color: colors.success }]}>
                            ₹{item.totalPaid.toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.tallyItem}>
                          <Text style={[styles.finLabel, { color: colors.textSecondary }]}>Pending</Text>
                          <Text
                            style={[
                              styles.finVal,
                              { color: item.pendingSalary > 0 ? colors.danger : colors.success },
                            ]}
                          >
                            ₹{item.pendingSalary.toLocaleString()}
                          </Text>
                        </View>
                      </View>

                      {/* Action buttons row: Pay + Bonus + Share PDF */}
                      <View style={styles.cardActionsRow}>
                        {hasPending && (
                          <TouchableOpacity
                            style={[styles.payNowBtn, { backgroundColor: colors.primary, flex: 1, marginTop: 0 }]}
                            onPress={() =>
                              router.push({
                                pathname: '/modal-record-payment',
                                params: {
                                  employeeId: emp.id,
                                  defaultAmount: String(item.pendingSalary),
                                },
                              })
                            }
                          >
                            <Ionicons name="wallet-outline" size={14} color="#FFFFFF" />
                            <Text style={styles.payNowBtnText} numberOfLines={1}>
                              Pay (₹{item.pendingSalary.toLocaleString()})
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.sharePdfBtn,
                            { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: '/modal-record-payment',
                              params: { employeeId: emp.id, isBonus: 'true' },
                            })
                          }
                        >
                          <Ionicons name="gift-outline" size={14} color="#D97706" />
                          <Text style={[styles.sharePdfBtnText, { color: '#D97706' }]}>+ Bonus</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.sharePdfBtn, { backgroundColor: colors.infoLight, borderColor: colors.info }]}
                          onPress={() => handleSharePayslip(item)}
                        >
                          <Ionicons name="share-outline" size={14} color={colors.info} />
                          <Text style={[styles.sharePdfBtnText, { color: colors.info }]}>PDF</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )
            ) : (
              /* View 2: Payment Ledger */
              payments.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No payments recorded for {formattedMonthTitle}.
                  </Text>
                </View>
              ) : (
                payments.map((p) => (
                  <View
                    key={p.id}
                    style={[
                      styles.ledgerCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.ledgerIconBox,
                        { backgroundColor: p.is_bonus ? '#FEF3C7' : colors.successLight },
                      ]}
                    >
                      <Ionicons
                        name={p.is_bonus ? 'gift-outline' : 'cash-outline'}
                        size={20}
                        color={p.is_bonus ? '#D97706' : colors.success}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.ledgerEmpName, { color: colors.text }]}>
                          {p.employee_name || 'Staff Member'}
                        </Text>
                        {p.is_bonus && (
                          <View
                            style={{
                              backgroundColor: '#FEF3C7',
                              borderColor: '#F59E0B',
                              borderWidth: 1,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 6,
                            }}
                          >
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}>
                              {p.bonus_type === 'award' ? '🎁 BONUS (ADDED TO SALARY)' : '🎁 BONUS (PAID)'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.ledgerMeta, { color: colors.textSecondary }]}>
                        {toDisplayDate(p.payment_date)}
                        {p.bonus_type !== 'award' ? ` • ${p.payment_mode.toUpperCase()}` : ''}
                        {p.notes ? ` • ${p.notes}` : ''}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text
                        style={[
                          styles.ledgerAmount,
                          { color: p.is_bonus ? '#D97706' : colors.success },
                        ]}
                      >
                        {p.is_bonus ? '+' : ''}₹{p.amount.toLocaleString()}
                      </Text>
                      <TouchableOpacity onPress={() => handleDeletePayment(p)}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenter: { alignItems: 'center' },
  monthTitle: { fontSize: 16, fontWeight: '800' },
  monthSubtitle: { fontSize: 11, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 40 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center' },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 28, backgroundColor: '#CBD5E1' },
  sumLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  sumVal: { fontSize: 16, fontWeight: '800' },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  subTabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  subTabBtnText: { fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, marginTop: 8 },
  reportCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repName: { fontSize: 15, fontWeight: '700' },
  repCode: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  repRole: { fontSize: 12, marginTop: 2 },
  settleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  settleBadgeText: { fontSize: 11, fontWeight: '700' },
  attPillsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    justifyContent: 'space-around',
  },
  attPill: { alignItems: 'center' },
  attPillNum: { fontSize: 14, fontWeight: '800' },
  attPillLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  formulaText: { fontSize: 12 },
  financialTally: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    justifyContent: 'space-around',
  },
  tallyItem: { alignItems: 'center' },
  finLabel: { fontSize: 11, fontWeight: '600' },
  finVal: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  payNowBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  sharePdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  sharePdfBtnText: { fontSize: 12, fontWeight: '800' },
  ledgerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  ledgerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerEmpName: { fontSize: 14, fontWeight: '700' },
  ledgerMeta: { fontSize: 11, marginTop: 2 },
  ledgerAmount: { fontSize: 15, fontWeight: '800' },
});
