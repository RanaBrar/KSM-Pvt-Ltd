import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { deleteEmployee, getEmployees, invalidateQueryCache } from '@/services/api';
import { Employee } from '@/types';

export default function EmployeesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { isAdmin, isManager, activeBranchFilter, user } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const branchScope = activeBranchFilter === 'all' ? undefined : activeBranchFilter;
      const list = await getEmployees(branchScope);
      setEmployees(list);
    } catch (err) {
      console.warn('Employees load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeBranchFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  const filteredEmployees = employees.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.employee_id_code.toLowerCase().includes(q) ||
      (e.phone && e.phone.includes(q)) ||
      (e.designation && e.designation.toLowerCase().includes(q))
    );
  });

  const handleCall = (phone?: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleDeleteEmployee = (emp: Employee) => {
    Alert.alert(
      'Delete Employee',
      `Are you sure you want to delete "${emp.name}" (${emp.employee_id_code})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEmployee(emp.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete employee');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Staff Directory" subtitle="Employees & Wages" />

      {/* Search & Add Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <Ionicons name="search" size={17} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by name, ID code, phone..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/modal-add-employee')}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Staff</Text>
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
        ) : filteredEmployees.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Employees Found</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              {searchQuery
                ? 'No staff member matches your search filter.'
                : 'Click "Add Staff" above to register employees with daily salary.'}
            </Text>
          </View>
        ) : (
          filteredEmployees.map((emp) => (
            <View
              key={emp.id}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {emp.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.text }]}>{emp.name}</Text>
                    <View style={[styles.codeBadge, { backgroundColor: colors.borderLight }]}>
                      <Text style={[styles.codeBadgeText, { color: colors.primary }]}>
                        {emp.employee_id_code}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.designation, { color: colors.textSecondary }]}>
                    {emp.designation || 'Staff Member'}
                    {isAdmin && emp.branch_name ? ` • ${emp.branch_name}` : ''}
                  </Text>
                </View>

                {/* Daily Wage Badge */}
                <View style={[styles.wageBadge, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.wageAmount, { color: colors.success }]}>
                    ₹{emp.daily_salary}
                  </Text>
                  <Text style={[styles.wageLabel, { color: colors.success }]}>/ day</Text>
                </View>
              </View>

              {/* Details & Contacts */}
              <View style={[styles.detailsSection, { borderTopColor: colors.borderLight }]}>
                {emp.phone ? (
                  <TouchableOpacity style={styles.detailRow} onPress={() => handleCall(emp.phone)}>
                    <Ionicons name="call-outline" size={14} color={colors.primary} />
                    <Text style={[styles.detailText, { color: colors.primary, textDecorationLine: 'underline' }]}>
                      {emp.phone}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {emp.address ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.detailText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {emp.address}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Bottom Quick Actions */}
              <View style={[styles.cardFooter, { borderTopColor: colors.borderLight }]}>
                <TouchableOpacity
                  style={[styles.payActionBtn, { backgroundColor: colors.infoLight }]}
                  onPress={() => router.push({ pathname: '/modal-record-payment', params: { employeeId: emp.id } })}
                >
                  <Ionicons name="wallet-outline" size={15} color={colors.info} />
                  <Text style={[styles.payActionBtnText, { color: colors.info }]}>Pay Wages</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editActionBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => router.push({ pathname: '/modal-add-employee', params: { employeeId: emp.id } })}
                >
                  <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                  <Text style={[styles.editActionBtnText, { color: colors.primary }]}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.deleteActionBtn, { backgroundColor: colors.dangerLight }]}
                  onPress={() => handleDeleteEmployee(emp)}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.deleteActionBtnText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 40 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center' },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  codeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  designation: {
    fontSize: 12,
    marginTop: 2,
  },
  wageBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  wageAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  wageLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 10,
    gap: 10,
  },
  payActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  payActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  editActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  deleteActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
