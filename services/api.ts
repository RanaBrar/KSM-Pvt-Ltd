import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AttendanceRecord,
  Branch,
  BranchManager,
  CashierSaleRecord,
  Employee,
  EmployeeMonthlyReport,
  Item,
  MonthlySummary,
  PaymentRecord,
  PurchaseRecord,
  PurchaseSummary,
} from '@/types';
import {
  markSupabaseOffline,
  markSupabaseOnline,
  requireSupabase,
  resetSupabaseCircuitBreaker,
} from './supabase';

// Legacy offline cache keys (only used to purge any leftover offline data)
const LEGACY_OFFLINE_KEYS = [
  'ksm_cache_branches',
  'ksm_cache_managers',
  'ksm_cache_employees',
  'ksm_cache_attendance',
  'ksm_cache_payments',
  'ksm_cache_items',
  'ksm_cache_purchases',
  'ksm_cache_cashier_sales',
  'ksm_default_tax_rate',
];

const DEFAULT_TAX_RATE_VALUE = 7;
const SYSTEM_TAX_ITEM_NAME = '__DEFAULT_TAX_RATE__';
const SYSTEM_CONFIG_CATEGORY = '__SYSTEM_CONFIG__';
const SYSTEM_CASHIER_SALE_ITEM_NAME = '__CASHIER_DAILY_SALE__';
const ROLE_CASHIER_PREFIX = '[ROLE:CASHIER]';
const BONUS_PAID_PREFIX = '[BONUS_PAID]';
const BONUS_AWARD_PREFIX = '[BONUS_AWARD]';

let memoryDefaultTaxRate: number | null = null;

// -------------------------------------------------------------
// Online Request Deduplication (In-Memory Only, No Offline DB)
// -------------------------------------------------------------
const inFlightQueries = new Map<string, Promise<any>>();
const queryCache = new Map<string, { data: any; timestamp: number }>();
const DEFAULT_QUERY_TTL_MS = 15000; // 15 seconds in-memory deduplication for online responses

type RefreshCallback = (data: any) => void;
const refreshCallbacks = new Map<string, Set<RefreshCallback>>();

export function subscribeToRefresh(cacheKey: string, cb: RefreshCallback): () => void {
  if (!refreshCallbacks.has(cacheKey)) {
    refreshCallbacks.set(cacheKey, new Set());
  }
  refreshCallbacks.get(cacheKey)!.add(cb);
  return () => {
    refreshCallbacks.get(cacheKey)?.delete(cb);
  };
}

function notifyRefreshSubscribers(cacheKey: string, data: any): void {
  refreshCallbacks.get(cacheKey)?.forEach((cb) => {
    try {
      cb(data);
    } catch {
      /* ignore */
    }
  });
}

export function invalidateQueryCache(prefix?: string): void {
  if (!prefix) {
    queryCache.clear();
    resetSupabaseCircuitBreaker();
    return;
  }
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) {
      queryCache.delete(key);
    }
  }
}

function formatDbError(err: any, fallbackContext: string): string {
  const raw = err?.message || String(err || '');
  if (
    raw.toLowerCase().includes('fetch') ||
    raw.toLowerCase().includes('network') ||
    raw.toLowerCase().includes('timed out') ||
    raw.toLowerCase().includes('unable to connect')
  ) {
    return 'Unable to connect to the online database. Please check your internet connection.';
  }
  return `Database Error (${fallbackContext}): ${raw}`;
}

function handleSupabaseError(error: any, context: string): never {
  const msg = formatDbError(error, context);
  markSupabaseOffline(msg);
  throw new Error(msg);
}

/**
 * Deduplicates concurrent online queries and caches successful online responses
 * in memory for `ttlMs`. Never falls back to any offline backup database.
 */
async function deduplicatedOnlineQuery<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_QUERY_TTL_MS
): Promise<T> {
  const cachedEntry = queryCache.get(cacheKey);
  const now = Date.now();
  if (cachedEntry && now - cachedEntry.timestamp < ttlMs) {
    return cachedEntry.data as T;
  }

  const existingPromise = inFlightQueries.get(cacheKey);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await fetcher();
      queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      markSupabaseOnline();
      notifyRefreshSubscribers(cacheKey, result);
      return result;
    } finally {
      inFlightQueries.delete(cacheKey);
    }
  })();

  inFlightQueries.set(cacheKey, promise);
  return promise;
}

/**
 * Removes any legacy offline backup database keys from AsyncStorage.
 * The app now operates 100% online against Supabase.
 */
export async function preloadAllCaches(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(LEGACY_OFFLINE_KEYS);
  } catch {
    // ignore cleanup error
  }
}

// -------------------------------------------------------------
// Default Purchase Tax Rate (Online in public.items)
// -------------------------------------------------------------
export async function getDefaultTaxRate(): Promise<number> {
  if (memoryDefaultTaxRate !== null) {
    return memoryDefaultTaxRate;
  }
  try {
    const supabase = requireSupabase();
    const { data: itemRow, error: itemErr } = await supabase
      .from('items')
      .select('unit')
      .eq('name', SYSTEM_TAX_ITEM_NAME)
      .maybeSingle();

    if (itemErr) {
      handleSupabaseError(itemErr, 'fetching default tax rate');
    }

    if (itemRow && itemRow.unit !== undefined && itemRow.unit !== null) {
      const parsed = parseFloat(String(itemRow.unit));
      if (!isNaN(parsed) && parsed >= 0) {
        memoryDefaultTaxRate = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Online getDefaultTaxRate error:', err);
  }
  return DEFAULT_TAX_RATE_VALUE;
}

export async function setDefaultTaxRate(rate: number): Promise<void> {
  const cleanRate = isNaN(rate) || rate < 0 ? DEFAULT_TAX_RATE_VALUE : rate;
  const supabase = requireSupabase();

  const { data: existing, error: findErr } = await supabase
    .from('items')
    .select('id')
    .eq('name', SYSTEM_TAX_ITEM_NAME)
    .maybeSingle();

  if (findErr) {
    handleSupabaseError(findErr, 'checking default tax rate');
  }

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('items')
      .update({
        unit: String(cleanRate),
        category: SYSTEM_CONFIG_CATEGORY,
      })
      .eq('id', existing.id);
    if (updErr) {
      handleSupabaseError(updErr, 'updating default tax rate');
    }
  } else {
    const { error: insErr } = await supabase.from('items').insert([
      {
        name: SYSTEM_TAX_ITEM_NAME,
        category: SYSTEM_CONFIG_CATEGORY,
        unit: String(cleanRate),
      },
    ]);
    if (insErr) {
      handleSupabaseError(insErr, 'saving default tax rate');
    }
  }

  memoryDefaultTaxRate = cleanRate;
  markSupabaseOnline();
}

// -------------------------------------------------------------
// Branches API (Online Only)
// -------------------------------------------------------------
export async function getBranches(): Promise<Branch[]> {
  return deduplicatedOnlineQuery('branches_all', async () => {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('branches').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'loading branches');
    }
    return (data || []) as Branch[];
  });
}

export async function addBranch(branchData: Omit<Branch, 'id' | 'created_at'>): Promise<Branch> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('branches')
    .insert([
      {
        name: branchData.name,
        code: branchData.code,
        phone: branchData.phone,
        address: branchData.address,
      },
    ])
    .select()
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('No branch returned'), 'creating branch');
  }

  invalidateQueryCache();
  return data as Branch;
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('No branch returned'), 'updating branch');
  }

  invalidateQueryCache();
  return data as Branch;
}

export async function deleteBranch(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting branch');
  }
  invalidateQueryCache();
  return true;
}

// -------------------------------------------------------------
// Branch Managers & Cashiers API (Online Only)
// -------------------------------------------------------------
function normalizeManagerRecord(m: any, branchNameFallback?: string): BranchManager {
  const rawAddr = typeof m.address === 'string' ? m.address : '';
  const hasCashierPrefix = rawAddr.startsWith(ROLE_CASHIER_PREFIX);
  const role: 'branch_manager' | 'cashier' =
    m.role === 'cashier' || hasCashierPrefix ? 'cashier' : 'branch_manager';
  const cleanAddress = hasCashierPrefix
    ? rawAddr.slice(ROLE_CASHIER_PREFIX.length).trim()
    : rawAddr;

  return {
    ...m,
    address: cleanAddress,
    role,
    branch_name: m.branches?.name || m.branch_name || branchNameFallback || '',
  };
}

function encodeAddressWithRole(address?: string, role?: 'branch_manager' | 'cashier'): string {
  const clean = (address || '').replace(/^\[ROLE:CASHIER\]\s*/, '').trim();
  if (role === 'cashier') {
    return clean ? `${ROLE_CASHIER_PREFIX} ${clean}` : ROLE_CASHIER_PREFIX;
  }
  return clean;
}

export async function getManagers(branchId?: string): Promise<BranchManager[]> {
  return deduplicatedOnlineQuery(`managers_${branchId || 'all'}`, async () => {
    const supabase = requireSupabase();
    let query = supabase.from('managers').select('*, branches(name)');
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query.order('name');
    if (error) {
      handleSupabaseError(error, 'loading managers & cashiers');
    }
    return (data || []).map((m: any) => normalizeManagerRecord(m));
  });
}

export async function addManager(
  managerData: Omit<BranchManager, 'id' | 'created_at'>
): Promise<BranchManager> {
  const role: 'branch_manager' | 'cashier' =
    managerData.role === 'cashier' ? 'cashier' : 'branch_manager';
  const supabase = requireSupabase();
  const encodedAddr = encodeAddressWithRole(managerData.address, role);

  const { data, error } = await supabase
    .from('managers')
    .insert([
      {
        branch_id: managerData.branch_id,
        name: managerData.name,
        phone: managerData.phone,
        address: encodedAddr,
        username: managerData.username.toLowerCase().trim(),
        password: managerData.password,
      },
    ])
    .select('*, branches(name)')
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to create account'), 'adding manager/cashier');
  }

  invalidateQueryCache('managers_');
  return normalizeManagerRecord(data, managerData.branch_name);
}

export async function updateManager(
  id: string,
  updates: Partial<BranchManager>
): Promise<BranchManager | null> {
  const supabase = requireSupabase();

  // Fetch current row if we need existing role/address
  const { data: currentRow, error: fetchErr } = await supabase
    .from('managers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    handleSupabaseError(fetchErr, 'fetching manager account');
  }

  const currentNormalized = currentRow ? normalizeManagerRecord(currentRow) : undefined;
  const effectiveRole: 'branch_manager' | 'cashier' =
    updates.role || currentNormalized?.role || 'branch_manager';

  const dbUpdates: any = { ...updates };
  delete dbUpdates.role;
  delete dbUpdates.branch_name;
  if (updates.address !== undefined || updates.role !== undefined) {
    const addrToEncode =
      updates.address !== undefined ? updates.address : currentNormalized?.address || '';
    dbUpdates.address = encodeAddressWithRole(addrToEncode, effectiveRole);
  }

  const { data, error } = await supabase
    .from('managers')
    .update(dbUpdates)
    .eq('id', id)
    .select('*, branches(name)')
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to update account'), 'updating manager/cashier');
  }

  invalidateQueryCache('managers_');
  return normalizeManagerRecord(data);
}

export async function deleteManager(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('managers').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting manager/cashier');
  }
  invalidateQueryCache('managers_');
  return true;
}

export async function verifyManagerLogin(
  username: string,
  password: string
): Promise<BranchManager | null> {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('managers')
    .select('*, branches(name)')
    .eq('username', cleanUser)
    .eq('password', cleanPass)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, 'verifying login with online database');
  }

  if (!data) {
    return null;
  }

  return normalizeManagerRecord(data);
}

// -------------------------------------------------------------
// Employees API (Online Only)
// -------------------------------------------------------------
export async function getEmployees(branchId?: string): Promise<Employee[]> {
  if (branchId) {
    const allEntry = queryCache.get('employees_all');
    if (allEntry && Date.now() - allEntry.timestamp < DEFAULT_QUERY_TTL_MS) {
      return (allEntry.data as Employee[]).filter((e) => e.branch_id === branchId);
    }
  }

  return deduplicatedOnlineQuery(`employees_${branchId || 'all'}`, async () => {
    const supabase = requireSupabase();
    let query = supabase.from('employees').select('*, branches(name)');
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query.order('name');
    if (error) {
      handleSupabaseError(error, 'loading employees');
    }
    return (data || []).map((e: any) => ({
      ...e,
      daily_salary: Number(e.daily_salary) || 0,
      branch_name: e.branches?.name || '',
    }));
  });
}

export async function addEmployee(
  employeeData: Omit<Employee, 'id' | 'created_at'>
): Promise<Employee> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('employees')
    .insert([
      {
        employee_id_code: employeeData.employee_id_code,
        branch_id: employeeData.branch_id,
        name: employeeData.name,
        phone: employeeData.phone,
        address: employeeData.address,
        daily_salary: Number(employeeData.daily_salary) || 0,
        designation: employeeData.designation || 'Staff',
        status: employeeData.status || 'active',
      },
    ])
    .select('*, branches(name)')
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to add employee'), 'adding employee');
  }

  invalidateQueryCache('employees_');
  invalidateQueryCache('monthly_report_');
  return {
    ...(data as any),
    daily_salary: Number(data.daily_salary) || 0,
    branch_name: data.branches?.name || '',
  } as Employee;
}

export async function updateEmployee(
  id: string,
  updates: Partial<Employee>
): Promise<Employee | null> {
  const supabase = requireSupabase();
  const dbUpdates: any = { ...updates };
  delete dbUpdates.branch_name;

  const { data, error } = await supabase
    .from('employees')
    .update(dbUpdates)
    .eq('id', id)
    .select('*, branches(name)')
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to update employee'), 'updating employee');
  }

  invalidateQueryCache('employees_');
  invalidateQueryCache('monthly_report_');
  return {
    ...(data as any),
    daily_salary: Number(data.daily_salary) || 0,
    branch_name: data.branches?.name || '',
  } as Employee;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting employee');
  }
  invalidateQueryCache();
  return true;
}

// -------------------------------------------------------------
// Daily Attendance API (Online Only)
// -------------------------------------------------------------
export async function getAttendance(date: string, branchId?: string): Promise<AttendanceRecord[]> {
  return deduplicatedOnlineQuery(`attendance_${date}_${branchId || 'all'}`, async () => {
    const supabase = requireSupabase();

    const [allEmps, attRes] = await Promise.all([
      getEmployees(branchId),
      (async () => {
        let query = supabase.from('attendance').select('*').eq('date', date);
        if (branchId) {
          query = query.eq('branch_id', branchId);
        }
        return query;
      })(),
    ]);

    if (attRes.error) {
      handleSupabaseError(attRes.error, 'loading attendance');
    }

    const activeEmpIds = new Set(
      allEmps.filter((e) => e.status !== 'inactive').map((e) => e.id)
    );

    return ((attRes.data || []) as AttendanceRecord[]).filter((a) =>
      activeEmpIds.has(a.employee_id)
    );
  });
}

export async function getEmployeeMonthlyAttendance(
  employeeId: string,
  monthYear: string // 'YYYY-MM'
): Promise<AttendanceRecord[]> {
  return deduplicatedOnlineQuery(`emp_monthly_att_${employeeId}_${monthYear}`, async () => {
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDayStr = String(daysInMonth).padStart(2, '0');

    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('date', `${monthYear}-01`)
      .lte('date', `${monthYear}-${lastDayStr}`)
      .order('date', { ascending: true });

    if (error) {
      handleSupabaseError(error, 'loading employee monthly attendance');
    }

    return (data || []) as AttendanceRecord[];
  });
}

export async function markAttendance(
  record: Omit<AttendanceRecord, 'id' | 'created_at'>
): Promise<AttendanceRecord> {
  const supabase = requireSupabase();

  let rate = record.daily_rate;
  if (rate === undefined || rate === null || Number(rate) === 0) {
    const emps = await getEmployees(record.branch_id);
    const emp = emps.find((e) => e.id === record.employee_id);
    rate = Number(emp?.daily_salary) || 0;
  }

  const dailyRateNum = Number(rate) || 0;

  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      {
        employee_id: record.employee_id,
        branch_id: record.branch_id,
        date: record.date,
        status: record.status,
        daily_rate: dailyRateNum,
        notes: record.notes || '',
        marked_by: record.marked_by || '',
      },
      { onConflict: 'employee_id,date' }
    )
    .select()
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to save attendance'), 'marking attendance');
  }

  invalidateQueryCache('attendance_');
  invalidateQueryCache('emp_monthly_att_');
  invalidateQueryCache('monthly_report_');

  return {
    ...(data as AttendanceRecord),
    daily_rate: Number(data.daily_rate) > 0 ? Number(data.daily_rate) : dailyRateNum,
  };
}

export async function markBatchAttendance(
  records: Omit<AttendanceRecord, 'id' | 'created_at'>[]
): Promise<boolean> {
  if (!records.length) return true;

  const supabase = requireSupabase();
  const emps = await getEmployees();
  const empMap = new Map(emps.map((e) => [e.id, e.daily_salary || 0]));

  const payload = records.map((r) => ({
    employee_id: r.employee_id,
    branch_id: r.branch_id,
    date: r.date,
    status: r.status,
    daily_rate:
      r.daily_rate !== undefined && r.daily_rate !== null
        ? r.daily_rate
        : empMap.get(r.employee_id) || 0,
    notes: r.notes || '',
    marked_by: r.marked_by || '',
  }));

  const { error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'employee_id,date' });

  if (error) {
    handleSupabaseError(error, 'saving batch attendance');
  }

  invalidateQueryCache('attendance_');
  invalidateQueryCache('emp_monthly_att_');
  invalidateQueryCache('monthly_report_');
  return true;
}

// -------------------------------------------------------------
// Payments & Employee Bonus API (Online Only)
// -------------------------------------------------------------
function normalizePaymentRecord(p: any, empNameFallback?: string): PaymentRecord {
  const rawNotes = typeof p.notes === 'string' ? p.notes : '';
  let is_bonus = Boolean(p.is_bonus);
  let bonus_type: 'paid' | 'award' | undefined = p.bonus_type;
  let cleanNotes = rawNotes;

  if (rawNotes.startsWith(BONUS_AWARD_PREFIX)) {
    is_bonus = true;
    bonus_type = 'award';
    cleanNotes = rawNotes.slice(BONUS_AWARD_PREFIX.length).trim();
  } else if (rawNotes.startsWith(BONUS_PAID_PREFIX) || rawNotes.startsWith('[BONUS]')) {
    is_bonus = true;
    bonus_type = 'paid';
    cleanNotes = rawNotes.replace(/^(\[BONUS_PAID\]|\[BONUS\])\s*/, '').trim();
  }

  return {
    ...p,
    amount: Number(p.amount) || 0,
    notes: cleanNotes,
    is_bonus,
    bonus_type,
    employee_name: p.employees?.name || p.employee_name || empNameFallback || '',
  };
}

function encodePaymentNotes(notes?: string, isBonus?: boolean, bonusType?: 'paid' | 'award'): string {
  const clean = (notes || '')
    .replace(/^(\[BONUS_AWARD\]|\[BONUS_PAID\]|\[BONUS\])\s*/, '')
    .trim();
  if (isBonus) {
    const prefix = bonusType === 'award' ? BONUS_AWARD_PREFIX : BONUS_PAID_PREFIX;
    return clean ? `${prefix} ${clean}` : prefix;
  }
  return clean;
}

export async function getPayments(
  employeeId?: string,
  branchId?: string,
  monthYear?: string
): Promise<PaymentRecord[]> {
  return deduplicatedOnlineQuery(
    `payments_${employeeId || 'all'}_${branchId || 'all'}_${monthYear || 'all'}`,
    async () => {
      const supabase = requireSupabase();
      let query = supabase.from('payments').select('*, employees(name)');
      if (employeeId) query = query.eq('employee_id', employeeId);
      if (branchId) query = query.eq('branch_id', branchId);
      if (monthYear) {
        const [pYr, pMo] = monthYear.split('-').map(Number);
        const pLastDay = new Date(pYr, pMo, 0).getDate();
        const pLastDayStr = String(pLastDay).padStart(2, '0');
        query = query
          .gte('payment_date', `${monthYear}-01`)
          .lte('payment_date', `${monthYear}-${pLastDayStr}`);
      }
      const { data, error } = await query.order('payment_date', { ascending: false });
      if (error) {
        handleSupabaseError(error, 'loading salary & bonus payments');
      }
      return (data || []).map((p: any) => normalizePaymentRecord(p));
    }
  );
}

export async function recordPayment(
  paymentData: Omit<PaymentRecord, 'id' | 'created_at'>
): Promise<PaymentRecord> {
  const supabase = requireSupabase();
  const encodedNotes = encodePaymentNotes(
    paymentData.notes,
    paymentData.is_bonus,
    paymentData.bonus_type
  );

  const { data, error } = await supabase
    .from('payments')
    .insert([
      {
        employee_id: paymentData.employee_id,
        branch_id: paymentData.branch_id,
        amount: Number(paymentData.amount) || 0,
        payment_date: paymentData.payment_date,
        payment_mode: paymentData.payment_mode || 'cash',
        notes: encodedNotes,
      },
    ])
    .select('*, employees(name)')
    .single();

  if (error || !data) {
    handleSupabaseError(error || new Error('Failed to record payment'), 'recording payment');
  }

  invalidateQueryCache('payments_');
  invalidateQueryCache('monthly_report_');
  return normalizePaymentRecord(data);
}

export async function deletePayment(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting payment');
  }
  invalidateQueryCache('payments_');
  invalidateQueryCache('monthly_report_');
  return true;
}

// -------------------------------------------------------------
// Monthly Reports & Salary Calculation Engine (Online Only)
// -------------------------------------------------------------
export async function getMonthlyReport(
  monthYear: string, // format: "YYYY-MM"
  branchId?: string
): Promise<{ reports: EmployeeMonthlyReport[]; summary: MonthlySummary }> {
  return deduplicatedOnlineQuery(`monthly_report_${monthYear}_${branchId || 'all'}`, async () => {
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDayStr = String(daysInMonth).padStart(2, '0');

    const supabase = requireSupabase();

    const [employees, attRes, payments] = await Promise.all([
      getEmployees(branchId),
      (async () => {
        let q = supabase
          .from('attendance')
          .select('*')
          .gte('date', `${monthYear}-01`)
          .lte('date', `${monthYear}-${lastDayStr}`);
        if (branchId) q = q.eq('branch_id', branchId);
        return q;
      })(),
      getPayments(undefined, branchId, monthYear),
    ]);

    if (attRes.error) {
      handleSupabaseError(attRes.error, 'loading monthly attendance report');
    }

    const allAttendance = (attRes.data || []) as AttendanceRecord[];
    const activeEmployees = employees.filter((e) => e.status !== 'inactive');

    let totalEarned = 0;
    let totalBonus = 0;
    let totalPaid = 0;
    let totalPresentCount = 0;
    let totalAbsentCount = 0;

    const reports: EmployeeMonthlyReport[] = activeEmployees.map((emp) => {
      const empAttendance = allAttendance.filter((a) => a.employee_id === emp.id);
      const presentDays = empAttendance.filter((a) => a.status === 'present').length;
      const halfDays = empAttendance.filter((a) => a.status === 'half_day').length;
      const absentDays = empAttendance.filter((a) => a.status === 'absent').length;

      let earnedSalary = 0;
      empAttendance.forEach((a) => {
        const dayRate =
          Number(a.daily_rate) > 0
            ? Number(a.daily_rate)
            : Number(emp.daily_salary) || 0;

        if (a.status === 'present') {
          earnedSalary += dayRate;
        } else if (a.status === 'half_day') {
          earnedSalary += dayRate * 0.5;
        }
      });

      const empPayments = payments.filter((p) => p.employee_id === emp.id);
      const bonusAmount = empPayments
        .filter((p) => p.is_bonus)
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      const empTotalPaid = empPayments
        .filter((p) => p.bonus_type !== 'award')
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      const totalPayable = earnedSalary + bonusAmount;
      const pendingSalary = Math.max(0, totalPayable - empTotalPaid);

      totalEarned += earnedSalary;
      totalBonus += bonusAmount;
      totalPaid += empTotalPaid;
      totalPresentCount += presentDays;
      totalAbsentCount += absentDays;

      return {
        employee: emp,
        totalDaysInMonth: daysInMonth,
        presentDays,
        halfDays,
        absentDays,
        dailySalary: Number(emp.daily_salary) || 0,
        earnedSalary,
        bonusAmount,
        totalPayable,
        totalPaid: empTotalPaid,
        pendingSalary,
      };
    });

    const summary: MonthlySummary = {
      monthYear,
      totalEmployees: activeEmployees.length,
      totalEarned,
      totalBonus,
      totalPaid,
      totalPending: Math.max(0, totalEarned + totalBonus - totalPaid),
      totalPresentAttendance: totalPresentCount,
      totalAbsentAttendance: totalAbsentCount,
    };

    return { reports, summary };
  });
}

// =============================================================
// ITEMS MASTER API (Online Only)
// =============================================================
export async function getItems(): Promise<Item[]> {
  return deduplicatedOnlineQuery('items_all', async () => {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (error) {
      handleSupabaseError(error, 'loading product catalog');
    }

    const allRows = (data || []) as any[];
    const taxConfigRow = allRows.find(
      (d) => d.name === SYSTEM_TAX_ITEM_NAME || d.category === SYSTEM_CONFIG_CATEGORY
    );
    if (taxConfigRow && taxConfigRow.unit !== undefined && taxConfigRow.unit !== null) {
      const parsedTax = parseFloat(String(taxConfigRow.unit));
      if (!isNaN(parsedTax) && parsedTax >= 0) {
        memoryDefaultTaxRate = parsedTax;
      }
    }

    return allRows
      .filter((d) => d.name !== SYSTEM_TAX_ITEM_NAME && d.category !== SYSTEM_CONFIG_CATEGORY)
      .map((d) => ({
        ...d,
        tax_rate:
          d.tax_rate !== undefined && d.tax_rate !== null
            ? Number(d.tax_rate)
            : memoryDefaultTaxRate ?? DEFAULT_TAX_RATE_VALUE,
      })) as Item[];
  });
}

export async function addItem(itemData: Omit<Item, 'id' | 'created_at'>): Promise<Item> {
  const supabase = requireSupabase();
  const payloadWithTax: any = {
    name: itemData.name.trim(),
    category: itemData.category?.trim() || null,
    unit: itemData.unit?.trim() || 'kg',
    tax_rate:
      itemData.tax_rate !== undefined ? Number(itemData.tax_rate) : DEFAULT_TAX_RATE_VALUE,
  };

  let res = await supabase.from('items').insert([payloadWithTax]).select().single();

  if (
    res.error &&
    (res.error.message?.includes('tax_rate') || res.error.code === 'PGRST204')
  ) {
    const { tax_rate, ...fallbackPayload } = payloadWithTax;
    res = await supabase.from('items').insert([fallbackPayload]).select().single();
  }

  if (res.error || !res.data) {
    handleSupabaseError(res.error || new Error('Failed to add item'), 'adding catalog item');
  }

  invalidateQueryCache('items_');
  return {
    ...(res.data as Item),
    tax_rate:
      res.data.tax_rate !== undefined && res.data.tax_rate !== null
        ? Number(res.data.tax_rate)
        : payloadWithTax.tax_rate,
  };
}

export async function updateItem(
  id: string,
  updates: Partial<Item>
): Promise<Item | null> {
  const supabase = requireSupabase();
  const dbUpdates: any = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
  if (updates.tax_rate !== undefined) dbUpdates.tax_rate = updates.tax_rate;

  let res = await supabase
    .from('items')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (
    res.error &&
    (res.error.message?.includes('tax_rate') || res.error.code === 'PGRST204')
  ) {
    delete dbUpdates.tax_rate;
    res = await supabase
      .from('items')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
  }

  if (res.error || !res.data) {
    handleSupabaseError(res.error || new Error('Failed to update item'), 'updating catalog item');
  }

  invalidateQueryCache('items_');
  return {
    ...(res.data as Item),
    tax_rate:
      updates.tax_rate !== undefined
        ? Number(updates.tax_rate)
        : Number(res.data.tax_rate) || DEFAULT_TAX_RATE_VALUE,
  };
}

export async function deleteItem(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting catalog item');
  }
  invalidateQueryCache('items_');
  return true;
}

function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val.trim()
  );
}

// =============================================================
// PURCHASES API (Online Only)
// =============================================================
export async function getPurchases(
  branchId?: string,
  date?: string,
  monthYear?: string
): Promise<PurchaseRecord[]> {
  return deduplicatedOnlineQuery(
    `purchases_${branchId || 'all'}_${date || 'all'}_${monthYear || 'all'}`,
    async () => {
      const supabase = requireSupabase();
      let query = supabase.from('purchases').select('*, branches(name)');
      if (branchId) query = query.eq('branch_id', branchId);
      if (date) query = query.eq('date', date);
      if (monthYear) {
        const [yr, mo] = monthYear.split('-').map(Number);
        const lastDay = new Date(yr, mo, 0).getDate();
        const lastDayStr = String(lastDay).padStart(2, '0');
        query = query
          .gte('date', `${monthYear}-01`)
          .lte('date', `${monthYear}-${lastDayStr}`);
      }
      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError(error, 'loading purchases');
      }

      return (data || [])
        .filter(
          (p: any) =>
            p.product_name !== SYSTEM_CASHIER_SALE_ITEM_NAME &&
            p.item_name !== SYSTEM_CASHIER_SALE_ITEM_NAME
        )
        .map((p: any) => ({
          id: p.id,
          branch_id: p.branch_id,
          item_id: p.item_id || undefined,
          item_name: p.product_name || p.item_name || 'Purchase Item',
          amount: Number(p.amount) || 0,
          quantity_weight: p.quantity || p.quantity_weight || undefined,
          date: p.date,
          comment: p.comment || undefined,
          created_by: p.created_by_name || p.created_by || undefined,
          branch_name: p.branches?.name || '',
          created_at: p.created_at || new Date().toISOString(),
        })) as PurchaseRecord[];
    }
  );
}

export async function addPurchase(
  purchaseData: Omit<PurchaseRecord, 'id' | 'created_at'>
): Promise<PurchaseRecord> {
  const supabase = requireSupabase();
  const validItemId = isValidUuid(purchaseData.item_id) ? purchaseData.item_id : null;

  const primaryPayload: any = {
    branch_id: purchaseData.branch_id,
    product_name: purchaseData.item_name,
    item_id: validItemId,
    amount: Number(purchaseData.amount) || 0,
    quantity: purchaseData.quantity_weight || null,
    date: purchaseData.date,
    comment: purchaseData.comment || null,
    created_by_name: purchaseData.created_by || null,
  };

  let res = await supabase
    .from('purchases')
    .insert([primaryPayload])
    .select('*, branches(name)')
    .single();

  if (
    res.error &&
    (res.error.message?.includes('product_name') ||
      res.error.message?.includes('quantity') ||
      res.error.code === 'PGRST204')
  ) {
    const altPayload: any = {
      branch_id: purchaseData.branch_id,
      item_name: purchaseData.item_name,
      item_id: validItemId,
      amount: Number(purchaseData.amount) || 0,
      quantity_weight: purchaseData.quantity_weight || null,
      date: purchaseData.date,
      comment: purchaseData.comment || null,
      created_by: purchaseData.created_by || null,
    };
    res = await supabase
      .from('purchases')
      .insert([altPayload])
      .select('*, branches(name)')
      .single();
  }

  if (res.error || !res.data) {
    handleSupabaseError(res.error || new Error('Failed to save purchase'), 'adding purchase');
  }

  const data = res.data;
  invalidateQueryCache('purchases_');

  return {
    id: data.id,
    branch_id: data.branch_id,
    item_id: data.item_id || undefined,
    item_name: data.product_name || data.item_name || purchaseData.item_name,
    amount: Number(data.amount) || 0,
    quantity_weight:
      data.quantity || data.quantity_weight || purchaseData.quantity_weight || undefined,
    date: data.date,
    comment: data.comment || undefined,
    created_by: data.created_by_name || data.created_by || purchaseData.created_by || undefined,
    branch_name: data.branches?.name || '',
    created_at: data.created_at || new Date().toISOString(),
  };
}

export async function updatePurchase(
  id: string,
  updates: Partial<PurchaseRecord>
): Promise<PurchaseRecord | null> {
  const supabase = requireSupabase();
  const validItemId =
    updates.item_id !== undefined
      ? isValidUuid(updates.item_id)
        ? updates.item_id
        : null
      : undefined;

  const primaryPayload: any = {};
  if (updates.branch_id) primaryPayload.branch_id = updates.branch_id;
  if (updates.amount !== undefined) primaryPayload.amount = Number(updates.amount);
  if (updates.date) primaryPayload.date = updates.date;
  if (updates.comment !== undefined) primaryPayload.comment = updates.comment;
  if (validItemId !== undefined) primaryPayload.item_id = validItemId;
  if (updates.item_name) primaryPayload.product_name = updates.item_name;
  if (updates.quantity_weight !== undefined) primaryPayload.quantity = updates.quantity_weight;

  let res = await supabase
    .from('purchases')
    .update(primaryPayload)
    .eq('id', id)
    .select('*, branches(name)')
    .single();

  if (
    res.error &&
    (res.error.message?.includes('product_name') ||
      res.error.message?.includes('quantity') ||
      res.error.code === 'PGRST204')
  ) {
    delete primaryPayload.product_name;
    delete primaryPayload.quantity;
    if (updates.item_name) primaryPayload.item_name = updates.item_name;
    if (updates.quantity_weight !== undefined)
      primaryPayload.quantity_weight = updates.quantity_weight;
    res = await supabase
      .from('purchases')
      .update(primaryPayload)
      .eq('id', id)
      .select('*, branches(name)')
      .single();
  }

  if (res.error || !res.data) {
    handleSupabaseError(res.error || new Error('Failed to update purchase'), 'updating purchase');
  }

  const data = res.data;
  invalidateQueryCache('purchases_');

  return {
    id: data.id,
    branch_id: data.branch_id,
    item_id: data.item_id || undefined,
    item_name: data.product_name || data.item_name || updates.item_name || 'Purchase',
    amount: Number(data.amount) || 0,
    quantity_weight:
      data.quantity || data.quantity_weight || updates.quantity_weight || undefined,
    date: data.date,
    comment: data.comment || undefined,
    created_by: data.created_by_name || data.created_by || updates.created_by || undefined,
    branch_name: data.branches?.name || '',
    created_at: data.created_at || new Date().toISOString(),
  };
}

export async function deletePurchase(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting purchase');
  }
  invalidateQueryCache('purchases_');
  return true;
}

export async function getPurchaseSummary(
  branchId?: string,
  targetDate?: string,
  targetMonth?: string
): Promise<PurchaseSummary> {
  const d = new Date();
  const dateStr =
    targetDate ||
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  const monthStr = targetMonth || dateStr.substring(0, 7);

  const monthPurchases = await getPurchases(branchId, undefined, monthStr);

  let todayTotal = 0;
  let monthTotal = 0;

  monthPurchases.forEach((p) => {
    const amt = Number(p.amount) || 0;
    monthTotal += amt;
    if (p.date === dateStr) {
      todayTotal += amt;
    }
  });

  return {
    todayTotal,
    monthTotal,
    totalCount: monthPurchases.length,
  };
}

// =============================================================
// CASHIER DAILY SALES & COUNTER RECONCILIATION API (Online Only)
// =============================================================
function parseCashierRowFromPurchase(
  p: any,
  branchNameFallback?: string
): CashierSaleRecord | null {
  try {
    const rawComment = typeof p.comment === 'string' ? p.comment : '';
    const parsed = rawComment ? JSON.parse(rawComment) : {};
    const machines = Array.isArray(parsed.machines) ? parsed.machines : [];
    const total_sale =
      parsed.total_sale !== undefined ? Number(parsed.total_sale) : Number(p.amount) || 0;
    const today_online = Number(parsed.today_online) || 0;
    const cash_amount = Number(parsed.cash_amount) || 0;
    const ajj_ka_kharcha = Number(parsed.ajj_ka_kharcha) || 0;
    const ajj_ka_counter_balance = Number(parsed.ajj_ka_counter_balance) || 0;
    const mistaken_bill = Number(parsed.mistaken_bill) || 0;
    const fatte_note = Number(parsed.fatte_note) || 0;
    const counter_total =
      parsed.counter_total !== undefined
        ? Number(parsed.counter_total)
        : today_online +
          cash_amount +
          ajj_ka_kharcha +
          ajj_ka_counter_balance +
          mistaken_bill +
          fatte_note;
    const result_balance =
      parsed.result_balance !== undefined
        ? Number(parsed.result_balance)
        : counter_total - total_sale;

    return {
      id: p.id,
      branch_id: p.branch_id,
      branch_name: p.branches?.name || p.branch_name || branchNameFallback || '',
      date: p.date,
      machines,
      total_sale,
      today_online,
      cash_amount,
      ajj_ka_kharcha,
      ajj_ka_counter_balance,
      mistaken_bill,
      fatte_note,
      counter_total,
      result_balance,
      cashier_username:
        parsed.cashier_username || p.created_by_name || p.created_by || 'cashier',
      cashier_name: parsed.cashier_name || p.created_by_name || p.created_by || 'Cashier',
      created_at: p.created_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getCashierSales(
  branchId?: string,
  date?: string,
  monthYear?: string
): Promise<CashierSaleRecord[]> {
  return deduplicatedOnlineQuery(
    `cashier_sales_${branchId || 'all'}_${date || 'all'}_${monthYear || 'all'}`,
    async () => {
      const supabase = requireSupabase();
      let query = supabase
        .from('purchases')
        .select('*, branches(name)')
        .eq('product_name', SYSTEM_CASHIER_SALE_ITEM_NAME);

      if (branchId) query = query.eq('branch_id', branchId);
      if (date) query = query.eq('date', date);
      if (monthYear) {
        const [yr, mo] = monthYear.split('-').map(Number);
        const lastDay = new Date(yr, mo, 0).getDate();
        const lastDayStr = String(lastDay).padStart(2, '0');
        query = query
          .gte('date', `${monthYear}-01`)
          .lte('date', `${monthYear}-${lastDayStr}`);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError(error, 'loading cashier sales reports');
      }

      return (data || [])
        .map((row: any) => parseCashierRowFromPurchase(row))
        .filter((r): r is CashierSaleRecord => r !== null);
    }
  );
}

export async function saveCashierSale(
  saleInput: Omit<
    CashierSaleRecord,
    'id' | 'created_at' | 'total_sale' | 'counter_total' | 'result_balance'
  > & {
    id?: string;
  }
): Promise<CashierSaleRecord> {
  const supabase = requireSupabase();

  const cleanMachines = (saleInput.machines || []).map((m, idx) => ({
    id: m.id || `m_${idx + 1}`,
    name: m.name?.trim() || `Machine ${idx + 1}`,
    amount: Number(m.amount) || 0,
  }));

  const total_sale = cleanMachines.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const today_online = Number(saleInput.today_online) || 0;
  const cash_amount = Number(saleInput.cash_amount) || 0;
  const ajj_ka_kharcha = Number(saleInput.ajj_ka_kharcha) || 0;
  const ajj_ka_counter_balance = Number(saleInput.ajj_ka_counter_balance) || 0;
  const mistaken_bill = Number(saleInput.mistaken_bill) || 0;
  const fatte_note = Number(saleInput.fatte_note) || 0;

  const counter_total =
    today_online +
    cash_amount +
    ajj_ka_kharcha +
    ajj_ka_counter_balance +
    mistaken_bill +
    fatte_note;

  const result_balance = counter_total - total_sale;

  const jsonMeta = JSON.stringify({
    __type: 'CASHIER_SALE_V1',
    machines: cleanMachines,
    total_sale,
    today_online,
    cash_amount,
    ajj_ka_kharcha,
    ajj_ka_counter_balance,
    mistaken_bill,
    fatte_note,
    counter_total,
    result_balance,
    cashier_username: saleInput.cashier_username,
    cashier_name: saleInput.cashier_name,
  });

  let targetCloudId: string | null = isValidUuid(saleInput.id) ? saleInput.id! : null;
  if (!targetCloudId) {
    const { data: existingRow, error: findErr } = await supabase
      .from('purchases')
      .select('id')
      .eq('product_name', SYSTEM_CASHIER_SALE_ITEM_NAME)
      .eq('branch_id', saleInput.branch_id)
      .eq('date', saleInput.date)
      .maybeSingle();

    if (findErr) {
      handleSupabaseError(findErr, 'checking existing cashier sale');
    }
    if (existingRow?.id) {
      targetCloudId = existingRow.id;
    }
  }

  const payload: any = {
    branch_id: saleInput.branch_id,
    product_name: SYSTEM_CASHIER_SALE_ITEM_NAME,
    amount: total_sale,
    quantity: String(counter_total),
    date: saleInput.date,
    comment: jsonMeta,
    created_by_name: saleInput.cashier_name || saleInput.cashier_username,
  };

  let savedRow: any = null;
  if (targetCloudId) {
    const { data, error } = await supabase
      .from('purchases')
      .update(payload)
      .eq('id', targetCloudId)
      .select('*, branches(name)')
      .single();
    if (error || !data) {
      handleSupabaseError(error || new Error('Failed to update cashier sale'), 'updating cashier sale');
    }
    savedRow = data;
  } else {
    const { data, error } = await supabase
      .from('purchases')
      .insert([payload])
      .select('*, branches(name)')
      .single();
    if (error || !data) {
      handleSupabaseError(error || new Error('Failed to save cashier sale'), 'saving cashier sale');
    }
    savedRow = data;
  }

  invalidateQueryCache('cashier_sales_');
  const parsed = parseCashierRowFromPurchase(savedRow, saleInput.branch_name);
  if (!parsed) {
    throw new Error('Database Error: Invalid cashier sale record returned from database.');
  }
  return parsed;
}

export async function deleteCashierSale(id: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleting cashier sale');
  }
  invalidateQueryCache('cashier_sales_');
  return true;
}
