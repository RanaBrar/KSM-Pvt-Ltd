import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import {
  deletePurchase,
  getBranches,
  getPurchases,
  getPurchaseSummary,
  invalidateQueryCache,
} from '@/services/api';
import { Branch, PurchaseRecord, PurchaseSummary } from '@/types';
import { toDisplayDate } from '@/utils/date';

const getTodayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function PurchasesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, isAdmin, isManager } = useAuth();
  const insets = useSafeAreaInsets();

  const todayStr = getTodayString();
  const currentMonthStr = todayStr.substring(0, 7);

  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(
    isManager && user?.branch_id ? user.branch_id : 'all'
  );
  const [filterMode, setFilterMode] = useState<'today' | 'month' | 'all'>('month');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [summary, setSummary] = useState<PurchaseSummary>({
    todayTotal: 0,
    monthTotal: 0,
    totalCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const branchScope =
        selectedBranchFilter === 'all' ? undefined : selectedBranchFilter;

      const [branchList, purchaseList, sum] = await Promise.all([
        getBranches(),
        getPurchases(
          branchScope,
          filterMode === 'today' ? todayStr : undefined,
          filterMode === 'month' ? currentMonthStr : undefined
        ),
        getPurchaseSummary(branchScope, todayStr, currentMonthStr),
      ]);

      setBranches(branchList);
      setPurchases(purchaseList);
      setSummary(sum);
    } catch (err) {
      console.warn('Failed to load purchases:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedBranchFilter, filterMode])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  const handleDelete = (purchase: PurchaseRecord) => {
    Alert.alert(
      'Delete Purchase',
      `Are you sure you want to delete purchase for "${purchase.item_name}" (₹${purchase.amount})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePurchase(purchase.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete purchase');
            }
          },
        },
      ]
    );
  };

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        p.item_name.toLowerCase().includes(q) ||
        (p.branch_name && p.branch_name.toLowerCase().includes(q)) ||
        (p.comment && p.comment.toLowerCase().includes(q))
    );
  }, [purchases, searchQuery]);

  const selectedBranchName =
    selectedBranchFilter === 'all'
      ? 'All Branches'
      : branches.find((b) => b.id === selectedBranchFilter)?.name || 'Branch';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Compact Top Header */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: Math.max(insets.top, 12) + 6,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.borderLight }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              Purchases
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {isAdmin ? selectedBranchName : `${user?.branch_name || 'Branch'} Ledger`}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.catalogBtn, { backgroundColor: colors.borderLight, borderColor: colors.border }]}
              onPress={() => router.push('/modal-add-item')}
            >
              <Ionicons name="cube-outline" size={14} color={colors.primary} />
              <Text style={[styles.catalogBtnText, { color: colors.primary }]}>Items</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.success }]}
            onPress={() => router.push('/add-purchases')}
          >
            <Ionicons name="add" size={17} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Record</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Compact 2-Column KPI Summary Row */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.kpiIconBox, { backgroundColor: colors.successLight }]}>
              <Ionicons name="today" size={16} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Today's Total</Text>
              <Text style={[styles.kpiValue, { color: colors.success }]}>
                ₹{summary.todayTotal.toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.kpiIconBox, { backgroundColor: colors.infoLight }]}>
              <Ionicons name="calendar" size={16} color={colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Month ({currentMonthStr})
              </Text>
              <Text style={[styles.kpiValue, { color: colors.info }]}>
                ₹{summary.monthTotal.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Compact 2-Column Filter Row: Branch Select (if Admin) + Search Input */}
        <View style={styles.filterTwoColRow}>
          {isAdmin && (
            <TouchableOpacity
              style={[
                styles.branchSelectBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setShowBranchModal(true)}
            >
              <Ionicons name="business-outline" size={14} color={colors.primary} />
              <Text style={[styles.branchSelectText, { color: colors.text }]} numberOfLines={1}>
                {selectedBranchName}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          <View
            style={[
              styles.searchBarBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search" size={14} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchBarInput, { color: colors.text }]}
              placeholder="Search item, note..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Compact Period Filter + Count */}
        <View style={[styles.modeBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.modeBtn, filterMode === 'today' && { backgroundColor: colors.primaryLight }]}
            onPress={() => setFilterMode('today')}
          >
            <Text style={[styles.modeBtnText, { color: filterMode === 'today' ? colors.primary : colors.textSecondary }]}>
              Today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, filterMode === 'month' && { backgroundColor: colors.primaryLight }]}
            onPress={() => setFilterMode('month')}
          >
            <Text style={[styles.modeBtnText, { color: filterMode === 'month' ? colors.primary : colors.textSecondary }]}>
              This Month
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, filterMode === 'all' && { backgroundColor: colors.primaryLight }]}
            onPress={() => setFilterMode('all')}
          >
            <Text style={[styles.modeBtnText, { color: filterMode === 'all' ? colors.primary : colors.textSecondary }]}>
              All ({filteredPurchases.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Purchases 2-Column Grid */}
        {isLoading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredPurchases.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cart-outline" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Purchases Found</Text>
            <TouchableOpacity
              style={[styles.emptyAddBtn, { backgroundColor: colors.success }]}
              onPress={() => router.push('/add-purchases')}
            >
              <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
              <Text style={styles.emptyAddBtnText}>Record Purchase</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.twoColGrid}>
            {filteredPurchases.map((p) => (
              <View
                key={p.id}
                style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardTopRow}>
                  <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                    {p.item_name}
                  </Text>
                  <Text style={[styles.amountText, { color: colors.success }]}>
                    ₹{p.amount.toLocaleString()}
                  </Text>
                </View>

                <Text style={[styles.branchBadge, { color: colors.primary }]} numberOfLines={1}>
                  {p.branch_name || 'Branch'} • {toDisplayDate(p.date)}
                </Text>

                {p.quantity_weight ? (
                  <Text style={[styles.qtyText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {p.quantity_weight}
                  </Text>
                ) : null}

                {p.comment ? (
                  <Text style={[styles.commentText, { color: colors.textMuted }]} numberOfLines={1}>
                    {p.comment}
                  </Text>
                ) : null}

                <View style={[styles.cardBottomRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.recordedByText, { color: colors.textMuted }]} numberOfLines={1}>
                    By {p.created_by}
                  </Text>
                  <View style={styles.actionIconsRow}>
                    <TouchableOpacity
                      style={[styles.miniActionBtn, { backgroundColor: colors.borderLight }]}
                      onPress={() =>
                        router.push({ pathname: '/modal-add-purchase', params: { purchaseId: p.id } })
                      }
                    >
                      <Ionicons name="pencil" size={12} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.miniActionBtn, { backgroundColor: colors.dangerLight }]}
                      onPress={() => handleDelete(p)}
                    >
                      <Ionicons name="trash" size={12} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Branch Select Modal */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Filter by Branch</Text>
              <TouchableOpacity
                onPress={() => setShowBranchModal(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.borderLight }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.branchOption,
                {
                  backgroundColor: selectedBranchFilter === 'all' ? colors.primaryLight : colors.inputBg,
                  borderColor: selectedBranchFilter === 'all' ? colors.primary : colors.border,
                  marginBottom: 6,
                },
              ]}
              onPress={() => {
                setSelectedBranchFilter('all');
                setShowBranchModal(false);
              }}
            >
              <Ionicons
                name="apps-outline"
                size={16}
                color={selectedBranchFilter === 'all' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: '700',
                  color: selectedBranchFilter === 'all' ? colors.primary : colors.text,
                }}
              >
                All Branches
              </Text>
            </TouchableOpacity>

            <FlatList
              data={branches}
              keyExtractor={(b) => b.id}
              style={{ maxHeight: 300 }}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item: b }) => {
                const sel = selectedBranchFilter === b.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.branchOption,
                      {
                        backgroundColor: sel ? colors.primaryLight : colors.inputBg,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedBranchFilter(b.id);
                      setShowBranchModal(false);
                    }}
                  >
                    <Ionicons
                      name="business"
                      size={16}
                      color={sel ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: '700',
                        color: sel ? colors.primary : colors.text,
                      }}
                    >
                      {b.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{b.code}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 6,
    minWidth: 0,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 11, fontWeight: '600' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  catalogBtnText: { fontSize: 11, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  scroll: { flex: 1 },
  content: { padding: 10 },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 15, fontWeight: '900' },
  kpiLabel: { fontSize: 10, fontWeight: '600' },
  filterTwoColRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  branchSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  branchSelectText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  searchBarBox: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  modeBar: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnText: { fontSize: 11, fontWeight: '700' },
  loaderBox: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800' },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  emptyAddBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  twoColGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCard: {
    width: '48.6%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  itemName: { flex: 1, fontSize: 13, fontWeight: '800' },
  amountText: { fontSize: 13, fontWeight: '900' },
  branchBadge: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  qtyText: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  commentText: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    paddingTop: 5,
  },
  recordedByText: { flex: 1, fontSize: 9 },
  actionIconsRow: { flexDirection: 'row', gap: 5 },
  miniActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  closeModalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
