import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ColorScheme;
  isDark: boolean;
  colors: typeof Colors.light;
  toggleTheme: () => void;
  setTheme: (theme: ColorScheme) => void;
}

const STORAGE_KEY_THEME = 'ksm_theme_mode';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  colors: Colors.light,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceScheme = useDeviceColorScheme();
  const initialScheme: ColorScheme = deviceScheme === 'dark' ? 'dark' : 'light';
  const [theme, setCurrentTheme] = useState<ColorScheme>(initialScheme);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_THEME);
        if (saved === 'light' || saved === 'dark') {
          setCurrentTheme(saved);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const setTheme = async (newTheme: ColorScheme) => {
    setCurrentTheme(newTheme);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_THEME, newTheme);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const isDark = theme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
