-- ==============================================================================
-- KSM Pvt Ltd - Employee Attendance & Salary Management Database Schema
-- Run this in your Supabase project's SQL Editor (https://supabase.com)
-- 100% Free PostgreSQL Cloud Database
-- ==============================================================================

-- 1. Create Branches Table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Branch Managers Table
CREATE TABLE IF NOT EXISTS public.managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Employees Table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id_code TEXT NOT NULL,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    daily_salary NUMERIC(10,2) NOT NULL DEFAULT 500.00,
    designation TEXT DEFAULT 'Staff',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half_day')),
    daily_rate NUMERIC(10,2),
    notes TEXT,
    marked_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

-- Ensure column exists if table already created
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10,2);

-- 5. Create Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode TEXT DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer', 'cheque')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create App Settings Table (Global Admin Settings like Default Tax %)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES ('default_tax_rate', '7')
ON CONFLICT (key) DO NOTHING;

-- 7. Create Items Master Table (Managed by Admin)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    unit TEXT DEFAULT 'kg',
    tax_rate NUMERIC(5,2) DEFAULT 7.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 7.00;

-- 8. Create Purchases Table (Admin & Branch Managers)
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12,2),
    quantity TEXT,
    subtotal NUMERIC(12,2),
    tax_applied BOOLEAN DEFAULT false,
    tax_percent NUMERIC(5,2) DEFAULT 0.00,
    tax_amount NUMERIC(12,2) DEFAULT 0.00,
    comment TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_name TEXT,
    created_by_role TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure column compatibility if table was created previously with alternative column names
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='product_name') THEN
        ALTER TABLE public.purchases ADD COLUMN product_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='item_name') THEN
        ALTER TABLE public.purchases ADD COLUMN item_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='quantity') THEN
        ALTER TABLE public.purchases ADD COLUMN quantity TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='quantity_weight') THEN
        ALTER TABLE public.purchases ADD COLUMN quantity_weight TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='unit_price') THEN
        ALTER TABLE public.purchases ADD COLUMN unit_price NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='subtotal') THEN
        ALTER TABLE public.purchases ADD COLUMN subtotal NUMERIC(12,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='tax_applied') THEN
        ALTER TABLE public.purchases ADD COLUMN tax_applied BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='tax_percent') THEN
        ALTER TABLE public.purchases ADD COLUMN tax_percent NUMERIC(5,2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='tax_amount') THEN
        ALTER TABLE public.purchases ADD COLUMN tax_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='created_by_name') THEN
        ALTER TABLE public.purchases ADD COLUMN created_by_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='created_by') THEN
        ALTER TABLE public.purchases ADD COLUMN created_by TEXT;
    END IF;
END $$;

-- Create Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_employees_branch ON public.employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON public.attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON public.attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_employee ON public.payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_purchases_branch ON public.purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(date);
CREATE INDEX IF NOT EXISTS idx_items_name ON public.items(name);

-- Enable Row Level Security (RLS)
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Allow anon key full access for the mobile app
CREATE POLICY "Allow anon all on branches" ON public.branches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on managers" ON public.managers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on employees" ON public.employees FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on attendance" ON public.attendance FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on payments" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on app_settings" ON public.app_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on items" ON public.items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on purchases" ON public.purchases FOR ALL TO anon USING (true) WITH CHECK (true);

-- Optional: Allow authenticated role too
CREATE POLICY "Allow authenticated all on branches" ON public.branches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on managers" ON public.managers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on attendance" ON public.attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on app_settings" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on items" ON public.items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- Sample Initial Data (For quick testing)
-- ==============================================================================

DO $$
DECLARE
    b1_id UUID;
    b2_id UUID;
    e1_id UUID;
    e2_id UUID;
    e3_id UUID;
BEGIN
    -- Insert Branch 1
    INSERT INTO public.branches (name, code, phone, address)
    VALUES ('KSM Main Branch', 'BR-01', '+91 98765 43210', 'Plot 42, Industrial Area, Sector 5')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO b1_id;

    -- Insert Branch 2
    INSERT INTO public.branches (name, code, phone, address)
    VALUES ('KSM City Centre', 'BR-02', '+91 98765 12345', 'Unit 12, Market Square, Downtown')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO b2_id;

    -- Insert Branch Manager for Branch 1
    INSERT INTO public.managers (branch_id, name, phone, address, username, password)
    VALUES (b1_id, 'Vikram Sharma', '+91 98111 22233', 'Civil Lines, City', 'manager1', '123456')
    ON CONFLICT (username) DO NOTHING;

    -- Insert Branch Manager for Branch 2
    INSERT INTO public.managers (branch_id, name, phone, address, username, password)
    VALUES (b2_id, 'Rajesh Patel', '+91 98222 33344', 'Ring Road, City', 'manager2', '123456')
    ON CONFLICT (username) DO NOTHING;

    -- Insert Sample Employees for Branch 1
    INSERT INTO public.employees (employee_id_code, branch_id, name, phone, address, daily_salary, designation)
    VALUES ('EMP-101', b1_id, 'Amit Kumar', '+91 98333 44455', 'Sector 10', 650.00, 'Technician')
    RETURNING id INTO e1_id;

    INSERT INTO public.employees (employee_id_code, branch_id, name, phone, address, daily_salary, designation)
    VALUES ('EMP-102', b1_id, 'Suresh Singh', '+91 98444 55566', 'Model Town', 550.00, 'Machine Operator')
    RETURNING id INTO e2_id;

    -- Insert Sample Employee for Branch 2
    INSERT INTO public.employees (employee_id_code, branch_id, name, phone, address, daily_salary, designation)
    VALUES ('EMP-201', b2_id, 'Pooja Verma', '+91 98555 66677', 'Urban Estate', 700.00, 'Supervisor')
    RETURNING id INTO e3_id;

    -- Insert Today's Sample Attendance
    INSERT INTO public.attendance (employee_id, branch_id, date, status, daily_rate, notes, marked_by)
    VALUES 
        (e1_id, b1_id, CURRENT_DATE, 'present', 650.00, 'On time', 'Admin'),
        (e2_id, b1_id, CURRENT_DATE, 'present', 550.00, 'On time', 'Admin'),
        (e3_id, b2_id, CURRENT_DATE, 'half_day', 700.00, 'Morning shift', 'Admin')
    ON CONFLICT (employee_id, date) DO NOTHING;

    -- Insert Sample Items Master Catalog
    INSERT INTO public.items (name, category, unit)
    VALUES 
        ('Organic Fertilizer', 'Raw Materials', 'kg'),
        ('Tomato Seeds (Hybrid)', 'Seeds', 'packet'),
        ('Corrugated Packaging Boxes', 'Packaging', 'box'),
        ('Plant Booster Spray', 'Pesticides', 'liter'),
        ('Drip Irrigation Pipe 16mm', 'Equipment', 'meter')
    ON CONFLICT (name) DO NOTHING;

END $$;
