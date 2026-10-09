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
import { addEmployee, getBranches, getEmployees, updateEmployee } from '@/services/api';
import { Branch } from '@/types';

export default function AddEmployeeModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const isEditing = Boolean(params.employeeId);

  const { colors } = useAppTheme();
  const { user, isAdmin, isManager } = useAuth();
  const insets = useSafeAreaInsets();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isManager && user?.branch_id ? user.branch_id : ''
  );
  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dailySalary, setDailySalary] = useState('600');
  const [designation, setDesignation] = useState('Operator');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(isAdmin);
  const [isLoadingEmployee, setIsLoadingEmployee] = useState(isEditing);

  useEffect(() => {
    (async () => {
      try {
        if (isAdmin) {
          const list = await getBranches();
          setBranches(list);
          if (list.length > 0 && !selectedBranchId) {
            setSelectedBranchId(list[0].id);
          }
        } else if (isManager && user?.branch_id) {
          setSelectedBranchId(user.branch_id);
        }

        if (isEditing && params.employeeId) {
          const allEmps = await getEmployees();
          const target = allEmps.find((e) => e.id === params.employeeId);
          if (target) {
            setEmployeeCode(target.employee_id_code);
            setName(target.name);
            setPhone(target.phone || '');
            setAddress(target.address || '');
            setDailySalary(target.daily_salary.toString());
            setDesignation(target.designation || 'Staff');
            setSelectedBranchId(target.branch_id);
          }
        }
      } catch (e) {
        console.warn('Failed to load initial data:', e);
      } finally {
        setIsLoadingBranches(false);
        setIsLoadingEmployee(false);
      }
    })();
  }, [isAdmin, isManager, user, params.employeeId, isEditing]);

  const handleSave = async () => {
    if (!employeeCode.trim()) {
      Alert.alert('Required', 'Please enter an Employee ID (e.g. EMP-103)');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter Employee Name');
      return;
    }
    if (!selectedBranchId) {
      Alert.alert('Required', 'Please select a branch');
      return;
    }
    const salaryVal = parseFloat(dailySalary);
    if (isNaN(salaryVal) || salaryVal <= 0) {
      Alert.alert('Invalid Salary', 'Please enter a valid daily salary amount');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && params.employeeId) {
        await updateEmployee(params.employeeId, {
          employee_id_code: employeeCode.trim().toUpperCase(),
          branch_id: selectedBranchId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          daily_salary: salaryVal,
          designation: designation.trim() || 'Staff',
        });
        Alert.alert('Success', `Employee ${name} updated successfully!`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await addEmployee({
          employee_id_code: employeeCode.trim().toUpperCase(),
          branch_id: selectedBranchId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          daily_salary: salaryVal,
          designation: designation.trim() || 'Staff',
          status: 'active',
        });
        Alert.alert('Success', `Employee ${name} added successfully!`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save employee');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {isEditing ? 'Edit Employee' : 'Add New Employee'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {isEditing
                ? 'Update employee profile & daily salary rate'
                : isAdmin
                ? 'Admin: Select branch and register employee'
                : `Adding employee to: ${user?.branch_name || 'Your Branch'}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.borderLight }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isLoadingEmployee ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Branch Selector for Admin */}
            {isAdmin && (
              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Assign Branch *
                </Text>
                {isLoadingBranches ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                    {branches.map((b) => {
                      const isSelected = b.id === selectedBranchId;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.inputBg,
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setSelectedBranchId(b.id)}
                        >
                          <Ionicons
                            name="business"
                            size={14}
                            color={isSelected ? '#FFFFFF' : colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.chipText,
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
            )}

            {/* If Manager, show fixed Branch Pill */}
            {isManager && (
              <View style={[styles.branchInfoPill, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="business" size={16} color={colors.primary} />
                <Text style={[styles.branchInfoText, { color: colors.primary }]}>
                  Branch: {user?.branch_name || 'Assigned Branch'}
                </Text>
              </View>
            )}

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Employee ID *</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. EMP-105"
                  placeholderTextColor={colors.textMuted}
                  value={employeeCode}
                  onChangeText={setEmployeeCode}
                  autoCapitalize="characters"
                />
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Daily Salary (₹) *</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                      fontWeight: '700',
                    },
                  ]}
                  placeholder="e.g. 600"
                  placeholderTextColor={colors.textMuted}
                  value={dailySalary}
                  onChangeText={setDailySalary}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Rajesh Kumar"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Phone Number</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. +91 98765 00000"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Designation / Role</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Machine Operator, Electrician, Helper"
              placeholderTextColor={colors.textMuted}
              value={designation}
              onChangeText={setDesignation}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
            <TextInput
              style={[
                styles.input,
                styles.multiline,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="Employee residential address"
              placeholderTextColor={colors.textMuted}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={2}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={isEditing ? 'checkmark-circle' : 'person-add'} size={20} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {isEditing ? 'Save Changes' : 'Save Employee'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: 20,
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
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  branchInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  branchInfoText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: { flexDirection: 'row', marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
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
