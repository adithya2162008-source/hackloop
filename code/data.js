/**
 * VoltShare - Comprehensive Community EV Charging Database
 * Realistic Multi-City Community Hosts & Pricing Models
 */

const CITY_PRESETS = {
  bengaluru: { name: "Bengaluru, India", lat: 12.9716, lng: 77.5946, zoom: 13 },
  mumbai: { name: "Mumbai, India", lat: 19.0760, lng: 72.8777, zoom: 13 },
  delhi: { name: "Delhi NCR, India", lat: 28.6139, lng: 77.2090, zoom: 13 },
  london: { name: "London, UK", lat: 51.5074, lng: -0.1278, zoom: 13 },
  sanfrancisco: { name: "San Francisco, USA", lat: 37.7749, lng: -122.4194, zoom: 13 }
};

const INITIAL_CHARGERS = [
  {
    id: "ch-01",
    title: "GreenHaven Solar Wallbox",
    hostName: "Marcus Vance",
    hostAvatar: "👨‍💼",
    hostRating: 4.9,
    hostReviewsCount: 42,
    isVerifiedHost: true,
    address: "42 Willow Creek Lane, Indiranagar",
    city: "bengaluru",
    lat: 12.9716 + 0.005,
    lng: 77.5946 + 0.004,
    offsetKm: { lat: 0.005, lng: 0.004 },
    connectorType: "Type 2 (AC)",
    powerKw: 11.0,
    voltage: 230,
    currentAmps: 16,
    ratePerKwhINR: 14.50,
    offPeakRateINR: 11.50,
    offPeakHours: "11:00 PM - 6:00 AM",
    parkingType: "Private Covered Driveway",
    accessHours: "6:00 AM - 11:00 PM",
    availability: "available",
    solarPowered: true,
    solarCapacityKw: 15,
    amenities: ["Rooftop Solar", "High-Speed WiFi", "CCTV Security", "Restroom Access", "Covered Shade"],
    notes: "Powered by 15kW rooftop solar panels. Fast & green energy! Gate is automatic, ring intercom for buzzer entry.",
    totalSessions: 168,
    efficiencyScore: "99%",
    reviews: [
      { user: "Rohan K.", rating: 5, date: "2 days ago", comment: "Super smooth charging! Host offered fresh water while waiting." },
      { user: "Sneha M.", rating: 5, date: "1 week ago", comment: "Great 11kW speed on my Nexon EV. Clean shaded parking." }
    ]
  },
  {
    id: "ch-02",
    title: "Skyline Residences HyperCharge Bay #4",
    hostName: "Priya Sharma",
    hostAvatar: "👩‍💼",
    hostRating: 4.8,
    hostReviewsCount: 56,
    isVerifiedHost: true,
    address: "Tower B, Horizon Heights, Koramangala",
    city: "bengaluru",
    lat: 12.9716 - 0.004,
    lng: 77.5946 + 0.007,
    offsetKm: { lat: -0.004, lng: 0.007 },
    connectorType: "CCS2 (Fast DC)",
    powerKw: 30.0,
    voltage: 400,
    currentAmps: 75,
    ratePerKwhINR: 21.00,
    offPeakRateINR: 18.00,
    offPeakHours: "10:00 PM - 5:00 AM",
    parkingType: "Basement Parking B2 (Bay #4)",
    accessHours: "24/7 Access",
    availability: "available",
    solarPowered: false,
    amenities: ["24/7 Security Guard", "CCTV Surveillance", "Elevator Access", "Air Hose"],
    notes: "High speed DC fast charger. Show booking confirmation at the main entrance gate for immediate visitor pass.",
    totalSessions: 342,
    efficiencyScore: "99%",
    reviews: [
      { user: "Vikram P.", rating: 5, date: "Yesterday", comment: "Topped up 25kWh in under 45 minutes. Super reliable!" }
    ]
  },
  {
    id: "ch-03",
    title: "UrbanNest Tesla Wall Connector",
    hostName: "Alexandre Dupont",
    hostAvatar: "🧔",
    hostRating: 5.0,
    hostReviewsCount: 31,
    isVerifiedHost: true,
    address: "18 Orchard Boulevard, Lavelle Road",
    city: "bengaluru",
    lat: 12.9716 + 0.008,
    lng: 77.5946 - 0.006,
    offsetKm: { lat: 0.008, lng: -0.006 },
    connectorType: "NACS / Tesla",
    powerKw: 22.0,
    voltage: 400,
    currentAmps: 32,
    ratePerKwhINR: 17.50,
    offPeakRateINR: 14.00,
    offPeakHours: "12:00 AM - 6:00 AM",
    parkingType: "Front Garage & Driveway",
    accessHours: "7:00 AM - 11:00 PM",
    availability: "in-use",
    solarPowered: true,
    solarCapacityKw: 10,
    amenities: ["Tesla Gen 3 Wallbox", "J1772 Adapter", "Lounge Chairs", "Guest WiFi"],
    notes: "7.3m long cable. Fits all Tesla models and compatible J1772/Type 2 EVs with included adapter.",
    totalSessions: 110,
    efficiencyScore: "98%",
    reviews: [
      { user: "Karan D.", rating: 5, date: "3 days ago", comment: "Flawless Tesla Wallbox setup. Highly recommend Alexandre!" }
    ]
  },
  {
    id: "ch-04",
    title: "Oakwood 16A Overnight Plug Point",
    hostName: "David Miller",
    hostAvatar: "👨‍🌾",
    hostRating: 4.7,
    hostReviewsCount: 22,
    isVerifiedHost: false,
    address: "7 Silver Birch Way, Richmond Town",
    city: "bengaluru",
    lat: 12.9716 - 0.009,
    lng: 77.5946 - 0.003,
    offsetKm: { lat: -0.009, lng: -0.003 },
    connectorType: "16A Heavy Socket",
    powerKw: 3.3,
    voltage: 230,
    currentAmps: 16,
    ratePerKwhINR: 10.00,
    offPeakRateINR: 8.50,
    offPeakHours: "All Night",
    parkingType: "Gated Residential Courtyard",
    accessHours: "Overnight (8:00 PM - 8:00 AM)",
    availability: "available",
    solarPowered: false,
    amenities: ["Gated Safety", "Water Hose Available", "Budget Friendly"],
    notes: "Great budget option for 2-wheelers (Ather, Ola, Chetak) or overnight slow trickle car top-up. Bring your portable cable.",
    totalSessions: 84,
    efficiencyScore: "96%",
    reviews: [
      { user: "Aditya S.", rating: 5, date: "5 days ago", comment: "Charged my Ather 450X overnight for just ₹40. Super cheap!" }
    ]
  },
  {
    id: "ch-05",
    title: "CyberPlaza Tech Hub EV Bay #12",
    hostName: "Apex Tech Co-op",
    hostAvatar: "🏢",
    hostRating: 4.9,
    hostReviewsCount: 94,
    isVerifiedHost: true,
    address: "Building 3, Innovation Corridor, Outer Ring Road",
    city: "bengaluru",
    lat: 12.9716 + 0.012,
    lng: 77.5946 + 0.009,
    offsetKm: { lat: 0.012, lng: 0.009 },
    connectorType: "Type 2 (AC)",
    powerKw: 7.4,
    voltage: 230,
    currentAmps: 32,
    ratePerKwhINR: 13.50,
    offPeakRateINR: 10.50,
    offPeakHours: "8:00 PM - 7:00 AM",
    parkingType: "Tech Park Dedicated EV Bay",
    accessHours: "8:00 AM - 10:00 PM",
    availability: "available",
    solarPowered: true,
    solarCapacityKw: 50,
    amenities: ["Cafe Access", "High-Speed WiFi", "EV Tire Pressure Station", "Work Pods"],
    notes: "Shared community point by Apex Coworking. Enjoy coffee and fast internet in the lobby while your EV charges.",
    totalSessions: 460,
    efficiencyScore: "99%",
    reviews: [
      { user: "Meera T.", rating: 5, date: "Yesterday", comment: "Worked from the cafe while my car charged. Seamless!" }
    ]
  },
  {
    id: "ch-06",
    title: "Villa Solaria 22kW Fast Tri-Phase",
    hostName: "Dr. Ananya Ray",
    hostAvatar: "👩‍⚕️",
    hostRating: 5.0,
    hostReviewsCount: 18,
    isVerifiedHost: true,
    address: "14 Palm Grove Boulevard, HSR Layout",
    city: "bengaluru",
    lat: 12.9716 - 0.007,
    lng: 77.5946 - 0.008,
    offsetKm: { lat: -0.007, lng: -0.008 },
    connectorType: "Type 2 (AC)",
    powerKw: 22.0,
    voltage: 415,
    currentAmps: 32,
    ratePerKwhINR: 16.00,
    offPeakRateINR: 13.00,
    offPeakHours: "10:00 PM - 6:00 AM",
    parkingType: "Private Gated Garage",
    accessHours: "6:00 AM - 10:00 PM",
    availability: "available",
    solarPowered: true,
    solarCapacityKw: 20,
    amenities: ["Three-Phase 22kW", "Solar Powered", "Automatic Gate Entry", "CCTV"],
    notes: "High capacity 22kW AC charger. Delivers up to 100km range per hour on supported vehicles.",
    totalSessions: 95,
    efficiencyScore: "100%",
    reviews: [
      { user: "Rajiv M.", rating: 5, date: "4 days ago", comment: "22kW charging speed on my Audi e-tron was incredible!" }
    ]
  }
];

const CURRENCY_CONFIG = {
  INR: { symbol: "₹", name: "INR (₹)", rateMultiplier: 1.0, isDefault: true, code: "INR" },
  USD: { symbol: "$", name: "USD ($)", rateMultiplier: 0.012, isDefault: false, code: "USD" },
  EUR: { symbol: "€", name: "EUR (€)", rateMultiplier: 0.011, isDefault: false, code: "EUR" },
  GBP: { symbol: "£", name: "GBP (£)", rateMultiplier: 0.0095, isDefault: false, code: "GBP" }
};

// Google Maps Night Theme Style Definition
const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#021019" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "transit.line", elementType: "geometry.fill", stylers: [{ color: "#283d6a" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#3a4762" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] }
];

if (typeof window !== 'undefined') {
  window.CITY_PRESETS = CITY_PRESETS;
  window.INITIAL_CHARGERS = INITIAL_CHARGERS;
  window.CURRENCY_CONFIG = CURRENCY_CONFIG;
  window.GOOGLE_MAPS_DARK_STYLE = GOOGLE_MAPS_DARK_STYLE;
}
