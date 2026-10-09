import { Platform } from 'react-native';

const primaryColor = '#2563EB'; // Royal Indigo
const primaryLight = '#3B82F6';

export const Colors = {
  light: {
    primary: primaryColor,
    primaryLight: '#DBEAFE',
    text: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    background: '#F8FAFC',
    card: '#FFFFFF',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    tint: primaryColor,
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: primaryColor,
    tabBarBackground: '#FFFFFF',

    // Status colors
    success: '#10B981',
    successLight: '#D1FAE5',
    danger: '#EF4444',
    dangerLight: '#FEE2E2',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    info: '#0EA5E9',
    infoLight: '#E0F2FE',

    // UI elements
    inputBg: '#F1F5F9',
    inputBorder: '#CBD5E1',
    divider: '#E2E8F0',
    cardShadow: 'rgba(0, 0, 0, 0.05)',
  },
  dark: {
    primary: primaryLight,
    primaryLight: '#1E3A8A',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    background: '#0B0F19',
    card: '#151C2C',
    border: '#26334D',
    borderLight: '#1E293B',
    tint: '#60A5FA',
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: '#60A5FA',
    tabBarBackground: '#111726',

    // Status colors
    success: '#34D399',
    successLight: 'rgba(52, 211, 153, 0.15)',
    danger: '#F87171',
    dangerLight: 'rgba(248, 113, 113, 0.15)',
    warning: '#FBBF24',
    warningLight: 'rgba(251, 191, 36, 0.15)',
    info: '#38BDF8',
    infoLight: 'rgba(56, 189, 248, 0.15)',

    // UI elements
    inputBg: '#1E293B',
    inputBorder: '#334155',
    divider: '#26334D',
    cardShadow: 'rgba(0, 0, 0, 0.3)',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
