/**
 * VoltShare - Community EV Charging Network
 * Full-Featured Application Controller & Engine
 * Supports Authentication, Dynamic Roles (Driver vs Host), and Live Metering
 */

class VoltShareApp {
  constructor() {
    const defaultData = window.INITIAL_CHARGERS || [];
    this.chargers = JSON.parse(localStorage.getItem('voltshare_chargers')) || [...defaultData];
    this.currentCurrency = localStorage.getItem('voltshare_currency') || 'INR';
    this.currentCity = localStorage.getItem('voltshare_city') || 'bengaluru';
    
    // Theme State ('dark' | 'light')
    this.currentTheme = localStorage.getItem('voltshare_theme') || 'dark';
    
    // Auth & Role State
    this.currentUser = JSON.parse(localStorage.getItem('voltshare_user')) || null;
    this.userRole = localStorage.getItem('voltshare_role') || null; // 'driver' | 'host'
    
    // User GPS Location & City Hub
    const cityData = (window.CITY_PRESETS && window.CITY_PRESETS[this.currentCity]) || { lat: 12.9716, lng: 77.5946, name: "Bengaluru, India" };
    this.userLocation = { lat: cityData.lat, lng: cityData.lng, name: cityData.name };
    
    this.selectedCharger = null;
    this.activeFilter = 'all';
    this.searchQuery = '';
    
    // Active Charging Session State
    this.chargingSession = JSON.parse(localStorage.getItem('voltshare_active_session')) || null;
    this.sessionInterval = null;
    this.chargeTargetLimit = 80;
    
    // Wallet & Host State
    this.walletBalance = parseFloat(localStorage.getItem('voltshare_wallet_balance')) || 1500.00;
    this.hostEarnings = parseFloat(localStorage.getItem('voltshare_host_earnings')) || 2840.50;
    this.hostTotalKwh = parseFloat(localStorage.getItem('voltshare_host_kwh')) || 215.8;
    this.hostIsOnline = JSON.parse(localStorage.getItem('voltshare_host_online')) ?? true;

    // Dual Map Engine State (Google Maps + Leaflet Fallback)
    this.googleMapsApiKey = localStorage.getItem('voltshare_gmaps_key') || (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_MAPS_API_KEY) || '';
    this.mapEngine = this.googleMapsApiKey ? 'google' : 'leaflet';
    
    // Leaflet Instances
    this.map = null;
    this.leafletTileLayer = null;
    this.markersLayer = null;
    this.userMarker = null;
    this.routePolyline = null;
    
    // Google Maps Instances
    this.googleMap = null;
    this.googleMarkers = [];
    this.googleUserMarker = null;
    this.googleRoutePolyline = null;
    this.googleInfoWindow = null;
    
    this.isNavigating = false;

    this.init();
  }

  init() {
    this.initTheme();
    this.initEventListeners();
    this.initLandingPageInteractions();
    this.initMapEngine();
    this.detectUserLocation();
    this.renderNearbyList();
    this.updateHostDashboard();
    this.updateWalletUI();
    this.checkActiveSession();
    this.updateCurrencyUI();
    this.updateCityUI();
    this.runStartupSplash();
  }

  // =========================================================================
  // 0. Startup Splash & Navigation Flow
  // =========================================================================
  runStartupSplash(isReplay = false) {
    const splash = document.getElementById('appSplashScreen');
    const fill = document.getElementById('splashProgressFill');
    const percentEl = document.getElementById('splashPercentText');
    const statusMsg = document.getElementById('splashStatusMsg');
    const progressText = document.getElementById('splashProgressText');

    if (!splash || !fill || !percentEl) return;

    splash.classList.remove('fade-out');
    splash.style.display = 'flex';
    fill.style.width = '0%';
    percentEl.textContent = '0%';

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 14) + 8;
      if (progress > 100) progress = 100;

      fill.style.width = `${progress}%`;
      percentEl.textContent = `${progress}%`;

      if (progress < 30) {
        if (statusMsg) statusMsg.textContent = "Connecting to decentralized energy grid...";
        if (progressText) progressText.textContent = "INITIALIZING";
      } else if (progress < 65) {
        if (statusMsg) statusMsg.textContent = "Calibrating telemetry & kWh meters...";
        if (progressText) progressText.textContent = "SYNCING";
      } else if (progress < 95) {
        if (statusMsg) statusMsg.textContent = "Locating nearby community hosts...";
        if (progressText) progressText.textContent = "MAPPING";
      } else {
        if (statusMsg) statusMsg.textContent = "VoltShare Ready!";
        if (progressText) progressText.textContent = "CONNECTED";
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          splash.classList.add('fade-out');
          setTimeout(() => {
            splash.style.display = 'none';
            if (!isReplay) {
              // Always show rich Landing / Home page first
              this.showLandingPage();
            }
          }, 500);
        }, 300);
      }
    }, 60);
  }

  showLandingPage() {
    const landing = document.getElementById('appLandingScreen');
    const authScreen = document.getElementById('appAuthScreen');
    const roleScreen = document.getElementById('appRoleScreen');

    if (authScreen) authScreen.style.display = 'none';
    if (roleScreen) roleScreen.style.display = 'none';
    if (landing) {
      landing.style.display = 'flex';
      landing.classList.remove('fade-out');
    }
  }

  hideLandingPage() {
    const landing = document.getElementById('appLandingScreen');
    if (landing) {
      landing.classList.add('fade-out');
      setTimeout(() => {
        landing.style.display = 'none';
      }, 300);
    }
  }

  openAuthScreen() {
    this.hideLandingPage();
    const authScreen = document.getElementById('appAuthScreen');
    const roleScreen = document.getElementById('appRoleScreen');
    if (roleScreen) roleScreen.style.display = 'none';
    if (authScreen) {
      authScreen.style.display = 'flex';
      authScreen.classList.remove('fade-out');
    }
  }

  openRoleScreen() {
    this.hideLandingPage();
    const authScreen = document.getElementById('appAuthScreen');
    const roleScreen = document.getElementById('appRoleScreen');
    if (authScreen) authScreen.style.display = 'none';
    if (roleScreen) {
      roleScreen.style.display = 'flex';
      roleScreen.classList.remove('fade-out');
    }
  }

  evaluateAuthAndRoleState() {
    const landing = document.getElementById('appLandingScreen');
    const authScreen = document.getElementById('appAuthScreen');
    const roleScreen = document.getElementById('appRoleScreen');

    if (landing) landing.style.display = 'none';

    if (!this.currentUser) {
      if (authScreen) authScreen.style.display = 'flex';
      if (roleScreen) roleScreen.style.display = 'none';
    } else if (!this.userRole) {
      if (authScreen) authScreen.style.display = 'none';
      if (roleScreen) roleScreen.style.display = 'flex';
    } else {
      if (authScreen) authScreen.style.display = 'none';
      if (roleScreen) roleScreen.style.display = 'none';
      this.applyRoleInterface(this.userRole);
    }
  }

  loginUser(email, name = "EV Enthusiast") {
    this.currentUser = { email, name, loggedInAt: Date.now() };
    localStorage.setItem('voltshare_user', JSON.stringify(this.currentUser));

    // SQL DB: Upsert user record
    if (window.db) {
      const existingUser = window.db.getUser(email);
      const sqlUser = window.db.upsertUser({
        id: existingUser ? existingUser.id : `usr-${Date.now()}`,
        email: email,
        full_name: name,
        wallet_balance: existingUser ? existingUser.wallet_balance : 1500.00
      });
      this.walletBalance = parseFloat(sqlUser.wallet_balance);
      localStorage.setItem('voltshare_wallet_balance', this.walletBalance.toString());
      this.currentUser.sqlId = sqlUser.id;
    }

    const authScreen = document.getElementById('appAuthScreen');
    if (authScreen) authScreen.style.display = 'none';

    // Proceed to Role Selection
    const roleScreen = document.getElementById('appRoleScreen');
    if (roleScreen) roleScreen.style.display = 'flex';
  }

  selectRole(role) {
    this.userRole = role;
    localStorage.setItem('voltshare_role', role);

    const roleScreen = document.getElementById('appRoleScreen');
    if (roleScreen) roleScreen.style.display = 'none';

    this.applyRoleInterface(role);
    this.showToast(`✨ Switched to ${role === 'driver' ? 'EV Driver' : 'Charger Host'} Mode!`);
  }

  applyRoleInterface(role) {
    const rolePill = document.getElementById('headerRolePill');
    const roleIcon = document.getElementById('headerRoleIcon');
    const roleLabel = document.getElementById('headerRoleLabel');
    const bottomNav = document.getElementById('dynamicBottomNav');

    if (role === 'host') {
      if (rolePill) {
        rolePill.className = 'header-role-pill mode-host';
      }
      if (roleIcon) roleIcon.className = 'fa-solid fa-house-signal';
      if (roleLabel) roleLabel.textContent = 'Host Mode';

      // Render Host Bottom Navigation
      if (bottomNav) {
        bottomNav.innerHTML = `
          <button class="nav-item active" data-tab="tab-host-dashboard">
            <i class="fa-solid fa-chart-pie"></i>
            <span>Dashboard</span>
          </button>
          <button class="nav-item" data-tab="tab-host-inquiries">
            <i class="fa-solid fa-inbox"></i>
            <span>Inquiries</span>
          </button>
          <button class="nav-item" data-tab="tab-wallet">
            <i class="fa-solid fa-wallet"></i>
            <span>Wallet</span>
          </button>
          <button class="nav-item" data-tab="tab-profile">
            <i class="fa-solid fa-user-gear"></i>
            <span>Details</span>
          </button>
          <button class="nav-item" id="btnQuickSwitchToDriver">
            <i class="fa-solid fa-car-side" style="color: var(--accent-cyan);"></i>
            <span>Driver View</span>
          </button>
        `;
      }
      this.switchTab('tab-host-dashboard');
    } else {
      // Driver Mode
      if (rolePill) {
        rolePill.className = 'header-role-pill mode-driver';
      }
      if (roleIcon) roleIcon.className = 'fa-solid fa-car-side';
      if (roleLabel) roleLabel.textContent = 'Driver Mode';

      // Render Driver Bottom Navigation
      if (bottomNav) {
        bottomNav.innerHTML = `
          <button class="nav-item active" data-tab="tab-explore">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>Explore</span>
          </button>
          <button class="nav-item" data-tab="tab-charging">
            <span class="badge-active-dot" id="activeSessionDot" style="${this.chargingSession ? 'display: block;' : 'display: none;'}"></span>
            <i class="fa-solid fa-bolt"></i>
            <span>Charging</span>
          </button>
          <button class="nav-item" data-tab="tab-wallet">
            <i class="fa-solid fa-wallet"></i>
            <span>Wallet</span>
          </button>
          <button class="nav-item" data-tab="tab-profile">
            <i class="fa-solid fa-user-gear"></i>
            <span>Details</span>
          </button>
          <button class="nav-item" id="btnQuickSwitchToHost">
            <i class="fa-solid fa-house-signal" style="color: var(--accent-emerald);"></i>
            <span>Host Mode</span>
          </button>
        `;
      }
      this.switchTab('tab-explore');
    }

    this.attachDynamicNavEvents();
  }

  attachDynamicNavEvents() {
    document.querySelectorAll('.bottom-nav-bar .nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    const switchHostBtn = document.getElementById('btnQuickSwitchToHost');
    if (switchHostBtn) {
      switchHostBtn.addEventListener('click', () => this.selectRole('host'));
    }

    const switchDriverBtn = document.getElementById('btnQuickSwitchToDriver');
    if (switchDriverBtn) {
      switchDriverBtn.addEventListener('click', () => this.selectRole('driver'));
    }
  }

  logout() {
    this.currentUser = null;
    this.userRole = null;
    localStorage.removeItem('voltshare_user');
    localStorage.removeItem('voltshare_role');
    
    const roleModal = document.getElementById('roleSwitchModal');
    if (roleModal) roleModal.classList.remove('active');

    this.evaluateAuthAndRoleState();
    this.showToast("👋 Logged out successfully");
  }

  // =========================================================================
  // 1. Dual Map Engine (Google Maps SDK + Leaflet Fallback)
  // =========================================================================
  initMapEngine() {
    if (this.googleMapsApiKey) {
      this.loadGoogleMapsSdk(this.googleMapsApiKey)
        .then(() => {
          this.initGoogleMap();
          this.updateMapEngineUI('google');
        })
        .catch((err) => {
          console.warn("Could not load Google Maps SDK, falling back to Leaflet:", err.message);
          this.initLeafletMap();
          this.updateMapEngineUI('leaflet');
        });
    } else {
      this.initLeafletMap();
      this.updateMapEngineUI('leaflet');
    }
  }

  loadGoogleMapsSdk(apiKey) {
    return new Promise((resolve, reject) => {
      // Global callback triggered by Google if key is invalid or restricted to Android SDK
      window.gm_authFailure = () => {
        console.warn("Google Maps Auth Error: This API Key may be restricted to Android or lacks Maps JavaScript API permissions.");
        this.showToast("⚠️ Google Maps key restricted or invalid for Web. Switched to OpenStreetMap.");
        this.resetToLeafletMap();
      };

      if (window.google && window.google.maps) {
        return resolve(window.google.maps);
      }

      const existingScript = document.getElementById('googleMapsScriptTag');
      if (existingScript) existingScript.remove();

      const script = document.createElement('script');
      script.id = 'googleMapsScriptTag';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;

      const timeout = setTimeout(() => {
        reject(new Error("Google Maps script load timed out"));
      }, 8000);

      script.onload = () => {
        clearTimeout(timeout);
        if (window.google && window.google.maps) {
          resolve(window.google.maps);
        } else {
          reject(new Error("Google Maps object not found on window"));
        }
      };

      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load Google Maps script"));
      };

      document.head.appendChild(script);
    });
  }

  // =========================================================================
  // 0.5. Theme Engine (Dark vs Light Mode)
  // =========================================================================
  initTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.updateThemeUI();
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    this.showToast(newTheme === 'dark' ? '🌙 Dark Mode Activated' : '☀️ Light Mode Activated');
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('voltshare_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeUI();
    this.updateMapTheme();
  }

  updateThemeUI() {
    const isDark = this.currentTheme === 'dark';
    
    // Update all theme toggle icon buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isDark ? 'fa-solid fa-moon theme-icon-current' : 'fa-solid fa-sun theme-icon-current';
        icon.style.color = isDark ? '' : '#f59e0b';
      }
    });

    // Update modal elements
    const modalEmoji = document.getElementById('modalThemeEmoji');
    const modalTitle = document.getElementById('modalThemeTitle');
    const modalIcon = document.getElementById('modalThemeIcon');
    if (modalEmoji) modalEmoji.textContent = isDark ? '🌙' : '☀️';
    if (modalTitle) modalTitle.textContent = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    if (modalIcon) {
      modalIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      modalIcon.style.color = isDark ? '#f59e0b' : '#38bdf8';
    }
  }

  updateMapTheme() {
    const isDark = this.currentTheme === 'dark';
    if (this.mapEngine === 'leaflet' && this.map && typeof L !== 'undefined') {
      if (this.leafletTileLayer) {
        this.map.removeLayer(this.leafletTileLayer);
      }
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      this.leafletTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(this.map);
      this.updateMapEngineUI('leaflet');
    } else if (this.mapEngine === 'google' && this.googleMap && window.google) {
      this.googleMap.setOptions({
        styles: isDark ? (window.GOOGLE_MAPS_DARK_STYLE || []) : []
      });
      this.updateMapEngineUI('google');
    }
  }

  initLandingPageInteractions() {
    // Calculator
    const hoursSlider = document.getElementById('calcHoursSlider');
    const rateSlider = document.getElementById('calcRateSlider');
    const hoursLabel = document.getElementById('calcHoursLabel');
    const rateLabel = document.getElementById('calcRateLabel');
    const monthlyEarnings = document.getElementById('calcMonthlyEarnings');
    const kwhTotal = document.getElementById('calcKwhTotal');

    const updateCalc = () => {
      if (!hoursSlider || !rateSlider) return;
      const hours = parseInt(hoursSlider.value);
      const rate = parseFloat(rateSlider.value);
      if (hoursLabel) hoursLabel.textContent = `${hours} Hours/day`;
      if (rateLabel) rateLabel.textContent = this.formatCurrency(rate) + ' / kWh';

      // 11kW average wallbox power
      const dailyKwh = hours * 11.0;
      const monthlyKwh = dailyKwh * 30;
      const totalEarnings = monthlyKwh * rate;

      if (monthlyEarnings) monthlyEarnings.textContent = this.formatCurrency(totalEarnings);
      if (kwhTotal) kwhTotal.textContent = `~${Math.round(monthlyKwh).toLocaleString()} kWh delivered / month`;
    };

    if (hoursSlider) hoursSlider.addEventListener('input', updateCalc);
    if (rateSlider) rateSlider.addEventListener('input', updateCalc);

    // Interactive charging stage pulse on click
    const stage = document.getElementById('landingChargingStage');
    if (stage) {
      stage.addEventListener('click', () => {
        const powerEl = document.getElementById('simLivePower');
        const energyEl = document.getElementById('simLiveEnergy');
        const socEl = document.getElementById('simBatterySoc');

        const boostedPower = (11.0 + Math.random() * 11.0).toFixed(1);
        const boostedSoc = Math.min(100, Math.floor(84 + Math.random() * 12));
        if (powerEl) powerEl.textContent = `${boostedPower} kW`;
        if (energyEl) energyEl.textContent = `${(18.4 + Math.random() * 4).toFixed(1)} kWh`;
        if (socEl) socEl.textContent = `${boostedSoc}% • Fast Boost`;

        stage.style.transform = 'scale(0.98)';
        setTimeout(() => {
          stage.style.transform = '';
        }, 150);

        this.showToast('⚡ Energy Flux Surge! Telemetry synchronizing...');
      });
    }
  }

  initGoogleMap() {
    const googleContainer = document.getElementById('googleMapCanvas');
    const leafletContainer = document.getElementById('leafletMap');

    if (leafletContainer) leafletContainer.style.display = 'none';
    if (googleContainer) {
      googleContainer.style.display = 'block';
      this.mapEngine = 'google';

      const centerLatLng = { lat: this.userLocation.lat, lng: this.userLocation.lng };
      const isDark = this.currentTheme === 'dark';

      try {
        this.googleMap = new google.maps.Map(googleContainer, {
          center: centerLatLng,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: isDark ? (window.GOOGLE_MAPS_DARK_STYLE || []) : []
        });

        this.googleInfoWindow = new google.maps.InfoWindow();

        // Watchdog: If Google Maps fails to load tiles within 3s (e.g. Android restricted key), auto-fallback to Leaflet
        let tilesLoaded = false;
        google.maps.event.addListenerOnce(this.googleMap, 'tilesloaded', () => {
          tilesLoaded = true;
          this.updateMapEngineUI('google');
        });

        setTimeout(() => {
          if (!tilesLoaded && this.mapEngine === 'google') {
            console.warn("Google Maps tiles failed to load within timeout. Falling back to Leaflet OSM.");
            this.showToast("⚠️ Google key not authorized for Web. Switched to OpenStreetMap.");
            this.resetToLeafletMap();
          }
        }, 3000);

        this.updateMapUserMarker();
        this.renderMapMarkers();
      } catch (e) {
        console.error("Google Maps initialization failed:", e);
        this.resetToLeafletMap();
      }
    }
  }

  initLeafletMap() {
    const googleContainer = document.getElementById('googleMapCanvas');
    const leafletContainer = document.getElementById('leafletMap');

    if (googleContainer) googleContainer.style.display = 'none';
    if (leafletContainer) {
      leafletContainer.style.display = 'block';
      this.mapEngine = 'leaflet';

      if (!this.map && typeof L !== 'undefined') {
        this.map = L.map('leafletMap', {
          center: [this.userLocation.lat, this.userLocation.lng],
          zoom: 14,
          zoomControl: false
        });

        const isDark = this.currentTheme === 'dark';
        const tileUrl = isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

        this.leafletTileLayer = L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> OpenStreetMap',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(this.map);

        this.markersLayer = L.layerGroup().addTo(this.map);
      } else if (this.map) {
        this.map.setView([this.userLocation.lat, this.userLocation.lng], 14);
      }

      // Force size recalculation to prevent gray/empty map tiles
      setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 100);
      setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 350);

      this.updateMapUserMarker();
      this.renderMapMarkers();
      this.updateMapEngineUI('leaflet');
    }
  }

  updateMapEngineUI(engine) {
    const label = document.getElementById('mapEngineLabel');
    const badge = document.getElementById('mapEngineBadge');
    const isDark = this.currentTheme === 'dark';
    if (engine === 'google') {
      if (label) label.textContent = isDark ? 'Google Maps Dark' : 'Google Maps Light';
      if (badge) {
        badge.style.borderColor = 'rgba(6, 182, 212, 0.6)';
        badge.style.color = '#38bdf8';
      }
    } else {
      if (label) label.textContent = isDark ? 'OSM Dark Matter' : 'OSM Voyager Light';
      if (badge) {
        badge.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        badge.style.color = 'var(--text-secondary)';
      }
    }
  }

  saveGoogleMapsApiKey(key) {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      this.showToast("⚠️ Please enter a valid Google Maps API Key (e.g. AIzaSy...)");
      return;
    }

    this.showToast("🔄 Connecting to Google Maps SDK...");
    this.googleMapsApiKey = trimmed;
    localStorage.setItem('voltshare_gmaps_key', trimmed);

    this.loadGoogleMapsSdk(trimmed)
      .then(() => {
        this.initGoogleMap();
        this.updateMapEngineUI('google');
        const modal = document.getElementById('gmapsConfigModal');
        if (modal) modal.classList.remove('active');
        this.showToast("✨ Google Maps Dark Mode successfully enabled!");
      })
      .catch((err) => {
        console.error("Google Maps SDK load failed:", err);
        this.showToast("❌ Unable to load Google Maps with that key. Reverting to OSM.");
        this.resetToLeafletMap();
      });
  }

  resetToLeafletMap() {
    this.googleMapsApiKey = '';
    this.mapEngine = 'leaflet';
    localStorage.removeItem('voltshare_gmaps_key');
    const keyInput = document.getElementById('gmapsApiKeyInput');
    if (keyInput) keyInput.value = '';

    this.initLeafletMap();
    this.updateMapEngineUI('leaflet');
    const modal = document.getElementById('gmapsConfigModal');
    if (modal) modal.classList.remove('active');
    this.showToast("🗺️ Switched back to OpenStreetMap Dark Matter");
  }

  detectUserLocation() {
    const locateBtn = document.getElementById('btnLocateMe');
    if (locateBtn) locateBtn.classList.add('locate-active');

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.userLocation.lat = position.coords.latitude;
          this.userLocation.lng = position.coords.longitude;
          this.userLocation.name = "My Live GPS Location";

          this.reanchorChargersAroundUser();
          this.updateMapUserMarker();
          this.renderMapMarkers();
          this.renderNearbyList();
          this.showToast("📍 Exact GPS location detected!");
        },
        (error) => {
          console.warn("GPS fallback to city center:", error.message);
          this.reanchorChargersAroundUser();
          this.updateMapUserMarker();
          this.renderMapMarkers();
          this.renderNearbyList();
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      this.reanchorChargersAroundUser();
      this.updateMapUserMarker();
      this.renderMapMarkers();
      this.renderNearbyList();
    }
  }

  reanchorChargersAroundUser() {
    this.chargers.forEach((ch) => {
      if (ch.offsetKm) {
        ch.lat = this.userLocation.lat + ch.offsetKm.lat;
        ch.lng = this.userLocation.lng + ch.offsetKm.lng;
      }
    });
  }

  updateMapUserMarker() {
    // 1. Leaflet Engine
    if (this.mapEngine === 'leaflet' && this.map && typeof L !== 'undefined') {
      if (this.userMarker) {
        this.map.removeLayer(this.userMarker);
      }

      const userIcon = L.divIcon({
        className: 'custom-user-div-icon',
        html: `
          <div class="custom-ev-marker user-location-pin">
            <div class="marker-radar-ring"></div>
            <div class="marker-pin-body">🚗</div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      this.userMarker = L.marker([this.userLocation.lat, this.userLocation.lng], { icon: userIcon })
        .addTo(this.map)
        .bindPopup(`<b>Your Location</b><br>Scanning community hosts within 10 km`)
        .openPopup();

      this.map.flyTo([this.userLocation.lat, this.userLocation.lng], 14, { duration: 1.2 });
    }

    // 2. Google Maps Engine
    if (this.mapEngine === 'google' && this.googleMap && window.google) {
      if (this.googleUserMarker) {
        this.googleUserMarker.setMap(null);
      }

      const userPinSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="20" fill="rgba(6, 182, 212, 0.25)" stroke="#06b6d4" stroke-width="2"/>
          <circle cx="22" cy="22" r="14" fill="#06b6d4"/>
          <text x="22" y="27" text-anchor="middle" fill="#070a12" font-size="14" font-family="sans-serif">🚗</text>
        </svg>
      `)}`;

      this.googleUserMarker = new google.maps.Marker({
        position: { lat: this.userLocation.lat, lng: this.userLocation.lng },
        map: this.googleMap,
        title: "Your GPS Location",
        icon: {
          url: userPinSvg,
          scaledSize: new google.maps.Size(44, 44),
          anchor: new google.maps.Point(22, 22)
        }
      });

      this.googleMap.panTo({ lat: this.userLocation.lat, lng: this.userLocation.lng });
    }
  }

  renderMapMarkers() {
    const filtered = this.getFilteredChargers();

    // 1. Leaflet Engine Rendering
    if (this.mapEngine === 'leaflet' && this.map && this.markersLayer && typeof L !== 'undefined') {
      this.markersLayer.clearLayers();

      filtered.forEach(ch => {
        const isAvailable = ch.availability === 'available';
        const statusClass = isAvailable ? 'available' : 'in-use';
        const symbol = ch.connectorType.includes('CCS') ? '⚡' : ch.connectorType.includes('Tesla') ? '🔌' : '🔋';
        const rateFormatted = this.formatCurrency(this.getChargerRate(ch));

        const markerIcon = L.divIcon({
          className: 'custom-station-div-icon',
          html: `
            <div class="custom-ev-marker ${statusClass}" id="marker-${ch.id}">
              ${isAvailable ? '<div class="marker-radar-ring"></div>' : ''}
              <div class="marker-pin-body">${symbol}</div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const marker = L.marker([ch.lat, ch.lng], { icon: markerIcon }).addTo(this.markersLayer);

        const popupContent = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 180px; padding: 4px;">
            <h4 style="margin: 0 0 4px; font-weight: 800; color: #0f172a;">${ch.title}</h4>
            <p style="margin: 0 0 6px; font-size: 11px; color: #64748b;">${ch.address}</p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
              <span style="background: #10b98120; color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 12px;">
                ${rateFormatted}/kWh
              </span>
              <span style="font-size: 11px; font-weight: 700; color: #0284c7;">${ch.powerKw} kW</span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          this.selectCharger(ch);
        });
      });
    }

    // 2. Google Maps Engine Rendering
    if (this.mapEngine === 'google' && this.googleMap && window.google) {
      this.googleMarkers.forEach(m => m.setMap(null));
      this.googleMarkers = [];

      filtered.forEach(ch => {
        const isAvailable = ch.availability === 'available';
        const fillColor = isAvailable ? '#10b981' : '#f59e0b';
        const symbol = ch.connectorType.includes('CCS') ? '⚡' : ch.connectorType.includes('Tesla') ? '🔌' : '🔋';
        const rateFormatted = this.formatCurrency(this.getChargerRate(ch));

        const markerSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="${fillColor}" stroke="#070a12" stroke-width="3"/>
            <text x="22" y="27" text-anchor="middle" fill="#070a12" font-size="15" font-family="sans-serif" font-weight="bold">${symbol}</text>
          </svg>
        `)}`;

        const gMarker = new google.maps.Marker({
          position: { lat: ch.lat, lng: ch.lng },
          map: this.googleMap,
          title: ch.title,
          icon: {
            url: markerSvg,
            scaledSize: new google.maps.Size(44, 44),
            anchor: new google.maps.Point(22, 22)
          }
        });

        gMarker.addListener('click', () => {
          if (this.googleInfoWindow) {
            const infoHtml = `
              <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 180px; padding: 4px; color: #0f172a;">
                <h4 style="margin: 0 0 4px; font-weight: 800; font-size: 13px;">${ch.title}</h4>
                <p style="margin: 0 0 6px; font-size: 11px; color: #64748b;">${ch.address}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                  <span style="background: #10b98120; color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">
                    ${rateFormatted}/kWh
                  </span>
                  <span style="font-size: 11px; font-weight: 700; color: #0284c7;">${ch.powerKw} kW</span>
                </div>
              </div>
            `;
            this.googleInfoWindow.setContent(infoHtml);
            this.googleInfoWindow.open(this.googleMap, gMarker);
          }
          this.selectCharger(ch);
        });

        this.googleMarkers.push(gMarker);
      });
    }
  }

  // =========================================================================
  // 2. Calculations & Distance Helpers
  // =========================================================================
  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2);
  }

  getChargerRate(charger) {
    const cfg = (window.CURRENCY_CONFIG && window.CURRENCY_CONFIG[this.currentCurrency]) || { rateMultiplier: 1.0 };
    const inrRate = charger.ratePerKwhINR || 14.50;
    if (this.currentCurrency === 'INR') {
      return inrRate;
    }
    return inrRate * cfg.rateMultiplier;
  }

  formatCurrency(amount) {
    const cfg = (window.CURRENCY_CONFIG && window.CURRENCY_CONFIG[this.currentCurrency]) || { symbol: "₹" };
    return `${cfg.symbol}${parseFloat(amount).toFixed(2)}`;
  }

  getFilteredChargers() {
    return this.chargers.filter(ch => {
      const matchesSearch = !this.searchQuery || 
        ch.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        ch.address.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        ch.connectorType.toLowerCase().includes(this.searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (this.activeFilter === 'all') return true;
      if (this.activeFilter === 'available') return ch.availability === 'available';
      if (this.activeFilter === 'fast') return ch.powerKw >= 22.0;
      if (this.activeFilter === 'ac') return ch.powerKw < 22.0;
      if (this.activeFilter === 'solar') return ch.solarPowered === true;

      return true;
    });
  }

  // =========================================================================
  // 3. UI Rendering & Nearby List
  // =========================================================================
  renderNearbyList() {
    const listContainer = document.getElementById('nearbyStationsList');
    const countBadge = document.getElementById('stationCountBadge');
    if (!listContainer) return;

    const filtered = this.getFilteredChargers();

    filtered.sort((a, b) => {
      const distA = parseFloat(this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, a.lat, a.lng));
      const distB = parseFloat(this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, b.lat, b.lng));
      return distA - distB;
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} Stations Nearby`;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
          <i class="fa-solid fa-charging-station" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
          <p>No community stations match your active filter.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtered.map(ch => {
      const dist = this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, ch.lat, ch.lng);
      const rateFormatted = this.formatCurrency(this.getChargerRate(ch));
      const isSelected = this.selectedCharger && this.selectedCharger.id === ch.id;

      return `
        <div class="station-card ${isSelected ? 'highlighted' : ''}" data-id="${ch.id}">
          <div class="station-card-top">
            <div class="station-info-group">
              <div class="station-name">
                ${ch.title}
                ${ch.isVerifiedHost ? '<i class="fa-solid fa-circle-check verified-host-icon" title="Verified Host"></i>' : ''}
              </div>
              <div class="station-address">
                <i class="fa-solid fa-location-dot" style="margin-right: 4px; color: var(--accent-cyan);"></i>
                ${ch.address}
              </div>
            </div>
            <div class="station-badge-rate">
              <span class="rate-val">${rateFormatted}</span>
              <span class="rate-unit">per kWh</span>
            </div>
          </div>

          <div class="station-specs-row">
            <div class="spec-item">
              <i class="fa-solid fa-bolt" style="color: var(--accent-cyan);"></i>
              <span class="spec-power">${ch.powerKw} kW</span>
            </div>
            <div class="spec-item">
              <i class="fa-solid fa-plug" style="color: var(--text-muted);"></i>
              <span>${ch.connectorType}</span>
            </div>
            <div class="spec-item">
              <i class="fa-solid fa-route" style="color: var(--text-muted);"></i>
              <span>${dist} km</span>
            </div>
            <span class="status-indicator-badge status-${ch.availability}">
              ${ch.availability === 'in-use' ? 'In Use' : ch.availability}
            </span>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.station-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const charger = this.chargers.find(c => c.id === id);
        if (charger) {
          this.selectCharger(charger);
        }
      });
    });
  }

  selectCharger(charger) {
    this.selectedCharger = charger;
    this.renderNearbyList();

    if (this.mapEngine === 'leaflet' && this.map) {
      this.map.flyTo([charger.lat, charger.lng], 16, { duration: 0.8 });
    } else if (this.mapEngine === 'google' && this.googleMap && window.google) {
      this.googleMap.panTo({ lat: charger.lat, lng: charger.lng });
      this.googleMap.setZoom(16);
    }

    this.openChargerDetailModal(charger);
  }

  // =========================================================================
  // 4. Navigation & Turn-by-Turn Guidance
  // =========================================================================
  startTurnByTurnNavigation(charger) {
    this.isNavigating = true;

    const start = [this.userLocation.lat, this.userLocation.lng];
    const end = [charger.lat, charger.lng];
    const mid1 = [start[0] + (end[0] - start[0]) * 0.4 + 0.001, start[1] + (end[1] - start[1]) * 0.3];
    const mid2 = [start[0] + (end[0] - start[0]) * 0.7, start[1] + (end[1] - start[1]) * 0.8 + 0.001];

    // 1. Leaflet Route Polyline
    if (this.mapEngine === 'leaflet' && this.map && typeof L !== 'undefined') {
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }
      const latlngs = [start, mid1, mid2, end];
      this.routePolyline = L.polyline(latlngs, {
        color: '#10b981',
        weight: 5,
        opacity: 0.85,
        dashArray: '8, 8',
        lineCap: 'round'
      }).addTo(this.map);

      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });
    }

    // 2. Google Maps Route Polyline
    if (this.mapEngine === 'google' && this.googleMap && window.google) {
      if (this.googleRoutePolyline) {
        this.googleRoutePolyline.setMap(null);
      }
      const gPoints = [
        { lat: start[0], lng: start[1] },
        { lat: mid1[0], lng: mid1[1] },
        { lat: mid2[0], lng: mid2[1] },
        { lat: end[0], lng: end[1] }
      ];
      this.googleRoutePolyline = new google.maps.Polyline({
        path: gPoints,
        geodesic: true,
        strokeColor: '#10b981',
        strokeOpacity: 0.9,
        strokeWeight: 5
      });
      this.googleRoutePolyline.setMap(this.googleMap);

      const bounds = new google.maps.LatLngBounds();
      gPoints.forEach(p => bounds.extend(p));
      this.googleMap.fitBounds(bounds, 50);
    }

    const dist = this.calculateDistanceKm(start[0], start[1], end[0], end[1]);
    const etaMins = Math.max(2, Math.round(parseFloat(dist) * 3));

    const hud = document.getElementById('navGuidanceHud');
    if (hud) {
      hud.classList.add('active');
      document.getElementById('navNextTurn').textContent = `In 250m, Turn Right onto ${charger.address.split(',')[0]}`;
      document.getElementById('navEtaDetails').textContent = `ETA: ${etaMins} mins • ${dist} km remaining`;
    }

    const modal = document.getElementById('chargerDetailModal');
    if (modal) modal.classList.remove('active');

    this.showToast(`🧭 Navigation started to ${charger.title}`);
  }

  stopNavigation() {
    this.isNavigating = false;
    if (this.routePolyline && this.map) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    if (this.googleRoutePolyline) {
      this.googleRoutePolyline.setMap(null);
      this.googleRoutePolyline = null;
    }
    const hud = document.getElementById('navGuidanceHud');
    if (hud) hud.classList.remove('active');
    this.showToast("Navigation ended");
  }

  // =========================================================================
  // 5. Charger Detail Modal & Reviews
  // =========================================================================
  openChargerDetailModal(ch) {
    const modal = document.getElementById('chargerDetailModal');
    if (!modal) return;

    const dist = this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, ch.lat, ch.lng);
    const rateFormatted = this.formatCurrency(this.getChargerRate(ch));

    document.getElementById('modalStationTitle').textContent = ch.title;
    document.getElementById('modalHostName').textContent = ch.hostName;
    document.getElementById('modalHostAvatar').textContent = ch.hostAvatar || "👨‍💼";
    document.getElementById('modalHostRating').textContent = `${ch.hostRating} ★ (${ch.hostReviewsCount} reviews)`;
    document.getElementById('modalAddress').textContent = ch.address;
    document.getElementById('modalConnector').textContent = ch.connectorType;
    document.getElementById('modalPower').textContent = `${ch.powerKw} kW`;
    document.getElementById('modalParkingType').textContent = ch.parkingType;
    document.getElementById('modalAccessHours').textContent = ch.accessHours;
    document.getElementById('modalNotes').textContent = ch.notes || "No special host rules.";
    document.getElementById('modalRatePill').textContent = `${rateFormatted} / kWh`;
    document.getElementById('modalDistance').textContent = `${dist} km away`;

    const amenitiesContainer = document.getElementById('modalAmenities');
    if (amenitiesContainer) {
      amenitiesContainer.innerHTML = (ch.amenities || ['24/7 Security', 'Safe Parking']).map(a => `
        <span class="filter-pill" style="font-size: 0.7rem; pointer-events: none;">
          <i class="fa-solid fa-check" style="color: var(--accent-emerald);"></i> ${a}
        </span>
      `).join('');
    }

    const reviewsContainer = document.getElementById('modalReviewsList');
    if (reviewsContainer) {
      const revs = ch.reviews || [{ user: "Verified Driver", rating: 5, date: "3 days ago", comment: "Great charging speed & host!" }];
      reviewsContainer.innerHTML = revs.map(r => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 2px;">
            <strong style="color: var(--text-primary);">${r.user}</strong>
            <span style="color: var(--accent-amber);">${'★'.repeat(r.rating)}</span>
          </div>
          <p style="font-size: 0.72rem; color: var(--text-secondary); line-height: 1.3;">"${r.comment}"</p>
        </div>
      `).join('');
    }

    const startBtn = document.getElementById('btnStartChargeFromModal');
    if (startBtn) {
      if (ch.availability === 'in-use') {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Currently Occupied';
        startBtn.style.opacity = '0.5';
      } else {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Plug In & Start';
        startBtn.style.opacity = '1';
      }
    }

    modal.classList.add('active');
  }

  // =========================================================================
  // 6. Real-Time Charging Engine (kWh × Rate Formula)
  // =========================================================================
  startChargingSession(charger) {
    const modal = document.getElementById('chargerDetailModal');
    if (modal) modal.classList.remove('active');

    charger.availability = 'in-use';
    this.saveChargersState();
    this.renderMapMarkers();
    this.renderNearbyList();

    const rate = this.getChargerRate(charger);

    // SQL DB: Resolve host_id for this charger
    let hostId = 'host-marcus';
    if (window.db) {
      const dbCharger = window.db.tables.chargers.find(c => c.id === charger.id);
      if (dbCharger) hostId = dbCharger.host_id;
    }

    const sessionId = `sess-${Date.now()}`;
    this.chargingSession = {
      id: sessionId,
      chargerId: charger.id,
      chargerTitle: charger.title,
      hostName: charger.hostName,
      address: charger.address,
      powerKw: charger.powerKw,
      ratePerKwh: rate,
      currencyCode: this.currentCurrency,
      startTime: Date.now(),
      kwhConsumed: 0.00,
      currentCost: 0.00,
      socPercentage: 34,
      voltage: charger.voltage || 230.0,
      amperage: charger.currentAmps || 16.0,
      temperature: 28.5,
      hostId: hostId
    };

    // SQL DB: Create session record
    if (window.db) {
      const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';
      window.db.createSession({
        id: sessionId,
        driver_id: driverId,
        host_id: hostId,
        charger_id: charger.id,
        start_time: new Date().toISOString(),
        initial_soc: 34,
        target_limit_soc: this.chargeTargetLimit,
        rate_applied_per_kwh: rate,
        power_kw: charger.powerKw,
        avg_voltage: charger.voltage || 230.0
      });
    }

    localStorage.setItem('voltshare_active_session', JSON.stringify(this.chargingSession));

    this.switchTab('tab-charging');
    this.runChargingLoop();
    this.showToast(`⚡ Charging session started at ${charger.title}!`);
  }

  runChargingLoop() {
    if (this.sessionInterval) clearInterval(this.sessionInterval);

    const kwhPerSecond = (this.chargingSession.powerKw / 3600) * 12;

    this.sessionInterval = setInterval(() => {
      if (!this.chargingSession) {
        clearInterval(this.sessionInterval);
        return;
      }

      this.chargingSession.kwhConsumed += (kwhPerSecond * 0.5);
      this.chargingSession.currentCost = this.chargingSession.kwhConsumed * this.chargingSession.ratePerKwh;

      if (this.chargingSession.socPercentage < 100) {
        this.chargingSession.socPercentage = Math.min(100, (34 + (this.chargingSession.kwhConsumed / 50) * 100));
      }

      if (this.chargingSession.socPercentage >= this.chargeTargetLimit) {
        this.showToast(`🎯 Reached target limit of ${this.chargeTargetLimit}%! Auto-stopping session.`);
        this.stopChargingSession();
        return;
      }

      this.chargingSession.voltage = (230 + Math.random() * 5).toFixed(1);
      this.chargingSession.temperature = (28.5 + (this.chargingSession.kwhConsumed * 0.12)).toFixed(1);

      this.updateChargingScreenUI();
      localStorage.setItem('voltshare_active_session', JSON.stringify(this.chargingSession));
    }, 500);
  }

  updateChargingScreenUI() {
    const s = this.chargingSession;
    const activeView = document.getElementById('activeChargingView');
    const noActiveView = document.getElementById('noActiveChargingView');
    const dot = document.getElementById('activeSessionDot');

    if (!s) {
      if (activeView) activeView.style.display = 'none';
      if (noActiveView) noActiveView.style.display = 'flex';
      if (dot) dot.style.display = 'none';
      return;
    }

    if (activeView) activeView.style.display = 'flex';
    if (noActiveView) noActiveView.style.display = 'none';
    if (dot) dot.style.display = 'block';

    document.getElementById('liveKwhValue').textContent = s.kwhConsumed.toFixed(2);
    document.getElementById('liveSocValue').textContent = `${Math.round(s.socPercentage)}% Charged`;
    document.getElementById('liveCostValue').textContent = this.formatCurrency(s.currentCost);
    document.getElementById('livePowerValue').textContent = `${s.powerKw.toFixed(1)} kW`;
    document.getElementById('liveVoltageValue').textContent = `${s.voltage} V`;
    document.getElementById('liveStationName').textContent = s.chargerTitle;
    document.getElementById('liveRateLabel').textContent = `${this.formatCurrency(s.ratePerKwh)}/kWh`;

    document.getElementById('formulaKwhSpan').textContent = `${s.kwhConsumed.toFixed(2)} kWh`;
    document.getElementById('formulaRateSpan').textContent = this.formatCurrency(s.ratePerKwh);
    document.getElementById('formulaCostSpan').textContent = this.formatCurrency(s.currentCost);

    const gauge = document.getElementById('gaugeCircle');
    if (gauge) {
      const offset = 565 - (565 * (s.socPercentage / 100));
      gauge.style.strokeDashoffset = offset;
    }

    const elapsedSecs = Math.floor((Date.now() - s.startTime) / 1000);
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    document.getElementById('liveDuration').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  stopChargingSession() {
    if (!this.chargingSession) return;

    clearInterval(this.sessionInterval);

    const s = { ...this.chargingSession };
    const charger = this.chargers.find(c => c.id === s.chargerId);
    if (charger) {
      charger.availability = 'available';
      this.saveChargersState();
      this.renderMapMarkers();
      this.renderNearbyList();
    }

    const subtotal = parseFloat(s.currentCost.toFixed(2));
    const platformFee = parseFloat((subtotal * 0.05).toFixed(2));

    this.walletBalance = Math.max(0, this.walletBalance - (subtotal + platformFee));
    localStorage.setItem('voltshare_wallet_balance', this.walletBalance.toString());

    // SQL DB: Complete session, record transaction, deduct wallet
    if (window.db) {
      window.db.completeSession(s.id);
      const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';
      const txn = window.db.recordTransaction({
        session_id: s.id,
        payer_user_id: driverId,
        payee_host_id: s.hostId || 'host-marcus',
        charger_id: s.chargerId,
        subtotal_amount: subtotal,
        platform_fee_amount: platformFee,
        grand_total_amount: subtotal + platformFee,
        currency: s.currencyCode || 'INR',
        payment_method: 'VoltShare Wallet'
      });
      // Sync wallet balance to SQL DB
      window.db.updateUserWallet(driverId, this.walletBalance);
      // Update host totals from DB
      const host = window.db.tables.hosts.find(h => h.id === (s.hostId || 'host-marcus'));
      if (host) {
        this.hostEarnings = host.total_earnings;
        this.hostTotalKwh = host.total_kwh_shared;
      }
    } else {
      this.hostEarnings += subtotal;
      this.hostTotalKwh += s.kwhConsumed;
    }

    localStorage.setItem('voltshare_host_earnings', this.hostEarnings.toString());
    localStorage.setItem('voltshare_host_kwh', this.hostTotalKwh.toString());
    this.updateHostDashboard();
    this.updateWalletUI();
    this.renderTransactionHistory();

    this.chargingSession = null;
    localStorage.removeItem('voltshare_active_session');
    this.updateChargingScreenUI();

    this.openInvoiceModal(s);
  }

  openInvoiceModal(sessionData) {
    const modal = document.getElementById('invoiceModal');
    if (!modal) return;

    const kwh = sessionData.kwhConsumed.toFixed(2);
    const rate = this.formatCurrency(sessionData.ratePerKwh);
    const subtotal = sessionData.currentCost;
    const platformFee = parseFloat((subtotal * 0.05).toFixed(2));
    const total = parseFloat((subtotal + platformFee).toFixed(2));
    const co2Saved = (sessionData.kwhConsumed * 0.42).toFixed(2);

    // Generate invoice number from SQL DB or generate one
    let invoiceNum = `INV-VOLT-${Date.now().toString().slice(-6)}`;
    if (window.db && window.db.tables.transactions.length > 0) {
      invoiceNum = window.db.tables.transactions[0].invoice_number || invoiceNum;
    }

    document.getElementById('recStationName').textContent = sessionData.chargerTitle;
    document.getElementById('recHostName').textContent = sessionData.hostName;
    document.getElementById('recKwhConsumed').textContent = `${kwh} kWh`;
    document.getElementById('recRateApplied').textContent = `${rate} / kWh`;
    document.getElementById('recSubtotal').textContent = this.formatCurrency(subtotal);
    document.getElementById('recPlatformFee').textContent = this.formatCurrency(platformFee);
    document.getElementById('recGrandTotal').textContent = this.formatCurrency(total);
    document.getElementById('recCo2Saved').textContent = `${co2Saved} kg`;
    document.getElementById('recDate').textContent = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Add invoice number if element exists
    const invNumEl = document.getElementById('recInvoiceNumber');
    if (invNumEl) invNumEl.textContent = invoiceNum;

    modal.classList.add('active');
  }

  checkActiveSession() {
    if (this.chargingSession) {
      this.runChargingLoop();
    }
  }

  // =========================================================================
  // 7. Host Charger Management & New Listing Wizard
  // =========================================================================
  addNewHostCharger(formData) {
    const chargerId = `ch-host-${Date.now()}`;
    const lat = this.userLocation.lat + (Math.random() * 0.006 - 0.003);
    const lng = this.userLocation.lng + (Math.random() * 0.006 - 0.003);

    const newCharger = {
      id: chargerId,
      title: formData.title,
      hostName: formData.hostName || "Community Host",
      hostAvatar: "🏡",
      hostRating: 5.0,
      hostReviewsCount: 1,
      isVerifiedHost: true,
      address: formData.address,
      lat,
      lng,
      offsetKm: { lat: 0.004, lng: -0.004 },
      connectorType: formData.connectorType,
      powerKw: parseFloat(formData.powerKw),
      ratePerKwhINR: parseFloat(formData.ratePerKwh),
      parkingType: formData.parkingType,
      accessHours: formData.accessHours,
      availability: "available",
      solarPowered: formData.solarPowered,
      amenities: ['Private Dedicated Bay', 'Gated Access', 'CCTV Security'],
      notes: formData.notes,
      totalSessions: 0,
      efficiencyScore: "100%",
      reviews: []
    };

    // SQL DB: Persist charger to database
    if (window.db) {
      const hostId = (this.currentUser && window.db.getHostByUserId(this.currentUser.sqlId))?.id || 'host-marcus';
      window.db.insertCharger({
        id: chargerId,
        host_id: hostId,
        title: formData.title,
        address: formData.address,
        city: this.currentCity,
        lat, lng,
        connector_type: formData.connectorType,
        power_kw: parseFloat(formData.powerKw),
        rate_per_kwh: parseFloat(formData.ratePerKwh),
        parking_type: formData.parkingType,
        access_hours: formData.accessHours,
        is_solar_powered: formData.solarPowered,
        notes: formData.notes,
        amenities: ['Private Dedicated Bay', 'Gated Access', 'CCTV Security']
      });
    }

    this.chargers.unshift(newCharger);
    this.saveChargersState();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.updateHostDashboard();

    this.showToast(`🎉 Your private charger "${newCharger.title}" is now active & saved to SQL DB!`);
  }

  updateHostDashboard() {
    // SQL DB: Fetch fresh host data
    let earnings = this.hostEarnings;
    let kwh = this.hostTotalKwh;
    let reviewsCount = 42;
    let rating = 4.9;

    if (window.db && this.currentUser) {
      const userId = this.currentUser.sqlId || (window.db.tables.hosts[0]?.user_id);
      const host = window.db.tables.hosts.find(h => h.user_id === userId) || window.db.tables.hosts[0];
      if (host) {
        earnings = host.total_earnings;
        kwh = host.total_kwh_shared;
        reviewsCount = host.reviews_count;
        rating = host.host_rating;
        this.hostEarnings = earnings;
        this.hostTotalKwh = kwh;
      }
    }

    const earningsEl = document.getElementById('hostEarningsValue');
    const kwhEl = document.getElementById('hostKwhValue');
    const toggle = document.getElementById('hostOnlineToggle');

    if (earningsEl) earningsEl.textContent = this.formatCurrency(earnings);
    if (kwhEl) kwhEl.textContent = `${kwh.toFixed(1)} kWh`;
    if (toggle) toggle.checked = this.hostIsOnline;

    const hostList = document.getElementById('myHostedChargersList');
    if (hostList) {
      // Merge in-memory chargers with SQL DB chargers
      let myStations = this.chargers.filter(c => c.id.startsWith('ch-host-') || c.id === 'ch-01' || c.id === 'ch-02');
      if (window.db) {
        const userId = this.currentUser?.sqlId;
        const host = userId ? window.db.tables.hosts.find(h => h.user_id === userId) : window.db.tables.hosts[0];
        if (host) {
          const dbChargers = window.db.tables.chargers.filter(c => c.host_id === host.id);
          dbChargers.forEach(dc => {
            if (!myStations.find(c => c.id === dc.id)) {
              myStations.push({
                id: dc.id, title: dc.title, connectorType: dc.connector_type,
                powerKw: dc.power_kw, availability: dc.availability_status,
                ratePerKwhINR: dc.rate_per_kwh, totalSessions: dc.total_sessions
              });
            }
          });
        }
      }
      hostList.innerHTML = myStations.map(c => `
        <div class="my-station-card">
          <div class="my-station-toggle-row">
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 2px;">${c.title}</h4>
              <p style="font-size: 0.75rem; color: var(--text-muted);">${c.connectorType} • ${c.powerKw} kW</p>
            </div>
            <span class="status-indicator-badge status-${c.availability || c.availability_status || 'available'}">
              ${c.availability || c.availability_status || 'available'}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
            <span style="color: var(--accent-emerald-light); font-weight: 700;">
              ${this.formatCurrency(this.getChargerRate(c))} / kWh
            </span>
            <span style="color: var(--text-muted);">
              ${c.totalSessions || 0} sessions
            </span>
          </div>
        </div>
      `).join('');
    }
  }

  updateWalletUI() {
    // SQL DB: Get live wallet balance
    if (window.db && this.currentUser) {
      const userId = this.currentUser.sqlId;
      if (userId) {
        const u = window.db.getUser(userId);
        if (u) {
          this.walletBalance = parseFloat(u.wallet_balance);
          localStorage.setItem('voltshare_wallet_balance', this.walletBalance.toString());
        }
      }
    }
    const el = document.getElementById('walletBalanceDisplay');
    if (el) el.textContent = this.formatCurrency(this.walletBalance);
  }

  // =========================================================================
  // SQL Transaction History Renderer
  // =========================================================================
  renderTransactionHistory() {
    const container = document.getElementById('sqlTransactionsList');
    if (!container || !window.db) return;

    const userId = (this.currentUser && this.currentUser.sqlId) || null;
    const hostId = null; // Show all if no filter
    let txns;
    try {
      txns = window.db.getTransactionsWithDetails(userId, hostId);
    } catch (e) {
      txns = window.db.tables.transactions.slice(0, 20);
    }

    if (txns.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px 10px;color:var(--text-muted);">
          <i class="fa-solid fa-receipt" style="font-size:2rem;margin-bottom:10px;display:block;opacity:0.4;"></i>
          <p>No transactions yet. Complete a charging session to see your history here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = txns.map(t => {
      const date = new Date(t.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isPaid = t.payment_status === 'SUCCESS';
      const kwhText = t.kwh_consumed ? `${parseFloat(t.kwh_consumed).toFixed(2)} kWh` : 'N/A';
      return `
        <div class="station-card" style="cursor:default;">
          <div class="station-card-top">
            <div>
              <div class="station-name">${t.station_title || 'Charging Session'}</div>
              <div class="station-address" style="display:flex;flex-direction:column;gap:2px;">
                <span><i class="fa-solid fa-calendar-days" style="margin-right:4px;"></i>${date}</span>
                <span><i class="fa-solid fa-bolt" style="margin-right:4px;color:var(--accent-cyan);"></i>${kwhText} • ${t.payment_method}</span>
              </div>
            </div>
            <div class="station-badge-rate">
              <span class="rate-val" style="color:${isPaid ? 'var(--accent-emerald-light)' : 'var(--accent-amber)'};">-${this.formatCurrency(t.grand_total_amount)}</span>
            </div>
          </div>
          <div class="station-specs-row">
            <span style="color:var(--text-muted);font-size:0.72rem;font-family:var(--font-mono);">${t.invoice_number}</span>
            <span class="status-indicator-badge status-${isPaid ? 'available' : 'in-use'}" style="font-size:0.65rem;">${t.payment_status}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // SQL Admin Terminal Methods
  // =========================================================================
  runSQLQuery(sql) {
    if (!window.db) {
      return { success: false, error: 'Database not initialized', columns: ['Error'], rows: [['DB not ready']] };
    }
    return window.db.executeRawSQL(sql);
  }

  renderSQLResults(result) {
    const container = document.getElementById('sqlResultsContainer');
    if (!container) return;

    if (!result.success) {
      container.innerHTML = `
        <div style="padding:16px;color:#f87171;font-family:var(--font-mono);font-size:0.75rem;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>${result.error || 'Query failed'}
        </div>
      `;
      return;
    }

    if (!result.rows || result.rows.length === 0) {
      container.innerHTML = `
        <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.8rem;">
          <i class="fa-solid fa-circle-info" style="margin-right:6px;"></i>
          Query returned 0 rows${result.tableName ? ` from <strong>${result.tableName}</strong>` : ''}.
        </div>
      `;
      return;
    }

    const cols = result.columns || [];
    const rows = result.rows || [];

    container.innerHTML = `
      <div style="padding:8px 12px;background:rgba(6,182,212,0.06);border-bottom:1px solid var(--border-subtle);font-size:0.72rem;color:var(--text-muted);display:flex;justify-content:space-between;">
        <span><i class="fa-solid fa-table" style="margin-right:5px;"></i>${result.tableName || 'result'}</span>
        <span style="color:var(--accent-emerald-light);font-weight:700;">${rows.length} row${rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.72rem;font-family:var(--font-mono);">
          <thead>
            <tr style="background:rgba(255,255,255,0.04);">
              ${cols.map(c => `<th style="padding:6px 10px;text-align:left;color:var(--accent-cyan-light);white-space:nowrap;border-bottom:1px solid var(--border-subtle);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;">${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, ri) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:${ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}">
                ${row.map(cell => `<td style="padding:5px 10px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${String(cell)}">${String(cell)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  saveChargersState() {
    localStorage.setItem('voltshare_chargers', JSON.stringify(this.chargers));
  }

  // =========================================================================
  // 8. Navigation, City & Currency Controls
  // =========================================================================
  switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetPanel = document.getElementById(tabId);
    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);

    if (targetPanel) targetPanel.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (tabId === 'tab-explore') {
      if (this.mapEngine === 'google' && this.googleMap && window.google) {
        google.maps.event.trigger(this.googleMap, 'resize');
        this.googleMap.setCenter({ lat: this.userLocation.lat, lng: this.userLocation.lng });
      } else if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 200);
      }
    }
    if (tabId === 'tab-charging') {
      this.updateChargingScreenUI();
    }
    if (tabId === 'tab-host-dashboard') {
      this.updateHostDashboard();
    }
    if (tabId === 'tab-wallet') {
      this.updateWalletUI();
      this.renderTransactionHistory();
    }
    if (tabId === 'tab-profile') {
      this.loadUserDetailsToForm();
    }
  }

  // =========================================================================
  // 8.5. User Profile & Vehicle Details (Direct SQL DB Sync)
  // =========================================================================
  loadUserDetailsToForm() {
    if (!window.db) return;
    const email = (this.currentUser && this.currentUser.email) || 'alex.driver@voltshare.io';
    let user = window.db.getUser(email) || (this.currentUser && this.currentUser.sqlId ? window.db.getUser(this.currentUser.sqlId) : null);
    
    if (!user) {
      user = window.db.upsertUser({
        email: email,
        full_name: (this.currentUser && this.currentUser.name) || 'Alex Vance',
        wallet_balance: this.walletBalance || 1500.00,
        role_preference: this.userRole || 'driver'
      });
    }

    const host = window.db.getHostByUserId(user.id);

    const nameInp = document.getElementById('profileFullName');
    const emailInp = document.getElementById('profileEmail');
    const phoneInp = document.getElementById('profilePhone');
    const rolePref = document.getElementById('profileRolePreference');
    const evModelInp = document.getElementById('profileEvModel');
    const battInp = document.getElementById('profileBatteryCapacity');
    const plateInp = document.getElementById('profilePlateNumber');
    const sqlUserId = document.getElementById('profileSqlUserId');
    const kycBadge = document.getElementById('profileKycBadge');
    const hostNameInp = document.getElementById('profileHostDisplayName');
    const hostUpiInp = document.getElementById('profileHostUpi');
    const hostBankInp = document.getElementById('profileHostBankAcc');

    if (nameInp) nameInp.value = user.full_name || '';
    if (emailInp) emailInp.value = user.email || '';
    if (phoneInp) phoneInp.value = user.phone || '+91 98450 12345';
    if (rolePref) rolePref.value = user.role_preference || this.userRole || 'driver';
    if (evModelInp) evModelInp.value = user.ev_model || 'Tesla Model Y Performance';
    if (battInp) battInp.value = user.ev_battery_capacity_kwh || 75.0;
    if (plateInp) plateInp.value = user.ev_plate_number || 'KA 03 EV 8899';
    if (sqlUserId) sqlUserId.textContent = user.id || 'usr-default';
    if (kycBadge) kycBadge.textContent = (user.kyc_status || 'VERIFIED') + ' KYC';

    if (host) {
      if (hostNameInp) hostNameInp.value = host.display_name || '';
      if (hostUpiInp) hostUpiInp.value = host.payout_upi_id || '';
      if (hostBankInp) hostBankInp.value = host.bank_account_no || '';
    } else {
      if (hostNameInp) hostNameInp.value = user.full_name + ' (Wallbox)';
      if (hostUpiInp) hostUpiInp.value = user.email.split('@')[0] + '@okhdfcbank';
      if (hostBankInp) hostBankInp.value = '**** **** 4892';
    }
  }

  saveUserDetailsFromForm() {
    if (!window.db) {
      this.showToast('⚠️ Database engine not ready');
      return;
    }

    const name = document.getElementById('profileFullName')?.value.trim() || 'EV Enthusiast';
    const email = document.getElementById('profileEmail')?.value.trim() || (this.currentUser?.email || 'driver@voltshare.io');
    const phone = document.getElementById('profilePhone')?.value.trim() || '+91 98450 12345';
    const rolePref = document.getElementById('profileRolePreference')?.value || this.userRole || 'driver';
    const evModel = document.getElementById('profileEvModel')?.value.trim() || 'Tesla Model Y Performance';
    const battKwh = parseFloat(document.getElementById('profileBatteryCapacity')?.value) || 75.0;
    const plateNum = document.getElementById('profilePlateNumber')?.value.trim() || 'KA 03 EV 8899';

    const hostName = document.getElementById('profileHostDisplayName')?.value.trim() || `${name} Host`;
    const hostUpi = document.getElementById('profileHostUpi')?.value.trim() || `${email.split('@')[0]}@okhdfcbank`;
    const hostBank = document.getElementById('profileHostBankAcc')?.value.trim() || '**** **** 4892';

    // 1. Direct Save to SQL Users Table
    const existingUser = window.db.getUser(email) || (this.currentUser?.sqlId ? window.db.getUser(this.currentUser.sqlId) : null);
    const userId = existingUser ? existingUser.id : `usr-${Date.now()}`;

    const savedUser = window.db.upsertUser({
      id: userId,
      email: email,
      full_name: name,
      phone: phone,
      role_preference: rolePref,
      ev_model: evModel,
      ev_battery_capacity_kwh: battKwh,
      ev_plate_number: plateNum,
      wallet_balance: this.walletBalance,
      kyc_status: 'VERIFIED'
    });

    // 2. Direct Save to SQL Hosts Table
    window.db.upsertHost({
      user_id: userId,
      display_name: hostName,
      payout_upi_id: hostUpi,
      bank_account_no: hostBank
    });

    // 3. Update active session user state
    this.currentUser = {
      email: savedUser.email,
      name: savedUser.full_name,
      sqlId: savedUser.id,
      loggedInAt: Date.now()
    };
    localStorage.setItem('voltshare_user', JSON.stringify(this.currentUser));

    const sqlUserIdEl = document.getElementById('profileSqlUserId');
    if (sqlUserIdEl) sqlUserIdEl.textContent = savedUser.id;

    this.showToast('💾 Details successfully saved directly to SQL Database!');
  }

  setCity(cityKey) {
    const presets = window.CITY_PRESETS || {};
    if (!presets[cityKey]) return;
    this.currentCity = cityKey;
    localStorage.setItem('voltshare_city', cityKey);

    const city = presets[cityKey];
    this.userLocation.lat = city.lat;
    this.userLocation.lng = city.lng;
    this.userLocation.name = city.name;

    this.reanchorChargersAroundUser();
    this.updateMapUserMarker();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.showToast(`📍 Switched city hub to ${city.name}`);
  }

  setCurrency(currencyCode) {
    const cfgs = window.CURRENCY_CONFIG || {};
    if (!cfgs[currencyCode]) return;
    this.currentCurrency = currencyCode;
    localStorage.setItem('voltshare_currency', currencyCode);
    this.updateCurrencyUI();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.updateHostDashboard();
    this.updateWalletUI();
  }

  updateCityUI() {
    const select = document.getElementById('citySelector');
    if (select) select.value = this.currentCity;
  }

  updateCurrencyUI() {
    const select = document.getElementById('currencySelector');
    if (select) select.value = this.currentCurrency;
  }

  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--accent-emerald);"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // =========================================================================
  // 9. Event Listeners Setup
  // =========================================================================
  initEventListeners() {
    // Auth Form & Demo Logins
    const authForm = document.getElementById('authLoginForm');
    if (authForm) {
      authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmailInput').value || "user@voltshare.io";
        this.loginUser(email);
      });
    }

    const demoDriverBtn = document.getElementById('btnDemoLoginDriver');
    if (demoDriverBtn) {
      demoDriverBtn.addEventListener('click', () => {
        this.loginUser("alex.driver@voltshare.io", "Alex Vance");
        this.selectRole('driver');
      });
    }

    const demoHostBtn = document.getElementById('btnDemoLoginHost');
    if (demoHostBtn) {
      demoHostBtn.addEventListener('click', () => {
        this.loginUser("marcus.host@voltshare.io", "Marcus Vance");
        this.selectRole('host');
      });
    }

    // Role Selection Cards
    const personaDriver = document.getElementById('personaCardDriver');
    if (personaDriver) {
      personaDriver.addEventListener('click', () => this.selectRole('driver'));
    }

    const personaHost = document.getElementById('personaCardHost');
    if (personaHost) {
      personaHost.addEventListener('click', () => this.selectRole('host'));
    }

    // Header Role Pill (Opens Role Switcher)
    const rolePill = document.getElementById('headerRolePill');
    if (rolePill) {
      rolePill.addEventListener('click', () => {
        document.getElementById('roleSwitchModal').classList.add('active');
      });
    }

    // Role Switch Modal Actions
    const modalSwitchDriver = document.getElementById('btnModalSwitchToDriver');
    if (modalSwitchDriver) {
      modalSwitchDriver.addEventListener('click', () => {
        document.getElementById('roleSwitchModal').classList.remove('active');
        this.selectRole('driver');
      });
    }

    const modalSwitchHost = document.getElementById('btnModalSwitchToHost');
    if (modalSwitchHost) {
      modalSwitchHost.addEventListener('click', () => {
        document.getElementById('roleSwitchModal').classList.remove('active');
        this.selectRole('host');
      });
    }

    const logOutBtn = document.getElementById('btnLogOut');
    if (logOutBtn) {
      logOutBtn.addEventListener('click', () => this.logout());
    }

    // Replay startup animation
    const brandHeader = document.getElementById('brandHeaderGroup');
    if (brandHeader) {
      brandHeader.addEventListener('click', () => {
        this.runStartupSplash(true);
      });
    }

    // Locate Me
    const locateBtn = document.getElementById('btnLocateMe');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => this.detectUserLocation());
    }

    // Filter Pills
    document.querySelectorAll('.filter-pill[data-filter]').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill[data-filter]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.getAttribute('data-filter');
        this.renderMapMarkers();
        this.renderNearbyList();
      });
    });

    // Search
    const searchInput = document.getElementById('stationSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderMapMarkers();
        this.renderNearbyList();
      });
    }

    // Turn-by-Turn Navigation
    const navBtn = document.getElementById('btnStartNavigation');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        if (this.selectedCharger) {
          this.startTurnByTurnNavigation(this.selectedCharger);
        }
      });
    }

    const endNavBtn = document.getElementById('btnEndNavigation');
    if (endNavBtn) {
      endNavBtn.addEventListener('click', () => this.stopNavigation());
    }

    // Charge Target Slider
    const limitSlider = document.getElementById('chargeLimitSlider');
    const limitLabel = document.getElementById('chargeLimitLabel');
    if (limitSlider && limitLabel) {
      limitSlider.addEventListener('input', (e) => {
        this.chargeTargetLimit = parseInt(e.target.value);
        limitLabel.textContent = `${this.chargeTargetLimit}% (Auto-Stop)`;
      });
    }

    // Modal Close Buttons
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Start Charging from Detail Modal
    const startFromModalBtn = document.getElementById('btnStartChargeFromModal');
    if (startFromModalBtn) {
      startFromModalBtn.addEventListener('click', () => {
        if (this.selectedCharger) {
          this.startChargingSession(this.selectedCharger);
        }
      });
    }

    // Stop Charging
    const stopChargeBtn = document.getElementById('btnStopCharging');
    if (stopChargeBtn) {
      stopChargeBtn.addEventListener('click', () => this.stopChargingSession());
    }

    // Host Wizard
    const openHostWizardBtn = document.getElementById('btnOpenHostWizard');
    if (openHostWizardBtn) {
      openHostWizardBtn.addEventListener('click', () => {
        document.getElementById('hostWizardModal').classList.add('active');
      });
    }

    // Host Form Submit
    const hostForm = document.getElementById('hostChargerForm');
    if (hostForm) {
      hostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
          title: document.getElementById('hostFormTitle').value,
          hostName: document.getElementById('hostFormName').value,
          address: document.getElementById('hostFormAddress').value,
          connectorType: document.getElementById('hostFormConnector').value,
          powerKw: document.getElementById('hostFormPower').value,
          ratePerKwh: document.getElementById('hostFormRate').value,
          parkingType: document.getElementById('hostFormParking').value,
          accessHours: document.getElementById('hostFormAccess').value,
          solarPowered: document.getElementById('hostFormSolar').checked,
          notes: document.getElementById('hostFormNotes').value
        };
        this.addNewHostCharger(data);
        document.getElementById('hostWizardModal').classList.remove('active');
        hostForm.reset();
      });
    }

    // Wallet Top Up
    const topUpBtn = document.getElementById('btnTopUpWallet');
    if (topUpBtn) {
      topUpBtn.addEventListener('click', () => {
        this.walletBalance += 500;
        localStorage.setItem('voltshare_wallet_balance', this.walletBalance.toString());
        // SQL DB: Persist updated wallet balance
        if (window.db && this.currentUser && this.currentUser.sqlId) {
          window.db.updateUserWallet(this.currentUser.sqlId, this.walletBalance);
        }
        this.updateWalletUI();
        this.showToast(`💳 Added ${this.formatCurrency(500)} to your VoltShare Wallet!`);
      });
    }

    // Wallet Refresh Button
    const refreshTxBtn = document.getElementById('btnRefreshTxHistory');
    if (refreshTxBtn) {
      refreshTxBtn.addEventListener('click', () => {
        this.renderTransactionHistory();
        this.showToast('🔄 Transaction history refreshed from SQL database.');
      });
    }

    // Profile & Details Form Save Actions
    const profileForm = document.getElementById('userProfileDetailsForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveUserDetailsFromForm();
      });
    }

    const btnSaveUserDetails = document.getElementById('btnSaveUserDetails');
    if (btnSaveUserDetails) {
      btnSaveUserDetails.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveUserDetailsFromForm();
      });
    }

    const btnOpenProfileHeader = document.getElementById('btnOpenProfileHeader');
    if (btnOpenProfileHeader) {
      btnOpenProfileHeader.addEventListener('click', () => {
        this.switchTab('tab-profile');
      });
    }

    const btnModalOpenProfile = document.getElementById('btnModalOpenProfile');
    if (btnModalOpenProfile) {
      btnModalOpenProfile.addEventListener('click', () => {
        const roleModal = document.getElementById('roleSwitchModal');
        if (roleModal) roleModal.classList.remove('active');
        this.switchTab('tab-profile');
      });
    }


    // Review Modal from Receipt
    const openReviewBtn = document.getElementById('btnOpenReviewFromReceipt');
    if (openReviewBtn) {
      openReviewBtn.addEventListener('click', () => {
        document.getElementById('invoiceModal').classList.remove('active');
        document.getElementById('reviewModal').classList.add('active');
      });
    }

    const submitReviewBtn = document.getElementById('btnSubmitReview');
    if (submitReviewBtn) {
      submitReviewBtn.addEventListener('click', () => {
        const feedbackText = document.getElementById('reviewTextInput').value.trim();
        // SQL DB: Record the review
        if (window.db && feedbackText) {
          const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';
          const lastSession = window.db.tables.charging_sessions.find(s => s.driver_id === driverId && s.session_status === 'completed');
          window.db.insertReview({
            session_id: lastSession?.id || null,
            author_user_id: driverId,
            target_host_id: lastSession?.host_id || 'host-marcus',
            charger_id: lastSession?.charger_id || 'ch-01',
            rating_stars: 5,
            feedback_text: feedbackText
          });
        }
        document.getElementById('reviewModal').classList.remove('active');
        document.getElementById('reviewTextInput').value = '';
        this.showToast("⭐ Thank you! Your review was saved to the SQL database.");
      });
    }

    // City & Currency Selectors
    const citySelect = document.getElementById('citySelector');
    if (citySelect) {
      citySelect.addEventListener('change', (e) => this.setCity(e.target.value));
    }

    const currencySelect = document.getElementById('currencySelector');
    if (currencySelect) {
      currencySelect.addEventListener('change', (e) => this.setCurrency(e.target.value));
    }

    // Google Maps API Key Modal Controls
    const openMapSettingsBtn = document.getElementById('btnOpenMapSettings');
    if (openMapSettingsBtn) {
      openMapSettingsBtn.addEventListener('click', () => {
        const modal = document.getElementById('gmapsConfigModal');
        const keyInput = document.getElementById('gmapsApiKeyInput');
        if (keyInput) keyInput.value = this.googleMapsApiKey || '';
        if (modal) modal.classList.add('active');
      });
    }

    const mapBadge = document.getElementById('mapEngineBadge');
    if (mapBadge) {
      mapBadge.addEventListener('click', () => {
        const modal = document.getElementById('gmapsConfigModal');
        const keyInput = document.getElementById('gmapsApiKeyInput');
        if (keyInput) keyInput.value = this.googleMapsApiKey || '';
        if (modal) modal.classList.add('active');
      });
    }

    const saveGmapsBtn = document.getElementById('btnSaveGoogleMapsKey');
    if (saveGmapsBtn) {
      saveGmapsBtn.addEventListener('click', () => {
        const keyInput = document.getElementById('gmapsApiKeyInput');
        if (keyInput) {
          this.saveGoogleMapsApiKey(keyInput.value);
        }
      });
    }

    const resetToOsmBtn = document.getElementById('btnResetToLeaflet');
    if (resetToOsmBtn) {
      resetToOsmBtn.addEventListener('click', () => {
        this.resetToLeafletMap();
      });
    }

    // View Toggle
    const toggleViewBtn = document.getElementById('btnToggleViewMode');
    if (toggleViewBtn) {
      toggleViewBtn.addEventListener('click', () => {
        const container = document.getElementById('deviceContainer');
        container.classList.toggle('fullscreen-mode');
        if (this.mapEngine === 'google' && this.googleMap && window.google) {
          google.maps.event.trigger(this.googleMap, 'resize');
        } else if (this.map) {
          setTimeout(() => this.map.invalidateSize(), 300);
        }
      });
    }

    // =======================================================================
    // Theme Switchers
    // =======================================================================
    const themeLandingBtn = document.getElementById('btnThemeToggleLanding');
    if (themeLandingBtn) {
      themeLandingBtn.addEventListener('click', () => this.toggleTheme());
    }

    const themeHeaderBtn = document.getElementById('btnThemeToggleHeader');
    if (themeHeaderBtn) {
      themeHeaderBtn.addEventListener('click', () => this.toggleTheme());
    }

    const themeModalBtn = document.getElementById('btnModalToggleTheme');
    if (themeModalBtn) {
      themeModalBtn.addEventListener('click', () => this.toggleTheme());
    }

    // =======================================================================
    // Landing Page Actions & Routing
    // =======================================================================
    const navHomeHeader = document.getElementById('btnNavHomeHeader');
    if (navHomeHeader) {
      navHomeHeader.addEventListener('click', () => this.showLandingPage());
    }

    const modalGoToHome = document.getElementById('btnModalGoToHome');
    if (modalGoToHome) {
      modalGoToHome.addEventListener('click', () => {
        document.getElementById('roleSwitchModal').classList.remove('active');
        this.showLandingPage();
      });
    }

    const backAuthToHome = document.getElementById('btnBackFromAuthToHome');
    if (backAuthToHome) {
      backAuthToHome.addEventListener('click', () => this.showLandingPage());
    }

    const backRoleToHome = document.getElementById('btnBackFromRoleToHome');
    if (backRoleToHome) {
      backRoleToHome.addEventListener('click', () => this.showLandingPage());
    }

    const landingSignInBtn = document.getElementById('btnNavToSignInLanding');
    if (landingSignInBtn) {
      landingSignInBtn.addEventListener('click', () => this.openAuthScreen());
    }

    const landingGetStartedBtn = document.getElementById('btnLandingGetStarted');
    if (landingGetStartedBtn) {
      landingGetStartedBtn.addEventListener('click', () => {
        if (this.currentUser && this.userRole) {
          this.hideLandingPage();
          this.applyRoleInterface(this.userRole);
        } else if (this.currentUser) {
          this.openRoleScreen();
        } else {
          this.openAuthScreen();
        }
      });
    }

    const landingFooterLaunch = document.getElementById('btnLandingFooterLaunch');
    if (landingFooterLaunch) {
      landingFooterLaunch.addEventListener('click', () => {
        if (this.currentUser && this.userRole) {
          this.hideLandingPage();
          this.applyRoleInterface(this.userRole);
        } else if (this.currentUser) {
          this.openRoleScreen();
        } else {
          this.openAuthScreen();
        }
      });
    }

    const landingHostBtn = document.getElementById('btnLandingHost');
    if (landingHostBtn) {
      landingHostBtn.addEventListener('click', () => {
        if (this.currentUser) {
          this.selectRole('host');
        } else {
          this.loginUser("marcus.host@voltshare.io", "Marcus Vance");
          this.selectRole('host');
        }
      });
    }

    const calcHostCTA = document.getElementById('btnCalcHostCTA');
    if (calcHostCTA) {
      calcHostCTA.addEventListener('click', () => {
        if (this.currentUser) {
          this.selectRole('host');
        } else {
          this.loginUser("marcus.host@voltshare.io", "Marcus Vance");
          this.selectRole('host');
        }
      });
    }

    const landingDemoDriver = document.getElementById('btnLandingDemoDriver');
    if (landingDemoDriver) {
      landingDemoDriver.addEventListener('click', () => {
        this.loginUser("alex.driver@voltshare.io", "Alex Vance");
        this.selectRole('driver');
      });
    }

    const landingDemoHost = document.getElementById('btnLandingDemoHost');
    if (landingDemoHost) {
      landingDemoHost.addEventListener('click', () => {
        this.loginUser("marcus.host@voltshare.io", "Marcus Vance");
        this.selectRole('host');
      });
    }

    // Drawer Toggle (Expand / Minimize Nearby Chargers)
    const toggleDrawer = () => {
      const drawer = document.getElementById('bottomDiscoveryDrawer');
      const actionText = document.getElementById('drawerActionText');
      const floatingControls = document.querySelector('.map-floating-controls');
      if (!drawer) return;

      const isExpanded = drawer.classList.toggle('expanded');
      if (actionText) actionText.textContent = isExpanded ? 'Tap to minimize' : 'Tap to expand';
      if (floatingControls) {
        if (isExpanded) floatingControls.classList.add('drawer-open');
        else floatingControls.classList.remove('drawer-open');
      }
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 300);
      }
    };

    const drawerHandle = document.getElementById('drawerHandleBar');
    if (drawerHandle) drawerHandle.addEventListener('click', toggleDrawer);

    const drawerHeader = document.getElementById('drawerHeaderToggle');
    if (drawerHeader) drawerHeader.addEventListener('click', toggleDrawer);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoltShareApp();
  console.log('%c⚡ VoltShare SQL Engine Active (Background)', 'color:#06b6d4;font-size:14px;font-weight:bold;');
  console.log('%c🛠️ Developer Database Studio: Open "admin.html" in your browser for the full SQL Admin Panel & Table Explorer.', 'color:#10b981;font-size:12px;');
  console.log('%c💡 Direct Console Access: window.db.executeRawSQL("SELECT * FROM transactions")', 'color:#94a3b8;font-family:monospace;');
});
