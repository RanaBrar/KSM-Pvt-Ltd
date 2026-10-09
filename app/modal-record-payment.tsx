import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { getEmployees, recordPayment } from '@/services/api';
import { Employee, PaymentMode } from '@/types';
import { getTodayDDMMYYYY, isValidDateInput, toDbDate } from '@/utils/date';
import { DatePickerField } from '@/components/date-picker-field';

export default function RecordPaymentModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    employeeId?: string;
    isBonus?: string;
    defaultAmount?: string;
  }>();
  const { colors } = useAppTheme();
  const { user, isManager } = useAuth();
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(params.employeeId || '');
  const [isBonus, setIsBonus] = useState<boolean>(params.isBonus === 'true');
  const [bonusType, setBonusType] = useState<'award' | 'paid'>('award');
  const [amount, setAmount] = useState(params.defaultAmount || '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDDMMYYYY());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const branchScope = isManager && user?.branch_id ? user.branch_id : undefined;
        const list = await getEmployees(branchScope);
        setEmployees(list);
        if (!selectedEmployeeId && list.length > 0) {
          setSelectedEmployeeId(list[0].id);
        }
      } catch (err) {
        console.warn('Failed to load employees:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isManager, user]);

  const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);

  const handleSave = async () => {
    if (!selectedEmployeeId || !selectedEmp) {
      Alert.alert('Required', 'Please select an employee');
      return;
    }
    const payVal = parseFloat(amount);
    if (isNaN(payVal) || payVal <= 0) {
      Alert.alert('Invalid Amount', `Please enter a valid ${isBonus ? 'bonus' : 'payment'} amount`);
      return;
    }

    if (!paymentDate.trim() || !isValidDateInput(paymentDate.trim())) {
      Alert.alert('Invalid Date', 'Date must be in DD-MM-YYYY format (e.g. 31-12-2026)');
      return;
    }

    const dbDate = toDbDate(paymentDate.trim());

    setIsSubmitting(true);
    try {
      await recordPayment({
        employee_id: selectedEmployeeId,
        branch_id: selectedEmp.branch_id,
        amount: payVal,
        payment_date: dbDate,
        payment_mode: paymentMode,
        notes: notes.trim() || (isBonus ? 'Employee Bonus' : ''),
        is_bonus: isBonus,
        bonus_type: isBonus ? bonusType : undefined,
      });
      const actionMsg = isBonus
        ? bonusType === 'award'
          ? `Added ₹${payVal.toLocaleString()} bonus to ${selectedEmp.name}'s monthly salary!`
          : `Recorded paid bonus of ₹${payVal.toLocaleString()} for ${selectedEmp.name}!`
        : `Recorded salary payment of ₹${payVal.toLocaleString()} for ${selectedEmp.name}!`;

      Alert.alert('Success', actionMsg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentModes: { id: PaymentMode; label: string; icon: any }[] = [
    { id: 'cash', label: 'Cash', icon: 'cash-outline' },
    { id: 'upi', label: 'UPI / Online', icon: 'phone-portrait-outline' },
    { id: 'bank_transfer', label: 'Bank Transfer', icon: 'card-outline' },
    { id: 'cheque', label: 'Cheque', icon: 'document-text-outline' },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 24) + 50,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {isBonus ? 'Give Employee Bonus' : 'Record Salary Payment'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {isBonus
                ? 'Award extra bonus to employee salary or pay bonus directly'
                : 'Issue wages or salary advances and track pending balances'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.borderLight }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Toggle: Regular Salary Payment vs Give Bonus */}
        <View style={[styles.typeToggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.typeToggleBtn,
              !isBonus && { backgroundColor: colors.primary },
            ]}
            onPress={() => setIsBonus(false)}
          >
            <Ionicons
              name="wallet-outline"
              size={16}
              color={!isBonus ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.typeToggleText,
                { color: !isBonus ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Salary Payment
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeToggleBtn,
              isBonus && { backgroundColor: '#D97706' },
            ]}
            onPress={() => setIsBonus(true)}
          >
            <Ionicons
              name="gift-outline"
              size={16}
              color={isBonus ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.typeToggleText,
                { color: isBonus ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Give Bonus
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Employee Selector */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Select Employee *</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empPicker}>
              {employees.map((e) => {
                const isSelected = e.id === selectedEmployeeId;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={[
                      styles.empChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.inputBg,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedEmployeeId(e.id)}
                  >
                    <Ionicons
                      name="person"
                      size={14}
                      color={isSelected ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.empChipText,
                        { color: isSelected ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      {e.name} ({e.employee_id_code})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Selected Employee Info Box */}
          {selectedEmp && (
            <View style={[styles.empInfoBanner, { backgroundColor: colors.primaryLight }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.empInfoName, { color: colors.text }]}>
                  {selectedEmp.name}
                </Text>
                <Text style={[styles.empInfoDetail, { color: colors.textSecondary }]}>
                  {selectedEmp.designation} • Daily Wage: ₹{selectedEmp.daily_salary}/day
                </Text>
              </View>
              <View style={styles.branchTag}>
                <Text style={[styles.branchTagText, { color: colors.primary }]}>
                  {selectedEmp.branch_name || 'Assigned'}
                </Text>
              </View>
            </View>
          )}

          {/* Bonus Handling Mode (when Give Bonus is active) */}
          {isBonus && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Bonus Option</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.bonusOptionBtn,
                    {
                      backgroundColor: bonusType === 'award' ? '#FEF3C7' : colors.inputBg,
                      borderColor: bonusType === 'award' ? '#D97706' : colors.border,
                    },
                  ]}
                  onPress={() => setBonusType('award')}
                >
                  <Ionicons
                    name={bonusType === 'award' ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={bonusType === 'award' ? '#D97706' : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: bonusType === 'award' ? '#92400E' : colors.text,
                      }}
                    >
                      Add to Salary
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                      Increases total payable wage
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.bonusOptionBtn,
                    {
                      backgroundColor: bonusType === 'paid' ? colors.successLight : colors.inputBg,
                      borderColor: bonusType === 'paid' ? colors.success : colors.border,
                    },
                  ]}
                  onPress={() => setBonusType('paid')}
                >
                  <Ionicons
                    name={bonusType === 'paid' ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={bonusType === 'paid' ? colors.success : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: bonusType === 'paid' ? colors.success : colors.text,
                      }}
                    >
                      Paid Immediately
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                      Bonus already handed over
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Amount */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {isBonus ? 'Bonus Amount (₹) *' : 'Payment Amount (₹) *'}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.amountInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: isBonus ? '#D97706' : colors.primary,
                color: colors.text,
              },
            ]}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            autoFocus
          />

          {/* Date Picker (type="date") */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Date *</Text>
          <DatePickerField value={paymentDate} onChange={setPaymentDate} compact={false} />

          {/* Payment Mode (shown for regular payment or immediately paid bonus) */}
          {(!isBonus || bonusType === 'paid') && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Payment Method</Text>
              <View style={styles.modeGrid}>
                {paymentModes.map((mode) => {
                  const isSelected = paymentMode === mode.id;
                  return (
                    <TouchableOpacity
                      key={mode.id}
                      style={[
                        styles.modeBtn,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.inputBg,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setPaymentMode(mode.id)}
                    >
                      <Ionicons
                        name={mode.icon}
                        size={16}
                        color={isSelected ? '#FFFFFF' : colors.text}
                      />
                      <Text
                        style={[
                          styles.modeBtnText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Notes */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {isBonus ? 'Bonus Reason / Note' : 'Notes / Reference'}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                color: colors.text,
              },
            ]}
            placeholder={
              isBonus
                ? 'e.g. Festival Bonus, Overtime Bonus, Performance Reward'
                : 'e.g. Full month wage, Advance, or Transaction ID'
            }
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
          />

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: isBonus ? '#D97706' : colors.success },
            ]}
            onPress={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name={isBonus ? 'gift' : 'checkmark-circle'}
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.submitBtnText}>
                  {isBonus ? 'Confirm & Save Bonus' : 'Confirm & Record Payment'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 3 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
    gap: 6,
  },
  typeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  typeToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bonusOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  empPicker: { flexDirection: 'row', marginBottom: 12 },
  empChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  empChipText: { fontSize: 13, fontWeight: '600' },
  empInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  empInfoName: { fontSize: 15, fontWeight: '700' },
  empInfoDetail: { fontSize: 12, marginTop: 2 },
  branchTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  branchTagText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    paddingVertical: 14,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  modeBtnText: { fontSize: 12, fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
