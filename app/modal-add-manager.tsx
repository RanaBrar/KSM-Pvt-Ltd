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
import { addManager, getBranches, getManagers, updateManager } from '@/services/api';
import { Branch } from '@/types';

export default function AddManagerModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    managerId?: string;
    defaultRole?: 'branch_manager' | 'cashier';
  }>();
  const isEditing = Boolean(params.managerId);

  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [role, setRole] = useState<'branch_manager' | 'cashier'>(
    params.defaultRole === 'cashier' ? 'cashier' : 'branch_manager'
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCashierRole = role === 'cashier';
  const roleLabel = isCashierRole ? 'Cashier' : 'Branch Manager';

  useEffect(() => {
    (async () => {
      try {
        const branchList = await getBranches();
        setBranches(branchList);

        if (isEditing && params.managerId) {
          const mgrList = await getManagers();
          const target = mgrList.find((m) => m.id === params.managerId);
          if (target) {
            setSelectedBranchId(target.branch_id);
            setRole(target.role === 'cashier' ? 'cashier' : 'branch_manager');
            setName(target.name);
            setPhone(target.phone || '');
            setAddress(target.address || '');
            setUsername(target.username);
          }
        } else if (branchList.length > 0) {
          setSelectedBranchId(branchList[0].id);
        }
      } catch (err) {
        console.warn('Failed to load account details:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditing, params.managerId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', `Please enter ${roleLabel} name`);
      return;
    }
    if (!selectedBranchId) {
      Alert.alert('Required', `Please select a branch for this ${roleLabel}`);
      return;
    }
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter username for login');
      return;
    }
    if (!isEditing && (!password.trim() || password.trim().length < 3)) {
      Alert.alert('Required', 'Password must be at least 3 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && params.managerId) {
        const updates: any = {
          branch_id: selectedBranchId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          username: username.trim().toLowerCase(),
          role,
        };
        if (password.trim()) {
          updates.password = password.trim();
        }
        await updateManager(params.managerId, updates);
        Alert.alert('Success', `${roleLabel} "${name}" updated successfully!`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await addManager({
          branch_id: selectedBranchId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          username: username.trim().toLowerCase(),
          password: password.trim(),
          role,
        });
        Alert.alert('Success', `${roleLabel} "${name}" registered successfully!`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || `Failed to save ${roleLabel}`);
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {isEditing ? `Edit ${roleLabel}` : `Add ${roleLabel}`}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {isCashierRole
                ? 'Cashier gets a single daily sales & counter screen for their branch'
                : 'Branch Manager can manage attendance, purchases & staff for their branch'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.borderLight }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Account Role Selector */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>
              Select Account Role *
            </Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  {
                    backgroundColor: !isCashierRole ? colors.primary : colors.inputBg,
                    borderColor: !isCashierRole ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setRole('branch_manager')}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={!isCashierRole ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.roleOptionText,
                    { color: !isCashierRole ? '#FFFFFF' : colors.text },
                  ]}
                >
                  Branch Manager
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  {
                    backgroundColor: isCashierRole ? colors.success : colors.inputBg,
                    borderColor: isCashierRole ? colors.success : colors.border,
                  },
                ]}
                onPress={() => setRole('cashier')}
              >
                <Ionicons
                  name="calculator-outline"
                  size={16}
                  color={isCashierRole ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.roleOptionText,
                    { color: isCashierRole ? '#FFFFFF' : colors.text },
                  ]}
                >
                  Branch Cashier
                </Text>
              </TouchableOpacity>
            </View>

            {/* Branch Selector */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Assign Branch *</Text>
            {branches.length === 0 ? (
              <Text style={{ color: colors.danger, marginBottom: 10 }}>
                No branches found. Please add a branch first.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.branchPicker}>
                {branches.map((b) => {
                  const isSelected = b.id === selectedBranchId;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.branchChip,
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
                          styles.branchChipText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {b.name} ({b.code})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {roleLabel} Full Name *
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
              placeholder={isCashierRole ? 'e.g. Ramesh Kumar' : 'e.g. Vikram Sharma'}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (!username && !isEditing) {
                  setUsername(text.toLowerCase().replace(/\s+/g, '').substring(0, 10));
                }
              }}
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
              placeholder="e.g. +91 98111 22233"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Address / Counter</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder={isCashierRole ? 'e.g. Counter 1 / Main Desk' : 'Residential address'}
              placeholderTextColor={colors.textMuted}
              value={address}
              onChangeText={setAddress}
            />

            {/* Credentials Section */}
            <View style={[styles.credentialsBox, { backgroundColor: colors.borderLight, borderColor: colors.border }]}>
              <Text style={[styles.credHeader, { color: colors.primary }]}>
                <Ionicons name="key-outline" size={16} color={colors.primary} /> Login Credentials
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Username *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.text,
                  },
                ]}
                placeholder={isCashierRole ? 'e.g. cashier1' : 'e.g. manager1'}
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                {isEditing ? 'New Password (leave blank to keep current)' : 'Password *'}
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
                  placeholder={isEditing ? 'Enter new password if changing' : 'Enter secure password'}
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
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
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: isCashierRole ? colors.success : colors.primary },
              ]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={isEditing ? 'checkmark-circle' : 'person-add-outline'} size={20} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {isEditing ? `Save ${roleLabel} Changes` : `Create ${roleLabel} Account`}
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
  roleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  branchPicker: { flexDirection: 'row', marginBottom: 6 },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  branchChipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  credentialsBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 18,
  },
  credHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
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
