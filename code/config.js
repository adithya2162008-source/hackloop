/**
 * VoltShare - Global Application Configuration
 * 
 * To use Google Maps in VoltShare:
 * 1. Obtain an API Key from Google Cloud Console (https://console.cloud.google.com/)
 * 2. Paste your API key below into GOOGLE_MAPS_API_KEY, or enter it inside the app using the Map Settings modal!
 */

window.APP_CONFIG = {
  // Google Maps JavaScript API Key (Optional - Leaflet OSM is used as default if empty)
  GOOGLE_MAPS_API_KEY: "AIzaSyBmYUnL2bsTYnllIfZLaypa1NHLf99EW8E",

  // Default App Settings
  DEFAULT_CITY: "bengaluru",
  DEFAULT_CURRENCY: "INR",
  
  // Platform settings
  PLATFORM_FEE_PERCENT: 5.0,
  APP_VERSION: "2.4.0"
};
