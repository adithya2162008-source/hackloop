# ⚡ VoltShare - Community EV Charging Network

[![Version](https://img.shields.io/badge/version-2.4.0-emerald.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android%20(Capacitor%20v6)-blue.svg)](capacitor.config.json)
[![Cloud Backend](https://img.shields.io/badge/backend-Supabase%20PostgreSQL%20%2B%20Firebase-06b6d4.svg)](config.js)
[![Hosting](https://img.shields.io/badge/hosted%20on-Firebase%20Hosting-orange.svg)](https://voltcharge-a5c69.web.app)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](package.json)

> **Powering Community EV Mobility**  
> A peer-to-peer mobile & web application enabling private property owners, societies, and commercial operators to share EV charging infrastructure with electric vehicle drivers across India.

---

## 🌐 Live Application & Mobile APK

- **Live Web App**: [https://voltcharge-a5c69.web.app](https://voltcharge-a5c69.web.app)
- **Pre-built Android APK**: [`VoltShare-app-debug.apk`](VoltShare-app-debug.apk) (Ready to install on Android devices)
- **Database Studio Manager**: [https://voltcharge-a5c69.web.app/db-admin](https://voltcharge-a5c69.web.app/db-admin) or local [`db-admin.html`](db-admin.html)

---

## 🌟 Key Application Features

### 🚗 EV Driver Experience
- **Live Radar & Interactive Map**: Discover nearby charging stations with real-time availability status (`Available` vs `In-Use`).
- **Multi-Connector Support**: Type 2 AC (3.3kW / 7.2kW / 11kW), CCS2 DC Fast (25kW - 60kW), CHAdeMO, and standard Indian 15A domestic sockets.
- **Bay Reservation Engine**: Lock in arrival time slots with a ₹30/hr reservation hold to prevent queueing.
- **Real-Time IoT Telemetry Meter**: Live simulated charging stream showing Voltage ($V$), Current ($A$), Power ($kW$), Energy delivered ($kWh$), Battery SOC ($0-100\%$), and cumulative $\text{CO}_2$ emissions avoided.
- **Turn-by-Turn Navigation HUD**: Instant distance, ETA, and routing overlays to selected charging bays.
- **In-App Wallet & Transparent Billing**: Exact formula billing (`kWh Consumed × Rate Applied + 5% Platform Fee`) with instant UPI, Google Pay, and Net Banking top-up simulations.

### 🏠 Charger Host Mode
- **One-Tap Persona Switch**: Seamlessly switch between EV Driver and Charger Host modes from the header.
- **Wallbox Status Control**: Toggle station availability (`Online` / `Maintenance` / `Private`) instantly.
- **Dynamic Tariff Management**: Set custom pricing per kWh and track real-time power delivery.
- **Host Earnings Ledger**: Live session tracking, daily revenue attribution, and withdrawal logs.

### 🗺️ Dual Map Engine
1. **Google Maps SDK with Dark Night Vector Theme**: High-precision vector tiles, custom emerald markers, terrain, and route polylines.
2. **OpenStreetMap / Leaflet Engine**: High-performance Dark Matter / Voyager light map tiles with zero API key requirement out-of-the-box.

### 🔐 Authentication & Cloud Sync
- **Native Android Google Sign-In**: Powered by `@codetrix-studio/capacitor-google-auth` for seamless one-tap Google Play Services account picker on Android devices.
- **Web Google Authentication**: Direct Firebase Auth popup/redirect flow for web users.
- **Dual Cloud Database Architecture**:
  - **Supabase PostgreSQL Cloud Server**: Authoritative backend storage for structured relational entities (`users`, `hosts`, `chargers`, `charging_sessions`, `transactions`, `reviews`, `telemetry_logs`, `reports`).
  - **Firebase Realtime Database Sync**: Multi-device state propagation across connected browsers and mobile clients.
  - **Offline-First Cache**: LocalStorage fallback to ensure active charge sessions and telemetry never drop during spotty network coverage.

---

## 📱 Android App (Capacitor v6 Native Build)

VoltShare is packaged as a high-performance native Android application using **Capacitor 6.2**.

### 🛠️ One-Click APK Compilation
To compile a fresh Android APK:

1. Double-click or run:
   ```cmd
   build-apk.bat
   ```
2. The automated script will:
   - Prepare clean web assets via `node scripts/prepare-www.js` (bundling `index.html` and excluding admin/landing pages).
   - Synchronize Android plugins and assets via `npx cap sync android`.
   - Generate adaptive launcher icons and splash screens.
   - Run Gradle debug compilation (`gradlew.bat assembleDebug`).
   - Copy the finished APK directly to `VoltShare-app-debug.apk` in the root folder.

### 📦 NPM Capacitor Scripts
You can also run individual tasks using npm:

```bash
# Prepare clean www bundle
npm run build:www

# Sync assets and native plugins
npm run cap:sync

# Build native Android debug APK
npm run cap:build

# Open Android Studio project
npm run cap:open
```

---

## 🚀 Quick Launch (Web Version)

### Option 1: Direct File Open
Simply double-click [`index.html`](index.html) in any modern browser (Google Chrome, Microsoft Edge, Firefox, Safari).

### Option 2: Local HTTP Server
Run a local static server to test Service Worker and PWA features:
```bash
# Using Node.js
npx serve .

# Or using Python
python -m http.server 8080
```
Then visit `http://localhost:8080`.

---

## ☁️ Deployment to Google Cloud / Firebase Hosting

VoltShare is deployed to Firebase Hosting (`voltcharge-a5c69`).

To deploy updates to the live site:
```cmd
deploy-to-google.bat
```
Or run directly via the Firebase CLI:
```bash
firebase deploy --only hosting
```

Live production URL: **[https://voltcharge-a5c69.web.app](https://voltcharge-a5c69.web.app)**

---

## ⚙️ Configuration (`config.js`)

All global settings, API keys, and cloud endpoints are centralized in [`config.js`](config.js):

```javascript
window.APP_CONFIG = {
  // Google Maps JavaScript API Key
  GOOGLE_MAPS_API_KEY: "AIzaSy...",

  // Default City & Currency
  DEFAULT_CITY: "bengaluru",
  DEFAULT_CURRENCY: "INR",
  PLATFORM_FEE_PERCENT: 5.0,
  APP_VERSION: "2.4.0",

  // Firebase Realtime DB & Auth Configuration
  FIREBASE: {
    apiKey: "AIzaSy...",
    authDomain: "voltcharge-a5c69.firebaseapp.com",
    databaseURL: "https://voltcharge-a5c69-default-rtdb.firebaseio.com",
    projectId: "voltcharge-a5c69",
    clientId: "731648245258-vavo5f3772962rsdknjgh3qho6rvmdfv.apps.googleusercontent.com"
  },

  // Supabase PostgreSQL Cloud Server
  SUPABASE: {
    ENABLED: true,
    URL: "https://gzsemckkimohwdazrkld.supabase.co",
    ANON_KEY: "sb_publishable_..."
  }
};
```

> **Google Maps API Key**: Can also be updated on the fly directly inside the app by clicking the Map Badge / Settings icon (`🗺️`).

---

## 🗄️ Database Architecture & Cloud Studio

VoltShare includes a built-in SQL database engine in [`db.js`](db.js) backed by PostgreSQL schemas in [`supabase_schema.sql`](supabase_schema.sql):

| Table | Description |
| :--- | :--- |
| `users` | Driver and host user profiles, wallet balances, auth identifiers |
| `hosts` | Verified host metadata, payout bank details, host ratings |
| `chargers` | Charger location coordinates, power output (kW), connector types, hourly rates |
| `charging_sessions` | Active and historical charge sessions with duration, kWh transferred, cost breakdown |
| `transactions` | Ledger entries for wallet top-ups, session payments, host payouts |
| `reviews` | Community driver reviews, 5-star ratings, and feedback |
| `telemetry_logs` | Real-time voltage ($V$), current ($A$), wattage ($kW$), and battery state logs |
| `reports` | Network health, charger issue reports, community audits |

### 🛠️ Cloud Database Studio
Open [`db-admin.html`](db-admin.html) to:
- Inspect and query all 8 relational tables.
- Execute custom SQL queries.
- Force bi-directional cloud push/pull sync.
- Monitor active database health and sync latency.

---

## 📁 Project Directory Structure

```text
community-ev-charge/
├── index.html                 # Primary application UI & entry point
├── styles.css                 # Master stylesheet (theme tokens, dark mode, animations)
├── app.js                     # Core application logic & UI controllers
├── db.js                      # SQL database engine & dual cloud sync layer
├── data.js                    # Seed data (stations, vehicles, initial community hosts)
├── config.js                  # Central configuration (Maps, Firebase, Supabase)
├── db-admin.html              # Cloud Database Studio & SQL inspector
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker for offline asset caching
├── VoltShare-app-debug.apk    # Pre-compiled native Android APK
├── build-apk.bat              # 1-Click Android APK build script
├── deploy-to-google.bat       # 1-Click Firebase Hosting deployment script
├── capacitor.config.json      # Capacitor native runtime configuration
├── firebase.json              # Firebase Hosting headers, routes, clean URLs
├── supabase_schema.sql        # Supabase PostgreSQL database schema
├── ev vehicle data/           # Reference EV battery datasets (2W, 4W, Luxury)
├── scripts/
│   ├── prepare-www.js         # Capacitor asset packager (isolates index.html)
│   ├── generate-android-icons.ps1  # Icon & splash screen generator
│   └── setup-android-sdk.ps1  # Android SDK environment setup script
└── android/                   # Native Android Studio project (Capacitor)
```

---

## 📄 License

This project is licensed under the **ISC License**. Developed by the VoltShare Team.
