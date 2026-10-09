export type UserRole = 'admin' | 'branch_manager' | 'cashier';

export interface Branch {
  id: string;
  name: string;
  code: string;
  phone: string;
  address: string;
  created_at?: string;
}

export interface BranchManager {
  id: string;
  branch_id: string;
  name: string;
  phone: string;
  address: string;
  username: string;
  password?: string;
  role?: 'branch_manager' | 'cashier';
  created_at?: string;
  branch_name?: string;
}

export interface Employee {
  id: string;
  employee_id_code: string;
  branch_id: string;
  name: string;
  phone: string;
  address: string;
  daily_salary: number;
  designation: string;
  status: 'active' | 'inactive';
  created_at?: string;
  branch_name?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  branch_id: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  daily_rate?: number; // Snapshot of employee's daily salary rate on this specific date
  notes?: string;
  marked_by?: string;
  created_at?: string;
}

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque';

export interface PaymentRecord {
  id: string;
  employee_id: string;
  branch_id: string;
  amount: number;
  payment_date: string; // YYYY-MM-DD
  payment_mode: PaymentMode;
  notes?: string;
  is_bonus?: boolean;
  bonus_type?: 'paid' | 'award'; // 'paid' = bonus paid out immediately; 'award' = bonus added to salary payable
  created_at?: string;
  employee_name?: string;
}

export interface UserSession {
  role: UserRole;
  username: string;
  name: string;
  branch_id?: string;
  branch_name?: string;
  manager_id?: string;
}

export interface EmployeeMonthlyReport {
  employee: Employee;
  totalDaysInMonth: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  dailySalary: number;
  earnedSalary: number;
  bonusAmount: number;
  totalPayable: number; // earnedSalary + bonusAmount
  totalPaid: number;
  pendingSalary: number;
}

export interface MonthlySummary {
  monthYear: string; // 'YYYY-MM'
  totalEmployees: number;
  totalEarned: number;
  totalBonus: number;
  totalPaid: number;
  totalPending: number;
  totalPresentAttendance: number;
  totalAbsentAttendance: number;
}

export interface Item {
  id: string;
  name: string;
  category?: string;
  unit?: string; // e.g. "kg", "packet", "bag", "box", "liter", "piece"
  tax_rate?: number; // Default tax percentage for this item (e.g. 7)
  created_at?: string;
}

export interface PurchaseRecord {
  id: string;
  branch_id: string;
  branch_name?: string;
  item_id?: string;
  item_name: string;
  amount: number; // Total amount (Rate * Qty + Tax)
  unit_price?: number; // Price per unit
  quantity?: number; // Numeric quantity
  quantity_weight?: string; // e.g. "10 kg"
  tax_applied?: boolean;
  tax_percent?: number;
  tax_amount?: number;
  subtotal?: number;
  date: string; // YYYY-MM-DD
  comment?: string;
  created_by: string; // username
  created_at?: string;
}

export interface PurchaseSummary {
  todayTotal: number;
  monthTotal: number;
  totalCount: number;
}

export interface MachineSaleEntry {
  id: string;
  name: string; // e.g. "Machine 1", "Machine 2"
  amount: number;
}

export interface CashierSaleRecord {
  id: string;
  branch_id: string;
  branch_name?: string;
  date: string; // YYYY-MM-DD
  machines: MachineSaleEntry[];
  total_sale: number; // Sum of machines
  today_online: number; // Paytm, Google Pay, etc.
  cash_amount: number; // Cash
  ajj_ka_kharcha: number; // Today's Expense
  ajj_ka_counter_balance: number; // Today's Counter Balance
  mistaken_bill: number; // Mistaken Bill
  fatte_note: number; // Torn/Damaged Notes
  counter_total: number; // Sum of the 6 fields above
  result_balance: number; // counter_total - total_sale
  cashier_username: string;
  cashier_name: string;
  created_at?: string;
}
