import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import {
  getBranches,
  getCashierSales,
  invalidateQueryCache,
  saveCashierSale,
} from '@/services/api';
import { Branch, CashierSaleRecord } from '@/types';
import { getTodayDDMMYYYY, getTodayYYYYMMDD } from '@/utils/date';
import { exportCashierSalesExcel, exportCashierSalesPdf } from '@/utils/export-report';

interface MachineRowInput {
  id: string;
  name: string;
  amount: string;
}

const createDefaultMachines = (): MachineRowInput[] => [
  { id: 'm_1', name: 'Machine 1', amount: '' },
  { id: 'm_2', name: 'Machine 2', amount: '' },
  { id: 'm_3', name: 'Machine 3', amount: '' },
];

export default function CashierSingleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useAppTheme();
  const { user, isAdmin, logout, isCloudConnected, dbErrorMessage, refreshCloudStatus } = useAuth();

  const todayDisplay = getTodayDDMMYYYY(); // DD-MM-YYYY (Read Only)
  const todayDb = getTodayYYYYMMDD(); // YYYY-MM-DD

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branch_id || '');
  const [existingRecordId, setExistingRecordId] = useState<string | undefined>(undefined);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Section 1: Machines
  const [machines, setMachines] = useState<MachineRowInput[]>(createDefaultMachines());

  // Section 2: Counter & Expenses Breakdown
  const [todayOnline, setTodayOnline] = useState<string>('');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [ajjKaKharcha, setAjjKaKharcha] = useState<string>('');
  const [ajjKaCounterBalance, setAjjKaCounterBalance] = useState<string>('');
  const [mistakenBill, setMistakenBill] = useState<string>('');
  const [fatteNote, setFatteNote] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const populateFromRecord = (rec: CashierSaleRecord | undefined) => {
    if (rec) {
      setExistingRecordId(rec.id);
      setLastSavedAt(rec.created_at || new Date().toISOString());
      if (rec.machines && rec.machines.length > 0) {
        setMachines(
          rec.machines.map((m, idx) => ({
            id: m.id || `m_${idx + 1}`,
            name: m.name || `Machine ${idx + 1}`,
            amount: m.amount > 0 ? String(m.amount) : '',
          }))
        );
      } else {
        setMachines(createDefaultMachines());
      }
      setTodayOnline(rec.today_online > 0 ? String(rec.today_online) : '');
      setCashAmount(rec.cash_amount > 0 ? String(rec.cash_amount) : '');
      setAjjKaKharcha(rec.ajj_ka_kharcha > 0 ? String(rec.ajj_ka_kharcha) : '');
      setAjjKaCounterBalance(
        rec.ajj_ka_counter_balance > 0 ? String(rec.ajj_ka_counter_balance) : ''
      );
      setMistakenBill(rec.mistaken_bill > 0 ? String(rec.mistaken_bill) : '');
      setFatteNote(rec.fatte_note > 0 ? String(rec.fatte_note) : '');
    } else {
      setExistingRecordId(undefined);
      setLastSavedAt(null);
      setMachines(createDefaultMachines());
      setTodayOnline('');
      setCashAmount('');
      setAjjKaKharcha('');
      setAjjKaCounterBalance('');
      setMistakenBill('');
      setFatteNote('');
    }
  };

  const loadTodaySale = useCallback(
    async (targetBranchId?: string) => {
      try {
        const brs = await getBranches();
        setBranches(brs);

        const activeBranch =
          targetBranchId ||
          selectedBranchId ||
          user?.branch_id ||
          (brs.length > 0 ? brs[0].id : '');

        if (activeBranch && activeBranch !== selectedBranchId) {
          setSelectedBranchId(activeBranch);
        }

        if (activeBranch) {
          const sales = await getCashierSales(activeBranch, todayDb);
          const todayRec = sales.find(
            (s) => s.branch_id === activeBranch && s.date === todayDb
          );
          populateFromRecord(todayRec);
        }
      } catch (err) {
        console.warn('Failed to load cashier today sale:', err);
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [selectedBranchId, todayDb, user?.branch_id]
  );

  useEffect(() => {
    loadTodaySale();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache('cashier_sales_');
    loadTodaySale(selectedBranchId);
  };

  // Machine helpers
  const handleAddMachine = () => {
    setMachines((prev) => [
      ...prev,
      {
        id: `m_${Date.now()}_${prev.length + 1}`,
        name: `Machine ${prev.length + 1}`,
        amount: '',
      },
    ]);
  };

  const handleRemoveMachine = (id: string) => {
    if (machines.length <= 1) return;
    setMachines((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdateMachine = (id: string, patch: Partial<MachineRowInput>) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  // Live Calculations
  const parseNum = (val: string): number => {
    const n = parseFloat(val.trim());
    return !isNaN(n) && n >= 0 ? n : 0;
  };

  const totalSale = useMemo(() => {
    return machines.reduce((sum, m) => sum + parseNum(m.amount), 0);
  }, [machines]);

  const counterTotal = useMemo(() => {
    return (
      parseNum(todayOnline) +
      parseNum(cashAmount) +
      parseNum(ajjKaKharcha) +
      parseNum(ajjKaCounterBalance) +
      parseNum(mistakenBill) +
      parseNum(fatteNote)
    );
  }, [
    todayOnline,
    cashAmount,
    ajjKaKharcha,
    ajjKaCounterBalance,
    mistakenBill,
    fatteNote,
  ]);

  // Result = Counter Total - Total Sale
  // e.g. Total Sale = 5000, Counter Total = 6000 -> Result = 1000
  // e.g. Total Sale = 4000, Counter Total = 3000 -> Result = -1000 (Red)
  const resultBalance = useMemo(() => {
    return Math.round((counterTotal - totalSale) * 100) / 100;
  }, [counterTotal, totalSale]);

  const isNegativeResult = resultBalance < 0;

  const handleSaveReport = async () => {
    const branchIdToSave = selectedBranchId || user?.branch_id;
    if (!branchIdToSave) {
      Alert.alert('Required', 'No branch assigned to this cashier account.');
      return;
    }

    if (totalSale <= 0 && counterTotal <= 0) {
      Alert.alert(
        'Empty Entry',
        'Please enter machine sales or counter amounts before saving.'
      );
      return;
    }

    setIsSaving(true);
    try {
      const activeBranchObj = branches.find((b) => b.id === branchIdToSave);
      const saved = await saveCashierSale({
        id: existingRecordId,
        branch_id: branchIdToSave,
        branch_name: activeBranchObj?.name || user?.branch_name || '',
        date: todayDb,
        machines: machines.map((m, idx) => ({
          id: m.id,
          name: m.name.trim() || `Machine ${idx + 1}`,
          amount: parseNum(m.amount),
        })),
        today_online: parseNum(todayOnline),
        cash_amount: parseNum(cashAmount),
        ajj_ka_kharcha: parseNum(ajjKaKharcha),
        ajj_ka_counter_balance: parseNum(ajjKaCounterBalance),
        mistaken_bill: parseNum(mistakenBill),
        fatte_note: parseNum(fatteNote),
        cashier_username: user?.username || 'cashier',
        cashier_name: user?.name || 'Cashier',
      });

      setExistingRecordId(saved.id);
      setLastSavedAt(saved.created_at || new Date().toISOString());

      Alert.alert(
        'Saved Successfully!',
        `Today's Sale (${todayDisplay}) has been saved.\n\nTotal Sale: ₹${totalSale.toLocaleString()}\nCounter Total: ₹${counterTotal.toLocaleString()}\nResult: ${
          resultBalance < 0 ? resultBalance : `+${resultBalance}`
        }`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save daily sale report');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      logout().then(() => router.replace('/login'));
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const currentBranchName =
    branches.find((b) => b.id === selectedBranchId)?.name ||
    user?.branch_name ||
    'Assigned Branch';

  const buildCurrentSaleRecord = (): CashierSaleRecord => ({
    id: existingRecordId || 'temp',
    branch_id: selectedBranchId || user?.branch_id || '',
    branch_name: currentBranchName,
    date: todayDb,
    machines: machines.map((m, idx) => ({
      id: m.id,
      name: m.name.trim() || `Machine ${idx + 1}`,
      amount: parseNum(m.amount),
    })),
    total_sale: totalSale,
    today_online: parseNum(todayOnline),
    cash_amount: parseNum(cashAmount),
    ajj_ka_kharcha: parseNum(ajjKaKharcha),
    ajj_ka_counter_balance: parseNum(ajjKaCounterBalance),
    mistaken_bill: parseNum(mistakenBill),
    fatte_note: parseNum(fatteNote),
    counter_total: counterTotal,
    result_balance: resultBalance,
    cashier_username: user?.username || 'cashier',
    cashier_name: user?.name || 'Cashier',
  });

  const handleExportCurrentSale = async (type: 'pdf' | 'excel') => {
    if (totalSale <= 0 && counterTotal <= 0) {
      Alert.alert('Empty Entry', 'Please enter sale or counter figures first before exporting.');
      return;
    }
    const rec = buildCurrentSaleRecord();
    const totalsObj = {
      totalSale: rec.total_sale,
      todayOnline: rec.today_online,
      cashAmount: rec.cash_amount,
      ajjKaKharcha: rec.ajj_ka_kharcha,
      counterBalance: rec.ajj_ka_counter_balance,
      mistakenBill: rec.mistaken_bill,
      fatteNote: rec.fatte_note,
      counterTotal: rec.counter_total,
      resultBalance: rec.result_balance,
    };
    try {
      if (type === 'pdf') {
        await exportCashierSalesPdf([rec], currentBranchName, `Today (${todayDisplay})`, totalsObj);
      } else {
        await exportCashierSalesExcel([rec], currentBranchName, `Today_${todayDisplay}`, totalsObj);
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to export report');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Top Header Bar ── */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: Math.max(insets.top, 12) + 6,
          },
        ]}
      >
        {isAdmin && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.borderLight, marginRight: 8 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </TouchableOpacity>
        )}

        <View style={[styles.roleIconBox, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="calculator" size={20} color={colors.primary} />
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {user?.name || 'Branch Cashier'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
            Cashier Counter • {currentBranchName}
          </Text>
        </View>

        {/* PDF Export Button */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: '#FEF2F2',
            borderColor: '#FCA5A5',
            marginRight: 6,
          }}
          onPress={() => handleExportCurrentSale('pdf')}
        >
          <Ionicons name="document-text-outline" size={13} color="#DC2626" />
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>PDF</Text>
        </TouchableOpacity>

        {/* Excel Export Button */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: '#F0FDF4',
            borderColor: '#86EFAC',
            marginRight: 6,
          }}
          onPress={() => handleExportCurrentSale('excel')}
        >
          <Ionicons name="grid-outline" size={13} color="#16A34A" />
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>Excel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.borderLight, marginRight: 8 }]}
          onPress={toggleTheme}
        >
          <Ionicons
            name={isDark ? 'sunny' : 'moon'}
            size={17}
            color={isDark ? '#FBBF24' : colors.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.logoutBtn,
            { backgroundColor: colors.dangerLight, borderColor: colors.danger },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Online Database Connection Error Banner */}
      {(!isCloudConnected || dbErrorMessage) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: '#FEE2E2',
            borderColor: '#EF4444',
            borderBottomWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Ionicons name="warning" size={18} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#991B1B' }}>
              Online Database Connection Error
            </Text>
            <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 1 }}>
              {dbErrorMessage ||
                'Unable to connect to the online database. Please check your internet connection.'}
            </Text>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: '#DC2626',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
            }}
            onPress={() => {
              refreshCloudStatus();
              onRefresh();
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Read-Only Today Date & Branch Info Card ── */}
          <View
            style={[
              styles.dateBannerCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.dateBannerLeft}>
              <View style={[styles.calendarBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
                  Today Date (Read Only)
                </Text>
                <Text style={[styles.dateValue, { color: colors.text }]}>
                  {todayDisplay}
                </Text>
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View
                style={[
                  styles.readOnlyPill,
                  { backgroundColor: colors.borderLight, borderColor: colors.border },
                ]}
              >
                <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
                <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>
                  READ ONLY
                </Text>
              </View>
              {lastSavedAt && (
                <View style={[styles.savedBadge, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.success }}>
                    Saved Today
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Admin Branch Switcher (only shown if Admin opens this screen) */}
          {isAdmin && branches.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {branches.map((b) => {
                const active = b.id === selectedBranchId;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.branchChip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedBranchId(b.id);
                      loadTodaySale(b.id);
                    }}
                  >
                    <Ionicons
                      name="business"
                      size={13}
                      color={active ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: active ? '#FFFFFF' : colors.text,
                      }}
                    >
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* ── SECTION 1: MACHINE SALES ── */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="hardware-chip-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Today Machine Sales
                  </Text>
                  <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                    Enter today's sale amount for each machine
                  </Text>
                </View>
              </View>
            </View>

            {/* Machine Rows */}
            {machines.map((m, idx) => (
              <View key={m.id} style={styles.machineRow}>
                {/* Machine Name Input */}
                <View
                  style={[
                    styles.machineNameBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <View style={[styles.machineNumBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.machineNumText, { color: colors.primary }]}>
                      #{idx + 1}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.machineNameInput, { color: colors.text }]}
                    value={m.name}
                    onChangeText={(t) => handleUpdateMachine(m.id, { name: t })}
                    placeholder={`Machine ${idx + 1}`}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                {/* Machine Sale Amount Input */}
                <View
                  style={[
                    styles.machineAmountBox,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: parseNum(m.amount) > 0 ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.machineAmountInput, { color: colors.text }]}
                    value={m.amount}
                    onChangeText={(t) => handleUpdateMachine(m.id, { amount: t })}
                    placeholder="e.g. 1000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>

                {/* Remove Machine Button */}
                {machines.length > 1 && (
                  <TouchableOpacity
                    style={[styles.removeMachineBtn, { backgroundColor: colors.dangerLight }]}
                    onPress={() => handleRemoveMachine(m.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* + Add More Machine Button */}
            <TouchableOpacity
              style={[
                styles.addMachineBtn,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
              onPress={handleAddMachine}
            >
              <Ionicons name="add-circle" size={18} color={colors.primary} />
              <Text style={[styles.addMachineBtnText, { color: colors.primary }]}>
                + Add More Machine Sale
              </Text>
            </TouchableOpacity>

            {/* Bottom of Machine Section: Total Sale */}
            <View
              style={[
                styles.sectionTotalBar,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.sectionTotalLabel, { color: colors.text }]}>
                Total Sale ({machines.length} {machines.length > 1 ? 'Machines' : 'Machine'}) :
              </Text>
              <Text style={[styles.sectionTotalValue, { color: colors.primary }]}>
                ₹{totalSale.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* ── SECTION 2: DAILY COUNTER & EXPENSES BREAKDOWN ── */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="wallet-outline" size={18} color={colors.success} />
                </View>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Counter & Expenses Details
                  </Text>
                  <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                    Online, Cash, Kharcha, Counter Balance, Mistaken Bill & Fatte Note
                  </Text>
                </View>
              </View>
            </View>

            {/* Row 1: Today Online + Cash */}
            <View style={styles.twoColGrid}>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  1. Today Online (Paytm, Google Pay)
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="phone-portrait-outline" size={15} color={colors.primary} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={todayOnline}
                    onChangeText={setTodayOnline}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  2. Cash
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="cash-outline" size={15} color={colors.success} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Row 2: Ajj Ka Kharcha + Ajj Ka Counter Balance */}
            <View style={styles.twoColGrid}>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  3. Ajj Ka Kharcha
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="receipt-outline" size={15} color={colors.warning} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={ajjKaKharcha}
                    onChangeText={setAjjKaKharcha}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  4. Ajj Ka Counter Balance
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="briefcase-outline" size={15} color={colors.info} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={ajjKaCounterBalance}
                    onChangeText={setAjjKaCounterBalance}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Row 3: Mistaken Bill + Fatte Note */}
            <View style={styles.twoColGrid}>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  5. Mistaken Bill
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="document-text-outline" size={15} color={colors.danger} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={mistakenBill}
                    onChangeText={setMistakenBill}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  6. Fatte Note (Torn Notes)
                </Text>
                <View
                  style={[
                    styles.counterInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="cut-outline" size={15} color={colors.warning} />
                  <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.counterInput, { color: colors.text }]}
                    value={fatteNote}
                    onChangeText={setFatteNote}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Bottom of Counter Section: Total */}
            <View
              style={[
                styles.sectionTotalBar,
                { backgroundColor: colors.successLight, borderColor: colors.success },
              ]}
            >
              <Text style={[styles.sectionTotalLabel, { color: colors.text }]}>
                Total :
              </Text>
              <Text style={[styles.sectionTotalValue, { color: colors.success }]}>
                ₹{counterTotal.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* ── SECTION 3: RESULT BOX (Difference: Counter Total - Total Sale) ── */}
          <View
            style={[
              styles.resultBox,
              {
                backgroundColor: isNegativeResult ? '#FEE2E2' : '#DCFCE7',
                borderColor: isNegativeResult ? '#EF4444' : '#16A34A',
              },
            ]}
          >
            <View style={styles.resultTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons
                  name={isNegativeResult ? 'alert-circle' : 'checkmark-circle'}
                  size={24}
                  color={isNegativeResult ? '#DC2626' : '#16A34A'}
                />
                <Text
                  style={[
                    styles.resultHeading,
                    { color: isNegativeResult ? '#991B1B' : '#14532D' },
                  ]}
                >
                  Result :
                </Text>
              </View>

              <Text
                style={[
                  styles.resultAmount,
                  { color: isNegativeResult ? '#DC2626' : '#16A34A' },
                ]}
              >
                {resultBalance < 0
                  ? `${resultBalance.toLocaleString()}`
                  : `${resultBalance.toLocaleString()}`}
              </Text>
            </View>

            <Text
              style={[
                styles.resultFormulaText,
                { color: isNegativeResult ? '#B91C1C' : '#15803D' },
              ]}
            >
              Counter Total (₹{counterTotal.toLocaleString()}) − Total Sale (₹
              {totalSale.toLocaleString()}) ={' '}
              <Text style={{ fontWeight: '900' }}>
                {resultBalance < 0
                  ? `${resultBalance.toLocaleString()}`
                  : `${resultBalance.toLocaleString()}`}
              </Text>
            </Text>
          </View>

          {/* ── SAVE BUTTON ── */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSaveReport}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {existingRecordId
                    ? "Update Today's Sale Report"
                    : "Save Today's Sale Report"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  roleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loaderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 14,
  },
  dateBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  dateBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateValue: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
  },
  readOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  readOnlyText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
  },
  sectionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 11,
    marginTop: 1,
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  machineNameBox: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 42,
    gap: 6,
  },
  machineNumBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  machineNumText: {
    fontSize: 10,
    fontWeight: '800',
  },
  machineNameInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 0,
  },
  machineAmountBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    gap: 4,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '700',
  },
  machineAmountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 0,
  },
  removeMachineBtn: {
    width: 38,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMachineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 4,
    marginBottom: 12,
  },
  addMachineBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTotalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTotalValue: {
    fontSize: 19,
    fontWeight: '900',
  },
  twoColGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  gridCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
  },
  counterInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    gap: 5,
  },
  counterInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 0,
  },
  resultBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 16,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultHeading: {
    fontSize: 20,
    fontWeight: '900',
  },
  resultAmount: {
    fontSize: 28,
    fontWeight: '900',
  },
  resultFormulaText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
