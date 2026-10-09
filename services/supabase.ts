import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/constants/supabase-config';

// Storage keys
export const STORAGE_KEY_SUPABASE_URL = 'ksm_supabase_url';
export const STORAGE_KEY_SUPABASE_ANON_KEY = 'ksm_supabase_anon_key';

const REQUEST_TIMEOUT_MS = 12000;

export interface DatabaseStatus {
  connected: boolean;
  errorMessage: string | null;
}

type DatabaseStatusListener = (status: DatabaseStatus) => void;
const statusListeners = new Set<DatabaseStatusListener>();

let currentDbStatus: DatabaseStatus = {
  connected: true,
  errorMessage: null,
};

function notifyStatusListeners() {
  statusListeners.forEach((listener) => {
    try {
      listener(currentDbStatus);
    } catch {
      // ignore listener errors
    }
  });
}

export function getDatabaseStatus(): DatabaseStatus {
  return currentDbStatus;
}

export function subscribeDatabaseStatus(listener: DatabaseStatusListener): () => void {
  statusListeners.add(listener);
  listener(currentDbStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function markSupabaseOffline(reason?: string): void {
  const msg =
    reason ||
    'Unable to connect to the online database. Please check your internet connection or database settings.';
  if (currentDbStatus.connected || currentDbStatus.errorMessage !== msg) {
    currentDbStatus = {
      connected: false,
      errorMessage: msg,
    };
    notifyStatusListeners();
  }
}

export function markSupabaseOnline(): void {
  if (!currentDbStatus.connected || currentDbStatus.errorMessage !== null) {
    currentDbStatus = {
      connected: true,
      errorMessage: null,
    };
    notifyStatusListeners();
  }
}

export function resetSupabaseCircuitBreaker(): void {
  // Retained for compatibility; online-only mode does not lock out requests
}

export function isSupabaseTemporarilyOffline(): boolean {
  return !currentDbStatus.connected;
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      signal: init?.signal || controller.signal,
    });
    markSupabaseOnline();
    return response;
  } catch (error: any) {
    const isAbort = error?.name === 'AbortError';
    const friendlyMsg = isAbort
      ? 'Database connection timed out. Unable to reach the online database.'
      : 'Unable to connect to the online database. Please check your internet connection.';
    markSupabaseOffline(friendlyMsg);
    throw new Error(friendlyMsg);
  } finally {
    clearTimeout(timeoutId);
  }
};

function createSupabaseClientInstance(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });
}

export function sanitizeSupabaseUrl(url: string): string {
  return (url || '')
    .trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
}

// Default in-code configuration
export const DEFAULT_SUPABASE_URL = sanitizeSupabaseUrl(
  SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || ''
);
export const DEFAULT_SUPABASE_ANON_KEY = (
  SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

let currentConfig = {
  url: DEFAULT_SUPABASE_URL,
  key: DEFAULT_SUPABASE_ANON_KEY,
};

// Eagerly initialize online client if default credentials exist
let supabaseInstance: SupabaseClient | null =
  DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY
    ? createSupabaseClientInstance(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY)
    : null;

export async function getSupabaseConfig(): Promise<{ url: string; key: string }> {
  try {
    const [savedUrl, savedKey] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_SUPABASE_URL),
      AsyncStorage.getItem(STORAGE_KEY_SUPABASE_ANON_KEY),
    ]);
    if (savedUrl && savedKey) {
      return {
        url: sanitizeSupabaseUrl(savedUrl),
        key: savedKey.trim(),
      };
    }
  } catch {
    // Ignore AsyncStorage read errors
  }

  if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY) {
    return {
      url: DEFAULT_SUPABASE_URL,
      key: DEFAULT_SUPABASE_ANON_KEY,
    };
  }

  return currentConfig;
}

export async function initSupabase(): Promise<SupabaseClient | null> {
  const config = await getSupabaseConfig();
  const cleanUrl = sanitizeSupabaseUrl(config.url);
  const cleanKey = config.key.trim();
  currentConfig = { url: cleanUrl, key: cleanKey };

  if (!cleanUrl || !cleanKey) {
    supabaseInstance = null;
    markSupabaseOffline('Online database URL and API Key are not configured.');
    return null;
  }

  try {
    supabaseInstance = createSupabaseClientInstance(cleanUrl, cleanKey);
    return supabaseInstance;
  } catch (error: any) {
    console.warn('Failed to initialize Supabase client:', error);
    supabaseInstance = null;
    markSupabaseOffline(error?.message || 'Failed to initialize online database client.');
    return null;
  }
}

export async function saveSupabaseConfig(url: string, key: string): Promise<boolean> {
  try {
    const cleanUrl = sanitizeSupabaseUrl(url);
    const cleanKey = key.trim();
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_SUPABASE_URL, cleanUrl),
      AsyncStorage.setItem(STORAGE_KEY_SUPABASE_ANON_KEY, cleanKey),
    ]);
    currentConfig = { url: cleanUrl, key: cleanKey };

    if (cleanUrl && cleanKey) {
      supabaseInstance = createSupabaseClientInstance(cleanUrl, cleanKey);
      return true;
    } else {
      supabaseInstance = null;
      markSupabaseOffline('Online database URL and API Key are missing.');
      return true;
    }
  } catch (err) {
    console.error('Error saving supabase config', err);
    return false;
  }
}

export async function testSupabaseConnection(
  url?: string,
  key?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const testUrl = sanitizeSupabaseUrl(
      url !== undefined ? url : currentConfig.url || ''
    );
    const testKey = (key !== undefined ? key : currentConfig.key || '').trim();

    if (!testUrl || !testKey) {
      const msg = 'Online Database Error: Please provide both Supabase URL and Anon Public Key.';
      markSupabaseOffline(msg);
      return { success: false, message: msg };
    }

    const testClient = createSupabaseClientInstance(testUrl, testKey);
    const { error } = await testClient
      .from('branches')
      .select('count', { count: 'exact', head: true });

    if (error) {
      if (error.code === '42P01') {
        markSupabaseOnline();
        return {
          success: true,
          message:
            'Connected to Supabase! Note: Please run supabase_schema.sql in the Supabase SQL editor to create tables.',
        };
      }
      const msg = `Database Error: ${error.message}`;
      markSupabaseOffline(msg);
      return { success: false, message: msg };
    }

    markSupabaseOnline();
    return {
      success: true,
      message: 'Successfully connected to online Supabase database!',
    };
  } catch (err: any) {
    const msg =
      err?.message ||
      'Unable to connect to online database. Please check your internet connection.';
    markSupabaseOffline(msg);
    return { success: false, message: msg };
  }
}

export function getSupabase(): SupabaseClient | null {
  if (!supabaseInstance && currentConfig.url && currentConfig.key) {
    supabaseInstance = createSupabaseClientInstance(currentConfig.url, currentConfig.key);
  }
  return supabaseInstance;
}

export function requireSupabase(): SupabaseClient {
  const client = getSupabase();
  if (!client) {
    const msg =
      'Database Error: Online database is not configured or unreachable. Please check Database Settings.';
    markSupabaseOffline(msg);
    throw new Error(msg);
  }
  return client;
}
