/**
 * VoltShare - Global Application Configuration
 * 
 * To use Google Maps in VoltShare:
 * 1. Obtain an API Key from Google Cloud Console (https://console.cloud.google.com/)
 * 2. Paste your API key below into GOOGLE_MAPS_API_KEY, or enter it inside the app using the Map Settings modal!
 */

window.APP_CONFIG = {
  // Google Maps JavaScript API Key
  GOOGLE_MAPS_API_KEY: "AIzaSyB-GK6yvilCw0PnA0fOnSs_7l3b_v1dUBc",

  // Default App Settings
  DEFAULT_CITY: "bengaluru",
  DEFAULT_CURRENCY: "INR",
  
  // Platform settings
  PLATFORM_FEE_PERCENT: 5.0,
  APP_VERSION: "2.4.0",

  // Cloud Database Internet Synchronization Settings
  // Enables real-time cross-device sync over the Internet
  CLOUD_SYNC: {
    ENABLED: true,
    // Internet Cloud DB Endpoint URL (Firebase Realtime Database REST Endpoint)
    SYNC_URL: "https://voltcharge-a5c69-default-rtdb.firebaseio.com/voltshare.json",
    API_KEY: "AIzaSyBKom1onJ3XsQjcjIJYPROFS1dWK6XGTBo",
    POLL_INTERVAL_MS: 0 // Sync on startup, window focus, user action, and write events without auto-refresh loop
  },

  // Firebase Configuration & Google Authentication
  FIREBASE: {
    apiKey: "AIzaSyBKom1onJ3XsQjcjIJYPROFS1dWK6XGTBo",
    authDomain: "voltcharge-a5c69.firebaseapp.com",
    databaseURL: "https://voltcharge-a5c69-default-rtdb.firebaseio.com",
    projectId: "voltcharge-a5c69",
    storageBucket: "voltcharge-a5c69.firebasestorage.app",
    appId: "1:731648245258:web:d6e46a54e80715785069f3",
    measurementId: "G-3YJ72K9TEJ",
    clientId: "731648245258-vavo5f3772962rsdknjgh3qho6rvmdfv.apps.googleusercontent.com"
  },

  // Supabase PostgreSQL Cloud Database Configuration
  SUPABASE: {
    ENABLED: true,
    URL: "https://gzsemckkimohwdazrkld.supabase.co",
    ANON_KEY: "sb_publishable_8mwiGcffh1HzZyZIVBBUWg_uUZP_Le5"
  }
};



