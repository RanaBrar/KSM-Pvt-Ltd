import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';

export default function TabLayout() {
  const { colors, isDark } = useAppTheme();
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();

  const isIOS = Platform.OS === 'ios';
  // Account for Android 3-button navigation bar (often ~48dp) or gesture bar (16-24dp)
  const tabPaddingBottom = isIOS ? 28 : (insets.bottom > 0 ? insets.bottom + 6 : 8);
  const tabHeight = isIOS ? 88 : 56 + tabPaddingBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.border,
          height: tabHeight,
          paddingBottom: tabPaddingBottom,
          paddingTop: 8,
          borderTopWidth: 1,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      {/* 1. Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* 2. Attendance */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'checkbox' : 'checkbox-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      {/* 3. Purchases */}
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Purchases',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      {/* 4. Employees — hidden from tab bar, accessible via Settings */}
      <Tabs.Screen
        name="employees"
        options={{
          href: null,
        }}
      />

      {/* 5. Reports & Salary */}
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Salary',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'receipt' : 'receipt-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* 5.5. Cashier Sales Reports (Admin Only) */}
      <Tabs.Screen
        name="cashier-reports"
        options={{
          title: 'Sales',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calculator' : 'calculator-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* 6. Settings (Profile, Employees, Branches, Managers, Cashiers, Products) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Hide management route from tabs */}
      <Tabs.Screen
        name="management"
        options={{
          href: null,
        }}
      />

      {/* Hide old default explore screen */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
