import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth-context";
import { useAppTheme } from "@/context/theme-context";
import {
  addPurchase,
  getBranches,
  getDefaultTaxRate,
  getItems,
} from "@/services/api";
import { Branch, Item } from "@/types";
import {
  getTodayDDMMYYYY,
  isValidDateInput,
  toDbDate,
} from "@/utils/date";
import { DatePickerField } from "@/components/date-picker-field";

// ---------- Types ----------
interface PurchaseRow {
  rowId: string;
  selectedItemId: string | null;
  itemName: string;
  unit: string;
  amount: string; // unit price / rate
  quantityWeight: string; // numeric qty (e.g. "10" or "10 kg")
  applyTax: boolean;
  taxPercent: string; // default "7"
  comment: string;
}

let _rowCounter = 0;
const makeRow = (defaultTax: number = 7): PurchaseRow => ({
  rowId: `row_${++_rowCounter}_${Date.now()}`,
  selectedItemId: null,
  itemName: "",
  unit: "",
  amount: "",
  quantityWeight: "1",
  applyTax: false,
  taxPercent: String(defaultTax),
  comment: "",
});

export function computeRowTotals(row: PurchaseRow) {
  const unitPrice = parseFloat(row.amount.trim());
  const validPrice = !isNaN(unitPrice) && unitPrice > 0 ? unitPrice : 0;

  const parsedQty = parseFloat(row.quantityWeight.trim());
  const validQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;

  const subtotal = validPrice * validQty;

  const parsedTax = parseFloat(row.taxPercent.trim());
  const validTaxPercent = !isNaN(parsedTax) && parsedTax >= 0 ? parsedTax : 0;

  const taxAmount = row.applyTax ? (subtotal * validTaxPercent) / 100 : 0;
  const total = subtotal + taxAmount;

  return {
    unitPrice: validPrice,
    qty: validQty,
    subtotal: Math.round(subtotal * 100) / 100,
    taxPercent: validTaxPercent,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// ---------- Component ----------
export default function AddPurchasesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, isAdmin, isManager } = useAuth();
  const insets = useSafeAreaInsets();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [defaultTaxRate, setDefaultTaxRateState] = useState<number>(7);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [date, setDate] = useState<string>(getTodayDDMMYYYY());
  const [rows, setRows] = useState<PurchaseRow[]>([makeRow(7)]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Searchable Item Select Modal state
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>("");

  // Branch Select Modal state (for Admin)
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [branchSearchQuery, setBranchSearchQuery] = useState<string>("");

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
        setRows([makeRow(defTax)]);

        if (isManager && user?.branch_id) {
          setSelectedBranchId(user.branch_id);
        } else if (branchList.length > 0) {
          setSelectedBranchId(branchList[0].id);
        }
      } catch (err) {
        console.warn("add-purchases load error:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ---- Row helpers ----
  const updateRow = (rowId: string, patch: Partial<PurchaseRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
    );
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const addRow = () => setRows((prev) => [...prev, makeRow(defaultTaxRate)]);

  const openItemPicker = (row: PurchaseRow) => {
    setPickerRowId(row.rowId);
    setItemSearchQuery("");
  };

  const handleSelectCatalogItem = (it: Item) => {
    if (!pickerRowId) return;
    const itemTax =
      it.tax_rate !== undefined && it.tax_rate !== null
        ? it.tax_rate
        : defaultTaxRate;
    updateRow(pickerRowId, {
      selectedItemId: it.id,
      itemName: it.name,
      unit: it.unit || "",
      taxPercent: String(itemTax),
    });
    setPickerRowId(null);
    setItemSearchQuery("");
  };

  const handleSelectCustomItem = (customName: string) => {
    if (!pickerRowId || !customName.trim()) return;
    updateRow(pickerRowId, {
      selectedItemId: null,
      itemName: customName.trim(),
    });
    setPickerRowId(null);
    setItemSearchQuery("");
  };

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

  const grandTotal = useMemo(() => {
    return rows.reduce((sum, r) => sum + computeRowTotals(r).total, 0);
  }, [rows]);

  // ---- Save ----
  const handleSaveAll = async () => {
    if (!selectedBranchId) {
      Alert.alert("Required", "Please select a branch first.");
      return;
    }
    if (!date.trim() || !isValidDateInput(date.trim())) {
      Alert.alert(
        "Invalid Date",
        "Date must be in DD-MM-YYYY format (e.g. 15-09-2026)."
      );
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.itemName.trim()) {
        Alert.alert(
          "Required",
          `Item #${i + 1}: Please select or enter a product name.`
        );
        return;
      }
      const num = parseFloat(r.amount.trim());
      if (isNaN(num) || num <= 0) {
        Alert.alert(
          "Required",
          `Item #${i + 1}: Please enter a valid amount/price (₹).`
        );
        return;
      }
    }

    const dbDate = toDbDate(date.trim());
    setIsSaving(true);
    try {
      await Promise.all(
        rows.map((r) => {
          const calc = computeRowTotals(r);
          const rawQty = r.quantityWeight.trim();
          const hasLetters = /[a-zA-Z]/.test(rawQty);
          const formattedQty = rawQty
            ? hasLetters
              ? rawQty
              : r.unit
              ? `${rawQty} ${r.unit}`
              : rawQty
            : "1";

          const qtySummary = `${formattedQty} × ₹${calc.unitPrice}${
            r.applyTax ? ` (+${calc.taxPercent}% tax: ₹${calc.taxAmount})` : ""
          }`;

          return addPurchase({
            branch_id: selectedBranchId,
            item_id: r.selectedItemId || undefined,
            item_name: r.itemName.trim(),
            amount: calc.total,
            unit_price: calc.unitPrice,
            quantity: calc.qty,
            quantity_weight: qtySummary,
            tax_applied: r.applyTax,
            tax_percent: r.applyTax ? calc.taxPercent : 0,
            tax_amount: calc.taxAmount,
            subtotal: calc.subtotal,
            date: dbDate,
            comment: r.comment.trim() || undefined,
            created_by: user?.username || "user",
          });
        })
      );
      Alert.alert(
        "Saved!",
        `${rows.length} purchase${rows.length > 1 ? "s" : ""} recorded (Total: ₹${grandTotal.toLocaleString()}).`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to save purchases.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingBox, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Compact Header ── */}
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
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.borderLight }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Record Purchases
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            Compact 2-column entry • Default Tax: {defaultTaxRate}%
          </Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            style={[
              styles.itemsBtn,
              { backgroundColor: colors.borderLight, borderColor: colors.border },
            ]}
            onPress={() => router.push("/modal-add-item")}
          >
            <Ionicons name="cube-outline" size={14} color={colors.primary} />
            <Text style={[styles.itemsBtnText, { color: colors.primary }]}>
              + Catalog
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Shared Top Card: 2-Column Branch + Date ── */}
        <View
          style={[
            styles.sharedCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.twoColRow}>
            {/* Col 1: Branch */}
            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Branch <Text style={styles.required}>*</Text>
              </Text>
              {isAdmin ? (
                <TouchableOpacity
                  style={[
                    styles.selectBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                  onPress={() => {
                    setBranchSearchQuery("");
                    setShowBranchModal(true);
                  }}
                >
                  <Ionicons name="business-outline" size={15} color={colors.primary} />
                  <Text
                    style={[styles.selectBoxText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {selectedBranch?.name || "Select Branch"}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.selectBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="business" size={14} color={colors.primary} />
                  <Text
                    style={[styles.selectBoxText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {selectedBranch?.name || user?.branch_name || "Assigned"}
                  </Text>
                  <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
                </View>
              )}
            </View>

            {/* Col 2: Date */}
            <View style={styles.col}>
              <View style={styles.labelRowBetween}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Date <Text style={styles.required}>*</Text>
                </Text>
                {date !== getTodayDDMMYYYY() && (
                  <TouchableOpacity onPress={() => setDate(getTodayDDMMYYYY())}>
                    <Text style={[styles.todayLink, { color: colors.primary }]}>
                      Today
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <DatePickerField value={date} onChange={setDate} compact />
            </View>
          </View>
        </View>

        {/* ── Item Rows (Compact 2-Column Layout) ── */}
        {rows.map((row, index) => {
          const calc = computeRowTotals(row);

          return (
            <View
              key={row.rowId}
              style={[
                styles.rowCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {/* Compact Row Header */}
              <View style={styles.rowHeaderLine}>
                <View
                  style={[
                    styles.rowBadge,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <Text style={[styles.rowBadgeText, { color: colors.primary }]}>
                    #{index + 1}
                  </Text>
                </View>
                <Text
                  style={[styles.rowTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {row.itemName ? row.itemName : `Purchase Item ${index + 1}`}
                </Text>

                {/* Live Total Pill in Header */}
                <View
                  style={[
                    styles.headerTotalBadge,
                    { backgroundColor: colors.successLight },
                  ]}
                >
                  <Text style={[styles.headerTotalText, { color: colors.success }]}>
                    ₹{calc.total.toLocaleString()}
                  </Text>
                </View>

                {rows.length > 1 && (
                  <TouchableOpacity
                    style={[
                      styles.removeBtn,
                      { backgroundColor: colors.dangerLight },
                    ]}
                    onPress={() => removeRow(row.rowId)}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>

              {/* ── 2-COLUMN ROW 1: Product Select (with Search) + Note/Comment ── */}
              <View style={styles.twoColRow}>
                {/* Col 1: Product / Item Select with Search */}
                <View style={[styles.col, { flex: 1.2 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    Product / Item <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.selectBox,
                      {
                        backgroundColor: colors.inputBg,
                        borderColor: row.itemName ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => openItemPicker(row)}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={15}
                      color={row.itemName ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.selectBoxText,
                        {
                          color: row.itemName ? colors.text : colors.textMuted,
                          fontWeight: row.itemName ? "700" : "500",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {row.itemName
                        ? `${row.itemName}${row.unit ? ` (${row.unit})` : ""}`
                        : "Select / Search..."}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={15}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Col 2: Note / Vendor (Compact) */}
                <View style={[styles.col, { flex: 0.8 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    Note / Vendor
                  </Text>
                  <View
                    style={[
                      styles.compactInputRow,
                      { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                  >
                    <TextInput
                      style={[styles.compactInput, { color: colors.text }]}
                      placeholder="Optional note"
                      placeholderTextColor={colors.textMuted}
                      value={row.comment}
                      onChangeText={(t) => updateRow(row.rowId, { comment: t })}
                    />
                  </View>
                </View>
              </View>

              {/* ── 2-COLUMN ROW 2: Price/Amount (₹) + Quantity ── */}
              <View style={[styles.twoColRow, { marginTop: 8 }]}>
                {/* Col 1: Amount / Unit Price */}
                <View style={styles.col}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    Amount / Price (₹) <Text style={styles.required}>*</Text>
                  </Text>
                  <View
                    style={[
                      styles.compactInputRow,
                      { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[styles.currencyPrefix, { color: colors.textSecondary }]}
                    >
                      ₹
                    </Text>
                    <TextInput
                      style={[styles.compactInput, { color: colors.text }]}
                      placeholder="e.g. 100"
                      placeholderTextColor={colors.textMuted}
                      value={row.amount}
                      onChangeText={(t) => updateRow(row.rowId, { amount: t })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Col 2: Quantity */}
                <View style={styles.col}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    Qty / Weight {row.unit ? `(${row.unit})` : ""}
                  </Text>
                  <View
                    style={[
                      styles.compactInputRow,
                      { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.compactInput, { color: colors.text }]}
                      placeholder="e.g. 10"
                      placeholderTextColor={colors.textMuted}
                      value={row.quantityWeight}
                      onChangeText={(t) =>
                        updateRow(row.rowId, { quantityWeight: t })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* ── 2-COLUMN ROW 3: Tax Checkbox + Tax %  |  Calculated Total Box ── */}
              <View style={[styles.twoColRow, { marginTop: 8, alignItems: "stretch" }]}>
                {/* Col 1: Checkbox to apply tax + Tax % input */}
                <View
                  style={[
                    styles.taxControlBox,
                    {
                      backgroundColor: row.applyTax
                        ? colors.primaryLight
                        : colors.inputBg,
                      borderColor: row.applyTax ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.taxCheckboxRow}
                    onPress={() =>
                      updateRow(row.rowId, { applyTax: !row.applyTax })
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={row.applyTax ? "checkbox" : "square-outline"}
                      size={20}
                      color={row.applyTax ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.taxCheckLabel,
                        { color: row.applyTax ? colors.primary : colors.text },
                      ]}
                    >
                      Apply Tax
                    </Text>
                  </TouchableOpacity>

                  <View
                    style={[
                      styles.taxPercentInputWrap,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.taxPercentInput, { color: colors.text }]}
                      value={row.taxPercent}
                      onChangeText={(t) =>
                        updateRow(row.rowId, { taxPercent: t })
                      }
                      keyboardType="numeric"
                      placeholder="7"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: colors.textSecondary,
                      }}
                    >
                      %
                    </Text>
                  </View>
                </View>

                {/* Col 2: Live Total Breakdown Box */}
                <View
                  style={[
                    styles.totalDisplayBox,
                    {
                      backgroundColor: colors.successLight,
                      borderColor: colors.success,
                    },
                  ]}
                >
                  <View style={styles.totalBreakdownRow}>
                    <Text
                      style={[
                        styles.totalSubFormula,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {calc.unitPrice || 0} × {calc.qty} = ₹
                      {calc.subtotal.toLocaleString()}
                      {row.applyTax
                        ? ` + ${calc.taxPercent}% (₹${calc.taxAmount})`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.totalFinalRow}>
                    <Text
                      style={[styles.totalFinalLabel, { color: colors.text }]}
                    >
                      Total:
                    </Text>
                    <Text
                      style={[styles.totalFinalValue, { color: colors.success }]}
                    >
                      ₹{calc.total.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {/* ── Add More Item Button ── */}
        <TouchableOpacity
          style={[
            styles.addMoreBtn,
            {
              borderColor: colors.primary,
              backgroundColor: colors.primaryLight,
            },
          ]}
          onPress={addRow}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.addMoreText, { color: colors.primary }]}>
            + Add Another Item
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Bottom Save Bar with Grand Total ── */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.grandTotalBox}>
          <Text style={[styles.grandTotalLabel, { color: colors.textSecondary }]}>
            Grand Total ({rows.length} {rows.length > 1 ? "items" : "item"})
          </Text>
          <Text style={[styles.grandTotalValue, { color: colors.success }]}>
            ₹{grandTotal.toLocaleString()}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={() => router.back()}
          disabled={isSaving}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.success }]}
          onPress={handleSaveAll}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={17} color="#FFF" />
              <Text style={styles.saveText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── SEARCHABLE PRODUCT / ITEM SELECT MODAL ── */}
      <Modal
        visible={pickerRowId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerRowId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select Product / Item
              </Text>
              <TouchableOpacity
                onPress={() => setPickerRowId(null)}
                style={[styles.closeModalBtn, { backgroundColor: colors.borderLight }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View
              style={[
                styles.searchBox,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
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
                <TouchableOpacity onPress={() => setItemSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Custom Item Quick Option when user types */}
            {itemSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                style={[
                  styles.customItemOption,
                  {
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => handleSelectCustomItem(itemSearchQuery)}
              >
                <Ionicons
                  name="add-circle"
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.customItemText, { color: colors.primary }]}>
                  Use "{itemSearchQuery.trim()}"
                </Text>
              </TouchableOpacity>
            )}

            {/* Catalog Items List (2-Column Grid inside Picker!) */}
            <FlatList
              data={filteredItems}
              keyExtractor={(it) => it.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={{ paddingVertical: 24, alignItems: "center" }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    No catalog items match your search.
                  </Text>
                </View>
              }
              renderItem={({ item: it }) => {
                const activeRow = rows.find((r) => r.rowId === pickerRowId);
                const isSelected =
                  activeRow?.selectedItemId === it.id ||
                  activeRow?.itemName === it.name;
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerGridItem,
                      {
                        backgroundColor: isSelected
                          ? colors.successLight
                          : colors.inputBg,
                        borderColor: isSelected ? colors.success : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectCatalogItem(it)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "cube-outline"}
                        size={15}
                        color={isSelected ? colors.success : colors.primary}
                      />
                      <Text
                        style={[
                          styles.pickerItemName,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {it.name}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{ fontSize: 10, color: colors.textSecondary }}
                      >
                        Unit: {it.unit || "kg"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.success,
                          fontWeight: "700",
                        }}
                      >
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

      {/* ── SEARCHABLE BRANCH SELECT MODAL (ADMIN) ── */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select Branch
              </Text>
              <TouchableOpacity
                onPress={() => setShowBranchModal(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.borderLight }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.searchBox,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
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
                        backgroundColor: sel
                          ? colors.primaryLight
                          : colors.inputBg,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedBranchId(b.id);
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
                        fontWeight: "700",
                        color: sel ? colors.primary : colors.text,
                      }}
                    >
                      {b.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      {b.code}
                    </Text>
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
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSub: { fontSize: 11, fontWeight: "500" },
  itemsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemsBtnText: { fontSize: 11, fontWeight: "700" },
  content: { padding: 10 },
  sharedCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  twoColRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  labelRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  required: { color: "#EF4444" },
  todayLink: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    height: 38,
  },
  selectBoxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  compactInputRow: {
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "600",
  },
  currencyPrefix: { fontSize: 13, fontWeight: "800" },
  rowCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  rowHeaderLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  rowBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rowBadgeText: { fontSize: 11, fontWeight: "800" },
  rowTitle: { fontSize: 13, fontWeight: "800", flex: 1 },
  headerTotalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  headerTotalText: { fontSize: 12, fontWeight: "900" },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  taxControlBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  taxCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  taxCheckLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  taxPercentInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 28,
    minWidth: 52,
  },
  taxPercentInput: {
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 0,
    minWidth: 26,
    textAlign: "right",
  },
  totalDisplayBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: "center",
  },
  totalBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalSubFormula: {
    fontSize: 10,
    fontWeight: "600",
  },
  totalFinalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },
  totalFinalLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  totalFinalValue: {
    fontSize: 14,
    fontWeight: "900",
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 12,
  },
  addMoreText: { fontSize: 13, fontWeight: "800" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  grandTotalBox: {
    flex: 1.2,
  },
  grandTotalLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cancelText: { fontSize: 13, fontWeight: "700" },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 5,
  },
  saveText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: "800" },
  closeModalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  customItemText: {
    fontSize: 13,
    fontWeight: "700",
  },
  pickerGridItem: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickerItemName: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
