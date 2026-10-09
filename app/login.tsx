import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

export default function LoginScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useAppTheme();
  const { login, isCloudConnected, dbErrorMessage, refreshCloudStatus } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  const handleRetryDb = async () => {
    setIsCheckingDb(true);
    try {
      await refreshCloudStatus();
    } finally {
      setIsCheckingDb(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter both username and password');
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await login(username, password);
      if (res.success) {
        if (res.role === 'cashier') {
          router.replace('/cashier-screen');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        const isDbErr =
          res.message?.toLowerCase().includes('database') ||
          res.message?.toLowerCase().includes('connect');
        Alert.alert(
          isDbErr ? 'Database Connection Error' : 'Login Failed',
          res.message || 'Invalid username or password'
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Database Error',
        err?.message || 'Unable to connect to the online database.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar with Theme Toggle */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={toggleTheme}
          >
            <Ionicons
              name={isDark ? 'sunny' : 'moon'}
              size={18}
              color={isDark ? '#FBBF24' : colors.text}
            />
          </TouchableOpacity>
        </View>

        {/* Online Database Error Banner */}
        {(!isCloudConnected || dbErrorMessage) && (
          <View
            style={{
              backgroundColor: '#FEE2E2',
              borderColor: '#EF4444',
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
              marginBottom: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Ionicons name="warning" size={22} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>
                Online Database Error
              </Text>
              <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>
                {dbErrorMessage ||
                  'Unable to connect to the online database. Please check your internet connection or database settings.'}
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#DC2626',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={handleRetryDb}
                disabled={isCheckingDb}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  {isCheckingDb ? '...' : 'Retry'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#1E293B',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={() => router.push('/modal-db-settings')}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  DB Setup
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Brand Banner */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Image
              source={require('@/assets/images/ksm-logo.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>KSM Pvt Ltd</Text>
          <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
            Employee Attendance & Salary System
          </Text>
        </View>

        {/* Unified Login Card */}
        <View style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.formHeading, { color: colors.text }]}>Sign In</Text>
            <Text style={[styles.formSubheading, { color: colors.textSecondary }]}>
              Enter your credentials to access your account
            </Text>
          </View>

          {/* Username Input */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter your username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter your password"
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

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                <Text style={styles.signInBtnText}>Sign In</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <View style={styles.footerNote}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Online Database Only • KSM Pvt Ltd
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 90,
    height: 90,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  loginCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 20,
  },
  formHeading: {
    fontSize: 20,
    fontWeight: '800',
  },
  formSubheading: {
    fontSize: 13,
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 26,
    gap: 8,
  },
  signInBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footerNote: {
    marginTop: 36,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
  },
});
