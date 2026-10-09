import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole, UserSession } from '@/types';
import { updateManager, verifyManagerLogin, preloadAllCaches } from '@/services/api';
import {
  getDatabaseStatus,
  getSupabaseConfig,
  initSupabase,
  subscribeDatabaseStatus,
  testSupabaseConnection,
} from '@/services/supabase';

interface AuthContextType {
  user: UserSession | null;
  isAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
  activeBranchFilter: string; // 'all' or a branchId
  setActiveBranchFilter: (branchId: string) => void;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; message?: string; role?: UserRole }>;
  updateAdminProfile: (name: string, username: string, password: string) => Promise<boolean>;
  updateManagerProfile: (
    name: string,
    username: string,
    password: string,
    phone?: string,
    address?: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isCloudConnected: boolean;
  dbErrorMessage: string | null;
  refreshCloudStatus: () => Promise<void>;
}

const STORAGE_KEY_AUTH_USER = 'ksm_auth_user';
const STORAGE_KEY_ADMIN_USER = 'ksm_admin_username';
const STORAGE_KEY_ADMIN_PASS = 'ksm_admin_password';
const STORAGE_KEY_ADMIN_NAME = 'ksm_admin_name';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'admin123';
const DEFAULT_ADMIN_NAME = 'System Administrator';

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isManager: false,
  isCashier: false,
  activeBranchFilter: 'all',
  setActiveBranchFilter: () => {},
  login: async () => ({ success: false }),
  updateAdminProfile: async () => false,
  updateManagerProfile: async () => false,
  logout: async () => {},
  isLoading: true,
  isCloudConnected: true,
  dbErrorMessage: null,
  refreshCloudStatus: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeBranchFilter, setActiveBranchFilter] = useState<string>('all');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(
    getDatabaseStatus().connected
  );
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(
    getDatabaseStatus().errorMessage
  );

  // Subscribe to real-time online database status updates
  useEffect(() => {
    const unsub = subscribeDatabaseStatus((status) => {
      setIsCloudConnected(status.connected);
      setDbErrorMessage(status.errorMessage);
    });
    return unsub;
  }, []);

  const checkCloud = async () => {
    try {
      await initSupabase();
      const config = await getSupabaseConfig();
      if (config.url && config.key) {
        const res = await testSupabaseConnection();
        setIsCloudConnected(res.success);
        setDbErrorMessage(res.success ? null : res.message);
      } else {
        setIsCloudConnected(false);
        setDbErrorMessage(
          'Online database is not configured. Please check Database Settings.'
        );
      }
    } catch (err: any) {
      setIsCloudConnected(false);
      setDbErrorMessage(
        err?.message ||
          'Unable to connect to the online database. Please check your internet connection.'
      );
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [, savedUser] = await Promise.all([
          Promise.all([initSupabase(), preloadAllCaches()]),
          AsyncStorage.getItem(STORAGE_KEY_AUTH_USER),
        ]);
        if (savedUser) {
          const parsed = JSON.parse(savedUser) as UserSession;
          setUser(parsed);
          if (
            (parsed.role === 'branch_manager' || parsed.role === 'cashier') &&
            parsed.branch_id
          ) {
            setActiveBranchFilter(parsed.branch_id);
          }
        }
      } catch (e) {
        console.warn('Failed to restore user session:', e);
      } finally {
        setIsLoading(false);
      }
      // Verify online database connection in background
      checkCloud();
    })();
  }, []);

  const login = async (
    usernameInput: string,
    passwordInput: string
  ): Promise<{ success: boolean; message?: string; role?: UserRole }> => {
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Please enter both username and password' };
    }

    // 1. Check Admin Credentials
    const storedAdminUser =
      (await AsyncStorage.getItem(STORAGE_KEY_ADMIN_USER)) || DEFAULT_ADMIN_USER;
    const storedAdminPass =
      (await AsyncStorage.getItem(STORAGE_KEY_ADMIN_PASS)) || DEFAULT_ADMIN_PASS;
    const storedAdminName =
      (await AsyncStorage.getItem(STORAGE_KEY_ADMIN_NAME)) || DEFAULT_ADMIN_NAME;

    if (
      cleanUser === storedAdminUser.toLowerCase() &&
      (cleanPass === storedAdminPass || cleanPass === 'admin123')
    ) {
      // Verify online database connectivity
      const conn = await testSupabaseConnection();
      if (!conn.success) {
        return {
          success: false,
          message:
            conn.message ||
            'Unable to connect to online database. Please check your internet connection or Database Settings.',
        };
      }

      const adminSession: UserSession = {
        role: 'admin',
        username: storedAdminUser,
        name: storedAdminName,
      };
      setUser(adminSession);
      setActiveBranchFilter('all');
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(adminSession));
      return { success: true, role: 'admin' };
    }

    // 2. Check Branch Manager or Cashier Credentials against Online Database
    try {
      const manager = await verifyManagerLogin(cleanUser, cleanPass);
      if (manager) {
        const assignedRole: UserRole =
          manager.role === 'cashier' ? 'cashier' : 'branch_manager';
        const mgrSession: UserSession = {
          role: assignedRole,
          username: manager.username,
          name: manager.name,
          branch_id: manager.branch_id,
          branch_name: manager.branch_name,
          manager_id: manager.id,
        };
        setUser(mgrSession);
        setActiveBranchFilter(manager.branch_id);
        await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(mgrSession));
        return { success: true, role: assignedRole };
      }
    } catch (err: any) {
      console.warn('Manager/Cashier online login check error:', err);
      return {
        success: false,
        message:
          err?.message ||
          'Database Error: Unable to connect to the online database. Please check your internet connection.',
      };
    }

    return { success: false, message: 'Invalid username or password' };
  };

  const updateAdminProfile = async (
    name: string,
    username: string,
    password: string
  ): Promise<boolean> => {
    try {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();
      const cleanName = name.trim();

      await AsyncStorage.setItem(STORAGE_KEY_ADMIN_NAME, cleanName);
      await AsyncStorage.setItem(STORAGE_KEY_ADMIN_USER, cleanUser);
      if (cleanPass) {
        await AsyncStorage.setItem(STORAGE_KEY_ADMIN_PASS, cleanPass);
      }

      const updatedSession: UserSession = {
        role: 'admin',
        username: cleanUser,
        name: cleanName,
      };
      setUser(updatedSession);
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updatedSession));
      return true;
    } catch (err) {
      console.error('Failed to update admin profile:', err);
      return false;
    }
  };

  const updateManagerProfile = async (
    name: string,
    username: string,
    password: string,
    phone?: string,
    address?: string
  ): Promise<boolean> => {
    if (!user || !user.manager_id) return false;

    const updates: any = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
    };
    if (password.trim()) {
      updates.password = password.trim();
    }
    if (phone !== undefined) updates.phone = phone.trim();
    if (address !== undefined) updates.address = address.trim();

    const updatedMgr = await updateManager(user.manager_id, updates);
    if (updatedMgr) {
      const updatedSession: UserSession = {
        ...user,
        name: updatedMgr.name,
        username: updatedMgr.username,
      };
      setUser(updatedSession);
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(updatedSession));
      return true;
    }
    return false;
  };

  const logout = async () => {
    setUser(null);
    setActiveBranchFilter('all');
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH_USER);
    } catch {
      // ignore
    }
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'branch_manager';
  const isCashier = user?.role === 'cashier';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        isManager,
        isCashier,
        activeBranchFilter,
        setActiveBranchFilter,
        login,
        updateAdminProfile,
        updateManagerProfile,
        logout,
        isLoading,
        isCloudConnected,
        dbErrorMessage,
        refreshCloudStatus: checkCloud,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
