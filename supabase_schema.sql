-- ============================================================================
-- VoltShare Community EV Charging Network — Supabase PostgreSQL Schema
-- Dialect: PostgreSQL (Supabase Compatible)
-- Version: 3.1.0
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(128) NOT NULL UNIQUE,
  full_name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) DEFAULT '+91 98765 43210',
  role_preference VARCHAR(20) DEFAULT 'driver', -- 'driver' | 'host' | 'both'
  ev_model VARCHAR(128) DEFAULT 'Tesla Model Y Performance',
  ev_battery_capacity_kwh NUMERIC(6,2) DEFAULT 75.0,
  ev_plate_number VARCHAR(32) DEFAULT '',
  wallet_balance NUMERIC(10,2) DEFAULT 1500.00,
  currency VARCHAR(8) DEFAULT 'INR',
  kyc_status VARCHAR(20) DEFAULT 'VERIFIED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HOSTS TABLE
CREATE TABLE IF NOT EXISTS public.hosts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name VARCHAR(128) NOT NULL,
  payout_upi_id VARCHAR(128) DEFAULT 'marcus.host@okhdfcbank',
  bank_account_no VARCHAR(64) DEFAULT '**** **** 8421',
  bank_ifsc VARCHAR(32) DEFAULT 'HDFC0001824',
  total_earnings NUMERIC(10,2) DEFAULT 2840.50,
  total_kwh_shared NUMERIC(10,2) DEFAULT 215.8,
  host_rating NUMERIC(3,2) DEFAULT 4.9,
  reviews_count INTEGER DEFAULT 42,
  is_verified BOOLEAN DEFAULT TRUE,
  is_online BOOLEAN DEFAULT TRUE,
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CHARGERS TABLE
CREATE TABLE IF NOT EXISTS public.chargers (
  id VARCHAR(64) PRIMARY KEY,
  host_id VARCHAR(64) REFERENCES public.hosts(id) ON DELETE SET NULL,
  title VARCHAR(128) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(64) NOT NULL DEFAULT 'bengaluru',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  connector_type VARCHAR(64) NOT NULL DEFAULT 'Type 2 (AC)',
  power_kw NUMERIC(6,2) NOT NULL DEFAULT 11.0,
  voltage INTEGER DEFAULT 230,
  current_amps INTEGER DEFAULT 16,
  rate_per_kwh NUMERIC(10,2) NOT NULL DEFAULT 14.50,
  off_peak_rate NUMERIC(10,2) DEFAULT 11.50,
  off_peak_hours VARCHAR(64) DEFAULT '11:00 PM - 6:00 AM',
  parking_type VARCHAR(128) DEFAULT 'Private Covered Driveway',
  access_hours VARCHAR(64) DEFAULT '6:00 AM - 11:00 PM',
  availability_status VARCHAR(20) DEFAULT 'available', -- 'available' | 'in-use' | 'offline'
  is_solar_powered BOOLEAN DEFAULT TRUE,
  solar_capacity_kw NUMERIC(6,2) DEFAULT 15.0,
  amenities JSONB DEFAULT '["Rooftop Solar", "High-Speed WiFi", "CCTV Security", "Restroom Access", "Covered Shade"]'::jsonb,
  photos JSONB DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT 'Powered by rooftop solar panels. Fast & green energy!',
  total_sessions INTEGER DEFAULT 168,
  efficiency_score VARCHAR(10) DEFAULT '99%',
  is_company_station BOOLEAN DEFAULT FALSE,
  company_name VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CHARGING SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.charging_sessions (
  id VARCHAR(64) PRIMARY KEY,
  driver_id VARCHAR(64) NOT NULL REFERENCES public.users(id),
  host_id VARCHAR(64) REFERENCES public.hosts(id),
  charger_id VARCHAR(64) NOT NULL REFERENCES public.chargers(id),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  initial_soc INTEGER DEFAULT 34,
  final_soc INTEGER DEFAULT 80,
  target_limit_soc INTEGER DEFAULT 80,
  kwh_consumed NUMERIC(8,2) DEFAULT 0.00,
  rate_applied_per_kwh NUMERIC(10,2) NOT NULL,
  power_kw NUMERIC(6,2) DEFAULT 11.0,
  avg_voltage NUMERIC(6,2) DEFAULT 234.0,
  co2_saved_kg NUMERIC(8,2) DEFAULT 0.00,
  session_status VARCHAR(20) DEFAULT 'active' -- 'active' | 'completed' | 'cancelled'
);

-- 5. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES public.charging_sessions(id),
  payer_user_id VARCHAR(64) NOT NULL REFERENCES public.users(id),
  payee_host_id VARCHAR(64) REFERENCES public.hosts(id),
  charger_id VARCHAR(64) NOT NULL REFERENCES public.chargers(id),
  subtotal_amount NUMERIC(10,2) NOT NULL,
  platform_fee_amount NUMERIC(10,2) NOT NULL,
  grand_total_amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'INR',
  payment_method VARCHAR(64) DEFAULT 'VoltShare Wallet',
  payment_status VARCHAR(20) DEFAULT 'SUCCESS',
  invoice_number VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.reviews (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES public.charging_sessions(id),
  author_user_id VARCHAR(64) NOT NULL REFERENCES public.users(id),
  target_host_id VARCHAR(64) REFERENCES public.hosts(id),
  charger_id VARCHAR(64) NOT NULL REFERENCES public.chargers(id),
  rating_stars INTEGER NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TELEMETRY LOGS (High Frequency Meter Data)
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES public.charging_sessions(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  voltage NUMERIC(6,2),
  current_amps NUMERIC(6,2),
  power_kw NUMERIC(6,2),
  kwh_accumulated NUMERIC(8,2),
  battery_soc INTEGER
);

-- 8. REPORTS TABLE (Host-filed session reports with optional proof media)
CREATE TABLE IF NOT EXISTS public.reports (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES public.charging_sessions(id) ON DELETE SET NULL,
  host_id VARCHAR(64) REFERENCES public.hosts(id) ON DELETE SET NULL,
  driver_name VARCHAR(128) DEFAULT '',
  charger_name VARCHAR(128) DEFAULT '',
  issue_text TEXT NOT NULL,
  proof_video_url TEXT DEFAULT NULL,  -- Supabase Storage public URL
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'resolved'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_chargers_city ON public.chargers(city);
CREATE INDEX IF NOT EXISTS idx_chargers_host ON public.chargers(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_driver ON public.charging_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON public.transactions(invoice_number);
CREATE INDEX IF NOT EXISTS idx_reports_host ON public.reports(host_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON public.reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

-- ENABLE ROW LEVEL SECURITY (RLS) WITH PUBLIC ACCESS POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Allow anon public read/write access for web demo
DROP POLICY IF EXISTS "Public users access" ON public.users;
CREATE POLICY "Public users access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public hosts access" ON public.hosts;
CREATE POLICY "Public hosts access" ON public.hosts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public chargers access" ON public.chargers;
CREATE POLICY "Public chargers access" ON public.chargers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public charging_sessions access" ON public.charging_sessions;
CREATE POLICY "Public charging_sessions access" ON public.charging_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public transactions access" ON public.transactions;
CREATE POLICY "Public transactions access" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public reviews access" ON public.reviews;
CREATE POLICY "Public reviews access" ON public.reviews FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public telemetry_logs access" ON public.telemetry_logs;
CREATE POLICY "Public telemetry_logs access" ON public.telemetry_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public reports access" ON public.reports;
CREATE POLICY "Public reports access" ON public.reports FOR ALL USING (true) WITH CHECK (true);

-- ENABLE REALTIME SUBSCRIPTIONS FOR LIVE MULTI-DEVICE REACTIVITY
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chargers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chargers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'charging_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.charging_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
END $$;

-- GRANT TABLE & SCHEMA PERMISSIONS
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;


-- ============================================================================
-- STORAGE BUCKETS & POLICIES
-- Run in Supabase SQL Editor (Dashboard -> SQL Editor):
-- ============================================================================

-- 1. 'charger-photos' for host station photos (allows viewing in Supabase Dashboard & App)
INSERT INTO storage.buckets (id, name, public)
VALUES ('charger-photos', 'charger-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public charger-photos upload" ON storage.objects;
CREATE POLICY "Public charger-photos upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'charger-photos');

DROP POLICY IF EXISTS "Public charger-photos read" ON storage.objects;
CREATE POLICY "Public charger-photos read" ON storage.objects
  FOR SELECT USING (bucket_id = 'charger-photos');

DROP POLICY IF EXISTS "Public charger-photos update" ON storage.objects;
CREATE POLICY "Public charger-photos update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'charger-photos');

DROP POLICY IF EXISTS "Public charger-photos delete" ON storage.objects;
CREATE POLICY "Public charger-photos delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'charger-photos');

-- 2. 'report-proofs' for video/image proof uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-proofs', 'report-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public report-proofs upload" ON storage.objects;
CREATE POLICY "Public report-proofs upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'report-proofs');

DROP POLICY IF EXISTS "Public report-proofs read" ON storage.objects;
CREATE POLICY "Public report-proofs read" ON storage.objects
  FOR SELECT USING (bucket_id = 'report-proofs');
-- ============================================================================
