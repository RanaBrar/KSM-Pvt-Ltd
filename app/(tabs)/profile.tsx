import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import {
  deleteBranch,
  deleteEmployee,
  deleteItem,
  deleteManager,
  getBranches,
  getDefaultTaxRate,
  getEmployees,
  getItems,
  getManagers,
  invalidateQueryCache,
  setDefaultTaxRate,
} from '@/services/api';
import { Branch, BranchManager, Employee, Item } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const {
    user,
    isAdmin,
    isManager,
    isCloudConnected,
    updateAdminProfile,
    updateManagerProfile,
    logout,
  } = useAuth();

  // Profile Form state
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Admin Data state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<BranchManager[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [defaultTaxInput, setDefaultTaxInput] = useState<string>('7');
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [adminTab, setAdminTab] = useState<'profile' | 'employees' | 'branches' | 'managers' | 'cashiers' | 'items'>('profile');
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setName(user?.name || '');
    setUsername(user?.username || '');
    setPassword('');

    if (isAdmin) {
      if (branches.length === 0 && employees.length === 0) {
        setIsLoadingAdminData(true);
      }
      try {
        const [brs, mgrs, emps, itms, defTax] = await Promise.all([
          getBranches(),
          getManagers(),
          getEmployees(),
          getItems(),
          getDefaultTaxRate(),
        ]);
        setBranches(brs);
        setManagers(mgrs);
        setEmployees(emps);
        setItems(itms);
        setDefaultTaxInput(String(defTax));
      } catch (err) {
        console.warn('Profile load error:', err);
      } finally {
        setIsLoadingAdminData(false);
        setRefreshing(false);
      }
    } else if (isManager && user?.manager_id) {
      try {
        const [brs, mgrs, emps, itms, defTax] = await Promise.all([
          getBranches(),
          getManagers(),
          getEmployees(),
          getItems(),
          getDefaultTaxRate(),
        ]);
        setBranches(brs);
        setItems(itms);
        setDefaultTaxInput(String(defTax));
        const myMgr = mgrs.find((m) => m.id === user.manager_id);
        if (myMgr) {
          setName(myMgr.name);
          setUsername(myMgr.username);
          setPhone(myMgr.phone || '');
          setAddress(myMgr.address || '');
        }
        setEmployees(emps);
      } catch (err) {
        console.warn('Manager profile load error:', err);
      } finally {
        setRefreshing(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user, isAdmin, isManager])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  const handleSaveDefaultTax = async () => {
    const num = parseFloat(defaultTaxInput.trim());
    if (isNaN(num) || num < 0 || num > 100) {
      Alert.alert('Invalid Tax Rate', 'Please enter a valid tax percentage between 0 and 100.');
      return;
    }
    setIsSavingTax(true);
    try {
      await setDefaultTaxRate(num);
      setDefaultTaxInput(String(num));
      Alert.alert('Saved', `Default purchase tax rate updated to ${num}%.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save tax rate');
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter a username');
      return;
    }

    setIsUpdating(true);
    try {
      if (isAdmin) {
        const success = await updateAdminProfile(name, username, password);
        if (success) {
          setPassword('');
          Alert.alert('Success', 'Admin credentials updated successfully!');
        } else {
          Alert.alert('Error', 'Failed to update admin credentials');
        }
      } else if (isManager) {
        const success = await updateManagerProfile(name, username, password, phone, address);
        if (success) {
          setPassword('');
          Alert.alert('Success', 'Profile and login credentials updated successfully!');
        } else {
          Alert.alert('Error', 'Failed to update manager profile');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteBranch = (branch: Branch) => {
    Alert.alert(
      'Delete Branch',
      `Delete branch "${branch.name}"? This removes associated managers and staff.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteBranch(branch.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleDeleteManager = (mgr: BranchManager) => {
    const label = mgr.role === 'cashier' ? 'Cashier' : 'Manager';
    Alert.alert(
      `Delete ${label}`,
      `Delete ${label.toLowerCase()} account "${mgr.username}" (${mgr.name})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteManager(mgr.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleDeleteItem = (item: Item) => {
    Alert.alert(
      'Delete Product Item',
      `Delete "${item.name}" from catalog? Existing purchases will keep their record, but this item won't be available for new purchases.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteItem(item.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleDeleteEmployee = (emp: Employee) => {
    Alert.alert(
      'Delete Employee',
      `Delete "${emp.name}" (${emp.employee_id_code})? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEmployee(emp.id);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete employee');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
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

  const branchManagers = managers.filter((m) => m.role !== 'cashier');
  const branchCashiers = managers.filter((m) => m.role === 'cashier');
  const myBranch = branches.find((b) => b.id === user?.branch_id);
  const myEmployees = employees.filter((e) => e.branch_id === user?.branch_id);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader
          title="Settings"
          subtitle={isAdmin ? 'Manage profile, staff, branches & more' : 'Profile & Branch Info'}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* User Info Header Card */}
          <View style={[styles.profileHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Ionicons
                name={isAdmin ? 'shield-checkmark' : 'person'}
                size={32}
                color="#FFFFFF"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'User'}</Text>
              <Text style={[styles.profileRole, { color: colors.textSecondary }]}>
                {isAdmin ? 'Super Administrator' : `Branch Manager • ${user?.branch_name || 'Assigned'}`}
              </Text>
              <View style={[styles.usernamePill, { backgroundColor: colors.borderLight }]}>
                <Ionicons name="at" size={13} color={colors.primary} />
                <Text style={[styles.usernamePillText, { color: colors.primary }]}>
                  {user?.username}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Access to Purchases Ledger */}
          <TouchableOpacity
            style={[styles.purchasesBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/(tabs)/purchases')}
          >
            <View style={[styles.purchasesIconBox, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="cart" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.purchasesBannerTitle, { color: colors.text }]}>Purchases & Expenses Ledger</Text>
              <Text style={[styles.purchasesBannerSub, { color: colors.textSecondary }]}>
                {isAdmin ? 'Record, review daily & monthly branch purchases' : 'Record & view your branch purchases'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Admin Quick Access to Cashier Sales Reports */}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.purchasesBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/cashier-reports')}
            >
              <View style={[styles.purchasesIconBox, { backgroundColor: colors.successLight }]}>
                <Ionicons name="calculator" size={22} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.purchasesBannerTitle, { color: colors.text }]}>Cashier Sales & Counter Reports</Text>
                <Text style={[styles.purchasesBannerSub, { color: colors.textSecondary }]}>
                  View all branches, branch-wise, daily & monthly cashier machine sales
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Navigation Tabs: Admin gets all tabs, Manager gets Profile + Employees */}
          {(isAdmin || isManager) && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subTabScrollContent}
              style={[styles.subTabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <TouchableOpacity
                style={[styles.subTabBtn, adminTab === 'profile' && { backgroundColor: colors.primary }]}
                onPress={() => setAdminTab('profile')}
              >
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={adminTab === 'profile' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text style={[styles.subTabBtnText, { color: adminTab === 'profile' ? '#FFFFFF' : colors.textSecondary }]}>
                  Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.subTabBtn, adminTab === 'employees' && { backgroundColor: colors.primary }]}
                onPress={() => setAdminTab('employees')}
              >
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={adminTab === 'employees' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text style={[styles.subTabBtnText, { color: adminTab === 'employees' ? '#FFFFFF' : colors.textSecondary }]}>
                  Employees ({employees.length})
                </Text>
              </TouchableOpacity>

              {isAdmin && (
                <>
                  <TouchableOpacity
                    style={[styles.subTabBtn, adminTab === 'branches' && { backgroundColor: colors.primary }]}
                    onPress={() => setAdminTab('branches')}
                  >
                    <Ionicons
                      name="business-outline"
                      size={14}
                      color={adminTab === 'branches' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.subTabBtnText, { color: adminTab === 'branches' ? '#FFFFFF' : colors.textSecondary }]}>
                      Branches ({branches.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subTabBtn, adminTab === 'managers' && { backgroundColor: colors.primary }]}
                    onPress={() => setAdminTab('managers')}
                  >
                    <Ionicons
                      name="shield-outline"
                      size={14}
                      color={adminTab === 'managers' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.subTabBtnText, { color: adminTab === 'managers' ? '#FFFFFF' : colors.textSecondary }]}>
                      Managers ({branchManagers.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subTabBtn, adminTab === 'cashiers' && { backgroundColor: colors.primary }]}
                    onPress={() => setAdminTab('cashiers')}
                  >
                    <Ionicons
                      name="calculator-outline"
                      size={14}
                      color={adminTab === 'cashiers' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.subTabBtnText, { color: adminTab === 'cashiers' ? '#FFFFFF' : colors.textSecondary }]}>
                      Cashiers ({branchCashiers.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subTabBtn, adminTab === 'items' && { backgroundColor: colors.primary }]}
                    onPress={() => setAdminTab('items')}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={14}
                      color={adminTab === 'items' ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.subTabBtnText, { color: adminTab === 'items' ? '#FFFFFF' : colors.textSecondary }]}>
                      Products ({items.length})
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )}

          {/* SECTION 1: PROFILE & CREDENTIALS UPDATE (For both Admin & Branch Manager) */}
          {(!isAdmin || adminTab === 'profile') && (
            <>
              {/* Branch Info Card (BRANCH MANAGER ONLY) */}
              {isManager && myBranch && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="business" size={20} color={colors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      Assigned Branch: {myBranch.name}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Branch Code:</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{myBranch.code}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Total Staff:</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {myEmployees.length} active employees
                    </Text>
                  </View>
                  {myBranch.phone ? (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Branch Phone:</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{myBranch.phone}</Text>
                    </View>
                  ) : null}
                  {myBranch.address ? (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Address:</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{myBranch.address}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Account Credentials Form */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 14 }]}>
                  Update Profile & Credentials
                </Text>

                <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter login username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  New Password (leave blank to keep current)
                </Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: colors.inputBg,
                        borderColor: colors.inputBorder,
                        color: colors.text,
                      },
                    ]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter new password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {isManager && (
                  <>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Contact Phone</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBg,
                          borderColor: colors.inputBorder,
                          color: colors.text,
                        },
                      ]}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Your phone number"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                    />

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBg,
                          borderColor: colors.inputBorder,
                          color: colors.text,
                        },
                      ]}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Your residential address"
                      placeholderTextColor={colors.textMuted}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleUpdateProfile}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Save Credentials</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Admin: Default Purchase Tax Setting */}
              {isAdmin && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      Purchase Tax Settings
                    </Text>
                  </View>
                  <Text style={[styles.cardSub, { color: colors.textSecondary, marginBottom: 10 }]}>
                    Default tax percentage applied per item when recording purchases (Default: 7%)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }}>
                      <TextInput
                        style={{ flex: 1, paddingVertical: 10, fontSize: 14, fontWeight: '700', color: colors.text }}
                        value={defaultTaxInput}
                        onChangeText={setDefaultTaxInput}
                        placeholder="7"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                      />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textSecondary }}>%</Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: colors.success,
                        paddingHorizontal: 16,
                        paddingVertical: 11,
                        borderRadius: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onPress={handleSaveDefaultTax}
                      disabled={isSavingTax}
                    >
                      {isSavingTax ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Save Tax</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Sign Out Button */}
              <TouchableOpacity
                style={[styles.signOutBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
                onPress={handleSignOut}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={[styles.signOutBtnText, { color: colors.danger }]}>Sign Out</Text>
              </TouchableOpacity>
            </>
          )}

          {/* SECTION 1.5: EMPLOYEES MANAGEMENT (Admin: all branches, Manager: their branch only) */}
          {(isAdmin || isManager) && adminTab === 'employees' && (
            <>
              {/* Search & Add Bar */}
              <View style={[styles.empTopBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.empSearchBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Ionicons name="search" size={17} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.empSearchInput, { color: colors.text }]}
                    placeholder="Search name, ID, phone..."
                    placeholderTextColor={colors.textMuted}
                    value={empSearchQuery}
                    onChangeText={setEmpSearchQuery}
                  />
                  {empSearchQuery ? (
                    <TouchableOpacity onPress={() => setEmpSearchQuery('')}>
                      <Ionicons name="close-circle" size={17} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.addEntityBtn, { backgroundColor: colors.primary, marginBottom: 0, marginTop: 0 }]}
                  onPress={() => router.push('/modal-add-employee')}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.addEntityBtnText}>Add Staff</Text>
                </TouchableOpacity>
              </View>

              {employees.filter((e) => {
                if (isManager && user?.branch_id && e.branch_id !== user.branch_id) return false;
                const q = empSearchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  e.name.toLowerCase().includes(q) ||
                  e.employee_id_code.toLowerCase().includes(q) ||
                  (e.phone && e.phone.includes(q)) ||
                  (e.designation && e.designation.toLowerCase().includes(q))
                );
              }).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="people-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>
                    {empSearchQuery ? 'No staff matches your search.' : 'No employees registered yet.'}
                  </Text>
                </View>
              ) : (
                employees
                  .filter((e) => {
                    if (isManager && user?.branch_id && e.branch_id !== user.branch_id) return false;
                    const q = empSearchQuery.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      e.name.toLowerCase().includes(q) ||
                      e.employee_id_code.toLowerCase().includes(q) ||
                      (e.phone && e.phone.includes(q)) ||
                      (e.designation && e.designation.toLowerCase().includes(q))
                    );
                  })
                  .map((emp) => (
                    <View
                      key={emp.id}
                      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.empCardHeader}>
                        <View style={[styles.empAvatar, { backgroundColor: colors.primaryLight }]}>
                          <Text style={[styles.empAvatarText, { color: colors.primary }]}>
                            {emp.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{emp.name}</Text>
                            <Text style={[styles.codeBadge, { backgroundColor: colors.borderLight, color: colors.primary, fontSize: 10 }]}>
                              {emp.employee_id_code}
                            </Text>
                          </View>
                          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                            {emp.designation || 'Staff Member'}
                            {emp.branch_name ? ` • ${emp.branch_name}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.empWageBadge, { backgroundColor: colors.successLight }]}>
                          <Text style={[styles.empWageAmount, { color: colors.success }]}>₹{emp.daily_salary}</Text>
                          <Text style={[styles.empWageLabel, { color: colors.success }]}>/day</Text>
                        </View>
                      </View>

                      {emp.phone ? (
                        <TouchableOpacity
                          style={[styles.empDetailRow, { marginTop: 8 }]}
                          onPress={() => Linking.openURL(`tel:${emp.phone}`)}
                        >
                          <Ionicons name="call-outline" size={13} color={colors.primary} />
                          <Text style={[styles.detailText, { color: colors.primary, textDecorationLine: 'underline' }]}>
                            {emp.phone}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <View style={[styles.empFooter, { borderTopColor: colors.borderLight }]}>
                        <TouchableOpacity
                          style={[styles.empActionBtn, { backgroundColor: colors.infoLight }]}
                          onPress={() => router.push({ pathname: '/modal-record-payment', params: { employeeId: emp.id } })}
                        >
                          <Ionicons name="wallet-outline" size={14} color={colors.info} />
                          <Text style={[styles.empActionBtnText, { color: colors.info }]}>Pay</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.empActionBtn, { backgroundColor: colors.primaryLight }]}
                          onPress={() => router.push({ pathname: '/modal-add-employee', params: { employeeId: emp.id } })}
                        >
                          <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                          <Text style={[styles.empActionBtnText, { color: colors.primary }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.empActionBtn, { backgroundColor: colors.dangerLight }]}
                          onPress={() => handleDeleteEmployee(emp)}
                        >
                          <Ionicons name="trash-outline" size={14} color={colors.danger} />
                          <Text style={[styles.empActionBtnText, { color: colors.danger }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
              )}
            </>
          )}

          {/* SECTION 2: ADMIN - BRANCHES MANAGEMENT */}
          {isAdmin && adminTab === 'branches' && (
            <>
              <TouchableOpacity
                style={[styles.addEntityBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/modal-add-branch')}
              >
                <Ionicons name="business" size={18} color="#FFFFFF" />
                <Text style={styles.addEntityBtnText}>Add New Branch</Text>
              </TouchableOpacity>

              {branches.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No branches registered yet.
                  </Text>
                </View>
              ) : (
                branches.map((b) => {
                  const branchEmps = employees.filter((e) => e.branch_id === b.id);
                  const branchMgr = branchManagers.find((m) => m.branch_id === b.id);
                  const branchCashier = branchCashiers.find((m) => m.branch_id === b.id);

                  return (
                    <View
                      key={b.id}
                      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.titleWithBadge}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{b.name}</Text>
                            <Text style={[styles.codeBadge, { backgroundColor: colors.borderLight, color: colors.primary }]}>
                              {b.code}
                            </Text>
                          </View>
                          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                            {branchEmps.length} Active Employees
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <TouchableOpacity
                            onPress={() => router.push({ pathname: '/modal-add-branch', params: { branchId: b.id } })}
                          >
                            <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteBranch(b)}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                        <Text style={[styles.detailText, { color: colors.text }]}>
                          Manager:{' '}
                          <Text style={{ fontWeight: '700' }}>
                            {branchMgr ? `${branchMgr.name} (${branchMgr.username})` : 'Unassigned'}
                          </Text>
                        </Text>
                        <Text style={[styles.detailText, { color: colors.text }]}>
                          Cashier:{' '}
                          <Text style={{ fontWeight: '700', color: branchCashier ? colors.success : colors.textSecondary }}>
                            {branchCashier ? `${branchCashier.name} (${branchCashier.username})` : 'Unassigned'}
                          </Text>
                        </Text>
                        {b.phone ? (
                          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                            Phone: {b.phone}
                          </Text>
                        ) : null}
                        {b.address ? (
                          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                            Address: {b.address}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* SECTION 3: ADMIN - MANAGERS MANAGEMENT */}
          {isAdmin && adminTab === 'managers' && (
            <>
              <TouchableOpacity
                style={[styles.addEntityBtn, { backgroundColor: colors.success }]}
                onPress={() => router.push({ pathname: '/modal-add-manager', params: { defaultRole: 'branch_manager' } })}
              >
                <Ionicons name="person-add" size={18} color="#FFFFFF" />
                <Text style={styles.addEntityBtnText}>Add Branch Manager</Text>
              </TouchableOpacity>

              {branchManagers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No branch managers registered yet.
                  </Text>
                </View>
              ) : (
                branchManagers.map((m) => (
                  <View
                    key={m.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{m.name}</Text>
                        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                          Branch Manager • {m.branch_name || 'Assigned'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/modal-add-manager', params: { managerId: m.id } })}
                        >
                          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteManager(m)}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.detailText, { color: colors.primary, fontWeight: '700' }]}>
                        Username: {m.username}
                      </Text>
                      {m.phone ? (
                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                          Phone: {m.phone}
                        </Text>
                      ) : null}
                      {m.address ? (
                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                          Address: {m.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* SECTION 3.5: ADMIN - CASHIERS MANAGEMENT */}
          {isAdmin && adminTab === 'cashiers' && (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  style={[styles.addEntityBtn, { flex: 1, backgroundColor: colors.primary, marginBottom: 0 }]}
                  onPress={() => router.push({ pathname: '/modal-add-manager', params: { defaultRole: 'cashier' } })}
                >
                  <Ionicons name="calculator" size={18} color="#FFFFFF" />
                  <Text style={styles.addEntityBtnText}>Add Branch Cashier</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addEntityBtn, { flex: 1, backgroundColor: colors.success, marginBottom: 0 }]}
                  onPress={() => router.push('/(tabs)/cashier-reports')}
                >
                  <Ionicons name="stats-chart" size={18} color="#FFFFFF" />
                  <Text style={styles.addEntityBtnText}>View Sales Reports</Text>
                </TouchableOpacity>
              </View>

              {branchCashiers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="calculator-outline" size={38} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>
                    No branch cashiers registered yet. Tap "Add Branch Cashier" to create a cashier login for a branch.
                  </Text>
                </View>
              ) : (
                branchCashiers.map((m) => (
                  <View
                    key={m.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.cardTitle, { color: colors.text }]}>{m.name}</Text>
                          <View style={[styles.unitBadge, { backgroundColor: colors.successLight }]}>
                            <Text style={[styles.unitBadgeText, { color: colors.success, fontWeight: '800' }]}>
                              CASHIER
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                          Branch: {m.branch_name || 'Assigned'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/modal-add-manager', params: { managerId: m.id, defaultRole: 'cashier' } })}
                        >
                          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteManager(m)}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.detailText, { color: colors.primary, fontWeight: '700' }]}>
                        Login Username: {m.username}
                      </Text>
                      {m.phone ? (
                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                          Phone: {m.phone}
                        </Text>
                      ) : null}
                      {m.address ? (
                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                          Address: {m.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* SECTION 4: ADMIN - PRODUCTS / ITEMS CATALOG MANAGEMENT */}
          {isAdmin && adminTab === 'items' && (
            <>
              {/* Default Tax Setting Card inside Products tab */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="pricetag-outline" size={17} color={colors.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>Default Purchase Tax (%)</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Default: 7%</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }}>
                    <TextInput
                      style={{ flex: 1, paddingVertical: 8, fontSize: 13, fontWeight: '700', color: colors.text }}
                      value={defaultTaxInput}
                      onChangeText={setDefaultTaxInput}
                      placeholder="7"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textSecondary }}>%</Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.success,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 9,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onPress={handleSaveDefaultTax}
                    disabled={isSavingTax}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.addEntityBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/modal-add-item')}
              >
                <Ionicons name="cube" size={18} color="#FFFFFF" />
                <Text style={styles.addEntityBtnText}>Add Product / Catalog Item</Text>
              </TouchableOpacity>

              {items.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No products added to catalog yet.
                  </Text>
                </View>
              ) : (
                items.map((it) => (
                  <View
                    key={it.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{it.name}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                          {it.category ? (
                            <View style={[styles.categoryBadge, { backgroundColor: colors.primaryLight }]}>
                              <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
                                {it.category}
                              </Text>
                            </View>
                          ) : null}
                          <View style={[styles.unitBadge, { backgroundColor: colors.borderLight }]}>
                            <Text style={[styles.unitBadgeText, { color: colors.textSecondary }]}>
                              Unit: {it.unit || 'kg'}
                            </Text>
                          </View>
                          <View style={[styles.unitBadge, { backgroundColor: colors.successLight }]}>
                            <Text style={[styles.unitBadgeText, { color: colors.success }]}>
                              Tax: {it.tax_rate !== undefined ? it.tax_rate : defaultTaxInput || 7}%
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/modal-add-item', params: { itemId: it.id } })}
                        >
                          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteItem(it)}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  profileHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileRole: {
    fontSize: 12,
    marginTop: 2,
  },
  usernamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
    marginTop: 6,
  },
  usernamePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  subTabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  subTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dbCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  dbCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  dbCardSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  codeBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 8,
    gap: 4,
  },
  detailText: {
    fontSize: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    padding: 6,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 6,
    marginBottom: 20,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  addEntityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  addEntityBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
  },
  subTabScrollContent: {
    paddingHorizontal: 2,
    gap: 6,
  },
  purchasesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  purchasesIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchasesBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  purchasesBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  empTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  empSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  empSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  empCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAvatarText: {
    fontSize: 17,
    fontWeight: '800',
  },
  empWageBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  empWageAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  empWageLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  empDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  empFooter: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 10,
    gap: 8,
  },
  empActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  empActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
