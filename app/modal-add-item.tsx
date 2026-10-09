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
import { useAppTheme } from '@/context/theme-context';
import { addItem, getDefaultTaxRate, getItems, updateItem } from '@/services/api';

const COMMON_CATEGORIES = [
  'Raw Materials',
  'Seeds',
  'Packaging',
  'Pesticides',
  'Fertilizers',
  'Equipment',
  'Maintenance',
  'General',
];

const COMMON_UNITS = ['kg', 'packet', 'box', 'bag', 'liter', 'meter', 'piece'];

export default function AddItemModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const isEditing = Boolean(params.itemId);

  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('kg');
  const [taxRate, setTaxRate] = useState('7');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const defTax = await getDefaultTaxRate();
        setTaxRate(String(defTax));

        if (isEditing && params.itemId) {
          const list = await getItems();
          const target = list.find((i) => i.id === params.itemId);
          if (target) {
            setName(target.name);
            setCategory(target.category || '');
            setUnit(target.unit || 'kg');
            setTaxRate(String(target.tax_rate !== undefined ? target.tax_rate : defTax));
          }
        }
      } catch (e) {
        console.warn('Failed to load item details:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditing, params.itemId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter product or item name.');
      return;
    }

    const parsedTax = parseFloat(taxRate.trim());
    const finalTax = isNaN(parsedTax) || parsedTax < 0 ? 7 : parsedTax;

    setIsSubmitting(true);
    try {
      if (isEditing && params.itemId) {
        await updateItem(params.itemId, {
          name: name.trim(),
          category: category.trim() || undefined,
          unit: unit.trim() || 'kg',
          tax_rate: finalTax,
        });
        Alert.alert('Success', 'Product updated successfully in catalog.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await addItem({
          name: name.trim(),
          category: category.trim() || undefined,
          unit: unit.trim() || 'kg',
          tax_rate: finalTax,
        });
        Alert.alert('Success', 'Product added to catalog.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save product');
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
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="cube-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {isEditing ? 'Edit Product Item' : 'Add Product Item'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {isEditing
              ? 'Modify item name, category, or default unit'
              : 'Add an item to the catalog for branch purchase selection'}
          </Text>
        </View>

        {/* Form Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Name */}
          <Text style={[styles.label, { color: colors.text }]}>
            Product / Item Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. Organic Fertilizer, Tomato Seeds"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus={!isEditing}
          />

          {/* Category */}
          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>
            Category (Optional)
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. Raw Materials, Packaging"
            placeholderTextColor={colors.textMuted}
            value={category}
            onChangeText={setCategory}
          />
          {/* Category Suggestions */}
          <View style={styles.pillRow}>
            {COMMON_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.pill,
                  {
                    backgroundColor: category === cat ? colors.primaryLight : colors.borderLight,
                    borderColor: category === cat ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: category === cat ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Default Unit */}
          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>
            Default Unit (Optional)
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. kg, packet, box, piece"
            placeholderTextColor={colors.textMuted}
            value={unit}
            onChangeText={setUnit}
          />
          {/* Unit Suggestions */}
          <View style={styles.pillRow}>
            {COMMON_UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.pill,
                  {
                    backgroundColor: unit === u ? colors.primaryLight : colors.borderLight,
                    borderColor: unit === u ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setUnit(u)}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: unit === u ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Default Tax % for this item */}
          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>
            Default Tax (%) for this Item
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. 7"
            placeholderTextColor={colors.textMuted}
            value={taxRate}
            onChangeText={setTaxRate}
            keyboardType="numeric"
          />
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
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveText}>{isEditing ? 'Update Item' : 'Save Item'}</Text>
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 20 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  card: { padding: 18, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  required: { color: '#EF4444' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: { fontSize: 14, fontWeight: '700' },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
