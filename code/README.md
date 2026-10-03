# ⚡ VoltShare - Community EV Charging Network

A peer-to-peer mobile & web application enabling private property owners to share home/commercial EV charging stations with EV drivers.

---

## 🚀 Quick Launch
Simply double click or open **[`index.html`](file:///d:/langchain%20updated/community-ev-charge/index.html)** in any modern web browser (Chrome, Edge, Firefox, Safari).

---

## 🗺️ Google Maps Integration & API Key Setup

VoltShare supports a **Dual Map Engine**:
1. **Google Maps SDK with Dark Night Vector Theme** (High-precision vectors, terrain, live markers, route polylines)
2. **OpenStreetMap Dark Matter Engine** (Pre-configured default with zero setup required)

### How to Add Your Google Maps API Key:

#### Option A: Direct In-App Setup (Easiest)
1. Open [`index.html`](file:///d:/langchain%20updated/community-ev-charge/index.html).
2. Tap the **Map Settings icon** (`🗺️`) or the **Map Badge** in the top bar.
3. Paste your Google Maps API Key (`AIza...`) and click **"Save & Enable Google Maps"**.
4. The app immediately connects to Google Maps SDK with the custom Dark Night styling!

#### Option B: In the Configuration File
Open [`config.js`](file:///d:/langchain%20updated/community-ev-charge/config.js) and paste your API key:
```javascript
window.APP_CONFIG = {
  GOOGLE_MAPS_API_KEY: "AIzaSyYourActualGoogleMapsApiKeyHere",
  DEFAULT_CITY: "bengaluru",
  DEFAULT_CURRENCY: "INR"
};
```

---

### 🔑 How to generate a free Google Maps API Key in 2 minutes:
1. Visit the [Google Cloud Console Credentials Page](https://console.cloud.google.com/google/maps-apis/credentials).
2. Create a project (or select an existing one).
3. Navigate to **APIs & Services &rarr; Library** and enable **"Maps JavaScript API"** and **"Places API"**.
4. Navigate to **Credentials &rarr; + Create Credentials &rarr; API Key**.
5. Copy the generated key starting with `AIza...` and paste it into VoltShare!

---

## 🌟 Key Application Features

- **⚡ High-Impact Animated Home / Landing Showcase**:
  - Interactive charging stage animation with particle conduit flux and simulated boost triggers.
  - Live community impact counters (kWh transferred, active hosts, CO₂ emissions avoided).
  - Interactive Host Earnings Calculator with customizable daily hours & kWh tariff sliders.
  - Clear navigation paths: Direct Login, Get Started, Host Onboarding, and 1-Click Demo Profiles.
- **🌓 Dual Theme Architecture (Dark & Light Mode)**:
  - Seamless toggle with instant persistence in `localStorage`.
  - Dynamic map tile switching between Dark Matter and Voyager Light (Leaflet) / Dark Night & Standard (Google Maps).
  - High-contrast, clean modern aesthetic across all cards, modals, dials, and telemetry gauges.
- **🎬 Animated Startup Splash**: Futuristic energy ring and telemetry calibration sequence using custom brand logo.
- **🔐 Auth & Dual Persona Workflow**:
  - **🚗 EV Driver Mode**: Live GPS radar, interactive station cards, 1-tap booking, turn-by-turn navigation HUD, real-time live telemetry meter ($V, A, kW, kWh$), and itemized digital receipts.
  - **🏠 Charger Host Mode**: Wallbox status switch (Online / Maintenance), live power output gauge, real-time session monitor, custom kWh tariff adjustment, and earnings payout ledger.
- **⚡ Exact kWh Billing Formula**:
  $$\text{Energy Subtotal} = \text{kWh Consumed} \times \text{Rate Applied per kWh}$$
  $$\text{Total Invoice} = \text{Energy Subtotal} + \text{Platform Network Fee (5\%) }$$
- **🌍 Multi-City & Multi-Currency Support**: Instant switching across Bengaluru (₹), Mumbai (₹), Delhi NCR (₹), London (£), and San Francisco ($).
