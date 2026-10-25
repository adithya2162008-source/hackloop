-- ============================================================================
-- VoltShare Community EV Charging Network - SQL Relational Database Schema
-- Version: 3.0.0
-- Dialect: SQLite / PostgreSQL ANSI SQL Compatible
-- ============================================================================

-- 1. USERS & PERSONAL PROFILES TABLE
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(128) NOT NULL UNIQUE,
  full_name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) DEFAULT '+91 98765 43210',
  role_preference VARCHAR(20) DEFAULT 'driver', -- 'driver' | 'host' | 'both'
  ev_model VARCHAR(128) DEFAULT 'Tesla Model Y Performance',
  ev_battery_capacity_kwh REAL DEFAULT 75.0,
  ev_plate_number VARCHAR(32) DEFAULT '',
  wallet_balance DECIMAL(10,2) DEFAULT 1500.00,
  currency VARCHAR(8) DEFAULT 'INR',
  kyc_status VARCHAR(20) DEFAULT 'VERIFIED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. HOST PROFILES & SETTLEMENT DETAILS TABLE
CREATE TABLE IF NOT EXISTS hosts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  payout_upi_id VARCHAR(128) DEFAULT 'marcus.host@okhdfcbank',
  bank_account_no VARCHAR(64) DEFAULT '**** **** 8421',
  bank_ifsc VARCHAR(32) DEFAULT 'HDFC0001824',
  total_earnings DECIMAL(10,2) DEFAULT 2840.50,
  total_kwh_shared REAL DEFAULT 215.8,
  host_rating REAL DEFAULT 4.9,
  reviews_count INTEGER DEFAULT 42,
  is_verified BOOLEAN DEFAULT 1,
  is_online BOOLEAN DEFAULT 1,
  photos TEXT DEFAULT '[]', -- JSON array of host charger setup photos
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. CHARGERS & WALLBOX STATIONS TABLE
CREATE TABLE IF NOT EXISTS chargers (
  id VARCHAR(64) PRIMARY KEY,
  host_id VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(64) NOT NULL DEFAULT 'bengaluru',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  connector_type VARCHAR(64) NOT NULL DEFAULT 'Type 2 (AC)',
  power_kw REAL NOT NULL DEFAULT 11.0,
  voltage INTEGER DEFAULT 230,
  current_amps INTEGER DEFAULT 16,
  rate_per_kwh DECIMAL(10,2) NOT NULL DEFAULT 14.50,
  off_peak_rate DECIMAL(10,2) DEFAULT 11.50,
  off_peak_hours VARCHAR(64) DEFAULT '11:00 PM - 6:00 AM',
  parking_type VARCHAR(128) DEFAULT 'Private Covered Driveway',
  access_hours VARCHAR(64) DEFAULT '6:00 AM - 11:00 PM',
  availability_status VARCHAR(20) DEFAULT 'available', -- 'available' | 'in-use' | 'offline'
  is_solar_powered BOOLEAN DEFAULT 1,
  solar_capacity_kw REAL DEFAULT 15.0,
  amenities TEXT DEFAULT '["Rooftop Solar", "High-Speed WiFi", "CCTV Security", "Restroom Access", "Covered Shade"]',
  photos TEXT DEFAULT '[]', -- JSON array of charging station photos
  notes TEXT DEFAULT 'Powered by rooftop solar panels. Fast & green energy!',
  total_sessions INTEGER DEFAULT 168,
  efficiency_score VARCHAR(10) DEFAULT '99%',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
);

-- 4. CHARGING SESSIONS & REAL-TIME ENERGY TELEMETRY TABLE
CREATE TABLE IF NOT EXISTS charging_sessions (
  id VARCHAR(64) PRIMARY KEY,
  driver_id VARCHAR(64) NOT NULL,
  host_id VARCHAR(64) NOT NULL,
  charger_id VARCHAR(64) NOT NULL,
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  initial_soc INTEGER DEFAULT 34,
  final_soc INTEGER DEFAULT 80,
  target_limit_soc INTEGER DEFAULT 80,
  kwh_consumed REAL DEFAULT 0.00,
  rate_applied_per_kwh DECIMAL(10,2) NOT NULL,
  power_kw REAL DEFAULT 11.0,
  avg_voltage REAL DEFAULT 234.0,
  co2_saved_kg REAL DEFAULT 0.00,
  session_status VARCHAR(20) DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (host_id) REFERENCES hosts(id),
  FOREIGN KEY (charger_id) REFERENCES chargers(id)
);

-- 5. TRANSACTIONS & FINANCIAL LEDGER TABLE
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY, -- e.g. 'TXN-2026-1001'
  session_id VARCHAR(64),
  payer_user_id VARCHAR(64) NOT NULL,
  payee_host_id VARCHAR(64) NOT NULL,
  charger_id VARCHAR(64) NOT NULL,
  subtotal_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL, -- 5% network charge
  grand_total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'INR',
  payment_method VARCHAR(64) DEFAULT 'VoltShare Wallet',
  payment_status VARCHAR(20) DEFAULT 'SUCCESS', -- 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED'
  invoice_number VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'INV-VOLT-2026-8941'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES charging_sessions(id),
  FOREIGN KEY (payer_user_id) REFERENCES users(id),
  FOREIGN KEY (payee_host_id) REFERENCES hosts(id),
  FOREIGN KEY (charger_id) REFERENCES chargers(id)
);

-- 6. COMMUNITY REVIEWS & RATINGS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64),
  author_user_id VARCHAR(64) NOT NULL,
  target_host_id VARCHAR(64) NOT NULL,
  charger_id VARCHAR(64) NOT NULL,
  rating_stars INTEGER NOT NULL CHECK(rating_stars BETWEEN 1 AND 5),
  feedback_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_user_id) REFERENCES users(id),
  FOREIGN KEY (target_host_id) REFERENCES hosts(id),
  FOREIGN KEY (charger_id) REFERENCES chargers(id)
);

-- 7. TELEMETRY TIME-SERIES LOGS (High Frequency Meter Data)
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  voltage REAL,
  current_amps REAL,
  power_kw REAL,
  kwh_accumulated REAL,
  battery_soc INTEGER,
  FOREIGN KEY (session_id) REFERENCES charging_sessions(id) ON DELETE CASCADE
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_chargers_city ON chargers(city);
CREATE INDEX IF NOT EXISTS idx_chargers_host ON chargers(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_driver ON charging_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON charging_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payee ON transactions(payee_host_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
