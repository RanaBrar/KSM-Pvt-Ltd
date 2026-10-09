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
import { addBranch, getBranches, updateBranch } from '@/services/api';

export default function AddBranchModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ branchId?: string }>();
  const isEditing = Boolean(params.branchId);

  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing && params.branchId) {
      (async () => {
        try {
          const list = await getBranches();
          const target = list.find((b) => b.id === params.branchId);
          if (target) {
            setName(target.name);
            setCode(target.code);
            setPhone(target.phone || '');
            setAddress(target.address || '');
          }
        } catch (e) {
          console.warn('Failed to load branch details:', e);
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [isEditing, params.branchId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter branch name');
      return;
    }
    if (!code.trim()) {
      Alert.alert('Required', 'Please enter unique branch code (e.g. BR-01)');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && params.branchId) {
        await updateBranch(params.branchId, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          phone: phone.trim(),
          address: address.trim(),
        });
        Alert.alert('Success', `Branch "${name}" updated successfully!`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await addBranch({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          phone: phone.trim(),
          address: address.trim(),
        });
        Alert.alert('Success', 'Branch created successfully!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save branch');
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
              {isEditing ? 'Edit Branch' : 'Add New Branch'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {isEditing
                ? 'Update branch contact details and address'
                : 'Register a new operational branch for KSM Pvt Ltd'}
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
            <Text style={[styles.label, { color: colors.textSecondary }]}>Branch Name *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. KSM South Industrial Plant"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (!code && !isEditing) {
                  const words = text.trim().split(' ');
                  const generatedCode = 'BR-' + (words[0] ? words[0].substring(0, 3).toUpperCase() : '01');
                  setCode(generatedCode);
                }
              }}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Branch Code *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. BR-03"
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
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
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
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
              placeholder="Complete address of the branch"
              placeholderTextColor={colors.textMuted}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
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
                  <Ionicons name={isEditing ? 'checkmark-circle' : 'business-outline'} size={20} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {isEditing ? 'Save Changes' : 'Create Branch'}
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
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
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
