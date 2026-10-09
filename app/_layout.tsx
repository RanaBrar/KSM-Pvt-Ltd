import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { ThemeProvider, useAppTheme } from '@/context/theme-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigation() {
  const { colors, isDark } = useAppTheme();
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const onLogin = segments[0] === 'login';
    const onCashierScreen = segments[0] === 'cashier-screen';

    if (!user && (inAuthGroup || onCashierScreen)) {
      router.replace('/login');
    } else if (user) {
      if (user.role === 'cashier') {
        if (!onCashierScreen) {
          router.replace('/cashier-screen');
        }
      } else if (onLogin) {
        router.replace('/(tabs)');
      }
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="cashier-screen" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal-db-settings"
          options={{ presentation: 'modal', title: 'Database Settings' }}
        />
        <Stack.Screen
          name="modal-add-branch"
          options={{ presentation: 'modal', title: 'Add Branch' }}
        />
        <Stack.Screen
          name="modal-add-manager"
          options={{ presentation: 'modal', title: 'Add Branch Manager / Cashier' }}
        />
        <Stack.Screen
          name="modal-add-employee"
          options={{ presentation: 'modal', title: 'Add Employee' }}
        />
        <Stack.Screen
          name="modal-record-payment"
          options={{ presentation: 'modal', title: 'Record Payment' }}
        />

        <Stack.Screen
          name="modal-add-purchase"
          options={{ presentation: 'modal', title: 'Edit Purchase' }}
        />
        <Stack.Screen
          name="add-purchases"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="modal-add-item"
          options={{ presentation: 'modal', title: 'Product Catalog Item' }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigation />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
