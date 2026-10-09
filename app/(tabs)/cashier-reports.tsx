import React, { useCallback, useMemo, useState } from 'react';
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
import { AppHeader } from '@/components/app-header';
import { DatePickerField } from '@/components/date-picker-field';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import {
  deleteCashierSale,
  getBranches,
  getCashierSales,
  invalidateQueryCache,
} from '@/services/api';
import { Branch, CashierSaleRecord } from '@/types';
import { getTodayDDMMYYYY, toDbDate, toDisplayDate } from '@/utils/date';
import { exportCashierSalesExcel, exportCashierSalesPdf } from '@/utils/export-report';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CashierReportsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeBranchFilter, setActiveBranchFilter, isAdmin } = useAuth();

  const now = new Date();
  const [filterMode, setFilterMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDDMMYYYY());
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12

  const [branches, setBranches] = useState<Branch[]>([]);
  const [salesRecords, setSalesRecords] = useState<CashierSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);

  const monthYearStr = `${year}-${month < 10 ? '0' + month : month}`;
  const formattedMonthTitle = `${MONTH_NAMES[month - 1]} ${year}`;
  const dbSelectedDate = useMemo(() => toDbDate(selectedDate), [selectedDate]);

  const loadReports = useCallback(async () => {
    try {
      const branchScope =
        activeBranchFilter === 'all' ? undefined : activeBranchFilter;

      const [brs, records] = await Promise.all([
        getBranches(),
        filterMode === 'daily'
          ? getCashierSales(branchScope, dbSelectedDate, undefined)
          : getCashierSales(branchScope, undefined, monthYearStr),
      ]);

      setBranches(brs);
      setSalesRecords(records);
    } catch (err) {
      console.warn('Failed to load cashier sales reports:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [activeBranchFilter, filterMode, dbSelectedDate, monthYearStr]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache('cashier_sales_');
    loadReports();
  };

  const shiftDay = (deltaDays: number) => {
    const [y, m, d] = dbSelectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    setSelectedDate(`${dd}-${mm}-${yyyy}`);
  };

  const shiftMonth = (delta: number) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const handleDeleteRecord = (rec: CashierSaleRecord) => {
    Alert.alert(
      'Delete Sale Report',
      `Delete cashier report for ${rec.branch_name || 'Branch'} on ${toDisplayDate(rec.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCashierSale(rec.id);
            loadReports();
          },
        },
      ]
    );
  };

  // Aggregated Totals
  const totals = useMemo(() => {
    return salesRecords.reduce(
      (acc, r) => {
        acc.totalSale += Number(r.total_sale) || 0;
        acc.todayOnline += Number(r.today_online) || 0;
        acc.cashAmount += Number(r.cash_amount) || 0;
        acc.ajjKaKharcha += Number(r.ajj_ka_kharcha) || 0;
        acc.counterBalance += Number(r.ajj_ka_counter_balance) || 0;
        acc.mistakenBill += Number(r.mistaken_bill) || 0;
        acc.fatteNote += Number(r.fatte_note) || 0;
        acc.counterTotal += Number(r.counter_total) || 0;
        acc.resultBalance += Number(r.result_balance) || 0;
        return acc;
      },
      {
        totalSale: 0,
        todayOnline: 0,
        cashAmount: 0,
        ajjKaKharcha: 0,
        counterBalance: 0,
        mistakenBill: 0,
        fatteNote: 0,
        counterTotal: 0,
        resultBalance: 0,
      }
    );
  }, [salesRecords]);

  // Branch-wise summary (when viewing All Branches)
  const branchWiseSummaries = useMemo(() => {
    return branches.map((b) => {
      const branchRecs = salesRecords.filter((r) => r.branch_id === b.id);
      const totalSale = branchRecs.reduce((s, r) => s + (Number(r.total_sale) || 0), 0);
      const counterTotal = branchRecs.reduce((s, r) => s + (Number(r.counter_total) || 0), 0);
      const resultBalance = counterTotal - totalSale;
      return {
        branch: b,
        count: branchRecs.length,
        totalSale,
        counterTotal,
        resultBalance,
      };
    });
  }, [branches, salesRecords]);

  const activeBranchTitle =
    activeBranchFilter === 'all'
      ? 'All Branches'
      : branches.find((b) => b.id === activeBranchFilter)?.name || 'Branch';

  const currentPeriodTitle =
    filterMode === 'daily' ? `Daily (${selectedDate})` : `Monthly (${formattedMonthTitle})`;

  const handleExportPdf = async () => {
    setIsExporting('pdf');
    try {
      await exportCashierSalesPdf(
        salesRecords,
        activeBranchTitle,
        currentPeriodTitle,
        totals
      );
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to generate PDF report');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting('excel');
    try {
      await exportCashierSalesExcel(
        salesRecords,
        activeBranchTitle,
        currentPeriodTitle,
        totals
      );
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to generate Excel file');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Cashier Sales Reports"
        subtitle="All Branches • Branch-wise • Daily & Monthly"
      />

      {/* ── Top Filter Bar: Daily Wise vs Monthly Wise + Date/Month Selector ── */}
      <View
        style={[
          styles.filterBar,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        {/* Mode Toggle: Daily Wise vs Monthly Wise + PDF / Excel / Entry Actions */}
        <View style={styles.modeRow}>
          <View
            style={[
              styles.modeSwitchBox,
              { backgroundColor: colors.inputBg, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.modeBtn,
                filterMode === 'daily' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setFilterMode('daily')}
            >
              <Ionicons
                name="today-outline"
                size={14}
                color={filterMode === 'daily' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  { color: filterMode === 'daily' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Daily
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeBtn,
                filterMode === 'monthly' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setFilterMode('monthly')}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={filterMode === 'monthly' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  { color: filterMode === 'monthly' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Monthly
              </Text>
            </TouchableOpacity>
          </View>

          {/* PDF Export Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              backgroundColor: '#FEF2F2',
              borderColor: '#FCA5A5',
            }}
            onPress={handleExportPdf}
            disabled={isExporting !== null}
          >
            <Ionicons name="document-text-outline" size={14} color="#DC2626" />
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>
              {isExporting === 'pdf' ? '...' : 'PDF'}
            </Text>
          </TouchableOpacity>

          {/* Excel Export Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              backgroundColor: '#F0FDF4',
              borderColor: '#86EFAC',
            }}
            onPress={handleExportExcel}
            disabled={isExporting !== null}
          >
            <Ionicons name="grid-outline" size={14} color="#16A34A" />
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#16A34A' }}>
              {isExporting === 'excel' ? '...' : 'Excel'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.enterSaleBtn, { backgroundColor: colors.success }]}
            onPress={() => router.push('/cashier-screen')}
          >
            <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" />
            <Text style={styles.enterSaleBtnText}>Entry</Text>
          </TouchableOpacity>
        </View>

        {/* Date or Month Navigation Row */}
        {filterMode === 'daily' ? (
          <View style={styles.periodNavRow}>
            <TouchableOpacity
              style={[styles.navArrowBtn, { backgroundColor: colors.borderLight }]}
              onPress={() => shiftDay(-1)}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={{ flex: 1, maxWidth: 210 }}>
              <DatePickerField value={selectedDate} onChange={setSelectedDate} compact />
            </View>

            <TouchableOpacity
              style={[styles.navArrowBtn, { backgroundColor: colors.borderLight }]}
              onPress={() => shiftDay(1)}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>

            {selectedDate !== getTodayDDMMYYYY() && (
              <TouchableOpacity
                style={[
                  styles.todayQuickBtn,
                  { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
                onPress={() => setSelectedDate(getTodayDDMMYYYY())}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                  Today
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.periodNavRow}>
            <TouchableOpacity
              style={[styles.navArrowBtn, { backgroundColor: colors.borderLight }]}
              onPress={() => shiftMonth(-1)}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.monthLabelCenter}>
              <Text style={[styles.monthTitleText, { color: colors.text }]}>
                {formattedMonthTitle}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {salesRecords.length} Daily Report{salesRecords.length === 1 ? '' : 's'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.navArrowBtn, { backgroundColor: colors.borderLight }]}
              onPress={() => shiftMonth(1)}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Branch Filter Chips (All Branches vs Branch-Wise) */}
        {isAdmin && branches.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.branchChipsScroll}
          >
            <TouchableOpacity
              style={[
                styles.branchFilterChip,
                {
                  backgroundColor:
                    activeBranchFilter === 'all' ? colors.primary : colors.inputBg,
                  borderColor:
                    activeBranchFilter === 'all' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveBranchFilter('all')}
            >
              <Ionicons
                name="globe-outline"
                size={13}
                color={activeBranchFilter === 'all' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.branchFilterChipText,
                  {
                    color: activeBranchFilter === 'all' ? '#FFFFFF' : colors.text,
                  },
                ]}
              >
                All Branches
              </Text>
            </TouchableOpacity>

            {branches.map((b) => {
              const isSelected = activeBranchFilter === b.id;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.branchFilterChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.inputBg,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setActiveBranchFilter(b.id)}
                >
                  <Ionicons
                    name="business-outline"
                    size={13}
                    color={isSelected ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.branchFilterChipText,
                      { color: isSelected ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {b.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* ── Overall Summary Card ── */}
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.summaryHeaderRow}>
                <Text style={[styles.summaryTitle, { color: colors.text }]}>
                  {filterMode === 'daily'
                    ? `Daily Summary • ${selectedDate}`
                    : `Monthly Summary • ${formattedMonthTitle}`}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                    {salesRecords.length} Entry{salesRecords.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>

              {/* Top 3 Big Totals: Total Sale | Counter Total | Result */}
              <View style={styles.bigTotalsRow}>
                <View
                  style={[
                    styles.bigTotalBox,
                    { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.bigTotalLabel, { color: colors.textSecondary }]}>
                    Total Machine Sale
                  </Text>
                  <Text style={[styles.bigTotalVal, { color: colors.primary }]}>
                    ₹{totals.totalSale.toLocaleString()}
                  </Text>
                </View>

                <View
                  style={[
                    styles.bigTotalBox,
                    { backgroundColor: colors.successLight, borderColor: colors.success },
                  ]}
                >
                  <Text style={[styles.bigTotalLabel, { color: colors.textSecondary }]}>
                    Counter Total
                  </Text>
                  <Text style={[styles.bigTotalVal, { color: colors.success }]}>
                    ₹{totals.counterTotal.toLocaleString()}
                  </Text>
                </View>

                <View
                  style={[
                    styles.bigTotalBox,
                    {
                      backgroundColor:
                        totals.resultBalance < 0 ? '#FEE2E2' : '#DCFCE7',
                      borderColor:
                        totals.resultBalance < 0 ? '#EF4444' : '#16A34A',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bigTotalLabel,
                      {
                        color: totals.resultBalance < 0 ? '#991B1B' : '#14532D',
                      },
                    ]}
                  >
                    Result
                  </Text>
                  <Text
                    style={[
                      styles.bigTotalVal,
                      {
                        color: totals.resultBalance < 0 ? '#DC2626' : '#16A34A',
                      },
                    ]}
                  >
                    {totals.resultBalance.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* 6-Item Breakdown Grid */}
              <View style={[styles.breakdownGrid, { borderTopColor: colors.borderLight }]}>
                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Today Online
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.todayOnline.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Cash
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.cashAmount.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Ajj Ka Kharcha
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.ajjKaKharcha.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Counter Balance
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.counterBalance.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Mistaken Bill
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.mistakenBill.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.breakdownCell}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Fatte Note
                  </Text>
                  <Text style={[styles.breakdownVal, { color: colors.text }]}>
                    ₹{totals.fatteNote.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Branch-Wise Comparison Table (when All Branches is active) ── */}
            {isAdmin && activeBranchFilter === 'all' && branches.length > 0 && (
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.summaryTitle, { color: colors.text, marginBottom: 10 }]}>
                  Branch-Wise Breakdown
                </Text>

                {branchWiseSummaries.map((item) => {
                  const isNeg = item.resultBalance < 0;
                  return (
                    <TouchableOpacity
                      key={item.branch.id}
                      style={[
                        styles.branchSummaryRow,
                        { borderBottomColor: colors.borderLight },
                      ]}
                      onPress={() => setActiveBranchFilter(item.branch.id)}
                    >
                      <View style={{ flex: 1.2 }}>
                        <Text style={[styles.branchRowName, { color: colors.text }]}>
                          {item.branch.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                          {item.count} report{item.count === 1 ? '' : 's'}
                        </Text>
                      </View>

                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>Sale</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                          ₹{item.totalSale.toLocaleString()}
                        </Text>
                      </View>

                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>Total</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>
                          ₹{item.counterTotal.toLocaleString()}
                        </Text>
                      </View>

                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>Result</Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '900',
                            color: isNeg ? '#DC2626' : '#16A34A',
                          }}
                        >
                          {item.resultBalance.toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Detailed Daily Cashier Report Cards ── */}
            {salesRecords.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="calculator-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No Cashier Sales Recorded
                </Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  No cashier sale entry found for the selected {filterMode === 'daily' ? 'date' : 'month'}.
                </Text>
              </View>
            ) : (
              salesRecords.map((rec) => {
                const isNeg = rec.result_balance < 0;
                return (
                  <View
                    key={rec.id}
                    style={[
                      styles.recordCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    {/* Card Header */}
                    <View style={styles.recordHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <View
                            style={[
                              styles.branchBadge,
                              { backgroundColor: colors.primaryLight },
                            ]}
                          >
                            <Ionicons name="business" size={12} color={colors.primary} />
                            <Text style={[styles.branchBadgeText, { color: colors.primary }]}>
                              {rec.branch_name || 'Branch'}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.datePill,
                              { backgroundColor: colors.borderLight },
                            ]}
                          >
                            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                            <Text style={[styles.datePillText, { color: colors.text }]}>
                              {toDisplayDate(rec.date)}
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.cashierMeta, { color: colors.textSecondary }]}>
                          Cashier: <Text style={{ fontWeight: '700', color: colors.text }}>{rec.cashier_name}</Text> (@{rec.cashier_username})
                        </Text>
                      </View>

                      {isAdmin && (
                        <TouchableOpacity
                          style={[styles.deleteBtn, { backgroundColor: colors.dangerLight }]}
                          onPress={() => handleDeleteRecord(rec)}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Section 1: Machine Sales List */}
                    <View
                      style={[
                        styles.subSectionBox,
                        { backgroundColor: colors.inputBg, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.subSectionHeading, { color: colors.textSecondary }]}>
                        MACHINE SALES ({rec.machines?.length || 0})
                      </Text>
                      <View style={styles.machineChipsWrap}>
                        {(rec.machines || []).map((m, i) => (
                          <View
                            key={m.id || i}
                            style={[
                              styles.machineChip,
                              { backgroundColor: colors.card, borderColor: colors.border },
                            ]}
                          >
                            <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                              {m.name}:
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '800' }}>
                              ₹{(Number(m.amount) || 0).toLocaleString()}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={[styles.subSectionTotalRow, { borderTopColor: colors.border }]}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>
                          Total Sale :
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary }}>
                          ₹{(Number(rec.total_sale) || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Section 2: Counter & Expenses Details */}
                    <View
                      style={[
                        styles.subSectionBox,
                        { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 },
                      ]}
                    >
                      <Text style={[styles.subSectionHeading, { color: colors.textSecondary }]}>
                        COUNTER & EXPENSES BREAKDOWN
                      </Text>

                      <View style={styles.counterDetailGrid}>
                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Today Online:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.today_online) || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Cash:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.cash_amount) || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Ajj Ka Kharcha:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.ajj_ka_kharcha) || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Counter Balance:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.ajj_ka_counter_balance) || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Mistaken Bill:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.mistaken_bill) || 0).toLocaleString()}
                          </Text>
                        </View>

                        <View style={styles.counterDetailItem}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            Fatte Note:
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                            ₹{(Number(rec.fatte_note) || 0).toLocaleString()}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.subSectionTotalRow, { borderTopColor: colors.border }]}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>
                          Total :
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.success }}>
                          ₹{(Number(rec.counter_total) || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Section 3: Result Box */}
                    <View
                      style={[
                        styles.cardResultBar,
                        {
                          backgroundColor: isNeg ? '#FEE2E2' : '#DCFCE7',
                          borderColor: isNeg ? '#EF4444' : '#16A34A',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '900',
                          color: isNeg ? '#991B1B' : '#14532D',
                        }}
                      >
                        Result :
                      </Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: '900',
                          color: isNeg ? '#DC2626' : '#16A34A',
                        }}
                      >
                        {rec.result_balance.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeSwitchBox: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  enterSaleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  enterSaleBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  periodNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  navArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayQuickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  monthLabelCenter: {
    flex: 1,
    alignItems: 'center',
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: '800',
  },
  branchChipsScroll: {
    flexDirection: 'row',
  },
  branchFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  branchFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 14,
    paddingBottom: 40,
  },
  loaderContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  summaryCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bigTotalsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bigTotalBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  bigTotalLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  bigTotalVal: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    rowGap: 8,
  },
  breakdownCell: {
    width: '33.33%',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  breakdownVal: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  branchSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  branchRowName: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 44,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  recordCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  branchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cashierMeta: {
    fontSize: 11,
    marginTop: 5,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subSectionBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  subSectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  machineChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  machineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  subSectionTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  counterDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 5,
    marginBottom: 8,
  },
  counterDetailItem: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 10,
  },
  cardResultBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 10,
  },
});
