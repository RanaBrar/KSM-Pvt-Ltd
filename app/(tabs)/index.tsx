import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import {
  getAttendance,
  getBranches,
  getEmployees,
  getMonthlyReport,
  getPayments,
  getPurchaseSummary,
  invalidateQueryCache,
  subscribeToRefresh,
} from '@/services/api';
import {
  AttendanceRecord,
  Branch,
  Employee,
  MonthlySummary,
  PaymentRecord,
  PurchaseSummary,
} from '@/types';
import { toDisplayDate } from '@/utils/date';

const getTodayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, isAdmin, isManager, activeBranchFilter, isCloudConnected } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [recentPayments, setRecentPayments] = useState<PaymentRecord[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState<PurchaseSummary>({
    todayTotal: 0,
    monthTotal: 0,
    totalCount: 0,
  });

  const todayStr = getTodayString();
  const currentMonthStr = todayStr.substring(0, 7); // 'YYYY-MM'

  const loadDashboardData = async () => {
    try {
      const branchScope = activeBranchFilter === 'all' ? undefined : activeBranchFilter;

      const [emps, brs, att, rep, pays, purSum] = await Promise.all([
        getEmployees(branchScope),
        getBranches(),
        getAttendance(todayStr, branchScope),
        getMonthlyReport(currentMonthStr, branchScope),
        getPayments(undefined, branchScope, currentMonthStr),
        getPurchaseSummary(branchScope, todayStr, currentMonthStr),
      ]);

      setEmployees(emps);
      setBranches(brs);
      setTodayAttendance(att);
      setMonthlySummary(rep.summary);
      setRecentPayments(pays.slice(0, 5));
      setPurchaseSummary(purSum);
    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Track if currently mounted to avoid state updates after unmount
  const isMounted = useRef(true);

  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      loadDashboardData();
      return () => { isMounted.current = false; };
    }, [activeBranchFilter])
  );

  // Subscribe to background cloud refreshes — silently reload dashboard when cloud data arrives
  useEffect(() => {
    const unsubs = [
      subscribeToRefresh('employees_all', () => { if (isMounted.current) loadDashboardData(); }),
      subscribeToRefresh('branches_all', () => { if (isMounted.current) loadDashboardData(); }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [activeBranchFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadDashboardData();
  };

  const activeEmpIds = new Set(employees.map((e) => e.id));
  const validTodayAttendance = todayAttendance.filter((a) => activeEmpIds.has(a.employee_id));

  const presentToday = validTodayAttendance.filter((a) => a.status === 'present').length;
  const halfDayToday = validTodayAttendance.filter((a) => a.status === 'half_day').length;
  const absentToday = validTodayAttendance.filter((a) => a.status === 'absent').length;
  const totalMarked = Math.min(employees.length, presentToday + halfDayToday + absentToday);
  const attendanceRate =
    employees.length > 0 ? Math.min(100, Math.round((presentToday / employees.length) * 100)) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Dashboard" subtitle="Overview & Performance" />

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
            {/* KPI Stat Cards Grid */}
            <View style={styles.kpiGrid}>
              {/* Total Staff */}
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="people" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.text }]}>{employees.length}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Active Staff</Text>
              </View>

              {/* Attendance Rate */}
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="checkbox" size={20} color={colors.success} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.success }]}>
                  {totalMarked > 0 ? `${attendanceRate}%` : 'Pending'}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Today's Turnout</Text>
              </View>

              {/* Earned Wages this month */}
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="cash" size={20} color={colors.info} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.text }]}>
                  ₹{(monthlySummary?.totalEarned || 0).toLocaleString()}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Month Wages</Text>
              </View>

              {/* Unpaid Balance */}
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.dangerLight }]}>
                  <Ionicons name="alert-circle" size={20} color={colors.danger} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.danger }]}>
                  ₹{(monthlySummary?.totalPending || 0).toLocaleString()}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Unpaid Balance</Text>
              </View>

              {/* Month Purchases */}
              <TouchableOpacity
                style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/(tabs)/purchases')}
              >
                <View style={[styles.kpiIconBox, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="cart" size={20} color={colors.warning} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.text }]}>
                  ₹{purchaseSummary.monthTotal.toLocaleString()}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Month Purchases</Text>
              </TouchableOpacity>
            </View>

            {/* Today's Attendance Tally Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Today's Attendance</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Date: {todayStr} ({totalMarked} / {employees.length} Marked)
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(tabs)/attendance')}
                >
                  <Text style={styles.smallActionBtnText}>Mark Now</Text>
                  <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.tallyRow}>
                <View style={[styles.tallyBox, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.tallyCount, { color: colors.success }]}>{presentToday}</Text>
                  <Text style={[styles.tallyLabel, { color: colors.success }]}>Present (Full)</Text>
                </View>

                <View style={[styles.tallyBox, { backgroundColor: colors.warningLight }]}>
                  <Text style={[styles.tallyCount, { color: colors.warning }]}>{halfDayToday}</Text>
                  <Text style={[styles.tallyLabel, { color: colors.warning }]}>Half Day (0.5)</Text>
                </View>

                <View style={[styles.tallyBox, { backgroundColor: colors.dangerLight }]}>
                  <Text style={[styles.tallyCount, { color: colors.danger }]}>{absentToday}</Text>
                  <Text style={[styles.tallyLabel, { color: colors.danger }]}>Absent</Text>
                </View>
              </View>
            </View>

            {/* Purchases Overview Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Branch Purchases & Expenses</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    {purchaseSummary.totalCount} purchases recorded this month
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: colors.success }]}
                  onPress={() => router.push('/(tabs)/purchases')}
                >
                  <Text style={styles.smallActionBtnText}>View All</Text>
                  <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.tallyRow}>
                <View style={[styles.tallyBox, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.tallyCount, { color: colors.success }]}>
                    ₹{purchaseSummary.todayTotal.toLocaleString()}
                  </Text>
                  <Text style={[styles.tallyLabel, { color: colors.success }]}>Today's Purchases</Text>
                </View>

                <View style={[styles.tallyBox, { backgroundColor: colors.infoLight }]}>
                  <Text style={[styles.tallyCount, { color: colors.info }]}>
                    ₹{purchaseSummary.monthTotal.toLocaleString()}
                  </Text>
                  <Text style={[styles.tallyLabel, { color: colors.info }]}>Month's Purchases</Text>
                </View>
              </View>
            </View>

            {/* Quick Action Shortcuts */}
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/(tabs)/attendance')}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="calendar-outline" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Daily Attendance</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/(tabs)/purchases')}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="cart-outline" size={22} color={colors.success} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Purchases</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/add-purchases')}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="bag-add-outline" size={22} color={colors.warning} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Add Purchase</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/modal-add-employee')}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="person-add-outline" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Add Employee</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/modal-record-payment')}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="wallet-outline" size={22} color={colors.info} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Pay Salary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push({ pathname: '/modal-record-payment', params: { isBonus: 'true' } })}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="gift-outline" size={22} color={colors.warning} />
                </View>
                <Text style={[styles.actionCardText, { color: colors.text }]}>Give Bonus</Text>
              </TouchableOpacity>

              {isAdmin && (
                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push('/modal-add-branch')}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.warningLight }]}>
                    <Ionicons name="business-outline" size={22} color={colors.warning} />
                  </View>
                  <Text style={[styles.actionCardText, { color: colors.text }]}>Add Branch</Text>
                </TouchableOpacity>
              )}

              {isAdmin && (
                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/modal-add-manager', params: { defaultRole: 'branch_manager' } })}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="shield-outline" size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.actionCardText, { color: colors.text }]}>Add Manager</Text>
                </TouchableOpacity>
              )}

              {isAdmin && (
                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/modal-add-manager', params: { defaultRole: 'cashier' } })}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.successLight }]}>
                    <Ionicons name="calculator-outline" size={22} color={colors.success} />
                  </View>
                  <Text style={[styles.actionCardText, { color: colors.text }]}>Add Cashier</Text>
                </TouchableOpacity>
              )}

              {isAdmin && (
                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push('/(tabs)/cashier-reports')}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.infoLight }]}>
                    <Ionicons name="stats-chart-outline" size={22} color={colors.info} />
                  </View>
                  <Text style={[styles.actionCardText, { color: colors.text }]}>Cashier Reports</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Recent Payments Section */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Salary Payments</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Disbursed wage vouchers
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
                  <Text style={[styles.viewAllLink, { color: colors.primary }]}>View All</Text>
                </TouchableOpacity>
              </View>

              {recentPayments.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No payments recorded this month yet.
                  </Text>
                </View>
              ) : (
                recentPayments.map((p) => (
                  <View key={p.id} style={[styles.paymentRow, { borderBottomColor: colors.borderLight }]}>
                    <View style={[styles.paymentIconBox, { backgroundColor: colors.successLight }]}>
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payEmpName, { color: colors.text }]}>
                        {p.employee_name || 'Staff Member'}
                      </Text>
                      <Text style={[styles.payDetails, { color: colors.textSecondary }]}>
                        {toDisplayDate(p.payment_date)} • {p.payment_mode.toUpperCase()}
                        {p.notes ? ` • ${p.notes}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.payAmount, { color: colors.success }]}>
                      +₹{p.amount.toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center' },
  cloudNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  cloudNoticeTitle: { fontSize: 13, fontWeight: '700' },
  cloudNoticeText: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  smallActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tallyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tallyBox: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  tallyCount: {
    fontSize: 20,
    fontWeight: '800',
  },
  tallyLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    minWidth: '29%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionCardText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  viewAllLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 12,
    marginTop: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  paymentIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payEmpName: {
    fontSize: 14,
    fontWeight: '700',
  },
  payDetails: {
    fontSize: 11,
    marginTop: 2,
  },
  payAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
