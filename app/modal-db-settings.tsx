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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { getSupabaseConfig, saveSupabaseConfig, testSupabaseConnection } from '@/services/supabase';

export default function DatabaseSettingsModal() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { refreshCloudStatus, isCloudConnected } = useAuth();

  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const config = await getSupabaseConfig();
      setSupabaseUrl(config.url);
      setSupabaseKey(config.key);
    })();
  }, []);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSupabaseConnection(supabaseUrl, supabaseKey);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      Alert.alert('Missing Fields', 'Please enter both Supabase Project URL and Anon API Key.');
      return;
    }

    setIsTesting(true);
    const test = await testSupabaseConnection(supabaseUrl, supabaseKey);
    setIsTesting(false);

    if (!test.success) {
      Alert.alert('Connection Failed', `${test.message}\n\nDo you still want to save?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save Anyway',
          onPress: async () => {
            await saveSupabaseConfig(supabaseUrl, supabaseKey);
            await refreshCloudStatus();
            router.back();
          },
        },
      ]);
      return;
    }

    await saveSupabaseConfig(supabaseUrl, supabaseKey);
    await refreshCloudStatus();
    Alert.alert('Success', 'Cloud Database configured successfully!', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleClear = async () => {
    Alert.alert(
      'Reset to Default Online DB',
      'Reset custom credentials back to the default online database configuration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await saveSupabaseConfig('', '');
            const config = await getSupabaseConfig();
            setSupabaseUrl(config.url);
            setSupabaseKey(config.key);
            setTestResult(null);
            await refreshCloudStatus();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* Header bar */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Online Database</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Online database configuration for KSM Pvt Ltd
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.borderLight }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Live Status Badge */}
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: isCloudConnected ? colors.successLight : colors.dangerLight,
              borderColor: isCloudConnected ? colors.success : colors.danger,
            },
          ]}
        >
          <Ionicons
            name={isCloudConnected ? 'cloud-done' : 'cloud-offline'}
            size={24}
            color={isCloudConnected ? colors.success : colors.danger}
          />
          <View style={styles.statusTextContainer}>
            <Text
              style={[
                styles.statusTitle,
                { color: isCloudConnected ? colors.success : colors.danger },
              ]}
            >
              {isCloudConnected
                ? 'Online Database Connected'
                : 'Unable to Connect to Online Database'}
            </Text>
            <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>
              {isCloudConnected
                ? 'All records are read and saved directly to the online Supabase database (offline backup database is disabled).'
                : 'Database connection error! Offline backup database is disabled — please verify your internet connection or Supabase credentials below.'}
            </Text>
          </View>
        </View>

        {/* Form Inputs */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Supabase Credentials</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Supabase Project URL</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                color: colors.text,
              },
            ]}
            placeholder="https://xyzcompany.supabase.co"
            placeholderTextColor={colors.textMuted}
            value={supabaseUrl}
            onChangeText={setSupabaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Supabase Anon / Public Key</Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                color: colors.text,
              },
            ]}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            placeholderTextColor={colors.textMuted}
            value={supabaseKey}
            onChangeText={setSupabaseKey}
            multiline
            numberOfLines={3}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {testResult && (
            <View
              style={[
                styles.testFeedback,
                {
                  backgroundColor: testResult.success ? colors.successLight : colors.dangerLight,
                  borderColor: testResult.success ? colors.success : colors.danger,
                },
              ]}
            >
              <Ionicons
                name={testResult.success ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={testResult.success ? colors.success : colors.danger}
              />
              <Text
                style={[
                  styles.testFeedbackText,
                  { color: testResult.success ? colors.success : colors.danger },
                ]}
              >
                {testResult.message}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.testBtn, { borderColor: colors.primary }]}
              onPress={handleTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={18} color={colors.primary} />
                  <Text style={[styles.testBtnText, { color: colors.primary }]}>Test Connection</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={isTesting}
            >
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>

          {isCloudConnected && (
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleClear}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.disconnectBtnText, { color: colors.danger }]}>
                Disconnect Cloud Database
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Free Setup Guide Card */}
        <View
          style={[
            styles.guideCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.guideHeader}>
            <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
            <Text style={[styles.guideTitle, { color: colors.text }]}>
              How to get your 100% Free Supabase Database
            </Text>
          </View>

          <View style={styles.stepItem}>
            <Text style={[styles.stepNum, { backgroundColor: colors.primaryLight, color: colors.primary }]}>
              1
            </Text>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Go to <Text style={{ fontWeight: '700', color: colors.primary }}>supabase.com</Text> and click "Start your project" (Free forever tier).
            </Text>
          </View>

          <View style={styles.stepItem}>
            <Text style={[styles.stepNum, { backgroundColor: colors.primaryLight, color: colors.primary }]}>
              2
            </Text>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              In your Supabase dashboard, click <Text style={{ fontWeight: '700' }}>SQL Editor</Text>, paste the code from <Text style={{ fontWeight: '700' }}>supabase_schema.sql</Text> file in this project, and click <Text style={{ fontWeight: '700' }}>Run</Text>.
            </Text>
          </View>

          <View style={styles.stepItem}>
            <Text style={[styles.stepNum, { backgroundColor: colors.primaryLight, color: colors.primary }]}>
              3
            </Text>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Go to <Text style={{ fontWeight: '700' }}>Project Settings → API</Text>, copy your <Text style={{ fontWeight: '700' }}>Project URL</Text> and <Text style={{ fontWeight: '700' }}>anon public key</Text>, and paste them above!
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  testFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    gap: 8,
  },
  testFeedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
  },
  testBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 6,
    paddingVertical: 8,
  },
  disconnectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  guideCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
