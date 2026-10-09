import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import {
  addPurchase,
  getBranches,
  getDefaultTaxRate,
  getItems,
  getPurchases,
  updatePurchase,
} from '@/services/api';
import { Branch, Item } from '@/types';
import {
  getTodayDDMMYYYY,
  isValidDateInput,
  toDbDate,
  toDisplayDate,
} from '@/utils/date';
import { DatePickerField } from '@/components/date-picker-field';

export default function AddPurchaseModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purchaseId?: string }>();
  const isEditing = Boolean(params.purchaseId);

  const { colors } = useAppTheme();
  const { user, isAdmin, isManager } = useAuth();
  const insets = useSafeAreaInsets();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [defaultTaxRate, setDefaultTaxRateState] = useState<number>(7);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [amount, setAmount] = useState<string>(''); // unit price
  const [quantityWeight, setQuantityWeight] = useState<string>('1');
  const [applyTax, setApplyTax] = useState<boolean>(false);
  const [taxPercent, setTaxPercent] = useState<string>('7');
  const [date, setDate] = useState<string>(getTodayDDMMYYYY());
  const [comment, setComment] = useState<string>('');

  const [showItemPicker, setShowItemPicker] = useState<boolean>(false);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [showBranchPicker, setShowBranchPicker] = useState<boolean>(false);
  const [branchSearchQuery, setBranchSearchQuery] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [branchList, itemList, defTax] = await Promise.all([
          getBranches(),
          getItems(),
          getDefaultTaxRate(),
        ]);
        setBranches(branchList);
        setItems(itemList);
        setDefaultTaxRateState(defTax);
        setTaxPercent(String(defTax));

        if (isManager && user?.branch_id) {
          setSelectedBranchId(user.branch_id);
        } else if (branchList.length > 0) {
          setSelectedBranchId(branchList[0].id);
        }

        if (isEditing && params.purchaseId) {
          const allPurchases = await getPurchases();
          const target = allPurchases.find((p) => p.id === params.purchaseId);
          if (target) {
            setSelectedBranchId(target.branch_id);
            setSelectedItemId(target.item_id || null);
            setItemName(target.item_name);
            if (target.unit_price !== undefined) {
              setAmount(String(target.unit_price));
            } else {
              setAmount(String(target.amount));
            }
            if (target.quantity !== undefined) {
              setQuantityWeight(String(target.quantity));
            } else if (target.quantity_weight) {
              const parsed = parseFloat(target.quantity_weight);
              setQuantityWeight(!isNaN(parsed) ? String(parsed) : target.quantity_weight);
            }
            if (target.tax_applied !== undefined) {
              setApplyTax(Boolean(target.tax_applied));
            }
            if (target.tax_percent !== undefined && target.tax_percent > 0) {
              setTaxPercent(String(target.tax_percent));
            }
            setDate(toDisplayDate(target.date));
            setComment(target.comment || '');
          }
        }
      } catch (err) {
        console.warn('Failed to load purchase modal data:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditing, params.purchaseId]);

  const calc = useMemo(() => {
    const p = parseFloat(amount.trim());
    const validPrice = !isNaN(p) && p > 0 ? p : 0;

    const q = parseFloat(quantityWeight.trim());
    const validQty = !isNaN(q) && q > 0 ? q : 1;

    const subtotal = validPrice * validQty;

    const t = parseFloat(taxPercent.trim());
    const validTax = !isNaN(t) && t >= 0 ? t : 0;

    const taxAmt = applyTax ? (subtotal * validTax) / 100 : 0;
    const total = subtotal + taxAmt;

    return {
      unitPrice: validPrice,
      qty: validQty,
      subtotal: Math.round(subtotal * 100) / 100,
      taxPercent: validTax,
      taxAmount: Math.round(taxAmt * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [amount, quantityWeight, applyTax, taxPercent]);

  const filteredItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.category && it.category.toLowerCase().includes(q)) ||
        (it.unit && it.unit.toLowerCase().includes(q))
    );
  }, [items, itemSearchQuery]);

  const filteredBranches = useMemo(() => {
    const q = branchSearchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.code && b.code.toLowerCase().includes(q))
    );
  }, [branches, branchSearchQuery]);

  const handleSelectItem = (item: Item) => {
    setSelectedItemId(item.id);
    setItemName(item.name);
    setUnit(item.unit || '');
    setTaxPercent(
      String(item.tax_rate !== undefined && item.tax_rate !== null ? item.tax_rate : defaultTaxRate)
    );
    setShowItemPicker(false);
    setItemSearchQuery('');
  };

  const handleSelectCustomItem = (customName: string) => {
    if (!customName.trim()) return;
    setSelectedItemId(null);
    setItemName(customName.trim());
    setShowItemPicker(false);
    setItemSearchQuery('');
  };

  const handleSave = async () => {
    if (!selectedBranchId) {
      Alert.alert('Required', 'Please select a branch.');
      return;
    }

    if (!itemName.trim()) {
      Alert.alert('Required', 'Please select or enter a product/item name.');
      return;
    }

    if (calc.unitPrice <= 0) {
      Alert.alert('Required', 'Please enter a valid purchase amount/price in ₹.');
      return;
    }

    if (!date.trim() || !isValidDateInput(date.trim())) {
      Alert.alert('Invalid Date', 'Date must be in DD-MM-YYYY format (e.g. 31-12-2026).');
      return;
    }

    const dbDate = toDbDate(date.trim());
    const rawQty = quantityWeight.trim();
    const hasLetters = /[a-zA-Z]/.test(rawQty);
    const formattedQty = rawQty
      ? hasLetters
        ? rawQty
        : unit
        ? `${rawQty} ${unit}`
        : rawQty
      : '1';
    const qtySummary = `${formattedQty} × ₹${calc.unitPrice}${
      applyTax ? ` (+${calc.taxPercent}% tax: ₹${calc.taxAmount})` : ''
    }`;

    setIsSubmitting(true);
    try {
      if (isEditing && params.purchaseId) {
        await updatePurchase(params.purchaseId, {
          branch_id: selectedBranchId,
          item_id: selectedItemId || undefined,
          item_name: itemName.trim(),
          amount: calc.total,
          unit_price: calc.unitPrice,
          quantity: calc.qty,
          quantity_weight: qtySummary,
          tax_applied: applyTax,
          tax_percent: applyTax ? calc.taxPercent : 0,
          tax_amount: calc.taxAmount,
          subtotal: calc.subtotal,
          date: dbDate,
          comment: comment.trim() || undefined,
        });
        Alert.alert('Success', 'Purchase updated successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await addPurchase({
          branch_id: selectedBranchId,
          item_id: selectedItemId || undefined,
          item_name: itemName.trim(),
          amount: calc.total,
          unit_price: calc.unitPrice,
          quantity: calc.qty,
          quantity_weight: qtySummary,
          tax_applied: applyTax,
          tax_percent: applyTax ? calc.taxPercent : 0,
          tax_amount: calc.taxAmount,
          subtotal: calc.subtotal,
          date: dbDate,
          comment: comment.trim() || undefined,
          created_by: user?.username || 'user',
        });
        Alert.alert('Success', 'Purchase recorded successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record purchase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 8,
            paddingBottom: Math.max(insets.bottom, 20) + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Compact Header */}
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.successLight }]}>
            <Ionicons name="cart" size={20} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {isEditing ? 'Edit Purchase' : 'Record Purchase'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Compact 2-column entry • Default Tax: {defaultTaxRate}%
            </Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.quickCatalogBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
              onPress={() => router.push('/modal-add-item')}
            >
              <Ionicons name="cube-outline" size={14} color={colors.primary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>+ Item</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Compact 2-Column Form Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* 2-Column Row 1: Branch + Date */}
          <View style={styles.twoColRow}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Branch <Text style={styles.required}>*</Text>
              </Text>
              {isAdmin ? (
                <TouchableOpacity
                  style={[styles.selectBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  onPress={() => {
                    setBranchSearchQuery('');
                    setShowBranchPicker(true);
                  }}
                >
                  <Ionicons name="business-outline" size={15} color={colors.primary} />
                  <Text style={[styles.selectBoxText, { color: colors.text }]} numberOfLines={1}>
                    {selectedBranch?.name || 'Select Branch'}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.selectBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="business" size={15} color={colors.primary} />
                  <Text style={[styles.selectBoxText, { color: colors.text }]} numberOfLines={1}>
                    {selectedBranch?.name || user?.branch_name || 'Assigned Branch'}
                  </Text>
                  <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                </View>
              )}
            </View>

            <View style={styles.col}>
              <View style={styles.labelRowBetween}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Date <Text style={styles.required}>*</Text>
                </Text>
                {date !== getTodayDDMMYYYY() && (
                  <TouchableOpacity onPress={() => setDate(getTodayDDMMYYYY())}>
                    <Text style={[styles.todayLink, { color: colors.primary }]}>Today</Text>
                  </TouchableOpacity>
                )}
              </View>
              <DatePickerField value={date} onChange={setDate} compact />
            </View>
          </View>

          {/* 2-Column Row 2: Product Select with Search + Note */}
          <View style={[styles.twoColRow, { marginTop: 10 }]}>
            <View style={[styles.col, { flex: 1.2 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Product / Item <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.selectBox,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: itemName ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setItemSearchQuery('');
                  setShowItemPicker(true);
                }}
              >
                <Ionicons
                  name="cube-outline"
                  size={15}
                  color={itemName ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.selectBoxText,
                    {
                      color: itemName ? colors.text : colors.textMuted,
                      fontWeight: itemName ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {itemName ? `${itemName}${unit ? ` (${unit})` : ''}` : 'Select / Search...'}
                </Text>
                <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.col, { flex: 0.8 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Note / Vendor
              </Text>
              <View style={[styles.compactInputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.compactInput, { color: colors.text }]}
                  placeholder="Optional note"
                  placeholderTextColor={colors.textMuted}
                  value={comment}
                  onChangeText={setComment}
                />
              </View>
            </View>
          </View>

          {/* 2-Column Row 3: Amount/Price (₹) + Qty */}
          <View style={[styles.twoColRow, { marginTop: 10 }]}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Amount / Price (₹) <Text style={styles.required}>*</Text>
              </Text>
              <View style={[styles.compactInputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₹</Text>
                <TextInput
                  style={[styles.compactInput, { color: colors.text }]}
                  placeholder="e.g. 100"
                  placeholderTextColor={colors.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Qty / Weight {unit ? `(${unit})` : ''}
              </Text>
              <View style={[styles.compactInputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
                <TextInput
                  style={[styles.compactInput, { color: colors.text }]}
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.textMuted}
                  value={quantityWeight}
                  onChangeText={setQuantityWeight}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* 2-Column Row 4: Apply Tax Checkbox + Tax %  |  Total Box */}
          <View style={[styles.twoColRow, { marginTop: 10, alignItems: 'stretch' }]}>
            <View
              style={[
                styles.taxControlBox,
                {
                  backgroundColor: applyTax ? colors.primaryLight : colors.inputBg,
                  borderColor: applyTax ? colors.primary : colors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.taxCheckboxRow}
                onPress={() => setApplyTax(!applyTax)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={applyTax ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={applyTax ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.taxCheckLabel, { color: applyTax ? colors.primary : colors.text }]}>
                  Apply Tax
                </Text>
              </TouchableOpacity>

              <View style={[styles.taxPercentInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.taxPercentInput, { color: colors.text }]}
                  value={taxPercent}
                  onChangeText={setTaxPercent}
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary }}>%</Text>
              </View>
            </View>

            <View
              style={[
                styles.totalDisplayBox,
                {
                  backgroundColor: colors.successLight,
                  borderColor: colors.success,
                },
              ]}
            >
              <Text style={[styles.totalSubFormula, { color: colors.textSecondary }]} numberOfLines={1}>
                {calc.unitPrice || 0} × {calc.qty} = ₹{calc.subtotal.toLocaleString()}
                {applyTax ? ` + ${calc.taxPercent}% (₹${calc.taxAmount})` : ''}
              </Text>
              <View style={styles.totalFinalRow}>
                <Text style={[styles.totalFinalLabel, { color: colors.text }]}>Total:</Text>
                <Text style={[styles.totalFinalValue, { color: colors.success }]}>
                  ₹{calc.total.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.back()}
            disabled={isSubmitting}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.success }]}
            onPress={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.saveText}>
                  {isEditing ? `Update (₹${calc.total.toLocaleString()})` : `Save (₹${calc.total.toLocaleString()})`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Searchable Item Select Modal */}
      <Modal
        visible={showItemPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowItemPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Product / Item</Text>
              <TouchableOpacity
                onPress={() => setShowItemPicker(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.borderLight }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search item or type custom name..."
                placeholderTextColor={colors.textMuted}
                value={itemSearchQuery}
                onChangeText={setItemSearchQuery}
                autoFocus
              />
              {itemSearchQuery ? (
                <TouchableOpacity onPress={() => setItemSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {itemSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                style={[
                  styles.customItemOption,
                  { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
                onPress={() => handleSelectCustomItem(itemSearchQuery)}
              >
                <Ionicons name="add-circle" size={18} color={colors.primary} />
                <Text style={[styles.customItemText, { color: colors.primary }]}>
                  Use "{itemSearchQuery.trim()}"
                </Text>
              </TouchableOpacity>
            )}

            <FlatList
              data={filteredItems}
              keyExtractor={(it) => it.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: it }) => {
                const isSelected = selectedItemId === it.id || itemName === it.name;
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerGridItem,
                      {
                        backgroundColor: isSelected ? colors.successLight : colors.inputBg,
                        borderColor: isSelected ? colors.success : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectItem(it)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'cube-outline'}
                        size={15}
                        color={isSelected ? colors.success : colors.primary}
                      />
                      <Text style={[styles.pickerItemName, { color: colors.text }]} numberOfLines={1}>
                        {it.name}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                        Unit: {it.unit || 'kg'}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.success, fontWeight: '700' }}>
                        Tax: {it.tax_rate !== undefined ? it.tax_rate : defaultTaxRate}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Searchable Branch Select Modal */}
      <Modal
        visible={showBranchPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Branch</Text>
              <TouchableOpacity
                onPress={() => setShowBranchPicker(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.borderLight }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search branch..."
                placeholderTextColor={colors.textMuted}
                value={branchSearchQuery}
                onChangeText={setBranchSearchQuery}
              />
            </View>

            <FlatList
              data={filteredBranches}
              keyExtractor={(b) => b.id}
              style={{ maxHeight: 300 }}
              contentContainerStyle={{ gap: 6, paddingVertical: 6 }}
              renderItem={({ item: b }) => {
                const sel = selectedBranchId === b.id;
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
                      setSelectedBranchId(b.id);
                      setShowBranchPicker(false);
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 1 },
  quickCatalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  twoColRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  labelRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  required: { color: '#EF4444' },
  todayLink: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    height: 38,
  },
  selectBoxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  compactInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    height: 38,
  },
  compactInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    fontWeight: '600',
  },
  currencyPrefix: { fontSize: 13, fontWeight: '800' },
  taxControlBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  taxCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taxCheckLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  taxPercentInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 28,
    minWidth: 52,
  },
  taxPercentInput: {
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 0,
    minWidth: 26,
    textAlign: 'right',
  },
  totalDisplayBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  totalSubFormula: {
    fontSize: 10,
    fontWeight: '600',
  },
  totalFinalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  totalFinalLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  totalFinalValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: { fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  customItemOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  customItemText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickerGridItem: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickerItemName: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
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
