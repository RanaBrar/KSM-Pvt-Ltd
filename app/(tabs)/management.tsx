import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  deleteBranch,
  deleteManager,
  getBranches,
  getEmployees,
  getManagers,
  invalidateQueryCache,
} from '@/services/api';
import { Branch, BranchManager, Employee } from '@/types';

export default function ManagementScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, isAdmin, isManager, isCloudConnected } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<BranchManager[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeTab, setActiveTab] = useState<'branches' | 'managers'>('branches');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [brs, mgrs, emps] = await Promise.all([
        getBranches(),
        getManagers(),
        getEmployees(),
      ]);
      setBranches(brs);
      setManagers(mgrs);
      setEmployees(emps);
    } catch (err) {
      console.warn('Management load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  const handleDeleteBranch = (branch: Branch) => {
    Alert.alert(
      'Delete Branch',
      `Are you sure you want to delete "${branch.name}"? This will also remove associated managers and staff.`,
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
    Alert.alert(
      'Delete Manager',
      `Are you sure you want to delete manager account "${mgr.username}" (${mgr.name})?`,
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

  // For Branch Manager view: Filter to their own branch
  const myBranch = branches.find((b) => b.id === user?.branch_id);
  const myEmployees = employees.filter((e) => e.branch_id === user?.branch_id);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={isAdmin ? 'Company & Branches' : 'My Branch Profile'}
        subtitle={isAdmin ? 'Manage Network & Managers' : 'Branch Details & Staff'}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {isAdmin ? (
          /* ================================================================= */
          /* ADMIN VIEW: BRANCHES & BRANCH MANAGERS MANAGEMENT */
          /* ================================================================= */
          <>
            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/modal-add-branch')}
              >
                <Ionicons name="business" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Add Branch</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.success }]}
                onPress={() => router.push('/modal-add-manager')}
              >
                <Ionicons name="person-add" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Add Manager</Text>
              </TouchableOpacity>
            </View>

            {/* Segment Tab */}
            <View style={[styles.subTabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[
                  styles.subTabBtn,
                  activeTab === 'branches' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('branches')}
              >
                <Ionicons
                  name="business-outline"
                  size={16}
                  color={activeTab === 'branches' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.subTabBtnText,
                    { color: activeTab === 'branches' ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  Branches ({branches.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.subTabBtn,
                  activeTab === 'managers' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('managers')}
              >
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={activeTab === 'managers' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.subTabBtnText,
                    { color: activeTab === 'managers' ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  Branch Managers ({managers.length})
                </Text>
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : activeTab === 'branches' ? (
              /* BRANCHES LIST */
              branches.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="business-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No branches registered yet.
                  </Text>
                </View>
              ) : (
                branches.map((b) => {
                  const branchEmps = employees.filter((e) => e.branch_id === b.id);
                  const branchMgr = managers.find((m) => m.branch_id === b.id);

                  return (
                    <View
                      key={b.id}
                      style={[
                        styles.card,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={[styles.branchIconBox, { backgroundColor: colors.primaryLight }]}>
                          <Ionicons name="business" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.nameRow}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{b.name}</Text>
                            <Text style={[styles.codeBadge, { backgroundColor: colors.borderLight, color: colors.primary }]}>
                              {b.code}
                            </Text>
                          </View>
                          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                            {branchEmps.length} Employees Assigned
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => handleDeleteBranch(b)}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>

                      <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                        {branchMgr ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.detailText, { color: colors.text }]}>
                              Manager: <Text style={{ fontWeight: '700' }}>{branchMgr.name}</Text> ({branchMgr.username})
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.detailRow}>
                            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
                            <Text style={[styles.detailText, { color: colors.warning }]}>
                              No manager assigned yet
                            </Text>
                          </View>
                        )}

                        {b.phone ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="call-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{b.phone}</Text>
                          </View>
                        ) : null}

                        {b.address ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{b.address}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )
            ) : (
              /* BRANCH MANAGERS LIST */
              managers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No branch managers registered yet.
                  </Text>
                </View>
              ) : (
                managers.map((mgr) => (
                  <View
                    key={mgr.id}
                    style={[
                      styles.card,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.branchIconBox, { backgroundColor: colors.successLight }]}>
                        <Ionicons name="person" size={20} color={colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{mgr.name}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                          Branch: {mgr.branch_name || 'Assigned'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteManager(mgr)}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                      <View style={styles.detailRow}>
                        <Ionicons name="key-outline" size={14} color={colors.primary} />
                        <Text style={[styles.detailText, { color: colors.primary, fontWeight: '700' }]}>
                          Username: {mgr.username}
                        </Text>
                      </View>

                      {mgr.phone ? (
                        <View style={styles.detailRow}>
                          <Ionicons name="call-outline" size={14} color={colors.textSecondary} />
                          <Text style={[styles.detailText, { color: colors.textSecondary }]}>{mgr.phone}</Text>
                        </View>
                      ) : null}

                      {mgr.address ? (
                        <View style={styles.detailRow}>
                          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                          <Text style={[styles.detailText, { color: colors.textSecondary }]}>{mgr.address}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              )
            )}
          </>
        ) : (
          /* ================================================================= */
          /* BRANCH MANAGER VIEW: BRANCH PROFILE */
          /* ================================================================= */
          <View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.branchIconBox, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="business" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {myBranch?.name || user?.branch_name || 'My Branch'}
                  </Text>
                  <Text style={[styles.codeBadge, { backgroundColor: colors.borderLight, color: colors.primary, alignSelf: 'flex-start', marginTop: 4 }]}>
                    Branch Code: {myBranch?.code || 'Assigned'}
                  </Text>
                </View>
              </View>

              <View style={[styles.detailsBox, { borderTopColor: colors.borderLight }]}>
                <View style={styles.detailRow}>
                  <Ionicons name="people-outline" size={16} color={colors.primary} />
                  <Text style={[styles.detailText, { color: colors.text, fontWeight: '700' }]}>
                    {myEmployees.length} Active Staff Members
                  </Text>
                </View>

                {myBranch?.phone ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                      {myBranch.phone}
                    </Text>
                  </View>
                ) : null}

                {myBranch?.address ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                      {myBranch.address}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Manager Account Info */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>
                Manager Account
              </Text>
              <View style={styles.detailRow}>
                <Ionicons name="person-outline" size={16} color={colors.primary} />
                <Text style={[styles.detailText, { color: colors.text }]}>
                  Name: <Text style={{ fontWeight: '700' }}>{user?.name}</Text>
                </Text>
              </View>
              <View style={[styles.detailRow, { marginTop: 6 }]}>
                <Ionicons name="key-outline" size={16} color={colors.primary} />
                <Text style={[styles.detailText, { color: colors.text }]}>
                  Username: <Text style={{ fontWeight: '700' }}>{user?.username}</Text>
                </Text>
              </View>
            </View>
          </View>
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
  dbStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  dbStatusTitle: { fontSize: 13, fontWeight: '700' },
  dbStatusSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
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
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  subTabBtnText: { fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, marginTop: 8 },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  branchIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  codeBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  detailsBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 10,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: { fontSize: 12 },
});
