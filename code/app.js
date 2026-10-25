/**
 * VoltShare - Community EV Charging Network
 * Full-Featured Application Controller & Engine
 * Supports Authentication, Dynamic Roles (Driver vs Host), and Live Metering
 */

class VoltShareApp {
  constructor() {
    this.currentCurrency = 'INR'; // Locked to Rupees as requested
    this.currentCity = 'bengaluru';

    // Purge any stale cache, mock data, or leftover test keys from localStorage
    try {
      const keysToPurge = [
        'voltshare_host_photos',
        'voltshare_chargers',
        'voltshare_sql_database_v5',
        'voltshare_deleted_ids',
        'voltshare_has_unpushed_changes',
        'voltshare_user',
        'voltshare_role',
        'voltshare_active_session',
        'voltshare_wallet_balance',
        'voltshare_host_earnings',
        'voltshare_host_kwh',
        'voltshare_host_online',
        'voltshare_active_reservation',
        'voltshare_notifications'
      ];
      keysToPurge.forEach(k => localStorage.removeItem(k));
    } catch(e) {}

    // Ensure SQL Database Engine is active and ready
    this.ensureDatabaseReady();

    // Synchronize chargers directly from SQL DB
    this.chargers = this.loadChargersFromDB();

    // Notification Center State (In-Memory)
    this.notifications = [
      { id: 'notif-1', title: 'Supabase Database Connected', msg: 'VoltShare network initialized with live PostgreSQL database.', time: 'Just now', icon: '⚡', unread: true }
    ];
    
    // Theme State ('dark' | 'light')
    this.currentTheme = 'dark';
    
    // Auth & Role State (In-Memory - No persistent localStorage caching)
    this.currentUser = null;
    this.userRole = null; // 'driver' | 'host'
    
    // User GPS Location & City Hub
    const cityData = (window.CITY_PRESETS && window.CITY_PRESETS[this.currentCity]) || { lat: 12.9716, lng: 77.5946, name: "Bengaluru, India" };
    this.userLocation = { lat: cityData.lat, lng: cityData.lng, name: cityData.name };
    
    this.selectedCharger = null;
    this.activeFilter = 'all';
    this.searchQuery = '';
    
    // Active Charging Session State (In-Memory)
    this.chargingSession = null;
    this.sessionInterval = null;
    this.chargeTargetLimit = 80;
    
    // Wallet & Host State (In-Memory)
    this.walletBalance = 1500.00;
    this.hostEarnings = 0.00;
    this.hostTotalKwh = 0.0;
    this.hostIsOnline = true;
    this.activeReservation = null;
    this.hostUploadedPhotos = [];

    // Dual Map Engine State (Google Maps + Leaflet Fallback)
    // Config.js is authoritative: if it's empty, clear any stale localStorage key too
    const configKey = (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_MAPS_API_KEY) || '';
    if (!configKey) {
      localStorage.removeItem('voltshare_gmaps_key'); // Clear stale key so old broken key doesn't reload
    }
    this.googleMapsApiKey = configKey || localStorage.getItem('voltshare_gmaps_key') || '';
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
    
    // Active Reservation State (+₹30/hour hold) - In-Memory
    this.activeReservation = null;
    this.reservationTimer = null;
    this.selectedReserveHours = 1;
    this.reserveTargetCharger = null;

    // Turn-by-Turn Voice Direction System (Google Maps style)
    this.voiceNavEnabled = true;
    this.navSteps = [];
    this.navCurrentStepIndex = 0;
    this.navStepTimer = null;
    this.selectedVoice = null;

    // Host Mode Charger Photos (Min 3, Max 5 required)
    this.hostUploadedPhotos = [];
    this.currentWizardPhotos = [];

    // Photo Slideshow Lightbox State
    this.slideshowPhotos = [];
    this.slideshowIndex = 0;
    this.slideshowTitle = 'Charger Photo';
    this.slideshowAutoplayTimer = null;
    this.currentDetailModalPhotos = [];
    this.currentDetailModalTitle = '';

    this.init();
  }

  init() {
    this.initTheme();
    this.initFirebase();
    this.initEventListeners();
    this.initVoiceNavigation();
    this.initHostPhotoUploader();
    this.initHostWizardPhotoUploader();
    this.initPhotoSlideshow();
    this.initLandingPageInteractions();
    this.initMapEngine();
    this.detectUserLocation();
    this.renderNearbyList();
    this.updateHostDashboard();
    this.updateWalletUI();
    this.checkActiveSession();
    this.checkActiveReservation();
    this.updateCurrencyUI();
    this.updateCityUI();
    this.renderNotifications();
    this.initCloudSyncListener();
    this.startPeriodicSync();
    this.runStartupSplash();
  }

  initCloudSyncListener() {
    window.addEventListener('voltshare:db_synced', () => {
      console.log('⚡ [VoltShare App] Cloud DB update received across internet. Refreshing app state...');
      if (window.db && this.currentUser && !this.currentUser.isDemo) {
        const u = (this.currentUser.sqlId ? window.db.getUser(this.currentUser.sqlId) : null) || window.db.getUser(this.currentUser.email);
        if (u) {
          this.currentUser.sqlId = u.id;
          this.currentUser.email = u.email;
          this.currentUser.name = u.full_name;
          if (u.wallet_balance !== undefined) {
            this.walletBalance = parseFloat(u.wallet_balance);
          }
        }
      }
      if (typeof this.loadChargersFromDB === 'function') {
        this.chargers = this.loadChargersFromDB();
      }
      if (typeof this.renderNearbyList === 'function') this.renderNearbyList();
      if (typeof this.updateHostDashboard === 'function') this.updateHostDashboard();
      if (typeof this.updateWalletUI === 'function') this.updateWalletUI();
      if (typeof this.renderTransactionHistory === 'function') this.renderTransactionHistory();
      if (typeof this.renderMapMarkers === 'function') this.renderMapMarkers();

      // If profile screen is active, update form fields smoothly if not typing
      const activeInput = document.activeElement;
      const isTypingInProfile = activeInput && activeInput.closest('#userProfileDetailsForm');
      if (!isTypingInProfile && typeof this.loadUserDetailsToForm === 'function') {
        const profileTab = document.getElementById('tab-profile');
        if (profileTab && profileTab.classList.contains('active')) {
          this.loadUserDetailsToForm();
        }
      }
    });
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
              // Auto-login: If user has a valid saved session in DB, skip landing & enter app
              if (this.currentUser && this.userRole && this.autoRestoreSession()) {
                // Session restored — user enters app directly without sign-in
              } else {
                this.showLandingPage();
              }
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

    // Update CTA buttons to reflect current login state
    this.updateLandingPageLoginState();
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

  // Auto-restore session for returning users on page load
  autoRestoreSession() {
    if (!this.currentUser || !this.currentUser.email) return false;

    // Verify user still exists in the SQL Database
    if (window.db) {
      const dbUser = window.db.getUser(this.currentUser.email);
      if (!dbUser) {
        // User was deleted from DB — clear session
        this.currentUser = null;
        this.userRole = null;
        return false;
      }

      // Restore wallet balance and profile from DB
      this.walletBalance = parseFloat(dbUser.wallet_balance !== undefined ? dbUser.wallet_balance : 1500.00);
      this.currentUser.name = dbUser.full_name || this.currentUser.name;
      this.currentUser.sqlId = dbUser.id;

      // Update last login timestamp locally only without pushing whole DB across network
      dbUser.last_login_at = new Date().toISOString();
    }

    // Hide all overlay screens
    const landing = document.getElementById('appLandingScreen');
    const authScreen = document.getElementById('appAuthScreen');
    const roleScreen = document.getElementById('appRoleScreen');
    if (landing) landing.style.display = 'none';
    if (authScreen) authScreen.style.display = 'none';
    if (roleScreen) roleScreen.style.display = 'none';

    // Apply saved role interface directly
    this.applyRoleInterface(this.userRole);
    this.updateWalletUI();
    this.showToast(`👋 Welcome back, ${this.currentUser.name}!`);

    return true;
  }

  // Update landing page CTA buttons based on login state
  updateLandingPageLoginState() {
    this.updateDemoModeUI();
    const signInBtn = document.getElementById('btnNavToSignInLanding');
    const getStartedBtn = document.getElementById('btnLandingGetStarted');

    if (this.currentUser && this.currentUser.isDemo) {
      if (signInBtn) signInBtn.style.display = 'none';
      if (getStartedBtn) {
        const btnSpan = getStartedBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = '⚡ Return to App (' + (this.currentUser.name || 'Demo') + ')';
      }
    } else if (this.currentUser && this.userRole) {
      // User is logged in — show personalized buttons
      if (signInBtn) {
        signInBtn.style.display = '';
        signInBtn.innerHTML = '<i class="fa-solid fa-circle-user"></i> ' + (this.currentUser.name || 'Account');
      }
      if (getStartedBtn) {
        const btnSpan = getStartedBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = '⚡ Enter App (' + (this.currentUser.name || 'User') + ')';
      }
    } else {
      // Not logged in — show default buttons
      if (signInBtn) {
        signInBtn.style.display = '';
        signInBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
      }
      if (getStartedBtn) {
        const btnSpan = getStartedBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = '⚡ Find a Charger & Charge';
      }
    }
  }

  // Manage UI visibility and read-only lockdown for demo accounts
  updateDemoModeUI() {
    const isDemo = !!(this.currentUser && this.currentUser.isDemo);

    // 1. Profile screen logout button
    const profileLogout = document.getElementById('btnProfileLogout');
    if (profileLogout) {
      const container = profileLogout.parentElement || profileLogout;
      container.style.display = isDemo ? 'none' : '';
      profileLogout.style.display = isDemo ? 'none' : '';
    }

    // 2. Role switch modal logout button
    const modalLogout = document.getElementById('btnLogOut');
    if (modalLogout) {
      modalLogout.style.display = isDemo ? 'none' : '';
    }

    // 3. Landing header login / sign-in button
    const landingSignIn = document.getElementById('btnNavToSignInLanding');
    if (landingSignIn) {
      if (isDemo) {
        landingSignIn.style.display = 'none';
      }
    }

    // 4. Lock Profile Form (Read-Only Spectator Mode)
    const profileForm = document.getElementById('userProfileDetailsForm');
    if (profileForm) {
      // Toggle all form controls
      profileForm.querySelectorAll('input, select, textarea').forEach(el => {
        el.disabled = isDemo;
        if (isDemo) {
          el.classList.add('demo-readonly-input');
        } else {
          el.classList.remove('demo-readonly-input');
        }
      });

      // Hide or disable Save button
      const saveBtn = document.getElementById('btnSaveUserDetails');
      if (saveBtn) {
        const saveContainer = saveBtn.parentElement || saveBtn;
        saveContainer.style.display = isDemo ? 'none' : '';
      }

      // Pin location button
      const pinBtn = document.getElementById('btnProfilePinLocation');
      if (pinBtn) {
        pinBtn.disabled = isDemo;
        pinBtn.style.opacity = isDemo ? '0.4' : '';
        pinBtn.style.pointerEvents = isDemo ? 'none' : '';
      }

      // Photo dropzone
      const dropzone = document.getElementById('profilePhotoDropzone');
      if (dropzone) {
        dropzone.style.pointerEvents = isDemo ? 'none' : '';
        dropzone.style.opacity = isDemo ? '0.45' : '';
      }

      // Vehicle category buttons
      document.querySelectorAll('.vehicle-cat-btn').forEach(btn => {
        btn.style.pointerEvents = isDemo ? 'none' : '';
        btn.style.opacity = isDemo ? '0.6' : '';
      });

      // Remove any previously injected notice banner (banner removed by user preference)
      const notice = document.getElementById('demoProfileReadOnlyNotice');
      if (notice) notice.remove();
    }

    // 5. Host Dashboard Restrictions (No adding points, no hosting actions)
    const addPointBtn = document.getElementById('btnOpenHostWizard');
    if (addPointBtn) {
      addPointBtn.style.display = isDemo ? 'none' : '';
    }

    const hostOnlineToggle = document.getElementById('hostOnlineToggle');
    if (hostOnlineToggle) {
      hostOnlineToggle.disabled = isDemo;
      const toggleWrap = hostOnlineToggle.closest('.switch');
      if (toggleWrap) {
        toggleWrap.style.opacity = isDemo ? '0.5' : '';
        toggleWrap.style.cursor = isDemo ? 'not-allowed' : '';
      }
    }

    // Wallet Top Up button
    const topUpBtn = document.getElementById('btnTopUpWallet');
    if (topUpBtn) {
      topUpBtn.disabled = isDemo;
      topUpBtn.style.opacity = isDemo ? '0.5' : '';
      topUpBtn.title = isDemo ? 'Disabled in Demo Mode' : '';
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

  // =========================================================================
  // Firebase & Google Authentication
  // =========================================================================
  initFirebase() {
    if (typeof firebase === 'undefined') return;
    try {
      const fbConfig = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE) || null;
      if (fbConfig && !firebase.apps.length) {
        firebase.initializeApp(fbConfig);
        console.log('⚡ [VoltShare Firebase] Initialized successfully with project', fbConfig.projectId);
      }

      // Check redirect result on load (crucial for mobile devices, WebViews & APKs)
      if (firebase.auth && window.location.protocol !== 'file:') {
        firebase.auth().getRedirectResult()
          .then((result) => {
            if (result && result.user) {
              const user = result.user;
              const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'EV User');
              const photoURL = user.photoURL || null;
              this.loginUser(user.email, displayName, photoURL);
              this.showToast(`✅ Welcome back, ${displayName}! (Verified Google Account)`);
            }
          })
          .catch((err) => {
            console.warn('Firebase Redirect Auth notice:', err.message);
          });
      }
    } catch (err) {
      console.warn('⚠️ [VoltShare Firebase] Init notice:', err.message);
    }
  }

  async signInWithGoogle() {
    const GOOGLE_CLIENT_ID = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE && window.APP_CONFIG.FIREBASE.clientId)
      || '731648245258-vavo5f3772962rsdknjgh3qho6rvmdfv.apps.googleusercontent.com';

    // 1. Check for Capacitor Native GoogleAuth plugin (Official Android Google Play Services Account Picker)
    const GoogleAuth = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleAuth)
      || (window.Plugins && window.Plugins.GoogleAuth)
      || (typeof GoogleAuthPlugin !== 'undefined' ? GoogleAuthPlugin : null);

    if (GoogleAuth && typeof GoogleAuth.signIn === 'function') {
      try {
        this.showToast('🔐 Opening Google Account Selector...');
        if (typeof GoogleAuth.initialize === 'function') {
          try {
            // On Android: do NOT override androidClientId via initialize call.
            // Let the plugin pick it up from capacitor.config.json (androidClientId = Android OAuth client type 1).
            // Only pass serverClientId (web client type 3) for requestIdToken.
            await GoogleAuth.initialize({
              scopes: ['profile', 'email'],
              grantOfflineAccess: false
            });
          } catch (initErr) {
            console.log('GoogleAuth init notice:', initErr);
          }
        }
        const googleUser = await GoogleAuth.signIn();
        if (googleUser) {
          const email = googleUser.email || (googleUser.profile && googleUser.profile.email);
          if (email) {
            const name = googleUser.name || (googleUser.profile && googleUser.profile.name) || (googleUser.givenName ? `${googleUser.givenName} ${googleUser.familyName || ''}`.trim() : email.split('@')[0]);
            const avatar = googleUser.imageUrl || (googleUser.profile && googleUser.profile.imageUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=06b6d4&color=fff&size=128`;

            // Connect with Firebase Auth credential if idToken is available
            const idToken = (googleUser.authentication && googleUser.authentication.idToken) || googleUser.idToken;
            if (idToken && typeof firebase !== 'undefined' && firebase.auth) {
              try {
                this.initFirebase();
                const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
                await firebase.auth().signInWithCredential(credential);
              } catch (fbErr) {
                console.warn('Firebase credential sign-in notice:', fbErr);
              }
            }

            this.loginUser(email, name, avatar);
            this.showToast(`✅ Welcome, ${name}! (Google Account)`);
            return;
          }
        }
      } catch (nativeErr) {
        console.warn('Native Google Auth note:', nativeErr);
        const errStr = String(nativeErr && (nativeErr.message || nativeErr.errorMessage || nativeErr.error) || nativeErr || '');
        if (errStr.includes('12501') || errStr.includes('cancelled') || errStr.includes('canceled') || errStr.includes('USER_CANCELLED')) {
          this.showToast('ℹ️ Google Sign-In cancelled.');
          return;
        }
        
        // Show exact error message to user
        this.showToast(`⚠️ Google Sign-In: ${errStr}`);

        // Fall back cleanly to the Google Account modal inside the app
        this._showGoogleAccountModal({
          isFileProtocol: false,
          errorNotice: errStr ? `Google notice: ${errStr}` : ''
        });
        return;
      }
    }

    // 2. If running via file:// protocol
    if (window.location.protocol === 'file:') {
      this._showGoogleAccountModal({
        isFileProtocol: true,
        reason: 'Local file:// protocol detected. Google security blocks OAuth popups on file paths.'
      });
      return;
    }

    // 3. Web Firebase Authentication (Popup only — NEVER redirect to external browser which breaks sessionStorage)
    this.initFirebase();

    if (typeof firebase === 'undefined' || !firebase.auth) {
      this.showToast('⚠️ Opening Google Account Sign-In...');
      this._showGoogleAccountModal({ isFileProtocol: false });
      return;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });

      this.showToast('🔐 Connecting to Google Account...');

      let user = null;
      try {
        const result = await firebase.auth().signInWithPopup(provider);
        user = result.user;
      } catch (popupErr) {
        console.warn('Popup sign in error, showing in-app Google selector:', popupErr);
        this._showGoogleAccountModal({
          isFileProtocol: false,
          errorNotice: popupErr.code === 'auth/unauthorized-domain'
            ? 'Domain authorization notice — enter account below:'
            : 'Enter your Google Account below:'
        });
        return;
      }

      if (user && user.email) {
        const displayName = user.displayName || user.email.split('@')[0];
        const photoURL = user.photoURL || null;
        this.loginUser(user.email, displayName, photoURL);
        this.showToast(`✅ Welcome, ${displayName}! (Verified Google Account)`);
      }
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      this._showGoogleAccountModal({ isFileProtocol: false, errorNotice: err.message });
    }
  }

  /**
   * Universal Google Account Sign-In Modal
   * Works smoothly on mobile APKs, offline, localhost, or live cloud.
   */
  _showGoogleAccountModal(options = {}) {
    // Remove existing modal if already open
    const existing = document.getElementById('googleAccountModal');
    if (existing) existing.remove();

    const isFile = !!options.isFileProtocol;
    const errorNotice = options.errorNotice || '';

    const overlay = document.createElement('div');
    overlay.id = 'googleAccountModal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0, 0, 0, 0.88); backdrop-filter: blur(14px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px; animation: fadeIn 0.25s ease;
    `;

    overlay.innerHTML = `
      <div style="
        background: linear-gradient(150deg, #0b1329 0%, #111e38 60%, #0d172c 100%);
        border: 1px solid rgba(100,116,139,0.35);
        border-radius: 24px; padding: 28px 24px; max-width: 440px; width: 100%;
        box-shadow: 0 25px 70px rgba(0,0,0,0.8), 0 0 50px rgba(100,116,139,0.15);
        font-family: 'Plus Jakarta Sans', sans-serif; position: relative; color: #e2e8f0;
      ">
        <!-- Close Button -->
        <button id="closeGoogleModalBtn" style="
          position: absolute; top: 16px; right: 16px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          color: #94a3b8; width: 32px; height: 32px; border-radius: 50%;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          font-size: 1rem; transition: all 0.15s;
        " onmouseover="this.style.background='rgba(192,57,43,0.2)';this.style.color='#f0a49e'" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.color='#94a3b8'">✕</button>

        <!-- Header -->
        <div style="text-align: center; margin-bottom: 22px;">
          <div style="
            width: 58px; height: 58px; margin: 0 auto 12px;
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 18px; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          ">
            <svg width="32" height="32" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
          </div>
          <h3 style="font-size: 1.25rem; font-weight: 800; margin: 0 0 6px; color: #f8fafc;">
            Sign In with Google
          </h3>
          <p style="font-size: 0.82rem; color: #94a3b8; margin: 0; line-height: 1.4;">
            ${errorNotice ? '<span style="color:#f87171; display:block; margin-bottom:4px;">' + errorNotice + '</span>' : ''}
            Enter your Google email to connect your VoltShare profile
          </p>
        </div>

        <!-- Google Account Form -->
        <div style="margin-bottom: 16px;">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div>
              <label style="display: block; font-size: 0.72rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Google Email</label>
              <input type="email" id="gCustomEmail" placeholder="yourname@gmail.com" value="" style="
                width: 100%; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15);
                border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 0.92rem;
                outline: none; transition: border-color 0.15s;
              " onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
            </div>

            <div>
              <label style="display: block; font-size: 0.72rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Your Name (Optional)</label>
              <input type="text" id="gCustomName" placeholder="e.g. Adithya" value="" style="
                width: 100%; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15);
                border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 0.92rem;
                outline: none; transition: border-color 0.15s;
              " onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
            </div>

            <button id="gCustomSubmitBtn" style="
              background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
              color: white; border: none; padding: 13px 18px; border-radius: 12px;
              font-size: 0.95rem; font-weight: 700; cursor: pointer; margin-top: 6px;
              box-shadow: 0 4px 18px rgba(2,132,199,0.4); transition: transform 0.15s;
              display: flex; align-items: center; justify-content: center; gap: 8px;
            " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
              <span>Continue to VoltShare</span> &rarr;
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listener for Google account submission
    const customSubmit = overlay.querySelector('#gCustomSubmitBtn');
    if (customSubmit) {
      customSubmit.addEventListener('click', () => {
        const emailInput = overlay.querySelector('#gCustomEmail');
        const nameInput = overlay.querySelector('#gCustomName');
        const email = (emailInput ? emailInput.value : '').trim().toLowerCase();
        let name = (nameInput ? nameInput.value : '').trim();

        if (!email || !email.includes('@')) {
          this.showToast('⚠️ Please enter a valid Google email (e.g. yourname@gmail.com)');
          if (emailInput) emailInput.focus();
          return;
        }

        if (!name) {
          name = email.split('@')[0];
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }

        overlay.remove();
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=06b6d4&color=fff&size=128`;
        this.loginUser(email, name, avatarUrl);
        this.showToast(`✅ Welcome, ${name}! (Verified Google Account)`);
      });
    }

    // Localhost redirect button
    const localhostBtn = overlay.querySelector('#gOpenLocalhostBtn');
    if (localhostBtn) {
      localhostBtn.addEventListener('click', () => {
        window.location.href = 'http://localhost:8000/app.html';
      });
    }

    // Close button
    const closeBtn = overlay.querySelector('#closeGoogleModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => overlay.remove());
    }

    // Backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  loginUser(email, name = "EV Enthusiast", avatarUrl = null, isDemo = false, password = null) {
    const cleanEmail = (email || "driver@voltshare.io").trim().toLowerCase();
    let displayName = name;
    let userSqlId = null;

    if (isDemo) {
      // Pure In-Memory Demo Mode: Never persist or sync demo accounts to Supabase or localStorage!
      this.currentUser = {
        email: cleanEmail,
        name: displayName,
        sqlId: `demo-${cleanEmail.includes('host') ? 'host' : 'driver'}`,
        avatarUrl: avatarUrl || null,
        isDemo: true,
        loggedInAt: Date.now()
      };
      this.walletBalance = 1500.00;
      this.hostEarnings = 0.00;
      this.hostTotalKwh = 0.0;
      this.hostUploadedPhotos = [];

      const authScreen = document.getElementById('appAuthScreen');
      if (authScreen) authScreen.style.display = 'none';

      const roleScreen = document.getElementById('appRoleScreen');
      if (roleScreen) {
        roleScreen.style.display = 'flex';
        roleScreen.classList.remove('fade-out');
      }
      this.updateDemoModeUI();
      return { success: true, user: this.currentUser };
    }

    if (window.db) {
      // 1. Check if user with this EXACT email already exists in Supabase / SQL Database
      const existingUser = window.db.getUser(cleanEmail);

      if (existingUser) {
        // Password verification for existing accounts
        if (password && existingUser.password) {
          if (existingUser.password !== password) {
            return {
              success: false,
              error: 'The email or the entered password is wrong. Please check it and try again.'
            };
          }
        } else if (password && !existingUser.password) {
          // Bind password on first email sign-in for legacy records
          existingUser.password = password;
        }

        // SAME SIGN IN INFO -> KEEP EXACT SAME USER ID & LOAD STORED PROFILE
        userSqlId = existingUser.id;
        displayName = existingUser.full_name || displayName;
        this.walletBalance = parseFloat(existingUser.wallet_balance !== undefined ? existingUser.wallet_balance : 0.00);
        this.userRole = existingUser.role_preference || 'driver';
        this._isExistingUser = true;
        
        // Update last login timestamp
        existingUser.last_login_at = new Date().toISOString();
        window.db.save(false);
      } else {
        this._isExistingUser = false;
        // DIFFERENT / NEW SIGN IN INFO -> DIRECTLY CREATE NEW ROW IN SQL DB WITH UNIQUE USER ID & EMPTY PROFILE DETAILS
        userSqlId = `usr-${Date.now()}`;
        displayName = (name && name !== "EV Enthusiast") 
          ? name 
          : (cleanEmail.split('@')[0] ? cleanEmail.split('@')[0].charAt(0).toUpperCase() + cleanEmail.split('@')[0].slice(1) : '');

        const newUser = window.db.insertUser({
          id: userSqlId,
          email: cleanEmail,
          password: password || '',
          full_name: displayName,
          phone: '',
          role_preference: 'driver',
          address: '',
          lat: null,
          lng: null,
          ev_model: '',
          ev_battery_capacity_kwh: null,
          ev_plate_number: '',
          wallet_balance: 0.00,
          currency: 'INR',
          kyc_status: 'VERIFIED'
        });

        // Directly create associated host record in SQL DB with empty/zero values (no dummy stats)
        window.db.insertHost({
          id: `host-${Date.now()}`,
          user_id: userSqlId,
          display_name: '',
          address: '',
          lat: null,
          lng: null,
          payout_upi_id: '',
          bank_account_no: '',
          bank_ifsc: '',
          total_earnings: 0.00,
          total_kwh_shared: 0.0,
          host_rating: 0.0,
          reviews_count: 0,
          photos: []
        });

        this.walletBalance = 0.00;
        this.hostEarnings = 0.00;
        this.hostTotalKwh = 0.0;
        this.userRole = null;
      }
    }

    this.currentUser = { 
      email: cleanEmail, 
      name: displayName, 
      sqlId: userSqlId, 
      avatarUrl: avatarUrl || null,
      isDemo: false,
      loggedInAt: Date.now() 
    };

    const authScreen = document.getElementById('appAuthScreen');
    if (authScreen) authScreen.style.display = 'none';

    // If pre-existing user who already has a role & profile: bypass role screen and profile,
    // take them directly to Explorer (Driver) or Dashboard (Host)
    if (this._isExistingUser && this.userRole) {
      const roleScreen = document.getElementById('appRoleScreen');
      if (roleScreen) roleScreen.style.display = 'none';
      this.hideLandingPage();

      const targetTab = this.userRole === 'host' ? 'tab-host-dashboard' : 'tab-explore';
      this.applyRoleInterface(this.userRole, targetTab);
      this.loadUserDetailsToForm();
      this.updateProfileModeUI(this.userRole);

      if (this.userRole === 'host') {
        this.loadHostNotificationsFromDB();
      }

      this.showToast(`👋 Welcome back, ${displayName || 'User'}!`);
      return { success: true, user: this.currentUser };
    }

    // New user: route to role selection screen so they select Driver or Host
    const roleScreen = document.getElementById('appRoleScreen');
    if (roleScreen) {
      roleScreen.style.display = 'flex';
      roleScreen.classList.remove('fade-out');
    }
  }

  selectRole(role) {
    this.userRole = role;

    const roleScreen = document.getElementById('appRoleScreen');
    if (roleScreen) roleScreen.style.display = 'none';
    this.hideLandingPage();

    // Check if user is pre-existing (already exists in DB with saved profile)
    const dbUser = (window.db && this.currentUser) ? (window.db.getUser(this.currentUser.sqlId) || window.db.getUser(this.currentUser.email)) : null;
    const isNewUser = !this._isExistingUser && (!dbUser || (!dbUser.full_name && !dbUser.ev_model && !dbUser.address && !dbUser.phone));

    if (isNewUser) {
      // First-time new user: route to profile form so they can enter details
      this.applyRoleInterface(role, 'tab-profile');
      this.loadUserDetailsToForm();
      this.updateProfileModeUI(role);
      this.showToast(`✨ Complete your ${role === 'driver' ? 'EV Driver' : 'Charger Host'} profile below to proceed.`);
    } else {
      // Pre-existing user: route directly to Explorer (driver) or Dashboard (host)
      const targetTab = role === 'host' ? 'tab-host-dashboard' : 'tab-explore';
      this.applyRoleInterface(role, targetTab);
      this.loadUserDetailsToForm();
      this.updateProfileModeUI(role);
      this.showToast(`👋 Welcome back, ${(dbUser && dbUser.full_name) || 'User'}!`);
    }

    // If entering host mode, load persisted host notifications from DB
    if (role === 'host') {
      this.loadHostNotificationsFromDB();
    }
  }

  applyRoleInterface(role, targetTab = null) {
    const rolePill = document.getElementById('headerRolePill');
    const roleIcon = document.getElementById('headerRoleIcon');
    const roleLabel = document.getElementById('headerRoleLabel');
    const bottomNav = document.getElementById('dynamicBottomNav');
    const activeTab = targetTab || (role === 'host' ? 'tab-host-dashboard' : 'tab-explore');

    if (role === 'host') {
      if (rolePill) {
        rolePill.className = 'header-role-pill mode-host';
      }
      if (roleIcon) roleIcon.className = 'fa-solid fa-house-signal';
      if (roleLabel) roleLabel.textContent = 'Host Mode';

      // Render Host Bottom Navigation
      if (bottomNav) {
        bottomNav.innerHTML = `
          <button class="nav-item ${activeTab === 'tab-host-dashboard' ? 'active' : ''}" data-tab="tab-host-dashboard">
            <i class="fa-solid fa-chart-pie"></i>
            <span>Dashboard</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-host-inquiries' ? 'active' : ''}" data-tab="tab-host-inquiries">
            <i class="fa-solid fa-inbox"></i>
            <span>Inquiries</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-wallet' ? 'active' : ''}" data-tab="tab-wallet">
            <i class="fa-solid fa-wallet"></i>
            <span>Wallet</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-profile' ? 'active' : ''}" data-tab="tab-profile">
            <i class="fa-solid fa-user"></i>
            <span>Profile</span>
          </button>
          <button class="nav-item" id="btnQuickSwitchToDriver">
            <i class="fa-solid fa-car-side" style="color: var(--accent-cyan);"></i>
            <span>Driver View</span>
          </button>
        `;
      }
      this.switchTab(activeTab);
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
          <button class="nav-item ${activeTab === 'tab-explore' ? 'active' : ''}" data-tab="tab-explore">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>Explore</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-charging' ? 'active' : ''}" data-tab="tab-charging">
            <span class="badge-active-dot" id="activeSessionDot" style="${this.chargingSession ? 'display: block;' : 'display: none;'}"></span>
            <i class="fa-solid fa-bolt"></i>
            <span>Charging</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-wallet' ? 'active' : ''}" data-tab="tab-wallet">
            <i class="fa-solid fa-wallet"></i>
            <span>Wallet</span>
          </button>
          <button class="nav-item ${activeTab === 'tab-profile' ? 'active' : ''}" data-tab="tab-profile">
            <i class="fa-solid fa-user"></i>
            <span>Profile</span>
          </button>
          <button class="nav-item" id="btnQuickSwitchToHost">
            <i class="fa-solid fa-house-signal" style="color: var(--accent-emerald);"></i>
            <span>Host Mode</span>
          </button>
        `;
      }
      this.switchTab(activeTab);
    }

    this.attachDynamicNavEvents();
    this.updateDemoModeUI();
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
    if (typeof firebase !== 'undefined' && firebase.auth) {
      try {
        firebase.auth().signOut().catch(() => {});
      } catch (e) {}
    }
    this.currentUser = null;
    this.userRole = null;
    this.hostUploadedPhotos = [];
    this.chargingSession = null;
    this.activeReservation = null;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    
    const roleModal = document.getElementById('roleSwitchModal');
    if (roleModal) roleModal.classList.remove('active');

    // Return to landing page (not auth screen) so user sees the home screen
    this.updateDemoModeUI();
    this.showLandingPage();
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
      modalIcon.style.color = isDark ? '#f59e0b' : '#94a3b8';
    }
  }

  // Applies/removes a CSS dark filter on the Leaflet map container for dark mode
  _applyLeafletDarkFilter() {
    const el = document.getElementById('leafletMap');
    if (!el) return;
    if (this.currentTheme === 'dark') {
      el.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)';
    } else {
      el.style.filter = 'none';
    }
    // Re-invert markers/overlays so they don't get color-flipped by the filter
    const markerStyle = document.getElementById('_leafletMarkerInvertFix');
    if (!markerStyle) {
      const s = document.createElement('style');
      s.id = '_leafletMarkerInvertFix';
      s.textContent = `
        #leafletMap .custom-ev-marker,
        #leafletMap .custom-user-div-icon,
        #leafletMap .leaflet-control,
        #leafletMap .leaflet-popup { filter: invert(1) hue-rotate(180deg); }
      `;
      document.head.appendChild(s);
    }
  }

  updateMapTheme() {
    const isDark = this.currentTheme === 'dark';
    if (this.mapEngine === 'leaflet' && this.map && typeof L !== 'undefined') {
      // Swap ESRI tile layer to match current theme
      if (this.leafletTileLayer) {
        this.map.removeLayer(this.leafletTileLayer);
      }
      const esriTileUrl = isDark
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      this.leafletTileLayer = L.tileLayer(esriTileUrl, {
        attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 18
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

        // ESRI ArcGIS tiles — 100% free, no API key, works from file:// URLs (OSM blocks file://)
        const isDark = this.currentTheme === 'dark';
        const esriTileUrl = isDark
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

        this.leafletTileLayer = L.tileLayer(esriTileUrl, {
          attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a>',
          maxZoom: 18
        }).addTo(this.map);

        // Apply dark CSS filter if in dark mode (no paid dark tile service needed)
        this._applyLeafletDarkFilter();

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
        badge.style.borderColor = 'rgba(100,116,139,0.6)';
        badge.style.color = '#94a3b8';
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
          this.userLocation.name = "My Live Location";

          if (locateBtn) locateBtn.classList.remove('locate-active');

          this.reanchorChargersAroundUser();
          this.updateMapUserMarker();
          this.renderMapMarkers();
          this.renderNearbyList();

          // Pan/fly the map to the user's actual location silently without toasts
          if (this.mapEngine === 'leaflet' && this.map) {
            this.map.flyTo([this.userLocation.lat, this.userLocation.lng], 15, { duration: 1.2 });
          } else if (this.mapEngine === 'google' && this.googleMap) {
            this.googleMap.panTo({ lat: this.userLocation.lat, lng: this.userLocation.lng });
            this.googleMap.setZoom(15);
          }
        },
        (error) => {
          if (locateBtn) locateBtn.classList.remove('locate-active');
          console.warn("Location error:", error.message);
          this.updateMapUserMarker();
          this.renderMapMarkers();
          this.renderNearbyList();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      if (locateBtn) locateBtn.classList.remove('locate-active');
      this.updateMapUserMarker();
      this.renderMapMarkers();
      this.renderNearbyList();
    }
  }

  async reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          const a = data.address || {};
          const street = a.road || a.pedestrian || a.suburb || a.neighbourhood || '';
          const area = a.suburb || a.neighbourhood || a.city_district || '';
          const city = a.city || a.town || a.county || a.state_district || '';
          const parts = [street, area, city].filter(Boolean);
          return parts.length >= 2 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
        }
      }
    } catch(e) {
      console.warn("Reverse geocode fetch fallback:", e);
    }
    return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }

  loadChargersFromDB() {
    let communityChargers = [];
    const seenIds = new Set();
    const seenSignatures = new Set();

    if (window.db && window.db.tables && window.db.tables.chargers) {
      // Purge any duplicates from window.db.tables.chargers
      const uniqueDbChargers = [];
      window.db.tables.chargers.forEach(c => {
        if (!c || !c.id) return;
        const lat = parseFloat(c.latitude || c.lat || 0).toFixed(4);
        const lng = parseFloat(c.longitude || c.lng || 0).toFixed(4);
        const titleKey = (c.title || '').trim().toLowerCase();
        const sig = `${titleKey}|${lat}|${lng}`;

        if (seenIds.has(c.id) || seenSignatures.has(sig)) {
          return; // Skip duplicate
        }
        seenIds.add(c.id);
        seenSignatures.add(sig);
        uniqueDbChargers.push(c);
      });
      window.db.tables.chargers = uniqueDbChargers;

      communityChargers = uniqueDbChargers.map(c => {
        const isComp = Boolean(c.is_company_station);
        return {
          id: c.id,
          host_id: c.host_id || null,
          hostId: c.host_id || null,
          title: c.title,
          companyName: c.company_name || (isComp ? c.title : null),
          isCompanyStation: isComp,
          isCommunityHost: !isComp,
          hostName: c.host_name || (window.db.tables.hosts && window.db.tables.hosts.find(h => h.id === c.host_id)?.display_name) || (isComp ? (c.company_name || c.title) : "Community Host"),
          hostAvatar: isComp ? "🔴" : "🏡",
          hostRating: isComp ? 4.8 : 5.0,
          hostReviewsCount: isComp ? 150 : 1,
          isVerifiedHost: true,
          address: c.address,
          city: (c.city || 'bengaluru').toLowerCase(),
          lat: parseFloat(c.latitude || c.lat),
          lng: parseFloat(c.longitude || c.lng),
          connectorType: c.connector_type || c.connectorType || 'Type 2 (AC)',
          powerKw: parseFloat(c.power_kw || c.powerKw || 11.0),
          ratePerKwhINR: parseFloat(c.rate_per_kwh || c.ratePerKwhINR || 15.00),
          parkingType: c.parking_type || c.parkingType || 'Private Covered Driveway',
          accessHours: c.access_hours || c.accessHours || '24/7 Access',
          availability: c.availability_status || c.availability || 'available',
          solarPowered: Boolean(c.is_solar_powered ?? c.solarPowered),
          amenities: typeof c.amenities === 'string' ? JSON.parse(c.amenities || '[]') : (c.amenities || ['Private Dedicated Bay', 'CCTV Security']),
          notes: c.notes || '',
          photos: c.photos || c.charger_photos || [],
          totalSessions: c.total_sessions || 0,
          efficiencyScore: c.efficiency_score || "100%",
          reviews: []
        };
      });
    }

    // Official company-established commercial EV charging stations fallback (avoid duplicates)
    const companyStations = (window.COMPANY_CHARGING_STATIONS || [])
      .filter(cs => !seenIds.has(cs.id))
      .map(cs => ({
        ...cs,
        host_id: null,
        hostId: null,
        isCompanyStation: true,
        isCommunityHost: false,
        hostAvatar: "🔴"
      }));

    return [...companyStations, ...communityChargers];
  }

  reanchorChargersAroundUser() {
    // Chargers maintain their real physical established GPS coordinates
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
        .bindPopup(`<b>Your Location</b><br>Scanning EV stations within reach`)
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
          <circle cx="22" cy="22" r="20" fill="rgba(100,116,139,0.25)" stroke="#64748b" stroke-width="2"/>
          <circle cx="22" cy="22" r="14" fill="#64748b"/>
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
        const isCompany = ch.isCompanyStation === true;
        const statusClass = isCompany ? 'company-station' : (isAvailable ? 'available' : (ch.availability === 'reserved' ? 'reserved' : 'in-use'));
        const symbol = isCompany 
          ? '<i class="fa-solid fa-charging-station" style="color:#c0392b;font-size:0.85rem;"></i>' 
          : (ch.connectorType.includes('CCS') ? '⚡' : ch.connectorType.includes('Tesla') ? '🔌' : '🔋');
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

        const badgeHtml = isCompany 
          ? `<span style="background: rgba(192,57,43,0.15); color: #c0392b; border: 1px solid rgba(192,57,43,0.4); padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-building-flag"></i> ${ch.companyName || 'Company Hub'}</span>`
          : `<span style="background: rgba(22,163,74,0.15); color: #16a34a; border: 1px solid rgba(22,163,74,0.4); padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-house"></i> Community Host</span>`;

        const isAvailableForReserve = ch.availability === 'available' && !isCompany;
        const popupContent = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px; padding: 4px;">
            <div style="margin-bottom: 4px;">${badgeHtml}</div>
            <h4 style="margin: 0 0 3px; font-weight: 800; color: #0f172a; font-size: 13px;">${ch.title}</h4>
            <p style="margin: 0 0 5px; font-size: 11px; color: #64748b;">${ch.address}</p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px;">
              <span style="background: #16a34a20; color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">${rateFormatted}/hr</span>
              <span style="font-size: 11px; font-weight: 700; color: ${isCompany ? '#c0392b' : '#0284c7'};">${ch.powerKw} kW</span>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
              <button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) window.app.startTurnByTurnNavigation(c);" style="flex: 1; background: #475569; color: #fff; border: none; border-radius: 5px; padding: 5px 6px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px;">
                <i class="fa-solid fa-diamond-turn-right"></i> Navigate
              </button>
              ${isAvailableForReserve ? `<button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) { window.app.selectedCharger = c; window.app.openReservationModal(c); }" style="flex: 0 0 auto; background: #7c3aed; color: #fff; border: none; border-radius: 5px; padding: 5px 8px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 3px;" title="Reserve this spot"><i class="fa-solid fa-clock"></i> Reserve</button>` : ''}
              <button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) window.app.openChargerDetailModal(c);" style="flex: 1; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 6px; font-size: 10px; font-weight: 700; cursor: pointer;">
                Details
              </button>
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
        const isCompany = ch.isCompanyStation === true;
        const fillColor = isCompany ? '#c0392b' : (isAvailable ? '#16a34a' : '#f59e0b');
        const strokeColor = isCompany ? '#7f1d1d' : '#070a12';
        const symbol = isCompany ? '🔴' : (ch.connectorType.includes('CCS') ? '⚡' : ch.connectorType.includes('Tesla') ? '🔌' : '🔋');
        const rateFormatted = this.formatCurrency(this.getChargerRate(ch));

        const markerSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3"/>
            <text x="22" y="27" text-anchor="middle" fill="#ffffff" font-size="15" font-family="sans-serif" font-weight="bold">${symbol}</text>
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
            const badgeHtml = isCompany 
              ? `<span style="background: rgba(192,57,43,0.15); color: #c0392b; border: 1px solid rgba(192,57,43,0.4); padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; display: inline-flex; align-items: center; gap: 3px;">🔴 ${ch.companyName || 'Company Hub'}</span>`
              : `<span style="background: rgba(22,163,74,0.15); color: #16a34a; border: 1px solid rgba(22,163,74,0.4); padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; display: inline-flex; align-items: center; gap: 3px;">🏡 Community Host</span>`;

            const isAvailableForReserveG = ch.availability === 'available' && !isCompany;
            const infoHtml = `
              <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 210px; padding: 4px; color: #0f172a;">
                <div style="margin-bottom: 4px;">${badgeHtml}</div>
                <h4 style="margin: 0 0 3px; font-weight: 800; font-size: 13px;">${ch.title}</h4>
                <p style="margin: 0 0 5px; font-size: 11px; color: #64748b;">${ch.address}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px;">
                  <span style="background: #16a34a20; color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">${rateFormatted}/hr</span>
                  <span style="font-size: 11px; font-weight: 700; color: ${isCompany ? '#c0392b' : '#0284c7'};">${ch.powerKw} kW</span>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                  <button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) window.app.startTurnByTurnNavigation(c);" style="flex: 1; background: #475569; color: #fff; border: none; border-radius: 5px; padding: 5px 6px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px;">
                    <i class="fa-solid fa-diamond-turn-right"></i> Navigate
                  </button>
                  ${isAvailableForReserveG ? `<button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) { window.app.selectedCharger = c; window.app.openReservationModal(c); }" style="flex: 0 0 auto; background: #7c3aed; color: #fff; border: none; border-radius: 5px; padding: 5px 8px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 3px;" title="Reserve this spot"><i class="fa-solid fa-clock"></i> Reserve</button>` : ''}
                  <button onclick="event.stopPropagation(); const c = window.app && window.app.chargers.find(x => x.id === '${ch.id}'); if (c) window.app.openChargerDetailModal(c);" style="flex: 1; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 6px; font-size: 10px; font-weight: 700; cursor: pointer;">
                    Details
                  </button>
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
    return this.getChargerHourlyRate(charger);
  }

  formatCurrency(amount) {
    const cfg = (window.CURRENCY_CONFIG && window.CURRENCY_CONFIG[this.currentCurrency]) || { symbol: "₹" };
    return `${cfg.symbol}${parseFloat(amount).toFixed(2)}`;
  }

  getFilteredChargers() {
    return this.chargers.filter(ch => {
      const searchTerms = [
        ch.title,
        ch.address,
        ch.connectorType,
        ch.companyName || '',
        ch.hostName || ''
      ].join(' ').toLowerCase();

      const matchesSearch = !this.searchQuery || searchTerms.includes(this.searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (this.activeFilter === 'all') return true;
      if (this.activeFilter === 'company') return ch.isCompanyStation === true;
      if (this.activeFilter === 'community') return !ch.isCompanyStation;
      if (this.activeFilter === 'available') return ch.availability === 'available';
      if (this.activeFilter === 'fast') return ch.powerKw >= 50.0;
      if (this.activeFilter === 'ac') return ch.powerKw < 50.0;
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
      countBadge.textContent = `${filtered.length} Station${filtered.length === 1 ? '' : 's'} Nearby`;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 35px 16px; color: var(--text-muted);">
          <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(100,116,139,0.1); border: 1px dashed var(--accent-cyan); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-size: 1.4rem;">⚡</div>
          <h4 style="color: var(--text-primary); font-size: 0.92rem; font-weight: 700; margin-bottom: 4px;">No Community Stations Established Yet</h4>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.4;">Be the first host to establish a private wallbox or community charger here!</p>
          <button class="btn-primary" id="btnEmptyStateAddHost" style="margin: 0 auto; padding: 6px 14px; font-size: 0.75rem; border-radius: var(--radius-full); width: auto;">
            <i class="fa-solid fa-plus"></i> Establish Charger as Host
          </button>
        </div>
      `;
      const emptyBtn = document.getElementById('btnEmptyStateAddHost');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => {
          this.selectRole('host');
          const modal = document.getElementById('hostWizardModal');
          if (modal) {
            modal.classList.add('active');
            const latInp = document.getElementById('hostFormLat');
            const lngInp = document.getElementById('hostFormLng');
            if (latInp) latInp.value = this.userLocation.lat.toFixed(6);
            if (lngInp) lngInp.value = this.userLocation.lng.toFixed(6);
          }
        });
      }
      return;
    }

    const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';

    listContainer.innerHTML = filtered.map(ch => {
      const dist = this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, ch.lat, ch.lng);
      const rateFormatted = this.formatCurrency(this.getChargerRate(ch));
      const isSelected = this.selectedCharger && this.selectedCharger.id === ch.id;
      const isCompany = ch.isCompanyStation === true;
      const isMyResv = ch.availability === 'reserved' && ch.reservedBy === driverId;
      const statusLabel = isCompany ? '24/7 Public' : (ch.availability === 'in-use' ? 'In Use' : (ch.availability === 'reserved' ? (isMyResv ? 'Reserved for You' : 'Reserved') : ch.availability));
      const statusClass = isCompany ? 'status-company' : (ch.availability === 'reserved' ? 'status-reserved' : `status-${ch.availability}`);

      const stationTag = isCompany
        ? `<span class="company-station-tag"><i class="fa-solid fa-building-flag"></i> ${ch.companyName || 'Company Fast Station'}</span>`
        : `<span class="community-host-tag"><i class="fa-solid fa-house"></i> Community Host</span>`;

      return `
        <div class="station-card ${isSelected ? 'highlighted' : ''} ${isCompany ? 'station-company-card' : ''}" data-id="${ch.id}">
          <div style="margin-bottom: 6px;">${stationTag}</div>
          <div class="station-card-top">
            <div class="station-info-group">
              <div class="station-name">
                ${ch.title}
                ${isCompany ? '<i class="fa-solid fa-certificate" style="color: #c0392b; font-size: 0.85rem;" title="Official Company Station"></i>' : (ch.isVerifiedHost ? '<i class="fa-solid fa-circle-check verified-host-icon" title="Verified Host"></i>' : '')}
              </div>
              <div class="station-address">
                <i class="fa-solid fa-location-dot" style="margin-right: 4px; color: ${isCompany ? '#c0392b' : 'var(--accent-cyan)'};"></i>
                ${ch.address}
              </div>
            </div>
            <div class="station-badge-rate" style="${isCompany ? 'border-color: rgba(192,57,43,0.4); background: rgba(192,57,43,0.1);' : ''}">
              <span class="rate-val" style="${isCompany ? 'color: #e07068;' : ''}">${rateFormatted}</span>
              <span class="rate-unit">/ hour</span>
            </div>
          </div>

          <div class="station-specs-row">
            <div class="spec-item">
              <i class="fa-solid fa-bolt" style="color: ${isCompany ? '#c0392b' : 'var(--accent-cyan)'};"></i>
              <span class="spec-power" style="${isCompany ? 'color: #e07068;' : ''}">${ch.powerKw} kW</span>
            </div>
            <div class="spec-item">
              <i class="fa-solid fa-plug" style="color: var(--text-muted);"></i>
              <span>${ch.connectorType}</span>
            </div>
            <div class="spec-item">
              <i class="fa-solid fa-route" style="color: var(--text-muted);"></i>
              <span>${dist} km</span>
            </div>
            <span class="status-indicator-badge ${statusClass}" style="${isCompany ? 'background: rgba(192,57,43,0.15); color: #e07068;' : ''}">
              ${statusLabel}
            </span>
          </div>

          <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
            <button class="btn-navigate-quick" data-nav-id="${ch.id}" title="Navigate to this charger"
              style="flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
                     padding:8px 10px; border-radius:8px; font-size:0.77rem; font-weight:700; cursor:pointer;
                     background:${isCompany ? 'rgba(192,57,43,0.15)' : 'rgba(100,116,139,0.15)'};
                     border:1px solid ${isCompany ? 'rgba(192,57,43,0.35)' : 'rgba(100,116,139,0.35)'};
                     color:${isCompany ? '#f0a49e' : '#94a3b8'};
                     transition:background 0.2s;">
              <i class="fa-solid fa-diamond-turn-right"></i> Navigate
            </button>
            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
              ${ch.availability === 'available' ? `<button class="btn-reserve-quick" data-reserve-id="${ch.id}" title="Reserve" style="background:none;border:none;padding:0;font-size:0.72rem;font-weight:600;cursor:pointer;color:var(--accent-amber);white-space:nowrap;"><i class="fa-solid fa-clock" style="margin-right:3px;"></i>Reserve</button>` : ''}
              <button class="btn-details-quick" data-details-id="${ch.id}" title="Details" style="background:none;border:none;padding:0;font-size:0.72rem;font-weight:600;cursor:pointer;color:var(--text-muted);white-space:nowrap;">Details</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Card-level event delegation — Navigate, Reserve and Details buttons
    listContainer.querySelectorAll('.btn-navigate-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-nav-id');
        const charger = this.chargers.find(c => c.id === id);
        if (charger) {
          this.selectedCharger = charger;
          this.startTurnByTurnNavigation(charger);
        }
      });
    });

    listContainer.querySelectorAll('.btn-reserve-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-reserve-id');
        const charger = this.chargers.find(c => c.id === id);
        if (charger) {
          this.selectedCharger = charger;
          this.openReservationModal(charger);
        }
      });
    });

    listContainer.querySelectorAll('.btn-details-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-details-id');
        const charger = this.chargers.find(c => c.id === id);
        if (charger) this.selectCharger(charger);
      });
    });

    // Tapping the card body (excluding action buttons) still opens details
    listContainer.querySelectorAll('.station-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-navigate-quick') || e.target.closest('.btn-details-quick') || e.target.closest('.btn-reserve-quick')) return;
        const id = card.getAttribute('data-id');
        const charger = this.chargers.find(c => c.id === id);
        if (charger) this.selectCharger(charger);
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
  // 4. Voice Direction System & Turn-by-Turn GPS Navigation (Google Maps Style)
  // =========================================================================
  initVoiceNavigation() {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis API is not available in this browser environment.');
      return;
    }

    const selectNaturalVoice = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (!voices || !voices.length) return;
        // Prioritize natural English navigation voices
        this.selectedVoice = voices.find(v => 
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Karen')) 
          && v.lang.startsWith('en')
        ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB' || v.lang.startsWith('en'))
          || voices[0];
      } catch (err) {
        console.warn('Could not select voice synthesizer:', err);
      }
    };

    selectNaturalVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = selectNaturalVoice;
    }
  }

  speakVoiceDirection(text, isUrgent = false) {
    if (!this.voiceNavEnabled || !('speechSynthesis' in window) || !text) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 0.98;   // Natural Google Maps driving cadence
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voiceBtn = document.getElementById('btnNavVoiceToggle');
      utterance.onstart = () => {
        if (voiceBtn) voiceBtn.classList.add('speaking');
      };
      utterance.onend = () => {
        if (voiceBtn) voiceBtn.classList.remove('speaking');
      };
      utterance.onerror = () => {
        if (voiceBtn) voiceBtn.classList.remove('speaking');
      };

      // Slight timeout prevents Chrome/Edge speech-synthesis cancel drop
      setTimeout(() => {
        if (this.isNavigating && this.voiceNavEnabled) {
          window.speechSynthesis.speak(utterance);
        }
      }, 50);
    } catch (err) {
      console.warn('Voice navigation speech error:', err);
    }
  }

  toggleVoiceNavigation() {
    this.voiceNavEnabled = !this.voiceNavEnabled;
    const btn = document.getElementById('btnNavVoiceToggle');
    const icon = document.getElementById('navVoiceIcon');

    if (this.voiceNavEnabled) {
      if (btn) {
        btn.classList.remove('muted');
        btn.style.background = 'rgba(22,163,74,0.25)';
        btn.style.borderColor = 'var(--accent-emerald)';
        btn.style.color = '#4ade80';
      }
      if (icon) {
        icon.className = 'fa-solid fa-volume-high';
      }
      this.showToast('🔊 Voice directions enabled');
      if (this.isNavigating) {
        this.speakVoiceDirection('Voice guidance unmuted.', true);
        setTimeout(() => {
          if (this.isNavigating && this.voiceNavEnabled) {
            this.displayAndSpeakCurrentNavStep();
          }
        }, 1400);
      }
    } else {
      if (btn) {
        btn.classList.add('muted');
        btn.classList.remove('speaking');
        btn.style.background = 'rgba(192,57,43,0.2)';
        btn.style.borderColor = 'rgba(192,57,43,0.5)';
        btn.style.color = '#f0a49e';
      }
      if (icon) {
        icon.className = 'fa-solid fa-volume-xmark';
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.showToast('🔇 Voice directions muted');
    }
  }

  replayCurrentVoiceDirection() {
    if (!this.isNavigating || !this.navSteps.length) return;
    const step = this.navSteps[this.navCurrentStepIndex];
    if (step) {
      this.speakVoiceDirection(step.speech, true);
      this.showToast(`🔊 ${step.hudText}`);
    }
  }

  buildSimulatedNavigationSteps(charger, totalDistKm, totalEtaMins) {
    const rawStreet = (charger.address || '').split(',')[0].trim() || 'Main Road';
    const street = rawStreet.replace(/[0-9#]/g, '').trim() || 'Main Road';
    const dist = parseFloat(totalDistKm) || 2.4;
    const eta = parseInt(totalEtaMins) || 7;

    return [
      {
        speech: `Starting route to ${charger.title}. Head north.`,
        hudText: `Head north toward ${street}`,
        subText: `ETA: ${eta} min • ${dist.toFixed(1)} km`,
        iconClass: 'fa-location-arrow'
      },
      {
        speech: `In 60 meters, take a right turn onto ${street}.`,
        hudText: `↱ In 60m, take right turn`,
        subText: `ETA: ${eta} min • ${dist.toFixed(1)} km`,
        iconClass: 'fa-arrow-right'
      },
      {
        speech: `Take right turn.`,
        hudText: `↱ Take right turn onto ${street}`,
        subText: `ETA: ${Math.max(1, eta - 1)} min • ${(dist * 0.85).toFixed(1)} km`,
        iconClass: 'fa-arrow-right'
      },
      {
        speech: `In 150 meters, take a left turn.`,
        hudText: `↰ In 150m, take left turn`,
        subText: `ETA: ${Math.max(1, eta - 2)} min • ${(dist * 0.7).toFixed(1)} km`,
        iconClass: 'fa-arrow-left'
      },
      {
        speech: `In 60 meters, take a left turn.`,
        hudText: `↰ In 60m, take left turn`,
        subText: `ETA: ${Math.max(1, eta - 2)} min • ${(dist * 0.55).toFixed(1)} km`,
        iconClass: 'fa-arrow-left'
      },
      {
        speech: `Take left turn, then continue straight for 300 meters.`,
        hudText: `↑ Continue straight for 300m`,
        subText: `ETA: ${Math.max(1, eta - 3)} min • ${(dist * 0.35).toFixed(1)} km`,
        iconClass: 'fa-arrow-up'
      },
      {
        speech: `In 60 meters, your destination is on the right.`,
        hudText: `🏁 In 60m, destination on right`,
        subText: `ETA: 1 min • 0.1 km`,
        iconClass: 'fa-flag-checkered'
      },
      {
        speech: `You have arrived at ${charger.title}. Destination is on your right.`,
        hudText: `🏁 Arrived at ${charger.title}`,
        subText: `Destination reached • Navigation complete`,
        iconClass: 'fa-circle-check'
      }
    ];
  }

  buildStepsFromOsrm(steps, charger, totalDistKm, totalEtaMins) {
    const rawStreet = (charger.address || '').split(',')[0].trim() || 'Main Road';
    const destStreet = rawStreet.replace(/[0-9#]/g, '').trim() || 'Main Road';
    const dist = parseFloat(totalDistKm) || 2.4;
    const eta = parseInt(totalEtaMins) || 7;

    const result = [];
    const firstStreet = (steps[0]?.name || destStreet || 'road').replace(/[0-9#]/g, '').trim() || 'main road';

    // Departure
    result.push({
      speech: `Starting route to ${charger.title}. Head north towards ${firstStreet}.`,
      hudText: `Head toward ${firstStreet}`,
      subText: `ETA: ${eta} min • ${dist.toFixed(1)} km`,
      iconClass: 'fa-location-arrow'
    });

    const turnSteps = steps.filter(s => s.maneuver && s.maneuver.type !== 'depart');
    if (turnSteps.length === 0) {
      return this.buildSimulatedNavigationSteps(charger, totalDistKm, totalEtaMins);
    }

    let remainingDist = dist;
    let remainingEta = eta;

    turnSteps.forEach(s => {
      const maneuver = s.maneuver || {};
      const mod = maneuver.modifier || 'straight';
      const street = (s.name || destStreet).replace(/[0-9#]/g, '').trim() || destStreet;
      const stepDistM = Math.round(s.distance || 60);

      remainingDist = Math.max(0.1, remainingDist - (stepDistM / 1000));
      remainingEta = Math.max(1, Math.round(remainingDist * 2.5));

      if (maneuver.type === 'arrive') {
        result.push({
          speech: `In 60 meters, your destination is on the right.`,
          hudText: `🏁 In 60m, destination on right`,
          subText: `ETA: 1 min • 0.1 km`,
          iconClass: 'fa-flag-checkered'
        });
        result.push({
          speech: `You have arrived at ${charger.title}. Destination is on your right.`,
          hudText: `🏁 Arrived at ${charger.title}`,
          subText: `Destination reached`,
          iconClass: 'fa-circle-check'
        });
        return;
      }

      let dir = 'straight';
      let icon = 'fa-arrow-up';
      let emoji = '↑';

      if (mod.includes('right')) {
        dir = 'right turn';
        icon = 'fa-arrow-right';
        emoji = '↱';
      } else if (mod.includes('left')) {
        dir = 'left turn';
        icon = 'fa-arrow-left';
        emoji = '↰';
      } else if (mod.includes('uturn')) {
        dir = 'U-turn';
        icon = 'fa-rotate-left';
        emoji = '↩';
      }

      if (stepDistM > 80) {
        result.push({
          speech: `In ${stepDistM} meters, take a ${dir} onto ${street}.`,
          hudText: `${emoji} In ${stepDistM}m, take ${dir}`,
          subText: `ETA: ${remainingEta} min • ${remainingDist.toFixed(1)} km`,
          iconClass: icon
        });
      }

      result.push({
        speech: `In 60 meters, take a ${dir}.`,
        hudText: `${emoji} In 60m, take ${dir}`,
        subText: `ETA: ${remainingEta} min • ${remainingDist.toFixed(1)} km`,
        iconClass: icon
      });

      result.push({
        speech: `Take ${dir}.`,
        hudText: `${emoji} Take ${dir} onto ${street}`,
        subText: `ETA: ${remainingEta} min • ${remainingDist.toFixed(1)} km`,
        iconClass: icon
      });
    });

    if (!result.some(r => r.hudText.includes('Arrived'))) {
      result.push({
        speech: `In 60 meters, your destination is on the right.`,
        hudText: `🏁 In 60m, destination on right`,
        subText: `ETA: 1 min • 0.1 km`,
        iconClass: 'fa-flag-checkered'
      });
      result.push({
        speech: `You have arrived at ${charger.title}. Destination is on your right.`,
        hudText: `🏁 Arrived at ${charger.title}`,
        subText: `Destination reached`,
        iconClass: 'fa-circle-check'
      });
    }

    return result;
  }

  startNavStepExecution() {
    if (this.navStepTimer) {
      clearInterval(this.navStepTimer);
      this.navStepTimer = null;
    }
    this.navCurrentStepIndex = 0;

    // Immediately display and speak the first instruction
    this.displayAndSpeakCurrentNavStep();

    // Advance turn instructions every 6.5s to realistically simulate turn progression
    this.navStepTimer = setInterval(() => {
      if (!this.isNavigating) {
        if (this.navStepTimer) clearInterval(this.navStepTimer);
        return;
      }

      if (this.navCurrentStepIndex < this.navSteps.length - 1) {
        this.navCurrentStepIndex++;
        this.displayAndSpeakCurrentNavStep();
      } else {
        // Reached arrival step
        if (this.navStepTimer) {
          clearInterval(this.navStepTimer);
          this.navStepTimer = null;
        }
      }
    }, 6500);
  }

  displayAndSpeakCurrentNavStep() {
    if (!this.isNavigating || !this.navSteps.length) return;
    const step = this.navSteps[this.navCurrentStepIndex];
    if (!step) return;

    const nextTurnEl = document.getElementById('navNextTurn');
    const etaDetailsEl = document.getElementById('navEtaDetails');
    const iconEl = document.getElementById('navTurnIcon');

    if (nextTurnEl) nextTurnEl.textContent = step.hudText;
    if (etaDetailsEl) etaDetailsEl.textContent = step.subText;
    if (iconEl && step.iconClass) {
      iconEl.className = `fa-solid ${step.iconClass}`;
    }

    this.speakVoiceDirection(step.speech);
  }

  startTurnByTurnNavigation(targetCharger) {
    const charger = targetCharger || this.selectedCharger || this.chargers[0];
    if (!charger) {
      this.showToast("⚠️ Please select a charging station on the map first.");
      return;
    }

    this.selectedCharger = charger;
    this.isNavigating = true;

    // 1. Close all modals first
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

    // 2. Switch to explore tab so user sees the live map
    this.switchTab('tab-explore');

    const startLat = parseFloat(this.userLocation.lat);
    const startLng = parseFloat(this.userLocation.lng);
    const endLat = parseFloat(charger.lat);
    const endLng = parseFloat(charger.lng);

    // 3. Set external Google Maps deep-link
    const externalMapsBtn = document.getElementById('btnNavOpenGoogleMapsApp');
    if (externalMapsBtn) {
      externalMapsBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${endLat},${endLng}&travelmode=driving`;
      externalMapsBtn.setAttribute('rel', 'noopener noreferrer');
    }

    // 4. Activate Navigation HUD
    const hud = document.getElementById('navGuidanceHud');
    if (hud) hud.classList.add('active');

    // Reset voice button visual state
    const voiceBtn = document.getElementById('btnNavVoiceToggle');
    const voiceIcon = document.getElementById('navVoiceIcon');
    if (voiceBtn) {
      if (this.voiceNavEnabled) {
        voiceBtn.classList.remove('muted');
        voiceBtn.style.background = 'rgba(22,163,74,0.25)';
        voiceBtn.style.borderColor = 'var(--accent-emerald)';
        voiceBtn.style.color = '#4ade80';
        if (voiceIcon) voiceIcon.className = 'fa-solid fa-volume-high';
      } else {
        voiceBtn.classList.add('muted');
        voiceBtn.style.background = 'rgba(192,57,43,0.2)';
        voiceBtn.style.borderColor = 'rgba(192,57,43,0.5)';
        voiceBtn.style.color = '#f0a49e';
        if (voiceIcon) voiceIcon.className = 'fa-solid fa-volume-xmark';
      }
    }

    const directDist = parseFloat(this.calculateDistanceKm(startLat, startLng, endLat, endLng));
    const distKm = Math.max(0.2, directDist).toFixed(1);
    const etaMins = Math.max(2, Math.round(parseFloat(distKm) * 3));

    // 5. Generate initial directions and start voice instructions immediately!
    this.navSteps = this.buildSimulatedNavigationSteps(charger, distKm, etaMins);
    this.startNavStepExecution();

    // 6. Draw straight-line road preview immediately, then enhance with real OSRM road geometry
    setTimeout(() => {
      if (!this.isNavigating) return;

      this.drawFallbackNavigationPolyline([startLat, startLng], [endLat, endLng], charger);

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;

      fetch(osrmUrl, { signal: AbortSignal.timeout(8000) })
        .then(res => {
          if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!this.isNavigating) return;
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            const pathPoints = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);
            const realDistKm = (route.distance / 1000).toFixed(1);
            const realEtaMins = Math.max(1, Math.round(route.duration / 60));

            this.drawNavigationPolyline(pathPoints);

            const steps = route.legs?.[0]?.steps || [];
            if (steps.length > 1) {
              const refinedSteps = this.buildStepsFromOsrm(steps, charger, realDistKm, realEtaMins);
              if (refinedSteps && refinedSteps.length > 0) {
                const currentIdx = this.navCurrentStepIndex;
                this.navSteps = refinedSteps;
                this.navCurrentStepIndex = Math.min(currentIdx, this.navSteps.length - 1);
              }
            }
          }
        })
        .catch(err => {
          console.warn('OSRM road route unavailable, using simulated navigation steps:', err.message);
        });
    }, 350);

    this.showToast(`🧭 Navigating to ${charger.title}`);
  }

  drawNavigationPolyline(pathPoints) {
    // 1. Leaflet Engine
    if (this.mapEngine === 'leaflet' && this.map && typeof L !== 'undefined') {
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }
      this.routePolyline = L.polyline(pathPoints, {
        color: '#16a34a',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [60, 60] });
    }

    // 2. Google Maps Engine
    if (this.mapEngine === 'google' && this.googleMap && window.google) {
      if (this.googleRoutePolyline) {
        this.googleRoutePolyline.setMap(null);
      }
      const gPath = pathPoints.map(p => ({ lat: p[0], lng: p[1] }));
      this.googleRoutePolyline = new google.maps.Polyline({
        path: gPath,
        geodesic: true,
        strokeColor: '#16a34a',
        strokeOpacity: 0.95,
        strokeWeight: 6
      });
      this.googleRoutePolyline.setMap(this.googleMap);

      const bounds = new google.maps.LatLngBounds();
      gPath.forEach(p => bounds.extend(p));
      this.googleMap.fitBounds(bounds, 60);
    }
  }

  drawFallbackNavigationPolyline(start, end, charger) {
    const mid1 = [start[0] + (end[0] - start[0]) * 0.4 + 0.001, start[1] + (end[1] - start[1]) * 0.3];
    const mid2 = [start[0] + (end[0] - start[0]) * 0.7, start[1] + (end[1] - start[1]) * 0.8 + 0.001];
    const path = [start, mid1, mid2, end];
    this.drawNavigationPolyline(path);
  }

  stopNavigation() {
    this.isNavigating = false;
    if (this.navStepTimer) {
      clearInterval(this.navStepTimer);
      this.navStepTimer = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

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

    const voiceBtn = document.getElementById('btnNavVoiceToggle');
    if (voiceBtn) voiceBtn.classList.remove('speaking');

    this.showToast("🛑 Navigation ended");
  }

  // =========================================================================
  // 5. Charger Detail Modal & Reviews
  // =========================================================================
  openChargerDetailModal(inputCh) {
    const modal = document.getElementById('chargerDetailModal');
    if (!modal) return;

    let ch = inputCh || this.selectedCharger || (this.chargers && this.chargers[0]);
    if (typeof ch === 'string') {
      ch = (this.chargers && this.chargers.find(c => c.id === ch)) ||
           (window.db && window.db.tables && window.db.tables.chargers && window.db.tables.chargers.find(c => c.id === ch));
    }
    if (!ch) return;

    const dist = this.calculateDistanceKm(this.userLocation.lat, this.userLocation.lng, ch.lat, ch.lng);
    const rateFormatted = this.formatCurrency(this.getChargerRate(ch));
    const isCompany = ch.isCompanyStation === true;

    document.getElementById('modalStationTitle').innerHTML = isCompany
      ? `<span style="color:#e07068;">🔴</span> ${ch.title}`
      : ch.title;
    document.getElementById('modalHostName').textContent = isCompany ? (ch.companyName || ch.hostName) : ch.hostName;
    document.getElementById('modalHostAvatar').textContent = isCompany ? "🔴" : (ch.hostAvatar || "👨‍💼");
    const hasValidHostReviews = ch.hostReviewsCount > 0 && ch.hostRating > 0;
    document.getElementById('modalHostRating').textContent = hasValidHostReviews 
      ? `${ch.hostRating} ★ (${ch.hostReviewsCount} reviews)`
      : (isCompany ? 'Verified Commercial Hub' : 'New Host • Verified Community Member');
    document.getElementById('modalAddress').textContent = ch.address;
    document.getElementById('modalConnector').textContent = ch.connectorType;
    document.getElementById('modalPower').textContent = `${ch.powerKw} kW ${isCompany ? 'Fast DC' : ''}`;
    document.getElementById('modalParkingType').textContent = ch.parkingType;
    document.getElementById('modalAccessHours').textContent = ch.accessHours;
    document.getElementById('modalNotes').textContent = ch.notes || "Official public commercial charging hub.";
    document.getElementById('modalRatePill').textContent = `${rateFormatted} / hour`;
    document.getElementById('modalDistance').textContent = `${dist} km away`;

    // Render charger photos gallery
    const photosContainer = document.getElementById('modalPhotosContainer');
    const photosList = document.getElementById('modalPhotosList');
    const photosBadge = document.getElementById('modalPhotosBadge');

    let displayPhotos = [];
    if (Array.isArray(ch.photos) && ch.photos.length > 0) {
      displayPhotos = ch.photos;
    } else if (typeof ch.photos === 'string' && ch.photos) {
      try { displayPhotos = JSON.parse(ch.photos); } catch(e) {}
    } else if (Array.isArray(ch.charger_photos) && ch.charger_photos.length > 0) {
      displayPhotos = ch.charger_photos;
    } else if (typeof ch.charger_photos === 'string' && ch.charger_photos) {
      try { displayPhotos = JSON.parse(ch.charger_photos); } catch(e) {}
    }

    this.currentDetailModalPhotos = displayPhotos || [];
    this.currentDetailModalTitle = ch.title || 'Charger Photo';

    if (photosContainer && photosList) {
      if (displayPhotos && displayPhotos.length > 0) {
        photosContainer.style.display = 'block';
        if (photosBadge) {
          photosBadge.textContent = `${displayPhotos.length} Photos Verified`;
        }
        photosList.innerHTML = displayPhotos.map((imgSrc, idx) => `
          <div style="flex-shrink: 0; width: 110px; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; position: relative; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'" onclick="window.app.openPhotoSlideshow(window.app.currentDetailModalPhotos, ${idx}, window.app.currentDetailModalTitle)">
            <img src="${imgSrc}" alt="Charger Photo ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
            <span style="position: absolute; bottom: 3px; right: 5px; background: rgba(0,0,0,0.65); color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 3px;"><i class="fa-solid fa-expand"></i> #${idx + 1}</span>
          </div>
        `).join('');
      } else {
        photosContainer.style.display = 'none';
        photosList.innerHTML = '';
      }
    }

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
    const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';

    if (startBtn) {
      if (ch.availability === 'in-use') {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Currently Occupied';
        startBtn.style.opacity = '0.5';
      } else {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Pay &amp; Start Session';
        startBtn.style.opacity = '1';
      }
    }

    // Demo Mode: lock down (View-Only)
    if (this.currentUser && this.currentUser.isDemo) {
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-eye"></i> View-Only in Demo';
        startBtn.style.opacity = '0.55';
        startBtn.style.cursor = 'not-allowed';
      }
      const slotPicker = document.getElementById('slotPickerRow');
      if (slotPicker) slotPicker.style.opacity = '0.4';
    } else {
      // Init slot picker for this charger
      this.initSlotPicker(ch);
    }

    this.selectedCharger = ch;
    modal.classList.add('active');
  }

  // =========================================================================
  // 6. Driver Bay Reservation Engine (+₹30/hr)
  // =========================================================================
  checkActiveReservation() {
    if (!this.activeReservation) return;

    if (this.activeReservation.expiryTime && this.activeReservation.expiryTime > Date.now()) {
      this.startReservationTimer();
      this.updateReservationHud();
    } else {
      this.cancelActiveReservation(false);
    }
  }

  openReservationModal(charger) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Bay reservations are disabled.');
      return;
    }

    const modal = document.getElementById('reservePointModal');
    if (!modal) return;

    const ch = charger || this.selectedCharger || this.chargers[0];
    if (!ch) {
      this.showToast('⚠️ Please select a charging point first.');
      return;
    }

    this.reserveTargetCharger = ch;
    this.selectedReserveHours = 1;

    const elTitle = document.getElementById('reserveModalStationTitle');
    if (elTitle) elTitle.textContent = ch.title;

    const elAddr = document.getElementById('reserveModalAddress');
    if (elAddr) elAddr.textContent = ch.address;

    const elRate = document.getElementById('reserveModalRate');
    if (elRate) elRate.textContent = `${this.formatCurrency(this.getChargerRate(ch))} / kWh`;

    const elConn = document.getElementById('reserveModalConnector');
    if (elConn) elConn.textContent = ch.connectorType;

    const elPower = document.getElementById('reserveModalPower');
    if (elPower) elPower.textContent = `${ch.powerKw} kW`;

    const elDur = document.getElementById('reserveModalDurationText');
    if (elDur) elDur.textContent = '1 Hour (60 mins)';

    const elFee = document.getElementById('reserveModalTotalFee');
    if (elFee) elFee.textContent = this.formatCurrency(30);

    const elBal = document.getElementById('reserveModalWalletBalance');
    if (elBal) elBal.textContent = this.formatCurrency(this.walletBalance);

    const confirmBtn = document.getElementById('btnConfirmReservation');
    if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay ₹30.00 & Lock Bay';

    // Reset chips
    document.querySelectorAll('#reserveDurationChips .topup-amount-chip').forEach(c => {
      if (parseInt(c.dataset.hours) === 1) c.classList.add('active');
      else c.classList.remove('active');
    });

    modal.classList.add('active');
  }

  confirmReservation() {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Bay reservations are disabled.');
      return;
    }

    const ch = this.reserveTargetCharger || this.selectedCharger;
    if (!ch) {
      this.showToast('⚠️ No charging station selected to reserve.');
      return;
    }

    const hours = this.selectedReserveHours || 1;
    const fee = hours * 30.00; // ₹30 per hour holding fee

    if (this.walletBalance < fee) {
      this.showToast(`⚠️ Insufficient balance (${this.formatCurrency(this.walletBalance)}). ₹${fee} required to reserve.`);
      const resvModal = document.getElementById('reservePointModal');
      if (resvModal) resvModal.classList.remove('active');
      this.openTopUpModal(fee);
      return;
    }

    // 1. Deduct ₹30/hr reservation fee from wallet
    this.walletBalance = parseFloat((this.walletBalance - fee).toFixed(2));

    const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-driver';

    // 2. SQL DB: Update User Wallet & Record Transaction
    if (window.db && driverId && !this.currentUser?.isDemo) {
      window.db.updateUserWallet(driverId, this.walletBalance);
      window.db.recordTransaction({
        session_id: null,
        payer_user_id: driverId,
        payee_host_id: ch.host_id || null,
        charger_id: ch.id,
        subtotal_amount: fee,
        platform_fee_amount: 0.00,
        grand_total_amount: fee,
        currency: 'INR',
        payment_method: `VoltShare Wallet (Bay Reservation Fee ${hours}hr @ ₹30/hr)`,
        invoice_number: `INV-RESV-${Date.now().toString().slice(-6)}`
      });
    }

    // 3. Mark Charger State as Reserved
    ch.availability = 'reserved';
    ch.reservedBy = driverId;
    ch.reserveExpiry = Date.now() + (hours * 3600 * 1000);
    this.saveChargersState();

    // 4. Save Active Reservation with timer (in-memory)
    this.activeReservation = {
      id: `resv-${Date.now()}`,
      chargerId: ch.id,
      title: ch.title,
      address: ch.address,
      hours: hours,
      fee: fee,
      expiryTime: ch.reserveExpiry
    };

    this.startReservationTimer();
    this.updateReservationHud();
    this.updateWalletUI();
    this.renderTransactionHistory();
    this.renderMapMarkers();
    this.renderNearbyList();

    // Close modals
    const resvModal = document.getElementById('reservePointModal');
    if (resvModal) resvModal.classList.remove('active');
    const chModal = document.getElementById('chargerDetailModal');
    if (chModal) chModal.classList.remove('active');

    this.showToast(`🔒 Bay reserved for ${hours} hr! Paid ${this.formatCurrency(fee)} reservation fee from wallet.`, 'Bay Reserved');
  }

  startReservationTimer() {
    if (this.reservationTimer) clearInterval(this.reservationTimer);
    this.updateReservationHud();
    this.reservationTimer = setInterval(() => {
      this.updateReservationHud();
    }, 1000);
  }

  updateReservationHud() {
    const hud = document.getElementById('activeReservationHud');
    if (!hud) return;

    if (!this.activeReservation) {
      hud.style.display = 'none';
      if (this.reservationTimer) clearInterval(this.reservationTimer);
      return;
    }

    const remainingMs = this.activeReservation.expiryTime - Date.now();
    if (remainingMs <= 0) {
      this.cancelActiveReservation(false);
      this.showToast('⏱️ Reservation hold period expired. Charger bay released.');
      return;
    }

    const totalSecs = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const titleEl = document.getElementById('resvHudStationTitle');
    if (titleEl) titleEl.textContent = `🔒 Reserved: ${this.activeReservation.title}`;

    const countEl = document.getElementById('resvCountdownDisplay');
    if (countEl) countEl.textContent = timeFormatted;

    hud.style.display = 'flex';
  }

  cancelActiveReservation(notify = true) {
    if (this.activeReservation) {
      const ch = this.chargers.find(c => c.id === this.activeReservation.chargerId);
      if (ch) {
        ch.availability = 'available';
        delete ch.reservedBy;
        delete ch.reserveExpiry;
        this.saveChargersState();
      }
    }

    this.activeReservation = null;

    if (this.reservationTimer) {
      clearInterval(this.reservationTimer);
      this.reservationTimer = null;
    }

    this.updateReservationHud();
    this.renderMapMarkers();
    this.renderNearbyList();

    if (notify) {
      this.showToast('Reservation ended. Charger released back to available.');
    }
  }

  // =========================================================================
  // 7. Real-Time Charging Engine (kWh × Rate Formula)
  // =========================================================================
  // =========================================================================
  // In-App Notification system
  // =========================================================================

  showInAppNotification(title, body, type = 'info') {
    // Create notification element
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); padding: 12px 16px;
      box-shadow: var(--shadow-md); z-index: 9999;
      max-width: 320px; width: calc(100% - 32px);
      display: flex; align-items: flex-start; gap: 10px;
      animation: notifSlideIn 0.3s ease;
    `;

    const iconMap = { info: '🔔', success: '✅', warning: '⚠️', error: '❌' };
    const colorMap = { info: 'var(--accent-cyan)', success: 'var(--accent-emerald)', warning: 'var(--accent-amber)', error: 'var(--accent-rose)' };

    notif.innerHTML = `
      <span style="font-size:1.1rem;flex-shrink:0;">${iconMap[type] || '🔔'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">${title}</div>
        <div style="font-size:0.72rem;color:var(--text-secondary);line-height:1.4;">${body}</div>
      </div>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0;font-size:0.9rem;flex-shrink:0;line-height:1;">✕</button>
    `;

    // Add slide-in animation if not already
    if (!document.getElementById('notifKeyframes')) {
      const style = document.createElement('style');
      style.id = 'notifKeyframes';
      style.textContent = '@keyframes notifSlideIn { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 7000);

    // Also persist into in-app notifications drawer
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: title || 'Alert',
      msg: body || '',
      time: 'Just now',
      icon: iconMap[type] || '🔔',
      unread: true
    });
    this.renderNotifications();
  }

  // =========================================================================
  // Time-Slot Booking Engine
  // =========================================================================

  initSlotPicker(inputCharger) {
    let charger = inputCharger || this.selectedCharger || (this.chargers && this.chargers[0]);
    if (typeof charger === 'string') {
      charger = (this.chargers && this.chargers.find(c => c.id === charger)) ||
                (window.db && window.db.tables && window.db.tables.chargers && window.db.tables.chargers.find(c => c.id === charger));
    }
    const group = document.getElementById('slotBtnGroup');
    const costEl = document.getElementById('slotCostPreview');
    const endsEl = document.getElementById('slotEndsAtPreview');
    if (!group) return;

    this._selectedSlotMinutes = 30; // default
    const hourlyRate = this.getChargerHourlyRate(charger);
    const hourlyBadge = document.getElementById('slotHourlyRateBadge');
    if (hourlyBadge) hourlyBadge.textContent = `${this.formatCurrency(hourlyRate)} / hour`;

    const updatePreview = (minutes) => {
      const hourlyRate = this.getChargerHourlyRate(charger);
      const fee = parseFloat(((hourlyRate * minutes) / 60).toFixed(2));
      const platformFee = parseFloat((fee * 0.10).toFixed(2));
      const total = parseFloat((fee + platformFee).toFixed(2));
      const endsAt = new Date(Date.now() + minutes * 60 * 1000);
      const fmt = endsAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      if (costEl) costEl.textContent = this.formatCurrency(total);
      if (endsEl) endsEl.textContent = fmt;
      this._selectedSlotMinutes = minutes;
    };

    group.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePreview(parseInt(btn.dataset.minutes, 10));
      });
    });

    // Show initial preview
    updatePreview(30);
  }

  getChargerHourlyRate(charger) {
    if (!charger) return 120.00;
    // 1. Direct hourly rate configured by host in rupees per hour
    if (charger.ratePerHourINR !== undefined && charger.ratePerHourINR !== null) {
      return parseFloat(charger.ratePerHourINR);
    }
    if (charger.ratePerHour !== undefined && charger.ratePerHour !== null) {
      return parseFloat(charger.ratePerHour);
    }
    if (charger.rate_per_hour !== undefined && charger.rate_per_hour !== null) {
      return parseFloat(charger.rate_per_hour);
    }
    // 2. Fallback for seed chargers: if rate is >= 40 treat as rupees/hr; otherwise scale to realistic hourly
    if (charger.ratePerKwhINR !== undefined && charger.ratePerKwhINR !== null) {
      const r = parseFloat(charger.ratePerKwhINR);
      if (r >= 40) return r;
      const p = charger.powerKw ? Math.min(parseFloat(charger.powerKw), 11.0) : 7.4;
      return parseFloat((r * p).toFixed(2));
    }
    if (charger.rate_per_kwh !== undefined && charger.rate_per_kwh !== null) {
      const r = parseFloat(charger.rate_per_kwh);
      if (r >= 40) return r;
      const p = charger.powerKw ? Math.min(parseFloat(charger.powerKw), 11.0) : 7.4;
      return parseFloat((r * p).toFixed(2));
    }
    return 120.00;
  }

  scheduleSessionNotifications(session) {
    const isTest1Min = session.durationMinutes === 1;
    const durationMs = session.durationMinutes * 60 * 1000;
    // For 1-minute test: warning at 30 seconds; expiration at 60 seconds; payout notice 10s later
    const warnMs = isTest1Min ? 30 * 1000 : durationMs - (10 * 60 * 1000);
    const endMs = durationMs;
    const hostPayoutMs = isTest1Min ? durationMs + (10 * 1000) : durationMs + (5 * 60 * 1000);

    // Clear any existing notification timers
    if (this._notifTimers) this._notifTimers.forEach(t => clearTimeout(t));
    this._notifTimers = [];

    // T-warn: Notify driver to prepare to leave
    if (warnMs > 0) {
      this._notifTimers.push(setTimeout(() => {
        if (!this.chargingSession) return;
        const remainingText = isTest1Min ? '30 seconds' : '10 minutes';
        this.showInAppNotification(
          `Heads up — ${remainingText} left`,
          isTest1Min 
            ? 'Your 1-minute test slot ends in 30 seconds. Automatic invoice debit will occur at 60s.'
            : 'Please prepare to leave. Your slot ends soon and another driver may be arriving.',
          'warning'
        );
        this.showToast(`⏰ ${remainingText} left in your session — please prepare to unplug.`);
      }, warnMs));
    }

    // T+0: Session auto-expires
    this._notifTimers.push(setTimeout(() => {
      if (!this.chargingSession) return;
      this.showInAppNotification(
        'Session ended',
        `Your ${session.durationMinutes}-minute slot at ${session.chargerTitle} has expired. Debit settled.`,
        'info'
      );
      this.stopChargingSession(true); // true = auto-expired
    }, endMs));

    // Post session: Notify host that payout was processed
    this._notifTimers.push(setTimeout(() => {
      const hostEarnings = session.hostPayout;
      this.showInAppNotification(
        'Payment confirmed — driver has left',
        `${this.formatCurrency(hostEarnings)} has been credited to your host earnings after the platform fee.`,
        'success'
      );
    }, hostPayoutMs));
  }

  startChargingSession(inputCharger) {
    let charger = inputCharger || this.selectedCharger || (this.chargers && this.chargers[0]);
    if (typeof charger === 'string') {
      charger = (this.chargers && this.chargers.find(c => c.id === charger)) || 
                (window.db && window.db.tables && window.db.tables.chargers && window.db.tables.chargers.find(c => c.id === charger));
    }
    if (!charger) {
      this.showToast('⚠️ No charger selected.');
      return;
    }

    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Charging access is disabled in view-only mode.');
      return;
    }

    const slotMinutes = this._selectedSlotMinutes || 30;
    const hourlyRate  = this.getChargerHourlyRate(charger);
    const sessionFee  = parseFloat(((hourlyRate * slotMinutes) / 60).toFixed(2));
    const platformFee = parseFloat((sessionFee * 0.10).toFixed(2));
    const totalCharge = parseFloat((sessionFee + platformFee).toFixed(2));

    // Check wallet balance
    if (this.walletBalance < totalCharge) {
      this.showToast(`❌ Insufficient wallet balance. Need ${this.formatCurrency(totalCharge)}, have ${this.formatCurrency(this.walletBalance)}.`);
      return;
    }

    const now = Date.now();
    const sessionId = `sess-${now}`;
    const endTime = now + slotMinutes * 60 * 1000;
    const hostPayout = parseFloat((sessionFee * 0.90).toFixed(2)); // host gets 90%

    // Deduct upfront from wallet permanently and record transaction
    this.deductFromWallet(totalCharge, `EV Slot Booking: ${charger.title} (${slotMinutes} min)`);
    if (window.db) {
      const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';
      window.db.recordTransaction({
        session_id: sessionId,
        payer_user_id: driverId,
        payee_host_id: charger.hostId || null,
        charger_id: charger.id,
        subtotal_amount: sessionFee,
        platform_fee_amount: platformFee,
        grand_total_amount: totalCharge,
        currency: this.currentCurrency || 'INR',
        payment_method: 'VoltShare Wallet'
      });
    }

    // Close detail modal
    const modal = document.getElementById('chargerDetailModal');
    if (modal) modal.classList.remove('active');

    // Mark charger in-use
    charger.availability = 'in-use';
    this.saveChargersState();
    if (window.db) window.db.updateChargerAvailability(charger.id, 'in-use');
    this.renderMapMarkers();
    this.renderNearbyList();

    let hostId = null;
    if (window.db) {
      const dbCharger = window.db.tables.chargers.find(c => c.id === charger.id);
      if (dbCharger) hostId = dbCharger.host_id;
    }

    this.chargingSession = {
      id: sessionId,
      chargerId: charger.id,
      chargerTitle: charger.title,
      hostName: charger.hostName,
      address: charger.address,
      durationMinutes: slotMinutes,
      startTime: now,
      endTime: endTime,
      sessionFee: sessionFee,
      platformFee: platformFee,
      totalCharged: totalCharge,
      hostPayout: hostPayout,
      hourlyRate: hourlyRate,
      hostId: hostId,
      autoExpired: false
    };

    // DB session record
    if (window.db) {
      const driverId = this.currentUser?.sqlId || 'usr-demo';
      window.db.createSession({
        id: sessionId,
        driver_id: driverId,
        host_id: hostId,
        charger_id: charger.id,
        start_time: new Date(now).toISOString(),
        rate_applied_per_kwh: this.getChargerRate(charger),
        power_kw: charger.powerKw,
        avg_voltage: charger.voltage || 230.0
      });
    }

    this.switchTab('tab-charging');
    this.runCountdownLoop();
    this.scheduleSessionNotifications(this.chargingSession);
    this.showToast(`⚡ Session started! ${slotMinutes} min slot — ${this.formatCurrency(totalCharge)} charged from wallet.`);
  }

  runCountdownLoop() {
    if (this.sessionInterval) clearInterval(this.sessionInterval);
    this.sessionInterval = setInterval(() => {
      if (!this.chargingSession) { clearInterval(this.sessionInterval); return; }
      this.updateChargingScreenUI();
    }, 1000);
    this.updateChargingScreenUI(); // immediate first render
  }

  updateChargingScreenUI() {
    const s = this.chargingSession;
    const activeView  = document.getElementById('activeChargingView');
    const noActiveView = document.getElementById('noActiveChargingView');
    const dot = document.getElementById('activeSessionDot');

    if (!s) {
      if (activeView)   activeView.style.display  = 'none';
      if (noActiveView) noActiveView.style.display = 'flex';
      if (dot) dot.style.display = 'none';
      return;
    }

    if (activeView)   activeView.style.display  = 'flex';
    if (noActiveView) noActiveView.style.display = 'none';
    if (dot) dot.style.display = 'block';

    const now        = Date.now();
    const remaining  = Math.max(0, s.endTime - now);
    const totalMs    = s.durationMinutes * 60 * 1000;
    const elapsed    = totalMs - remaining;
    const pct        = Math.min(100, (elapsed / totalMs) * 100);

    // Countdown display
    const remSecs  = Math.floor(remaining / 1000);
    const remMins  = Math.floor(remSecs / 60);
    const remSecsR = remSecs % 60;
    const cdEl = document.getElementById('sessionCountdownDisplay');
    if (cdEl) {
      cdEl.textContent = `${String(remMins).padStart(2, '0')}:${String(remSecsR).padStart(2, '0')}`;
      // Turn red in last 5 minutes
      cdEl.style.color = remMins < 5 ? 'var(--accent-rose)' : 'var(--text-primary)';
    }

    // Progress bar
    const bar = document.getElementById('sessionProgressBar');
    if (bar) bar.style.width = `${pct}%`;

    // Times
    const fmtTime = ts => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const startEl = document.getElementById('sessionStartTimeLabel');
    const endEl   = document.getElementById('sessionEndTimeLabel');
    const slotEl  = document.getElementById('sessionSlotLabel');
    const nameEl  = document.getElementById('liveStationName');
    const addrEl  = document.getElementById('liveStationAddress');

    if (startEl) startEl.textContent = fmtTime(s.startTime);
    if (endEl)   endEl.textContent   = fmtTime(s.endTime);
    if (slotEl)  slotEl.textContent  = s.durationMinutes >= 60
      ? `${s.durationMinutes / 60}h`
      : `${s.durationMinutes}m`;
    if (nameEl)  nameEl.textContent  = s.chargerTitle;
    if (addrEl)  addrEl.textContent  = s.address || '';

    // Payment summary
    const feeEl   = document.getElementById('recSessionFee');
    const cutEl   = document.getElementById('recPlatformCut');
    const totEl   = document.getElementById('recSessionTotal');
    if (feeEl) feeEl.textContent = this.formatCurrency(s.sessionFee);
    if (cutEl) cutEl.textContent = this.formatCurrency(s.platformFee);
    if (totEl) totEl.textContent = this.formatCurrency(s.totalCharged);

    // Status pill
    const pill = document.getElementById('sessionStatusPill');
    if (pill) {
      if (remMins < 5) {
        pill.textContent = 'ENDING SOON';
        pill.style.background = 'rgba(192,57,43,0.15)';
        pill.style.color = 'var(--accent-rose)';
      }
    }
  }

  stopChargingSession(autoExpired = false) {
    if (!this.chargingSession) return;

    clearInterval(this.sessionInterval);
    if (this._notifTimers) {
      this._notifTimers.forEach(t => clearTimeout(t));
      this._notifTimers = [];
    }

    const s = { ...this.chargingSession };

    // Free the charger
    const charger = this.chargers.find(c => c.id === s.chargerId);
    if (charger) {
      charger.availability = 'available';
      this.saveChargersState();
      if (window.db) window.db.updateChargerAvailability(charger.id, 'available');
      this.renderMapMarkers();
      this.renderNearbyList();
    }

    // Credit host earnings
    this.hostEarnings = parseFloat((this.hostEarnings + s.hostPayout).toFixed(2));
    this.updateHostDashboard();

    // Immediate notification to driver (current user) that session is complete (only if not already notified by auto-expire timer)
    if (!autoExpired) {
      this.showInAppNotification(
        'Charging Completed',
        `Your ${s.durationMinutes}-min session at ${s.chargerTitle} is complete. Total paid: ${this.formatCurrency(s.totalCharged)} (Prepaid from wallet).`,
        'info'
      );
    }

    // DB: complete session + transaction
    if (window.db && !this.currentUser?.isDemo) {
      window.db.completeSession(s.id, { kwh_consumed: 0, final_soc: 100, co2_saved_kg: 0 });
      const driverId = this.currentUser?.sqlId || null;
      if (driverId) {
        // Only record if transaction was not already recorded at booking
        const hasExistingTxn = Array.isArray(window.db.tables.transactions) && window.db.tables.transactions.some(t => t.session_id === s.id);
        if (!hasExistingTxn) {
          window.db.recordTransaction({
            session_id: s.id,
            payer_user_id: driverId,
            payee_host_id: s.hostId || null,
            charger_id: s.chargerId,
            subtotal_amount: s.sessionFee,
            platform_fee_amount: s.platformFee,
            grand_total_amount: s.totalCharged,
            currency: this.currentCurrency || 'INR',
            payment_method: 'VoltShare Wallet'
          });
        }
      }

      // Persist host payout notification in DB so the host sees it in their notification center
      if (s.hostId) {
        const driverName = (this.currentUser && (this.currentUser.name || this.currentUser.email)) || 'A driver';
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        window.db.insertNotification({
          host_id: s.hostId,
          user_id: null,
          title: '💰 Charging Payout Credited',
          msg: `${driverName} charged at "${s.chargerTitle}" for ${s.durationMinutes} min. ${this.formatCurrency(s.hostPayout)} has been credited to your host wallet. (${dateStr}, ${timeStr})`,
          type: 'credit',
          icon: '💰',
          amount: s.hostPayout,
          unread: true
        });
      }

      const host = window.db.tables.hosts?.find(h => h.id === s.hostId);
      if (host) {
        this.hostEarnings = host.total_earnings;
        this.hostTotalKwh = host.total_kwh_shared;
      }
    }

    this.renderTransactionHistory();
    this.chargingSession = null;
    this.updateChargingScreenUI();

    // Open invoice
    this.openTimeSlotInvoiceModal(s, autoExpired);
  }

  openTimeSlotInvoiceModal(s, autoExpired = false) {
    const modal = document.getElementById('invoiceModal');
    if (!modal) return;

    const invoiceNum = `INV-VOLT-${Date.now().toString().slice(-6)}`;
    const durationLabel = s.durationMinutes === 1
      ? '1 minute (Fast Test)'
      : (s.durationMinutes >= 60
        ? `${s.durationMinutes / 60} hour${s.durationMinutes / 60 > 1 ? 's' : ''}`
        : `${s.durationMinutes} minutes`);

    const fmtTime = ts => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('recStationName',  s.chargerTitle);
    setEl('recHostName',     s.hostName || 'Host');
    setEl('recKwhConsumed',  `${durationLabel} slot (${fmtTime(s.startTime)} – ${fmtTime(s.endTime)})`);
    setEl('recRateApplied',  `${this.formatCurrency(s.hourlyRate)} / hr`);
    setEl('recSubtotal',     this.formatCurrency(s.sessionFee));
    setEl('recPlatformFee',  this.formatCurrency(s.platformFee));
    
    // Debit styling: shown in RED with leading minus sign
    const grandTotalEl = document.getElementById('recGrandTotal');
    if (grandTotalEl) {
      grandTotalEl.textContent = `-${this.formatCurrency(s.totalCharged)}`;
      grandTotalEl.style.color = '#ef4444';
      grandTotalEl.style.fontWeight = '800';
    }

    const badgeEl = document.getElementById('recStatusBadge');
    if (badgeEl) {
      badgeEl.textContent = 'DEBITED SUCCESSFUL';
      badgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
      badgeEl.style.color = '#ef4444';
      badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }

    setEl('recCo2Saved',     '—');
    setEl('recDate',         new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    setEl('recInvoiceNumber', invoiceNum);

    if (autoExpired) this.showToast('⏱️ Session expired — debit settled and invoice generated.');
    modal.classList.add('active');
  }

  onInvoiceDone() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.classList.remove('active');
    this.updateWalletUI(true);
    this.renderTransactionHistory();
    this.showToast('✅ Charging session settled. Your wallet balance has been updated.');
  }

  checkActiveSession() {
    if (this.chargingSession) {
      // Check if session already expired (e.g. page reload after expiry)
      if (Date.now() >= this.chargingSession.endTime) {
        this.stopChargingSession(true);
      } else {
        this.runCountdownLoop();
        this.scheduleSessionNotifications(this.chargingSession);
      }
    }
  }

  // =========================================================================
  // 7. Host Charger Management & New Listing Wizard
  // =========================================================================
  addNewHostCharger(formData) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Adding charger points is disabled.');
      return;
    }

    const chargerId = `ch-host-${Date.now()}`;
    const lat = parseFloat(formData.lat) || this.userLocation.lat || 12.9716;
    const lng = parseFloat(formData.lng) || this.userLocation.lng || 77.5946;

    let host = (window.db && this.currentUser?.sqlId) ? window.db.getHostByUserId(this.currentUser.sqlId) : null;
    if (window.db && !host) {
      const hostId = `host-${Date.now()}`;
      host = window.db.insertHost({
        id: hostId,
        user_id: this.currentUser?.sqlId || `usr-${Date.now()}`,
        display_name: formData.hostName || (this.currentUser?.name ? `${this.currentUser.name} Host` : 'Community Host')
      });
    }
    const targetHostId = host ? host.id : (this.currentUser?.sqlId || null);

    const newCharger = {
      id: chargerId,
      host_id: targetHostId,
      hostId: targetHostId,
      title: formData.title,
      hostName: formData.hostName || (this.currentUser?.name ? `${this.currentUser.name}` : "Community Host"),
      hostAvatar: "🏡",
      hostRating: 5.0,
      hostReviewsCount: 1,
      isVerifiedHost: true,
      address: formData.address,
      lat,
      lng,
      connectorType: formData.connectorType,
      powerKw: parseFloat(formData.powerKw || 11.0),
      ratePerHourINR: parseFloat(formData.ratePerHour || formData.ratePerKwh || 120.00),
      ratePerKwhINR: parseFloat(formData.ratePerHour || formData.ratePerKwh || 120.00),
      parkingType: formData.parkingType || 'Private Covered Driveway',
      accessHours: formData.accessHours || '6:00 AM - 10:00 PM',
      availability: "available",
      solarPowered: Boolean(formData.solarPowered),
      amenities: ['Private Dedicated Bay', 'Gated Access', 'CCTV Security'],
      notes: formData.notes || '',
      photos: (Array.isArray(formData.photos) && formData.photos.length) ? [...formData.photos] : (Array.isArray(this.currentWizardPhotos) && this.currentWizardPhotos.length ? [...this.currentWizardPhotos] : []),
      totalSessions: 0,
      efficiencyScore: "100%",
      reviews: []
    };

    // SQL DB: Persist charger to database
    if (window.db) {
      const chargerPhotos = (Array.isArray(formData.photos) && formData.photos.length) ? [...formData.photos] : (Array.isArray(this.currentWizardPhotos) && this.currentWizardPhotos.length ? [...this.currentWizardPhotos] : []);
      window.db.insertCharger({
        id: chargerId,
        host_id: targetHostId,
        title: formData.title,
        address: formData.address,
        city: this.currentCity || 'bengaluru',
        lat, lng,
        connector_type: formData.connectorType,
        power_kw: parseFloat(formData.powerKw || 11.0),
        rate_per_kwh: parseFloat(formData.ratePerKwh || 15.00),
        parking_type: formData.parkingType || 'Private Covered Driveway',
        access_hours: formData.accessHours || '6:00 AM - 10:00 PM',
        is_solar_powered: Boolean(formData.solarPowered),
        notes: formData.notes || '',
        photos: chargerPhotos,
        amenities: ['Private Dedicated Bay', 'Gated Access', 'CCTV Security']
      });
      // Synchronize single source of truth from database
      this.chargers = this.loadChargersFromDB();
    } else {
      if (!this.chargers.some(c => c.id === chargerId)) {
        this.chargers.unshift(newCharger);
      }
    }

    // Ensure no duplicates exist in in-memory list
    const seenMap = new Set();
    this.chargers = this.chargers.filter(c => seenMap.has(c.id) ? false : seenMap.add(c.id));

    this.saveChargersState();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.updateHostDashboard();

    // Fly / Pan map directly to the newly established charger point
    if (this.mapEngine === 'leaflet' && this.map) {
      this.map.flyTo([lat, lng], 16, { duration: 1.2 });
    } else if (this.mapEngine === 'google' && this.googleMap && window.google) {
      this.googleMap.panTo({ lat, lng });
      this.googleMap.setZoom(16);
    }

    this.showToast(`🎉 Charger "${newCharger.title}" successfully established on map!`, 'New Station Active');
  }

  updateHostDashboard() {
    // SQL DB: Fetch fresh host data
    let earnings = this.hostEarnings || 0;
    let kwh = this.hostTotalKwh || 0;
    let reviewsCount = 0;
    let rating = 0.0;
    let driversServed = 0;

    if (window.db && this.currentUser) {
      if (this.currentUser.isDemo) {
        earnings = this.hostEarnings || 0;
        kwh = this.hostTotalKwh || 0;
        reviewsCount = 42;
        rating = 4.9;
        driversServed = 42;
      } else {
        const userId = this.currentUser.sqlId;
        const host = userId ? window.db.getHostByUserId(userId) : null;
        if (host) {
          earnings = host.total_earnings || 0;
          kwh = host.total_kwh_shared || 0;
          reviewsCount = host.reviews_count || 0;
          rating = host.host_rating || 0.0;
          this.hostEarnings = earnings;
          this.hostTotalKwh = kwh;

          // Real drivers served count from charging sessions
          if (Array.isArray(window.db.tables?.charging_sessions)) {
            driversServed = window.db.tables.charging_sessions.filter(s => s.host_id === host.id && s.status === 'COMPLETED').length;
          }
        } else {
          earnings = 0;
          kwh = 0;
          reviewsCount = 0;
          rating = 0.0;
          driversServed = 0;
          this.hostEarnings = 0;
          this.hostTotalKwh = 0;
        }
      }
    }

    const earningsEl = document.getElementById('hostEarningsValue');
    const kwhEl = document.getElementById('hostKwhValue');
    const driversEl = document.getElementById('hostDriversServedValue');
    const ratingEl = document.getElementById('hostRatingValue');
    const toggle = document.getElementById('hostOnlineToggle');

    if (earningsEl) earningsEl.textContent = this.formatCurrency(earnings);
    if (kwhEl) kwhEl.textContent = `${kwh.toFixed(1)} kWh`;
    if (driversEl) driversEl.textContent = String(driversServed);
    if (ratingEl) {
      if (reviewsCount > 0 && rating > 0) {
        ratingEl.textContent = `${parseFloat(rating).toFixed(1)} ★`;
        ratingEl.style.color = 'var(--accent-emerald-light)';
        ratingEl.style.fontSize = '1.2rem';
      } else {
        ratingEl.textContent = 'New Host';
        ratingEl.style.color = 'var(--accent-cyan-light)';
        ratingEl.style.fontSize = '0.95rem';
      }
    }
    if (toggle) toggle.checked = this.hostIsOnline;

    const hostList = document.getElementById('myHostedChargersList');
    if (hostList) {
      const myStations = this.getHostChargers();

      // Check if all are offline or if any is online
      const anyOnline = myStations.length > 0 ? myStations.some(c => c.availability !== 'offline' && !c.isOffline) : this.hostIsOnline;
      if (toggle) toggle.checked = anyOnline;
      this.hostIsOnline = anyOnline;

      if (myStations.length === 0) {
        hostList.innerHTML = `
          <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">
            <i class="fa-solid fa-charging-station" style="font-size: 1.8rem; opacity: 0.4; margin-bottom: 8px; display: block;"></i>
            <p style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary);">No charging points established yet</p>
            <p style="font-size: 0.72rem; margin-top: 3px;">Tap "+ Add Point" above to establish your station!</p>
          </div>
        `;
        return;
      }

      const isDemo = !!(this.currentUser && this.currentUser.isDemo);

      hostList.innerHTML = myStations.map(c => {
        const isOffline = (c.availability === 'offline' || c.isOffline === true);
        const photos = Array.isArray(c.photos) ? c.photos : (typeof c.photos === 'string' ? JSON.parse(c.photos || '[]') : []);
        
        const photoStrip = photos && photos.length > 0 ? `
          <div style="display: flex; gap: 6px; overflow-x: auto; margin: 8px 0; padding-bottom: 2px; align-items: center;">
            ${photos.map((p, idx) => `
              <img src="${p}" style="width: 52px; height: 38px; border-radius: 6px; object-fit: cover; border: 1.5px solid rgba(22,163,74,0.35); cursor: pointer; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" alt="Charger photo #${idx + 1}" onclick="event.stopPropagation(); const ch = window.app.chargers.find(x => x.id === '${c.id}'); window.app.openPhotoSlideshow(ch?.photos || [], ${idx}, '${c.title}')">
            `).join('')}
            <span style="font-size: 10px; color: var(--accent-emerald-light); font-weight: 700; white-space: nowrap; margin-left: 4px; background: rgba(22,163,74,0.12); padding: 2px 6px; border-radius: 4px;">
              <i class="fa-solid fa-camera"></i> ${photos.length} pics
            </span>
          </div>
        ` : `
          <div style="margin: 8px 0; padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-regular fa-image" style="margin-right: 4px;"></i> No photos attached</span>
            ${isDemo ? '' : `<button type="button" class="btn-add-charger-photos-link" data-id="${c.id}" style="background: none; border: none; color: var(--accent-emerald-light); font-size: 0.72rem; font-weight: 700; cursor: pointer; text-decoration: underline;">+ Add Pics</button>`}
          </div>
        `;

        const hostUserId = c.host_id || c.hostId || (this.currentUser && this.currentUser.sqlId) || '';
        return `
        <div class="my-station-card ${isOffline ? 'is-offline' : ''}" id="hostCard_${c.id}">
          <div class="my-station-toggle-row">
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 2px; color: ${isOffline ? 'var(--text-muted)' : 'var(--text-primary)'};">${c.title}</h4>
              <p style="font-size: 0.75rem; color: var(--text-muted);">${c.connectorType} • ${c.powerKw} kW • ${c.parkingType || 'Private Driveway'}</p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="status-indicator-badge ${isOffline ? 'status-offline' : ('status-' + (c.availability || 'available'))}">
                  ${isOffline ? '<i class="fa-solid fa-power-off"></i> OFFLINE' : (c.availability || 'available')}
                </span>
                <label class="switch switch-sm" title="${isDemo ? 'Disabled in Demo Mode' : ('Toggle ' + c.title + ' online/offline')}" style="${isDemo ? 'opacity: 0.45; cursor: not-allowed;' : ''}">
                  <input type="checkbox" class="charger-card-live-toggle" data-id="${c.id}" ${isOffline ? '' : 'checked'} ${isDemo ? 'disabled' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              ${hostUserId ? `<span style="font-size: 0.62rem; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.02em;">User ID: ${hostUserId}</span>` : ''}
            </div>
          </div>
          ${photoStrip}
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
            <div>
              <span style="color: ${isOffline ? 'var(--text-muted)' : 'var(--accent-emerald-light)'}; font-weight: 700;">
                ${this.formatCurrency(this.getChargerHourlyRate(c))} / hour
              </span>
              <span style="color: var(--text-muted); margin-left: 8px; font-size: 0.72rem;">
                ${c.totalSessions || 0} sessions
              </span>
            </div>
            ${isDemo ? `
            <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 6px;">
              <i class="fa-solid fa-eye"></i> View-Only
            </span>
            ` : `
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" class="btn-edit-charger-profile" data-id="${c.id}" style="background: rgba(100,116,139,0.12); border: 1px solid rgba(100,116,139,0.35); color: var(--accent-cyan-light); padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Edit profile and photos for this point">
                <i class="fa-solid fa-pen-to-square"></i> Profile & Pics
              </button>
              <button type="button" class="btn-delete-charger-profile" data-id="${c.id}" style="background: rgba(192,57,43,0.1); border: 1px solid rgba(192,57,43,0.3); color: #e07068; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Delete this charger point">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
            `}
          </div>
        </div>
        `;
      }).join('');

      // Attach card individual toggle switches
      hostList.querySelectorAll('.charger-card-live-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          const chargerId = chk.dataset.id;
          const targetCharger = this.chargers.find(x => x.id === chargerId);
          if (targetCharger) {
            this.setChargerOnlineState(targetCharger, chk.checked);
            this.showToast(chk.checked ? `🟢 ${targetCharger.title} turned LIVE online!` : `⚪ ${targetCharger.title} turned OFFLINE (grayed out).`);
          }
        });
      });

      // Attach Edit Profile & Pics buttons
      hostList.querySelectorAll('.btn-edit-charger-profile, .btn-add-charger-photos-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (id) this.openEditChargerWizard(id);
        });
      });

      // Attach Delete Point buttons
      hostList.querySelectorAll('.btn-delete-charger-profile').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (id) this.deleteHostCharger(id);
        });
      });
    }
  }

  getHostChargers() {
    if (!this.currentUser) return [];

    // Demo Mode handling
    if (this.currentUser.isDemo) {
      if (this.currentUser.email && this.currentUser.email.includes('host')) {
        return this.chargers.filter(c => {
          if (c.isCompanyStation) return false;
          return c.host_id === 'host-marcus' || c.hostId === 'host-marcus' || c.id === 'ch-host-marcus' || (c.hostName && c.hostName.toLowerCase().includes('marcus'));
        });
      }
      return [];
    }

    // Real User: strictly match chargers belonging to this user / host account
    const userSqlId = this.currentUser.sqlId;
    const userEmail = (this.currentUser.email || '').trim().toLowerCase();
    const validHostIds = new Set();
    const validUserIds = new Set();

    if (userSqlId) {
      validUserIds.add(userSqlId);
      validHostIds.add(userSqlId);
    }

    if (window.db) {
      const dbUser = (userSqlId ? window.db.getUser(userSqlId) : null) || (userEmail ? window.db.getUser(userEmail) : null);
      if (dbUser && dbUser.id) {
        validUserIds.add(dbUser.id);
        validHostIds.add(dbUser.id);
      }

      if (window.db.tables && Array.isArray(window.db.tables.hosts)) {
        window.db.tables.hosts.forEach(h => {
          if (h && (validUserIds.has(h.user_id) || validUserIds.has(h.id))) {
            if (h.id) validHostIds.add(h.id);
          }
        });
      }
    }

    // Match chargers registered to these host IDs in the SQL database
    const ownedChargerIds = new Set();
    if (window.db && window.db.tables && Array.isArray(window.db.tables.chargers)) {
      window.db.tables.chargers.forEach(dc => {
        if (!dc) return;
        if (dc.host_id && validHostIds.has(dc.host_id)) {
          ownedChargerIds.add(dc.id);
        }
      });
    }

    // Return ONLY chargers belonging to this user's host profile
    return this.chargers.filter(c => {
      if (!c || c.isCompanyStation) return false;
      if (ownedChargerIds.has(c.id)) return true;
      if (c.host_id && validHostIds.has(c.host_id)) return true;
      if (c.hostId && validHostIds.has(c.hostId)) return true;
      return false;
    });
  }

  setChargerOnlineState(charger, isOnline) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Station state cannot be modified.');
      this.updateHostDashboard();
      return;
    }

    charger.isOffline = !isOnline;
    charger.availability = isOnline ? 'available' : 'offline';

    // Persist in SQL DB if available
    if (window.db && window.db.tables && window.db.tables.chargers) {
      const dbCh = window.db.tables.chargers.find(c => c.id === charger.id);
      if (dbCh) {
        dbCh.availability_status = charger.availability;
        dbCh.is_offline = !isOnline;
        dbCh.updated_at = new Date().toISOString();
        window.db.save(false);
      }
    }

    this.saveChargersState();
    this.updateHostDashboard();
    this.renderNearbyList();
    this.renderMapMarkers();
  }

  openHostChargerSelectionModal() {
    const modal = document.getElementById('hostChargerSelectionModal');
    if (!modal) return;
    this.renderHostChargerSelectionList();
    modal.classList.add('active');
  }

  renderHostChargerSelectionList() {
    const container = document.getElementById('hostChargerSelectionList');
    if (!container) return;

    const myStations = this.getHostChargers();
    if (myStations.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">No charging points found.</div>`;
      return;
    }

    container.innerHTML = myStations.map(c => {
      const isOffline = (c.availability === 'offline' || c.isOffline === true);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:var(--radius-md);background:${isOffline ? 'rgba(30,41,59,0.3)' : 'var(--bg-card)'};border:1px solid ${isOffline ? 'rgba(148,163,184,0.2)' : 'var(--border-subtle)'};opacity:${isOffline ? '0.75' : '1'};transition:all 0.2s ease;">
          <div style="flex:1;overflow:hidden;margin-right:12px;">
            <div style="font-size:0.88rem;font-weight:700;color:${isOffline ? 'var(--text-muted)' : 'var(--text-primary)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${c.title}
            </div>
            <div style="font-size:0.72rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:2px;">
              <span>${c.connectorType} • ${c.powerKw} kW</span>
              <span class="status-indicator-badge ${isOffline ? 'status-offline' : 'status-available'}" style="font-size:0.62rem;padding:1px 6px;">
                ${isOffline ? 'OFFLINE' : 'LIVE'}
              </span>
            </div>
          </div>
          <button type="button" class="btn-toggle-single-station" data-id="${c.id}" style="padding:6px 12px;font-size:0.75rem;font-weight:700;border-radius:6px;cursor:pointer;border:1px solid ${isOffline ? 'var(--accent-emerald)' : 'rgba(192,57,43,0.5)'};background:${isOffline ? 'rgba(22,163,74,0.15)' : 'rgba(192,57,43,0.15)'};color:${isOffline ? 'var(--accent-emerald-light)' : '#e07068'};transition:all 0.2s ease;">
            ${isOffline ? '<i class="fa-solid fa-power-off"></i> Turn On' : '<i class="fa-solid fa-power-off"></i> Close / Turn Off'}
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-toggle-single-station').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chId = btn.dataset.id;
        const targetCharger = this.chargers.find(x => x.id === chId);
        if (targetCharger) {
          const currentlyOffline = (targetCharger.availability === 'offline' || targetCharger.isOffline === true);
          this.setChargerOnlineState(targetCharger, currentlyOffline);
          this.renderHostChargerSelectionList();
          this.showToast(currentlyOffline ? `🟢 ${targetCharger.title} turned ON!` : `⚪ ${targetCharger.title} turned OFF (grayed out).`);
        }
      });
    });
  }

  setupHostOnlineToggle() {
    const toggle = document.getElementById('hostOnlineToggle');
    if (!toggle || toggle._setupInit) return;
    toggle._setupInit = true;

    toggle.addEventListener('change', () => {
      if (this.currentUser && this.currentUser.isDemo) {
        toggle.checked = !toggle.checked;
        this.showToast('🔒 Demo Mode is view-only. Host controls cannot be modified.');
        return;
      }

      const isOnline = toggle.checked;
      const myStations = this.getHostChargers();

      myStations.forEach(c => {
        c.isOffline = !isOnline;
        c.availability = isOnline ? 'available' : 'offline';

        if (window.db && window.db.tables && window.db.tables.chargers) {
          const dbCh = window.db.tables.chargers.find(x => x.id === c.id);
          if (dbCh) {
            dbCh.availability_status = c.availability;
            dbCh.is_offline = !isOnline;
            dbCh.updated_at = new Date().toISOString();
          }
        }
      });
      if (window.db) window.db.save(false);

      this.hostIsOnline = isOnline;

      this.saveChargersState();
      this.updateHostDashboard();
      this.renderNearbyList();
      this.renderMapMarkers();

      this.showToast(
        isOnline 
          ? `🟢 All ${myStations.length} host chargers are now LIVE online!` 
          : `⚪ All ${myStations.length} host chargers have been switched OFFLINE.`
      );
    });
  }

  initHostSelectionModalEvents() {
    const modal = document.getElementById('hostChargerSelectionModal');
    const btnClose = document.getElementById('btnCloseHostChargerSelectionModal');
    const btnDone = document.getElementById('btnDoneHostChargerSelection');
    const btnOffAll = document.getElementById('btnTurnOffAllChargers');
    const btnOnAll = document.getElementById('btnTurnOnAllChargers');

    const closeModal = () => {
      if (modal) modal.classList.remove('active');
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnDone) btnDone.addEventListener('click', closeModal);

    if (btnOffAll) {
      btnOffAll.addEventListener('click', () => {
        const myStations = this.getHostChargers();
        myStations.forEach(c => {
          c.isOffline = true;
          c.availability = 'offline';
          if (window.db && window.db.tables && window.db.tables.chargers) {
            const dbCh = window.db.tables.chargers.find(dc => dc.id === c.id);
            if (dbCh) {
              dbCh.availability_status = 'offline';
              dbCh.is_offline = true;
            }
          }
        });
        if (window.db) window.db.save(false);
        this.saveChargersState();
        this.updateHostDashboard();
        this.renderNearbyList();
        this.renderMapMarkers();
        closeModal();
        this.showToast('⚪ All chargers turned off (grayed out).');
      });
    }

    if (btnOnAll) {
      btnOnAll.addEventListener('click', () => {
        const myStations = this.getHostChargers();
        myStations.forEach(c => {
          c.isOffline = false;
          c.availability = 'available';
          if (window.db && window.db.tables && window.db.tables.chargers) {
            const dbCh = window.db.tables.chargers.find(dc => dc.id === c.id);
            if (dbCh) {
              dbCh.availability_status = 'available';
              dbCh.is_offline = false;
            }
          }
        });
        if (window.db) window.db.save(false);
        this.saveChargersState();
        this.updateHostDashboard();
        this.renderNearbyList();
        this.renderMapMarkers();
        closeModal();
        this.showToast('🟢 All chargers are now LIVE online!');
      });
    }
  }

  // =========================================================================
  // Top Up Wallet Modal & UPI / Google Pay (GPay) Bank QR Engine
  // =========================================================================
  openTopUpModal(defaultAmount = 500) {
    const modal = document.getElementById('topUpWalletModal');
    if (!modal) return;

    this.topUpSelectedAmount = parseFloat(defaultAmount) || 500;

    const curBalEl = document.getElementById('topUpModalCurrentBalance');
    if (curBalEl) curBalEl.textContent = this.formatCurrency(this.walletBalance);

    const customInp = document.getElementById('topUpCustomAmount');
    if (customInp) customInp.value = this.topUpSelectedAmount;

    // Reset preset chips
    document.querySelectorAll('.topup-amount-chip').forEach(chip => {
      const amt = parseFloat(chip.dataset.amount);
      if (amt === this.topUpSelectedAmount) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Populate simulated UPI ID in input
    const upiInp = document.getElementById('topUpUpiIdInput');
    if (upiInp && !upiInp.value) {
      upiInp.value = 'driver@okhdfcbank';
    }

    this.renderGpayQrCode(this.topUpSelectedAmount);
    modal.classList.add('active');
  }

  renderGpayQrCode(amount) {
    const container = document.getElementById('gpayQrCodeContainer');
    const parsedAmount = Math.max(10, parseFloat(amount) || 500);

    // 1. Safe Official VoltShare Account Details (No real user bank account exposed)
    const payoutUpi = 'voltshare.ev@sandbox';
    const bankAcc = 'VoltShare Reserve Pool (Sandbox)';
    const payeeName = 'VoltShare Official EV Account';

    // 2. Update text UI elements
    const elPayee = document.getElementById('gpayPayeeName');
    if (elPayee) elPayee.textContent = payeeName;

    const elBank = document.getElementById('gpayBankAccount');
    if (elBank) elBank.textContent = bankAcc;

    const elUpi = document.getElementById('gpayUpiIdText');
    if (elUpi) elUpi.textContent = payoutUpi;

    const elQrAmt = document.getElementById('topUpGpayQrAmountDisplay');
    if (elQrAmt) elQrAmt.textContent = this.formatCurrency(parsedAmount);

    const elUpiSummaryAmt = document.getElementById('topUpUpiSummaryAmount');
    if (elUpiSummaryAmt) elUpiSummaryAmt.textContent = this.formatCurrency(parsedAmount);

    const elNewBal = document.getElementById('topUpModalNewBalance');
    if (elNewBal) elNewBal.textContent = this.formatCurrency(this.walletBalance + parsedAmount);

    // 3. Safe QR Payload (When scanned, clearly displays VoltShare Official EV Account with no real money transfer)
    const qrSafePayload = `VoltShare Official EV Account (Demo Wallet Top-Up: ${this.formatCurrency(parsedAmount)}). Account ID: VOLTSHARE-DEMO-EV. 100% Sandbox Simulation: No real money transferred.`;

    // 4. Render QR Code (High-res with robust offline fallback)
    if (container) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(qrSafePayload)}`;
      container.innerHTML = `
        <img src="${qrUrl}" alt="VoltShare Official EV Account QR" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:10px;text-align:center;color:#0f172a;font-size:0.75rem;font-weight:700;\\'><i class=\\'fa-solid fa-qrcode\\' style=\\'font-size:3.5rem;margin-bottom:6px;color:#64748b;\\'></i><span>VoltShare Official Account</span><span style=\\'font-family:monospace;font-size:0.72rem;color:#059669;margin-top:4px;\\'>${payoutUpi}</span></div>'"/>
      `;
    }
  }

  executeWalletTopUp(amount, method = 'gpay', details = '') {
    const parsedAmt = parseFloat(amount) || 500;
    
    // Read live balance from DB first
    let dbUser = null;
    if (window.db && this.currentUser) {
      dbUser = (this.currentUser.sqlId ? window.db.getUser(this.currentUser.sqlId) : null) || window.db.getUser(this.currentUser.email);
    }
    const curBal = dbUser && dbUser.wallet_balance !== undefined ? parseFloat(dbUser.wallet_balance) : this.walletBalance;
    this.walletBalance = parseFloat((curBal + parsedAmt).toFixed(2));

    // SQL DB: Persist wallet balance & record transaction
    const driverId = (dbUser && dbUser.id) || (this.currentUser && this.currentUser.sqlId) || null;
    if (window.db && driverId && !this.currentUser?.isDemo) {
      window.db.updateUserWallet(driverId, this.walletBalance);
      window.db.recordTransaction({
        session_id: null,
        payer_user_id: driverId,
        payee_host_id: 'voltshare-hq',
        charger_id: 'topup-wallet',
        subtotal_amount: parsedAmt,
        platform_fee_amount: 0.00,
        grand_total_amount: parsedAmt,
        currency: 'INR',
        payment_method: method === 'gpay' ? 'Google Pay (GPay Bank QR)' : `UPI (${details || 'Collect Request'})`,
        invoice_number: `INV-TOPUP-${Date.now().toString().slice(-6)}`
      });
    }

    this.updateWalletUI();
    this.renderTransactionHistory();

    const modal = document.getElementById('topUpWalletModal');
    if (modal) modal.classList.remove('active');

    const methodLabel = method === 'gpay' ? 'Google Pay (GPay Bank QR)' : 'UPI Request';
    this.showToast(`💳 Successfully added ${this.formatCurrency(parsedAmt)} to your VoltShare Wallet via ${methodLabel}!`);
  }

  deductFromWallet(amount, reason = 'Charging Session Payment') {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;

    this.walletBalance = parseFloat(Math.max(0, this.walletBalance - val).toFixed(2));

    try {
      localStorage.setItem('voltshare_wallet_balance', String(this.walletBalance));
    } catch(e) {}

    if (window.db) {
      const driverId = (this.currentUser && this.currentUser.sqlId) || 'usr-alex';
      if (Array.isArray(window.db.tables.users)) {
        window.db.tables.users.forEach(u => {
          u.wallet_balance = this.walletBalance;
          u.updated_at = new Date().toISOString();
        });
      }
      window.db.updateUserWallet(driverId, this.walletBalance, 'set', reason);
      window.db.save(true);
    }

    this.updateWalletUI(true);
  }


  updateWalletRoleUI() {
    const isHost = this.userRole === 'host';
    const topUpBtn = document.getElementById('btnTopUpWallet');
    const paymentMethodsBtn = document.getElementById('btnPaymentMethods');
    const walletSection = document.getElementById('tab-wallet');
    
    // In Host mode: provide the Withdraw option directly in the wallet column as requested
    let hostWithdrawWalletBtn = document.getElementById('btnHostWithdrawInWallet');
    if (isHost) {
      if (topUpBtn) topUpBtn.style.display = 'none';
      if (paymentMethodsBtn) paymentMethodsBtn.style.display = 'none';
      
      if (!hostWithdrawWalletBtn && topUpBtn && topUpBtn.parentElement) {
        hostWithdrawWalletBtn = document.createElement('button');
        hostWithdrawWalletBtn.id = 'btnHostWithdrawInWallet';
        hostWithdrawWalletBtn.className = 'btn-primary';
        hostWithdrawWalletBtn.style.cssText = 'padding: 10px; font-size: 0.8rem; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px;';
        hostWithdrawWalletBtn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> Withdraw Earnings';
        hostWithdrawWalletBtn.addEventListener('click', () => this.openHostWithdrawModal());
        topUpBtn.parentElement.appendChild(hostWithdrawWalletBtn);
      } else if (hostWithdrawWalletBtn) {
        hostWithdrawWalletBtn.style.display = 'flex';
      }
    } else {
      if (topUpBtn) topUpBtn.style.display = 'inline-flex';
      if (paymentMethodsBtn) paymentMethodsBtn.style.display = 'inline-flex';
      if (hostWithdrawWalletBtn) hostWithdrawWalletBtn.style.display = 'none';
    }
  }

  updateWalletUI(skipDbRead = false) {
    // SQL DB: Get live wallet balance unless skipDbRead is true
    if (!skipDbRead && window.db && !this.currentUser?.isDemo) {
      const u = (this.currentUser && this.currentUser.sqlId ? window.db.getUser(this.currentUser.sqlId) : null)
        || (this.currentUser && this.currentUser.email ? window.db.getUser(this.currentUser.email) : null)
        || (window.db.tables.users && window.db.tables.users[0]);
      if (u && u.wallet_balance !== undefined) {
        this.walletBalance = parseFloat(u.wallet_balance);
      }
    }
    const formatted = this.formatCurrency(this.walletBalance);
    const el = document.getElementById('walletBalanceDisplay');
    if (el) el.textContent = formatted;

    const headerBal = document.getElementById('headerWalletBalanceDisplay');
    if (headerBal) headerBal.textContent = formatted;

    const curBalEl = document.getElementById('topUpModalCurrentBalance');
    if (curBalEl) curBalEl.textContent = formatted;

    const resvBal = document.getElementById('reserveModalWalletBalance');
    if (resvBal) resvBal.textContent = formatted;
  }

  // =========================================================================
  // SQL Transaction History Renderer
  // =========================================================================
  renderTransactionHistory() {
    const container = document.getElementById('sqlTransactionsList');
    if (!container || !window.db) return;

    const userId = (this.currentUser && this.currentUser.sqlId) || null;
    const isHost = this.userRole === 'host';
    let host = null;
    if (isHost && userId) {
      host = window.db.getHostByUserId(userId);
    }
    const hostId = host ? host.id : null;

    let txns;
    try {
      txns = window.db.getTransactionsWithDetails(userId, hostId);
    } catch (e) {
      txns = window.db.tables.transactions.slice(0, 20);
    }

    if (!txns || txns.length === 0) {
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
      
      // Determine if transaction is a credit or debit:
      // Credits:
      //  - Wallet Top-Ups (charger_id === 'topup-wallet' or INV-TOPUP)
      //  - Host Earnings Credited (when current user is host and payee matches)
      // Debits:
      //  - Driver session invoices debited from wallet
      const isTopup = t.charger_id === 'topup-wallet' || (t.invoice_number && t.invoice_number.startsWith('INV-TOPUP'));
      const isHostEarning = isHost && (t.payee_host_id === hostId || (host && t.payee_host_id === host.id));
      const isCredit = isTopup || isHostEarning;

      const sign = isCredit ? '+' : '-';
      const color = isCredit ? '#10b981' : '#ef4444';
      const badgeText = isCredit ? (isTopup ? 'CREDITED (TOP-UP)' : 'CREDITED (EARNING)') : 'DEBITED';
      const badgeBg = isCredit 
        ? 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);' 
        : 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);';

      return `
        <div class="station-card" style="cursor:default; border-left: 3px solid ${color};">
          <div class="station-card-top">
            <div>
              <div class="station-name">${t.station_title || (isTopup ? 'VoltShare Wallet Top-Up' : 'EV Charging Session')}</div>
              <div class="station-address" style="display:flex;flex-direction:column;gap:2px;">
                <span><i class="fa-solid fa-calendar-days" style="margin-right:4px;"></i>${date}</span>
                <span><i class="fa-solid fa-bolt" style="margin-right:4px;color:var(--accent-cyan);"></i>${kwhText} • ${t.payment_method}</span>
              </div>
            </div>
            <div class="station-badge-rate" style="text-align: right;">
              <span class="rate-val" style="font-weight: 800; color: ${color};">${sign}${this.formatCurrency(t.grand_total_amount)}</span>
            </div>
          </div>
          <div class="station-specs-row">
            <span style="color:var(--text-muted);font-size:0.72rem;font-family:var(--font-mono);">${t.invoice_number}</span>
            <span style="font-size:0.65rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; ${badgeBg}">${badgeText}</span>
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
        <div style="padding:16px;color:#e07068;font-family:var(--font-mono);font-size:0.75rem;">
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
      <div style="padding:8px 12px;background:rgba(100,116,139,0.06);border-bottom:1px solid var(--border-subtle);font-size:0.72rem;color:var(--text-muted);display:flex;justify-content:space-between;">
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
    // Authoritative chargers persist directly in Supabase PostgreSQL; no localStorage cache
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
        // Only re-center if NOT actively navigating (avoids fighting with fitBounds)
        if (!this.isNavigating) {
          this.googleMap.setCenter({ lat: this.userLocation.lat, lng: this.userLocation.lng });
        }
      } else if (this.map) {
        setTimeout(() => {
          this.map.invalidateSize();
          // Only re-center if NOT actively navigating
          if (!this.isNavigating) {
            this.map.setView([this.userLocation.lat, this.userLocation.lng], this.map.getZoom());
          }
        }, 200);
      }
    }
    if (tabId === 'tab-charging') {
      this.updateChargingScreenUI();
    }
    if (tabId === 'tab-host-dashboard') {
      this.updateHostDashboard();
    }
    if (tabId === 'tab-host-inquiries') {
      this.renderHostInquiries();
    }
    if (tabId === 'tab-wallet') {
      this.updateWalletUI();
      this.renderTransactionHistory();
    }
    if (tabId === 'tab-profile') {
      this.loadUserDetailsToForm();
    }
  }

  renderHostInquiries() {
    const container = document.getElementById('hostInquiriesContainer');
    if (!container) return;

    if (!window.db || !this.currentUser) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
          <i class="fa-solid fa-inbox" style="font-size: 2rem; opacity: 0.3; margin-bottom: 10px; display: block;"></i>
          <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">No sessions yet</div>
          <p style="font-size: 0.74rem; margin-top: 5px;">Completed charging sessions will appear here.</p>
        </div>
      `;
      return;
    }

    const host = window.db.getHostByUserId(this.currentUser.sqlId);
    const hostId = host ? host.id : null;

    let sessions = [];
    if (hostId && Array.isArray(window.db.tables?.charging_sessions)) {
      sessions = window.db.tables.charging_sessions
        .filter(s => s.host_id === hostId)
        .sort((a, b) => new Date(b.end_time || b.created_at) - new Date(a.end_time || a.created_at));
    }

    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
          <i class="fa-solid fa-inbox" style="font-size: 2rem; opacity: 0.3; margin-bottom: 10px; display: block;"></i>
          <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">No sessions yet</div>
          <p style="font-size: 0.74rem; margin-top: 5px;">When drivers charge at your station, details will show up here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sessions.map(s => {
      const driver = (window.db.tables?.users?.find(u => u.id === s.driver_user_id)) || {};
      const driverName = driver.full_name || 'EV Driver';
      const driverModel = driver.ev_model || 'Electric Vehicle';
      const driverPlate = driver.ev_plate_number || '';
      const isCompleted = s.status === 'COMPLETED';
      const isActive = s.status === 'IN_PROGRESS';

      const statusColor = isCompleted ? '#16a34a' : (isActive ? '#0284c7' : '#94a3b8');
      const statusLabel = isCompleted ? 'Completed' : (isActive ? 'Active' : s.status || 'Booked');

      const startDt = new Date(s.start_time || s.created_at);
      const endDt = s.end_time ? new Date(s.end_time) : null;
      const dateLabel = startDt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const timeLabel = startDt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const durationMins = endDt ? Math.round((endDt - startDt) / 60000) : null;

      const kwh = s.kwh_consumed ? parseFloat(s.kwh_consumed).toFixed(2) : null;
      const totalAmt = s.total_amount ? parseFloat(s.total_amount) : 0;
      const hostEarnings = totalAmt > 0 ? (totalAmt * 0.9).toFixed(2) : null;

      const chargerTitle = (this.chargers?.find(c => c.id === s.charger_id))?.title || 'Your Station';

      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          
          <!-- Header row -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">${driverName}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                ${driverModel}${driverPlate ? ' · ' + driverPlate : ''}
              </div>
            </div>
            <span style="font-size: 0.67rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; border: 1px solid ${statusColor}40; color: ${statusColor}; background: ${statusColor}10; white-space: nowrap;">${statusLabel}</span>
          </div>

          <!-- Session info grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 0.72rem;">
            <div>
              <span style="color: var(--text-muted);">Station</span><br>
              <span style="color: var(--text-primary); font-weight: 600;">${chargerTitle}</span>
            </div>
            <div>
              <span style="color: var(--text-muted);">Date &amp; Time</span><br>
              <span style="color: var(--text-primary); font-weight: 600;">${dateLabel}, ${timeLabel}</span>
            </div>
            ${kwh ? `<div>
              <span style="color: var(--text-muted);">Energy Delivered</span><br>
              <span style="color: var(--accent-cyan-light); font-weight: 700;">${kwh} kWh</span>
            </div>` : ''}
            ${durationMins ? `<div>
              <span style="color: var(--text-muted);">Duration</span><br>
              <span style="color: var(--text-primary); font-weight: 600;">${durationMins} min</span>
            </div>` : ''}
          </div>

          <!-- Earnings + Report -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
            ${hostEarnings ? `<div>
              <span style="font-size: 0.67rem; color: var(--text-muted); display: block; margin-bottom: 1px;">Your Payout</span>
              <span style="font-size: 0.92rem; font-weight: 800; color: #16a34a;">+₹${parseFloat(hostEarnings).toFixed(2)}</span>
            </div>` : `<div></div>`}
            ${(() => {
              const existingReport = Array.isArray(window.db?.tables?.reports)
                ? window.db.tables.reports.find(r => r.session_id === s.id)
                : null;
              if (existingReport) {
                return `
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.68rem; font-weight:700; color:#f59e0b; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); padding:3px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
                      <i class="fa-solid fa-shield-halved"></i> Reported
                    </span>
                    ${existingReport.proof_video_url ? `
                      <button 
                        type="button"
                        onclick="window.app && window.app.viewReportProof('${encodeURIComponent(existingReport.proof_video_url)}', '${driverName}')"
                        style="background:none; border:1px solid var(--border-subtle); color:var(--accent-cyan); font-size:0.68rem; font-weight:600; padding:3px 8px; border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"
                        title="View uploaded proof"
                      >
                        <i class="fa-solid fa-circle-play"></i> Proof
                      </button>
                    ` : ''}
                  </div>
                `;
              }
              return `
                <button 
                  type="button"
                  onclick="window.app && window.app.openReportSessionPanel('${s.id}', '${driverName}', '${chargerTitle}')"
                  style="background: none; border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.7rem; font-weight: 600; padding: 4px 10px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.15s;"
                  onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444';"
                  onmouseout="this.style.borderColor='';this.style.color='';"
                >
                  <i class="fa-solid fa-flag"></i> Report
                </button>
              `;
            })()}
          </div>

        </div>
      `;
    }).join('');

    // Wire up report buttons after render (already using inline onclick, no extra wiring needed)
  }

  clearReportProofFile() {
    this._reportProofFile = null;
    if (this._reportProofBlobUrl) {
      try { URL.revokeObjectURL(this._reportProofBlobUrl); } catch (_) {}
      this._reportProofBlobUrl = null;
    }
    const preview = document.getElementById('reportVideoPreview');
    const filenameEl = document.getElementById('reportVideoFilename');
    const dropzone = document.getElementById('reportVideoDropzone');
    const fileInput = document.getElementById('reportVideoFileInput');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    if (filenameEl) filenameEl.textContent = '';
    if (dropzone) dropzone.style.borderColor = '';
    if (fileInput) fileInput.value = '';
  }

  openReportSessionPanel(sessionId, driverName, stationName) {
    const modal = document.getElementById('reportSessionModal');
    if (!modal) return;

    // Store context for submission
    this._reportContext = { sessionId, driverName, stationName };
    this.clearReportProofFile();

    // Fill hidden fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('reportSessionId', sessionId);
    setVal('reportDriverName', driverName);
    setVal('reportChargerName', stationName);
    setVal('reportIssueText', '');

    // Set host ID
    if (this.currentUser && window.db) {
      const host = window.db.getHostByUserId(this.currentUser.sqlId);
      setVal('reportHostId', host ? host.id : '');
    }

    // Set context banner
    const ctx = document.getElementById('reportModalContext');
    if (ctx) {
      ctx.innerHTML = `
        <div style="display:flex; gap:14px; flex-wrap:wrap;">
          <span><i class="fa-solid fa-user" style="color:var(--accent-cyan); margin-right:4px;"></i><strong>Driver:</strong> ${driverName}</span>
          <span><i class="fa-solid fa-charging-station" style="color:var(--accent-emerald); margin-right:4px;"></i><strong>Station:</strong> ${stationName}</span>
        </div>`;
    }

    // Wire close button (once)
    const closeBtn = document.getElementById('btnCloseReportModal');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.clearReportProofFile();
        modal.classList.remove('active');
      };
    }

    // Wire form submit (replace old listener)
    const form = document.getElementById('reportSessionForm');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.submitReport();
      };
    }

    modal.classList.add('active');
  }

  handleReportVideoFile(file) {
    if (!file) return;
    const MAX_MB = 50;
    if (file.size > MAX_MB * 1024 * 1024) {
      this.showToast(`⚠️ File too large. Max ${MAX_MB} MB allowed.`);
      return;
    }

    this._reportProofFile = file;

    const filenameEl = document.getElementById('reportVideoFilename');
    if (filenameEl) {
      const sizeStr = file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';
      filenameEl.textContent = `${file.name} (${sizeStr})`;
    }

    const dropzone = document.getElementById('reportVideoDropzone');
    if (dropzone) dropzone.style.borderColor = 'var(--accent-emerald)';

    const preview = document.getElementById('reportVideoPreview');
    if (!preview) return;

    const name = (file.name || '').toLowerCase();
    const ext = name.split('.').pop() || '';
    const isImage = file.type.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.style.display = 'block';
        preview.innerHTML = `
          <div style="position:relative; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border-subtle); background:#000;">
            <img src="${ev.target.result}" style="width:100%; max-height:200px; object-fit:cover; display:block;">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.72rem;">
            <span style="color:var(--text-muted);"><i class="fa-solid fa-image"></i> Image attached</span>
            <button type="button" onclick="window.app && window.app.clearReportProofFile()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.72rem; font-weight:600; padding:2px 6px;">
              <i class="fa-solid fa-trash-can"></i> Remove
            </button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
      return;
    }

    // Video Handling: resolve correct MIME type and fallback
    let mime = file.type;
    if (!mime || mime === 'application/octet-stream') {
      if (ext === 'mp4' || ext === 'm4v') mime = 'video/mp4';
      else if (ext === 'webm') mime = 'video/webm';
      else if (ext === 'ogg' || ext === 'ogv') mime = 'video/ogg';
      else if (ext === 'mov') mime = 'video/quicktime';
      else if (ext === 'avi') mime = 'video/x-msvideo';
    }

    if (this._reportProofBlobUrl) {
      try { URL.revokeObjectURL(this._reportProofBlobUrl); } catch (_) {}
      this._reportProofBlobUrl = null;
    }

    const blob = file.type ? file : new Blob([file], { type: mime || 'video/mp4' });
    const url = URL.createObjectURL(blob);
    this._reportProofBlobUrl = url;

    preview.style.display = 'block';
    preview.innerHTML = `
      <div id="reportProofPlayerContainer" style="position:relative; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border-subtle); background:#000; cursor:pointer;">
        <video 
          id="reportProofVideoPlayer"
          src="${url}"
          controls 
          playsinline 
          webkit-playsinline 
          preload="auto"
          style="width:100%; max-height:220px; display:block; background:#000;"
        >
          <source src="${url}" type="${mime || 'video/mp4'}">
          <source src="${url}" type="video/mp4">
          Your browser does not support this video.
        </video>
        <!-- Overlay play button icon -->
        <div 
          id="reportProofPlayOverlay"
          style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; background:rgba(0,0,0,0.3); transition:opacity 0.2s;"
        >
          <div style="width:50px; height:50px; border-radius:50%; background:rgba(0,0,0,0.7); border:2px solid rgba(255,255,255,0.9); display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.25rem; padding-left:3px; box-shadow:0 4px 16px rgba(0,0,0,0.6);">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
      </div>

      <!-- Format / Codec notice if browser cannot decode (e.g. AVI, MKV, or iPhone HEVC on Windows) -->
      <div id="reportProofVideoError" style="display:none; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-sm); padding:10px 12px; margin-top:8px; font-size:0.74rem;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#ef4444; margin-bottom:3px;">
          <i class="fa-solid fa-circle-exclamation"></i> Video Format Notice (${ext.toUpperCase()})
        </div>
        <div style="color:var(--text-secondary); line-height:1.4;">
          Your browser cannot preview this video codec directly (common with AVI, MKV, or iPhone HEVC). 
          <strong>Don't worry — your file is safely attached</strong> and will be submitted with your report.
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.72rem;">
        <span style="color:var(--text-muted);"><i class="fa-solid fa-circle-play"></i> Tap or click video to play / pause</span>
        <button type="button" onclick="window.app && window.app.clearReportProofFile()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.72rem; font-weight:600; padding:2px 6px;">
          <i class="fa-solid fa-trash-can"></i> Remove
        </button>
      </div>
    `;

    // Wire player interaction
    const container = document.getElementById('reportProofPlayerContainer');
    const vid = document.getElementById('reportProofVideoPlayer');
    const overlay = document.getElementById('reportProofPlayOverlay');
    const errBanner = document.getElementById('reportProofVideoError');

    if (vid) {
      // Toggle play/pause on click anywhere on container or video body
      const togglePlay = (e) => {
        // If clicking near native controls bar (bottom 42px), let native controls handle it
        const rect = vid.getBoundingClientRect();
        if (e.clientY > rect.bottom - 42) return;

        if (vid.paused) {
          const promise = vid.play();
          if (promise !== undefined) {
            promise.catch(err => {
              console.warn('[Video] Playback failed or codec unsupported:', err);
              if (errBanner) errBanner.style.display = 'block';
            });
          }
        } else {
          vid.pause();
        }
      };

      if (container) container.onclick = togglePlay;

      vid.onplay = () => {
        if (overlay) overlay.style.display = 'none';
      };
      vid.onpause = () => {
        if (overlay) overlay.style.display = 'flex';
      };
      vid.onended = () => {
        if (overlay) overlay.style.display = 'flex';
      };
      vid.onerror = (e) => {
        console.warn('[Video] Player error:', e);
        if (errBanner) errBanner.style.display = 'block';
        if (overlay) overlay.style.display = 'none';
      };

      // If file extension is a non-web standard container, show notice immediately
      if (['avi', 'mkv', 'wmv'].includes(ext)) {
        if (errBanner) errBanner.style.display = 'block';
      }
    }
  }

  async submitReport() {
    const issueText = (document.getElementById('reportIssueText')?.value || '').trim();
    if (!issueText) {
      this.showToast('⚠️ Please describe the issue before submitting.');
      return;
    }

    const btn = document.getElementById('btnSubmitReport');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; }

    let proofUrl = null;

    // Try to upload to Supabase Storage if connected and file selected
    if (this._reportProofFile && window.db && window.db.supabase) {
      try {
        const file = this._reportProofFile;
        const ext = file.name.split('.').pop();
        const path = `reports/${Date.now()}_proof.${ext}`;
        const { data, error } = await window.db.supabase.storage
          .from('report-proofs')
          .upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' });
        if (!error && data) {
          const { data: urlData } = window.db.supabase.storage
            .from('report-proofs')
            .getPublicUrl(path);
          proofUrl = urlData?.publicUrl || null;
        } else if (error) {
          console.warn('[Report] Supabase Storage upload failed:', error.message);
          // Fallback: store as a blob URL reference (local only)
          proofUrl = URL.createObjectURL(file);
        }
      } catch (err) {
        console.warn('[Report] Storage exception:', err);
        proofUrl = URL.createObjectURL(this._reportProofFile);
      }
    }

    const ctx = this._reportContext || {};
    const hostId = document.getElementById('reportHostId')?.value || null;

    const reportData = {
      session_id: ctx.sessionId || null,
      host_id: hostId,
      driver_name: ctx.driverName || '',
      charger_name: ctx.stationName || '',
      issue_text: issueText,
      proof_video_url: proofUrl
    };

    if (window.db && typeof window.db.insertReport === 'function') {
      window.db.insertReport(reportData);
    }

    // Close modal & clean up
    const modal = document.getElementById('reportSessionModal');
    if (modal) modal.classList.remove('active');

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Report'; }

    this.clearReportProofFile();
    this._reportContext = null;

    // Refresh inquiries tab to show reported status
    if (typeof this.renderHostInquiries === 'function') {
      this.renderHostInquiries();
    }

    this.showToast('✅ Report submitted. We\'ll review it within 24 hours.');
  }

  viewReportProof(encodedUrl, driverName) {
    const url = decodeURIComponent(encodedUrl);
    if (!url) return;

    let viewer = document.getElementById('proofViewerModal');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'proofViewerModal';
      viewer.className = 'modal-overlay';
      viewer.style.zIndex = '99999';
      viewer.innerHTML = `
        <div class="modal-bottom-sheet" style="max-height:85vh; padding:18px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">
              <i class="fa-solid fa-paperclip" style="color:var(--accent-cyan); margin-right:6px;"></i> Attached Proof
            </div>
            <button type="button" onclick="document.getElementById('proofViewerModal').classList.remove('active')" style="background:none; border:none; color:var(--text-muted); font-size:1.1rem; cursor:pointer;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div id="proofViewerBody" style="border-radius:var(--radius-sm); overflow:hidden; background:#000;"></div>
        </div>
      `;
      document.body.appendChild(viewer);
      viewer.onclick = (e) => {
        if (e.target === viewer) viewer.classList.remove('active');
      };
    }

    const body = document.getElementById('proofViewerBody');
    const isVid = url.match(/\.(mp4|webm|mov|ogg|m4v)/i) || url.startsWith('blob:') || url.includes('_proof.');
    if (body) {
      if (isVid) {
        body.innerHTML = `
          <video src="${url}" controls playsinline autoplay style="width:100%; max-height:400px; display:block; background:#000;">
            Your browser does not support this video.
          </video>`;
      } else {
        body.innerHTML = `<img src="${url}" style="width:100%; max-height:400px; object-fit:contain; display:block;">`;
      }
    }
    viewer.classList.add('active');
  }

  // =========================================================================
  // 8.4b. 30-Second Periodic Sync — keeps map, chargers & inquiries fresh
  // =========================================================================
  startPeriodicSync() {
    if (this._periodicSyncTimer) clearInterval(this._periodicSyncTimer);

    this._periodicSyncTimer = setInterval(() => {
      if (!window.db) return;

      try {
        // Re-load chargers from DB (picks up any newly added stations)
        if (typeof this.loadChargersFromDB === 'function') {
          const freshChargers = this.loadChargersFromDB();
          if (freshChargers && freshChargers.length !== (this.chargers || []).length) {
            this.chargers = freshChargers;
            if (typeof this.renderMapMarkers === 'function') this.renderMapMarkers();
            if (typeof this.renderNearbyList === 'function') this.renderNearbyList();
          } else {
            this.chargers = freshChargers || this.chargers;
          }
        }

        // Refresh map markers (charger availability may have changed)
        if (typeof this.renderMapMarkers === 'function') this.renderMapMarkers();

        // Refresh host dashboard (earnings, drivers served, inquiries)
        if (typeof this.updateHostDashboard === 'function') this.updateHostDashboard();

        // Refresh inquiries tab if visible
        const inquiriesTab = document.getElementById('tab-host-inquiries');
        if (inquiriesTab && inquiriesTab.classList.contains('active')) {
          if (typeof this.renderHostInquiries === 'function') this.renderHostInquiries();
        }

        // Refresh notifications (new completed session notifs for host)
        if (typeof this.renderNotifications === 'function') this.renderNotifications();

        // Wallet balance sync
        if (this.currentUser && window.db && !this.currentUser.isDemo) {
          const u = window.db.getUser(this.currentUser.sqlId || this.currentUser.email);
          if (u && u.wallet_balance !== undefined) {
            const fresh = parseFloat(u.wallet_balance);
            if (fresh !== this.walletBalance) {
              this.walletBalance = fresh;
              if (typeof this.updateWalletUI === 'function') this.updateWalletUI();
            }
          }
        }
      } catch (err) {
        // Silent — never break the UI over a sync tick
        console.warn('[PeriodicSync] tick error:', err);
      }
    }, 30000); // every 30 seconds
  }

  // =========================================================================
  // 8.5. User Profile & Vehicle Details (Direct SQL DB Sync)
  // =========================================================================
  updateProfileModeUI(mode) {
    const role = mode || this.userRole || 'driver';
    const vehicleCard = document.getElementById('cardProfileVehicleDetails');
    const hostCard = document.getElementById('cardProfileHostDetails');
    const bannerIcon = document.getElementById('profileModeBannerIcon');
    const bannerTitle = document.getElementById('profileModeBannerTitle');
    const bannerSubtitle = document.getElementById('profileModeBannerSubtitle');
    const bannerTag = document.getElementById('profileModeBannerTag');
    const rolePref = document.getElementById('profileRolePreference');

    if (rolePref && rolePref.value !== role && (role === 'driver' || role === 'host' || role === 'both')) {
      rolePref.value = role;
    }

    if (role === 'host') {
      if (vehicleCard) vehicleCard.style.display = 'none';
      if (hostCard) hostCard.style.display = 'flex';
      if (bannerIcon) bannerIcon.textContent = '🏡';
      if (bannerTitle) bannerTitle.textContent = 'Host Profile Setup';
      if (bannerSubtitle) bannerSubtitle.textContent = 'Please complete your host settlement and payout details to list wallboxes';
      if (bannerTag) {
        bannerTag.textContent = 'Host Mode';
        bannerTag.style.color = 'var(--accent-emerald-light)';
        bannerTag.style.background = 'rgba(22,163,74,0.2)';
      }
    } else if (role === 'driver') {
      if (vehicleCard) vehicleCard.style.display = 'flex';
      if (hostCard) hostCard.style.display = 'none';
      if (bannerIcon) bannerIcon.textContent = '🚗';
      if (bannerTitle) bannerTitle.textContent = 'Driver Profile Setup';
      if (bannerSubtitle) bannerSubtitle.textContent = 'Please complete your vehicle specifications to find and book chargers';
      if (bannerTag) {
        bannerTag.textContent = 'Driver Mode';
        bannerTag.style.color = 'var(--accent-cyan-light)';
        bannerTag.style.background = 'rgba(100,116,139,0.2)';
      }
    } else {
      if (vehicleCard) vehicleCard.style.display = 'flex';
      if (hostCard) hostCard.style.display = 'flex';
      if (bannerIcon) bannerIcon.textContent = '⚡';
      if (bannerTitle) bannerTitle.textContent = 'Dual Profile Setup';
      if (bannerSubtitle) bannerSubtitle.textContent = 'Please complete your driver vehicle and host wallbox specifications';
      if (bannerTag) {
        bannerTag.textContent = 'Dual Mode';
        bannerTag.style.color = 'var(--accent-amber)';
        bannerTag.style.background = 'rgba(245, 158, 11, 0.2)';
      }
    }
    this.updateDemoModeUI();
  }

  loadUserDetailsToForm() {
    this.ensureDatabaseReady();
    const email = (this.currentUser && this.currentUser.email) || '';
    let user = (this.currentUser && this.currentUser.sqlId ? window.db.getUser(this.currentUser.sqlId) : null) || (email ? window.db.getUser(email) : null);
    
    if (!user && email && !this.currentUser?.isDemo) {
      user = window.db.insertUser({
        id: (this.currentUser && this.currentUser.sqlId) || `usr-${Date.now()}`,
        email: email,
        full_name: (this.currentUser && this.currentUser.name) || '',
        phone: '',
        wallet_balance: this.walletBalance || 1500.00,
        role_preference: this.userRole || 'driver'
      });
    }

    this.updateDemoModeUI();

    const host = user ? window.db.getHostByUserId(user.id) : null;

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

    const addrInp = document.getElementById('profileAddress');
    const latInp = document.getElementById('profileLat');
    const lngInp = document.getElementById('profileLng');
    const validationBox = document.getElementById('profileValidationMsg');

    // Clear previous error states
    document.querySelectorAll('#userProfileDetailsForm .input-error').forEach(el => el.classList.remove('input-error'));
    if (validationBox) {
      validationBox.style.display = 'none';
      validationBox.textContent = '';
    }

    // Populate inputs: if empty in DB, keep strictly empty for user to fill!
    if (nameInp) nameInp.value = (user && user.full_name) || (this.currentUser && this.currentUser.name) || '';
    if (emailInp) emailInp.value = (user && user.email) || (this.currentUser && this.currentUser.email) || '';
    if (phoneInp) phoneInp.value = (user && user.phone) || '';
    if (rolePref) rolePref.value = (user && user.role_preference) || this.userRole || 'driver';
    if (evModelInp) evModelInp.value = (user && user.ev_model) || '';
    if (battInp) battInp.value = (user && user.ev_battery_capacity_kwh) ? user.ev_battery_capacity_kwh : '';
    if (plateInp) {
      let pVal = (user && user.ev_plate_number) || '';
      if (pVal === 'KA 03 EV 8899' || pVal.toLowerCase().includes('dummy')) {
        pVal = '';
        if (user) user.ev_plate_number = '';
      }
      plateInp.value = pVal;
    }
    if (sqlUserId) sqlUserId.textContent = (user && user.id) || 'usr-pending';
    if (kycBadge) kycBadge.textContent = ((user && user.kyc_status) || 'VERIFIED') + ' KYC';

    if (addrInp) addrInp.value = (user && user.address) || (host && host.address) || '';
    if (latInp) latInp.value = (user && user.lat !== undefined && user.lat !== null) ? user.lat : (host && host.lat ? host.lat : '');
    if (lngInp) lngInp.value = (user && user.lng !== undefined && user.lng !== null) ? user.lng : (host && host.lng ? host.lng : '');

    if (host) {
      if (hostNameInp) hostNameInp.value = host.display_name || '';
      if (hostUpiInp) hostUpiInp.value = host.payout_upi_id || '';
      if (hostBankInp) hostBankInp.value = host.bank_account_no || '';
    } else {
      if (hostNameInp) hostNameInp.value = '';
      if (hostUpiInp) hostUpiInp.value = '';
      if (hostBankInp) hostBankInp.value = '';
    }

    // Role preference change listener in profile form
    if (rolePref && !rolePref._hasChangeEvt) {
      rolePref._hasChangeEvt = true;
      rolePref.addEventListener('change', () => {
        this.updateProfileModeUI(rolePref.value);
      });
    }

    this.updateProfileModeUI(rolePref ? rolePref.value : this.userRole);

    // Load host charger photos directly from database (Never load stale global cache)
    let savedPhotos = [];
    if (this.currentUser && this.currentUser.isDemo) {
      savedPhotos = [];
    } else {
      if (host && host.photos) {
        try {
          savedPhotos = typeof host.photos === 'string' ? JSON.parse(host.photos) : host.photos;
        } catch (e) {}
      }
      if ((!savedPhotos || savedPhotos.length === 0) && window.db && window.db.tables && window.db.tables.chargers) {
        const myCh = window.db.tables.chargers.find(c => (host && c.host_id === host.id) || (user && c.host_id === user.id));
        if (myCh && myCh.photos && myCh.photos.length > 0) {
          try {
            savedPhotos = Array.isArray(myCh.photos) ? myCh.photos : JSON.parse(myCh.photos);
          } catch (e) {}
        }
      }
    }

    this.hostUploadedPhotos = Array.isArray(savedPhotos) ? savedPhotos : [];
    this.renderHostPhotoPreviews();

    if (user && !this.currentUser?.isDemo) {
      this.currentUser = {
        email: user.email,
        name: user.full_name,
        sqlId: user.id,
        isDemo: false,
        loggedInAt: Date.now()
      };
    }
    this.initVehicleDbSelector();
  }

  // =========================================================================
  // Host Charger Photo Upload System (Min 3, Max 5 Photos Required in Host Mode)
  // =========================================================================
  initHostPhotoUploader() {
    const dropzone = document.getElementById('profilePhotoDropzone');
    const fileInput = document.getElementById('profileChargerPhotoInput');
    if (!dropzone || !fileInput || dropzone._uploaderInitialized) return;
    dropzone._uploaderInitialized = true;

    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.handleHostPhotoFiles(Array.from(e.target.files));
        fileInput.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        this.handleHostPhotoFiles(Array.from(dt.files));
      }
    });
  }

  async handleHostPhotoFiles(files) {
    const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'));
    if (!imageFiles.length) {
      this.showToast('⚠️ Please upload photo files only (JPG, PNG, WebP).');
      return;
    }

    const availableSlots = 5 - this.hostUploadedPhotos.length;
    if (availableSlots <= 0) {
      this.showToast('⚠️ Maximum 5 charger photos reached. Delete an existing photo first.');
      return;
    }

    let filesToAdd = imageFiles;
    if (imageFiles.length > availableSlots) {
      filesToAdd = imageFiles.slice(0, availableSlots);
      this.showToast(`⚠️ Maximum 5 photos allowed. Added first ${availableSlots} photo(s).`);
    }

    const dropzone = document.getElementById('profilePhotoDropzone');
    if (dropzone) dropzone.classList.remove('input-error');

    for (const file of filesToAdd) {
      try {
        const compressed = await this.compressImageToDataUrl(file);
        if (this.hostUploadedPhotos.length < 5) {
          this.hostUploadedPhotos.push(compressed);
        }
      } catch (err) {
        console.warn('Failed to process image:', err);
      }
    }

    this.renderHostPhotoPreviews();
  }

  compressImageToDataUrl(file, maxDimension = 800, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  renderHostPhotoPreviews() {
    const grid = document.getElementById('profilePhotosGrid');
    const badge = document.getElementById('profilePhotosCountBadge');
    const count = this.hostUploadedPhotos ? this.hostUploadedPhotos.length : 0;

    if (badge) {
      if (count < 3) {
        badge.style.background = 'rgba(192,57,43,0.15)';
        badge.style.color = '#e07068';
        badge.style.borderColor = 'rgba(192,57,43,0.3)';
        badge.textContent = `${count} / 5 Photos (Min 3 required)`;
      } else {
        badge.style.background = 'rgba(22,163,74,0.2)';
        badge.style.color = 'var(--accent-emerald-light)';
        badge.style.borderColor = 'rgba(22,163,74,0.4)';
        badge.textContent = `✓ ${count} / 5 Photos Ready`;
      }
    }

    if (!grid) return;

    if (count === 0) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = this.hostUploadedPhotos.map((dataUrl, idx) => `
      <div class="photo-preview-item" data-photo-idx="${idx}" style="cursor: pointer;" onclick="if(!event.target.closest('.btn-remove-photo')) window.app.openPhotoSlideshow(window.app.hostUploadedPhotos, ${idx}, 'Uploaded Setup Photo')">
        <img src="${dataUrl}" alt="Charger Photo ${idx + 1}">
        <span class="photo-preview-badge">#${idx + 1}</span>
        <button type="button" class="btn-remove-photo" data-remove-idx="${idx}" title="Remove photo">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-remove-photo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(btn.getAttribute('data-remove-idx'), 10);
        if (!isNaN(removeIdx) && removeIdx >= 0 && removeIdx < this.hostUploadedPhotos.length) {
          this.hostUploadedPhotos.splice(removeIdx, 1);
          this.renderHostPhotoPreviews();
        }
      });
    });
  }

  // =========================================================================
  // Dedicated Charger Profile Photo Uploader (Unique per Charger Point)
  // =========================================================================
  initHostWizardPhotoUploader() {
    const dropzone = document.getElementById('hostWizardPhotoDropzone');
    const fileInput = document.getElementById('hostWizardPhotoInput');
    if (!dropzone || !fileInput || dropzone._wizardUploaderInit) return;
    dropzone._wizardUploaderInit = true;

    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.handleWizardPhotoFiles(Array.from(e.target.files));
        fileInput.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        this.handleWizardPhotoFiles(Array.from(dt.files));
      }
    });
  }

  async handleWizardPhotoFiles(files) {
    const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'));
    if (!imageFiles.length) {
      this.showToast('⚠️ Please upload image files only (JPG, PNG, WebP).');
      return;
    }

    if (!Array.isArray(this.currentWizardPhotos)) {
      this.currentWizardPhotos = [];
    }

    const availableSlots = 5 - this.currentWizardPhotos.length;
    if (availableSlots <= 0) {
      this.showToast('⚠️ Maximum 5 photos allowed for this charger profile. Remove one first.');
      return;
    }

    const filesToAdd = imageFiles.slice(0, availableSlots);
    for (const file of filesToAdd) {
      try {
        const compressed = await this.compressImageToDataUrl(file);
        if (this.currentWizardPhotos.length < 5) {
          this.currentWizardPhotos.push(compressed);
        }
      } catch(err) {
        console.warn('Failed to compress wizard photo:', err);
      }
    }

    this.renderWizardPhotoPreviews();
  }

  renderWizardPhotoPreviews() {
    const grid = document.getElementById('hostWizardPhotosGrid');
    const badge = document.getElementById('hostWizardPhotosCountBadge');
    const count = this.currentWizardPhotos ? this.currentWizardPhotos.length : 0;

    if (badge) {
      const metMin = count >= 3;
      badge.textContent = `${count} / 5 Photos${metMin ? ' ✓' : ' (Min 3)'}`;
      badge.style.background = metMin ? 'rgba(22,163,74,0.15)' : (count > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(255, 255, 255, 0.05)');
      badge.style.color = metMin ? 'var(--accent-emerald-light)' : (count > 0 ? 'var(--accent-amber-light)' : 'var(--text-muted)');
      badge.style.borderColor = metMin ? 'rgba(22,163,74,0.4)' : (count > 0 ? 'rgba(245,158,11,0.35)' : '');
    }

    if (grid) {
      if (!this.currentWizardPhotos || !this.currentWizardPhotos.length) {
        grid.innerHTML = '';
        return;
      }

      grid.innerHTML = this.currentWizardPhotos.map((dataUrl, idx) => `
        <div style="position: relative; width: 100%; aspect-ratio: 4/3; border-radius: 6px; overflow: hidden; border: 1.5px solid rgba(22,163,74,0.35); background: #000;">
          <img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Charger photo #${idx + 1}" onclick="window.app.openPhotoSlideshow(window.app.currentWizardPhotos, ${idx}, 'Charger Setup Photo')">
          <button type="button" class="btn-remove-wizard-photo" data-idx="${idx}" style="position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.85); border: 1px solid rgba(192,57,43,0.5); color: #e07068; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px;" title="Remove this photo">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-remove-wizard-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const removeIdx = parseInt(btn.dataset.idx, 10);
          if (!isNaN(removeIdx) && removeIdx >= 0 && removeIdx < this.currentWizardPhotos.length) {
            this.currentWizardPhotos.splice(removeIdx, 1);
            this.renderWizardPhotoPreviews();
          }
        });
      });
    }
  }

  openNewChargerWizard() {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Adding charger points is disabled.');
      return;
    }

    this.initHostWizardPhotoUploader();
    const modal = document.getElementById('hostWizardModal');
    if (!modal) return;
    const form = document.getElementById('hostChargerForm');
    if (form) form.reset();

    const idInp = document.getElementById('hostFormChargerId');
    if (idInp) idInp.value = '';

    const titleEl = document.getElementById('hostWizardModalTitle');
    if (titleEl) titleEl.textContent = '⚡ Add New Charging Point & Profile';

    const submitBtn = document.getElementById('btnHostFormSubmit');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Establish Charger Profile';

    const latInp = document.getElementById('hostFormLat');
    const lngInp = document.getElementById('hostFormLng');
    if (latInp && !latInp.value) latInp.value = this.userLocation.lat.toFixed(6);
    if (lngInp && !lngInp.value) lngInp.value = this.userLocation.lng.toFixed(6);

    const nameInp = document.getElementById('hostFormName');
    if (nameInp && (!nameInp.value || nameInp.value === '')) {
      nameInp.value = this.currentUser?.name || 'Community Host';
    }

    this.currentWizardPhotos = [];
    this.renderWizardPhotoPreviews();
    modal.classList.add('active');
  }

  openEditChargerWizard(chargerId) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Editing charger points is disabled.');
      return;
    }

    this.initHostWizardPhotoUploader();
    const modal = document.getElementById('hostWizardModal');
    if (!modal) return;

    const ch = this.chargers.find(c => c.id === chargerId) || (window.db?.tables?.chargers?.find(c => c.id === chargerId));
    if (!ch) {
      this.showToast('⚠️ Charger point not found.');
      return;
    }

    const idInp = document.getElementById('hostFormChargerId');
    if (idInp) idInp.value = ch.id;

    const titleEl = document.getElementById('hostWizardModalTitle');
    if (titleEl) titleEl.textContent = `✏️ Edit Profile: ${ch.title}`;

    const submitBtn = document.getElementById('btnHostFormSubmit');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Charger Profile & Photos';

    document.getElementById('hostFormTitle').value = ch.title || '';
    document.getElementById('hostFormName').value = ch.hostName || ch.host_name || (this.currentUser?.name || 'Community Host');
    document.getElementById('hostFormRate').value = ch.ratePerHourINR || ch.ratePerHour || ch.rate_per_hour || ch.ratePerKwhINR || 120.00;
    document.getElementById('hostFormAddress').value = ch.address || '';
    document.getElementById('hostFormLat').value = ch.lat || ch.latitude || '';
    document.getElementById('hostFormLng').value = ch.lng || ch.longitude || '';
    document.getElementById('hostFormConnector').value = ch.connectorType || ch.connector_type || 'Type 2 (AC)';
    document.getElementById('hostFormPower').value = String(ch.powerKw || ch.power_kw || '11.0');
    document.getElementById('hostFormParking').value = ch.parkingType || ch.parking_type || 'Private Driveway';
    document.getElementById('hostFormAccess').value = ch.accessHours || ch.access_hours || '24/7 Access';
    document.getElementById('hostFormSolar').checked = Boolean(ch.solarPowered ?? ch.is_solar_powered);
    document.getElementById('hostFormNotes').value = ch.notes || '';

    // Load THIS specific charger's distinct photos
    let chPhotos = [];
    if (Array.isArray(ch.photos) && ch.photos.length > 0) {
      chPhotos = [...ch.photos];
    } else if (typeof ch.photos === 'string' && ch.photos) {
      try { chPhotos = JSON.parse(ch.photos); } catch(e) {}
    } else if (Array.isArray(ch.charger_photos) && ch.charger_photos.length > 0) {
      chPhotos = [...ch.charger_photos];
    }
    this.currentWizardPhotos = chPhotos;
    this.renderWizardPhotoPreviews();

    modal.classList.add('active');
  }

  deleteHostCharger(chargerId) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Deleting charger points is disabled.');
      return;
    }

    const ch = this.chargers.find(c => c.id === chargerId);
    const title = ch ? ch.title : 'this charger';
    if (!confirm(`Are you sure you want to delete "${title}"? This will permanently remove its profile and pictures.`)) return;

    this.chargers = this.chargers.filter(c => c.id !== chargerId);

    if (window.db && window.db.tables && window.db.tables.chargers) {
      window.db.tables.chargers = window.db.tables.chargers.filter(c => c.id !== chargerId);
      window.db.save();
    }

    this.saveChargersState();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.updateHostDashboard();
    this.showToast(`🗑️ "${title}" deleted.`);
  }

  updateExistingHostCharger(formData) {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Editing charger points is disabled.');
      return;
    }

    const chargerId = formData.chargerId;
    const lat = parseFloat(formData.lat) || this.userLocation.lat || 12.9716;
    const lng = parseFloat(formData.lng) || this.userLocation.lng || 77.5946;

    // 1. Update in-memory chargers list
    const ch = this.chargers.find(c => c.id === chargerId);
    if (ch) {
      ch.title = formData.title;
      ch.hostName = formData.hostName;
      ch.address = formData.address;
      ch.lat = lat;
      ch.lng = lng;
      ch.connectorType = formData.connectorType;
      ch.powerKw = parseFloat(formData.powerKw || 11.0);
      ch.ratePerHourINR = parseFloat(formData.ratePerHour || formData.ratePerKwh || 120.00);
      ch.ratePerKwhINR = parseFloat(formData.ratePerHour || formData.ratePerKwh || 120.00);
      ch.parkingType = formData.parkingType;
      ch.accessHours = formData.accessHours;
      ch.solarPowered = Boolean(formData.solarPowered);
      ch.notes = formData.notes;
      ch.photos = formData.photos; // Assigned strictly to this charger!
    }

    // 2. Update persistent DB
    if (window.db && window.db.tables && window.db.tables.chargers) {
      const dbCharger = window.db.tables.chargers.find(c => c.id === chargerId);
      if (dbCharger) {
        dbCharger.title = formData.title;
        dbCharger.host_name = formData.hostName;
        dbCharger.address = formData.address;
        dbCharger.lat = lat;
        dbCharger.latitude = lat;
        dbCharger.lng = lng;
        dbCharger.longitude = lng;
        dbCharger.connector_type = formData.connectorType;
        dbCharger.power_kw = parseFloat(formData.powerKw || 11.0);
        dbCharger.rate_per_kwh = parseFloat(formData.ratePerKwh || 15.00);
        dbCharger.parking_type = formData.parkingType;
        dbCharger.access_hours = formData.accessHours;
        dbCharger.is_solar_powered = Boolean(formData.solarPowered);
        dbCharger.notes = formData.notes;
        dbCharger.photos = formData.photos; // Assigned strictly to this charger!
        dbCharger.updated_at = new Date().toISOString();
        window.db.save();
      }
    }

    this.saveChargersState();
    this.renderMapMarkers();
    this.renderNearbyList();
    this.updateHostDashboard();

    this.showToast(`✅ Profile and ${formData.photos.length} photos saved for "${formData.title}"!`);
  }

  // =========================================================================
  // Photo Slideshow Lightbox Controller
  // =========================================================================
  initPhotoSlideshow() {
    const closeBtn = document.getElementById('btnCloseSlideshow');
    const prevBtn = document.getElementById('btnSlideshowPrev');
    const nextBtn = document.getElementById('btnSlideshowNext');
    const autoplayBtn = document.getElementById('btnSlideshowAutoplay');
    const modal = document.getElementById('photoSlideshowModal');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closePhotoSlideshow());
    if (prevBtn) prevBtn.addEventListener('click', () => this.slideshowPrev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.slideshowNext());
    if (autoplayBtn) autoplayBtn.addEventListener('click', () => this.toggleSlideshowAutoplay());

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closePhotoSlideshow();
      });
    }

    // Keyboard controls: ArrowLeft, ArrowRight, Escape
    window.addEventListener('keydown', (e) => {
      const m = document.getElementById('photoSlideshowModal');
      if (!m || !m.classList.contains('active')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.slideshowPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.slideshowNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closePhotoSlideshow();
      }
    });

    // Mobile touch swipe gesture navigation
    const stage = document.querySelector('.slideshow-stage');
    if (stage) {
      let touchStartX = 0;
      let touchEndX = 0;
      stage.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      stage.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 45) {
          this.slideshowNext();
        } else if (touchEndX - touchStartX > 45) {
          this.slideshowPrev();
        }
      }, { passive: true });
    }
  }

  openPhotoSlideshow(photos, startIndex = 0, title = 'Charger Photo') {
    if (!photos || (Array.isArray(photos) && photos.length === 0)) return;
    this.slideshowPhotos = Array.isArray(photos) ? photos : [photos];
    this.slideshowIndex = Math.max(0, Math.min(startIndex, this.slideshowPhotos.length - 1));
    this.slideshowTitle = title || 'Verified Charger Photo';

    const modal = document.getElementById('photoSlideshowModal');
    if (!modal) return;

    this.renderSlideshowActivePhoto();
    modal.classList.add('active');
  }

  renderSlideshowActivePhoto() {
    if (!this.slideshowPhotos || !this.slideshowPhotos.length) return;
    const currentImgUrl = this.slideshowPhotos[this.slideshowIndex];
    const total = this.slideshowPhotos.length;

    const imgEl = document.getElementById('slideshowActiveImg');
    const titleEl = document.getElementById('slideshowTitle');
    const counterEl = document.getElementById('slideshowCounterBadge');
    const trackEl = document.getElementById('slideshowThumbnailsTrack');

    if (imgEl) {
      imgEl.style.opacity = '0';
      imgEl.src = currentImgUrl;
      setTimeout(() => { imgEl.style.opacity = '1'; }, 40);
    }
    if (titleEl) {
      titleEl.textContent = this.slideshowTitle;
    }
    if (counterEl) {
      counterEl.textContent = `${this.slideshowIndex + 1} / ${total}`;
    }

    if (trackEl) {
      trackEl.innerHTML = this.slideshowPhotos.map((src, idx) => `
        <div class="slideshow-thumb-item ${idx === this.slideshowIndex ? 'active' : ''}" onclick="window.app.gotoSlideshowIndex(${idx})">
          <img src="${src}" alt="Thumb ${idx + 1}">
        </div>
      `).join('');
      const activeThumb = trackEl.querySelector('.slideshow-thumb-item.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }

  slideshowNext() {
    if (!this.slideshowPhotos || !this.slideshowPhotos.length) return;
    this.slideshowIndex = (this.slideshowIndex + 1) % this.slideshowPhotos.length;
    this.renderSlideshowActivePhoto();
  }

  slideshowPrev() {
    if (!this.slideshowPhotos || !this.slideshowPhotos.length) return;
    this.slideshowIndex = (this.slideshowIndex - 1 + this.slideshowPhotos.length) % this.slideshowPhotos.length;
    this.renderSlideshowActivePhoto();
  }

  gotoSlideshowIndex(idx) {
    if (!this.slideshowPhotos || idx < 0 || idx >= this.slideshowPhotos.length) return;
    this.slideshowIndex = idx;
    this.renderSlideshowActivePhoto();
  }

  openSlideshowPhotoInNewTab() {
    if (!this.slideshowPhotos || !this.slideshowPhotos.length) return;
    const current = this.slideshowPhotos[this.slideshowIndex];
    if (!current) return;
    const win = window.open();
    if (win) {
      if (current.startsWith('data:image')) {
        win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${current}" style="max-width:100%;max-height:100vh;object-fit:contain;"></body></html>`);
        win.document.close();
      } else {
        win.location.href = current;
      }
    }
  }

  toggleSlideshowAutoplay() {
    const playIcon = document.getElementById('slideshowPlayIcon');
    const btn = document.getElementById('btnSlideshowAutoplay');
    if (this.slideshowAutoplayTimer) {
      clearInterval(this.slideshowAutoplayTimer);
      this.slideshowAutoplayTimer = null;
      if (playIcon) playIcon.className = 'fa-solid fa-play';
      if (btn) btn.style.background = 'rgba(255,255,255,0.08)';
    } else {
      this.slideshowNext();
      this.slideshowAutoplayTimer = setInterval(() => {
        this.slideshowNext();
      }, 3000);
      if (playIcon) playIcon.className = 'fa-solid fa-pause';
      if (btn) btn.style.background = 'rgba(22,163,74,0.3)';
    }
  }

  closePhotoSlideshow() {
    if (this.slideshowAutoplayTimer) {
      clearInterval(this.slideshowAutoplayTimer);
      this.slideshowAutoplayTimer = null;
      const playIcon = document.getElementById('slideshowPlayIcon');
      if (playIcon) playIcon.className = 'fa-solid fa-play';
      const btn = document.getElementById('btnSlideshowAutoplay');
      if (btn) btn.style.background = 'rgba(255,255,255,0.08)';
    }
    const modal = document.getElementById('photoSlideshowModal');
    if (modal) modal.classList.remove('active');
  }

  // =========================================================================
  // Driver Profile Vehicle Database Picker & Auto-Fill Handler (Modal & 3 Option Cards)
  // =========================================================================
  initVehicleDbSelector() {
    if (this._vehicleDbSelectorInitialized) return;
    
    const catButtons = document.querySelectorAll('.vehicle-cat-btn');
    const pickerModal = document.getElementById('vehiclePickerModal');
    const btnCloseModal = document.getElementById('btnCloseVehicleModal');
    const modalTitle = document.getElementById('vehicleModalTitle');
    const modalBadge = document.getElementById('vehicleModalCategoryBadge');
    const searchInp = document.getElementById('vehicleSearchInput');
    const listContainer = document.getElementById('vehicleDbListContainer');
    
    const autoFillBadge = document.getElementById('profileDbAutoFillBadge');
    const badgeVehicleName = document.getElementById('badgeVehicleName');
    const badgeVehicleBatt = document.getElementById('badgeVehicleBatt');
    const evModelInp = document.getElementById('profileEvModel');
    const battInp = document.getElementById('profileBatteryCapacity');

    this._vehicleDbSelectorInitialized = true;
    let currentCategoryVehicles = [];

    // Helper to fetch vehicles for a given category key
    const fetchVehiclesForCategory = (catKey) => {
      this.ensureDatabaseReady();
      let list = [];
      if (window.db && typeof window.db.getVehicles === 'function') {
        list = window.db.getVehicles(catKey);
      }
      if (!list || list.length === 0) {
        if (catKey === '2w' || catKey === '2-Wheeler') list = window.EV_2WHEELER_DATA || [];
        else if (catKey === '4w' || catKey === '4-Wheeler') list = window.EV_4WHEELER_DATA || [];
        else if (catKey === 'lux' || catKey === 'luxury' || catKey === '4-Wheeler (Luxury)') list = window.EV_LUXURY_DATA || [];
      }
      return list || [];
    };

    // Helper to render vehicle cards inside modal
    const renderVehicleList = (filterTerm = '') => {
      if (!listContainer) return;
      const term = filterTerm.toLowerCase().trim();
      const filtered = currentCategoryVehicles.filter(v => {
        if (!term) return true;
        const searchStr = `${v.company} ${v.model} ${v.variant || ''} ${v.vehicle_type || ''}`.toLowerCase();
        return searchStr.includes(term);
      });

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
            <i class="fa-solid fa-car-rear" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--border-subtle);"></i><br>
            No vehicles matched "${filterTerm}"
          </div>
        `;
        return;
      }

      listContainer.innerHTML = filtered.map(v => {
        const fullTitle = `${v.company} ${v.model}`.trim();
        const varTxt = v.variant ? v.variant : 'Standard Variant';
        const battKwh = parseFloat(v.battery_capacity_kwh) || 0;
        const iconClass = v.vehicle_type === '2-Wheeler' ? 'fa-motorcycle' : (v.vehicle_type && v.vehicle_type.includes('Luxury') ? 'fa-gem' : 'fa-car-side');
        const jsonVal = JSON.stringify({
          company: v.company,
          model: v.model,
          variant: v.variant || '',
          battery: battKwh,
          type: v.vehicle_type || ''
        });

        return `
          <div class="vehicle-db-item" data-vehicle="${encodeURIComponent(jsonVal)}" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
              <div style="width: 38px; height: 38px; min-width: 38px; border-radius: 8px; background: rgba(100,116,139,0.12); border: 1px solid rgba(100,116,139,0.25); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan); font-size: 1.1rem;">
                <i class="fa-solid ${iconClass}"></i>
              </div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fullTitle}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;">${varTxt}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; min-width: max-content;">
              <span style="font-size: 0.76rem; font-weight: 700; color: var(--accent-emerald-light); background: rgba(22,163,74,0.15); border: 1px solid rgba(22,163,74,0.3); padding: 4px 10px; border-radius: 6px;">
                ⚡ ${battKwh} kWh
              </span>
              <button type="button" class="btn-select-vehicle-item" style="background: var(--accent-cyan); color: #000; font-weight: 800; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.72rem; cursor: pointer;">
                Select
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Add click listeners to items
      listContainer.querySelectorAll('.vehicle-db-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const rawJson = item.getAttribute('data-vehicle');
          if (!rawJson) return;
          try {
            const vData = JSON.parse(decodeURIComponent(rawJson));
            const fullModelName = `${vData.company} ${vData.model}${vData.variant ? ' ' + vData.variant : ''}`.trim();
            const battCapacity = parseFloat(vData.battery) || 0;

            // Set vehicle form fields
            if (evModelInp) evModelInp.value = fullModelName;
            if (battInp) battInp.value = battCapacity;

            // Highlight chosen category button
            catButtons.forEach(btn => {
              if (btn.getAttribute('data-category') === this._activeCategoryKey) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Close Modal
            if (pickerModal) pickerModal.classList.remove('active');

            if (typeof this.showToast === 'function') {
              this.showToast(`Selected: ${fullModelName} (${battCapacity} kWh)`);
            }
          } catch(err) {
            console.error('Error selecting vehicle from modal:', err);
          }
        });
      });
    };

    // Category Button Click Handlers
    catButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const catKey = btn.getAttribute('data-category');
        this._activeCategoryKey = catKey;

        currentCategoryVehicles = fetchVehiclesForCategory(catKey);

        let catName = 'Vehicle Catalog';
        let badgeHtml = '<i class="fa-solid fa-car"></i> Vehicle Catalog';
        if (catKey === '2w') {
          catName = '🛵 2-Wheeler EVs';
          badgeHtml = '<i class="fa-solid fa-motorcycle"></i> 2-Wheeler Sets';
        } else if (catKey === '4w') {
          catName = '🚗 4-Wheeler EVs';
          badgeHtml = '<i class="fa-solid fa-car"></i> 4-Wheeler Sets';
        } else if (catKey === 'lux') {
          catName = '💎 Luxury EVs';
          badgeHtml = '<i class="fa-solid fa-gem"></i> Luxury Sets';
        }

        if (modalTitle) modalTitle.textContent = `${catName} (${currentCategoryVehicles.length} in DB)`;
        if (modalBadge) modalBadge.innerHTML = badgeHtml;
        if (searchInp) searchInp.value = '';

        renderVehicleList('');

        if (pickerModal) pickerModal.classList.add('active');
      });
    });

    // Search input listener
    if (searchInp) {
      searchInp.addEventListener('input', () => {
        renderVehicleList(searchInp.value);
      });
    }

    // Modal Close button
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        if (pickerModal) pickerModal.classList.remove('active');
      });
    }

    // Modal Overlay backdrop click to close
    if (pickerModal) {
      pickerModal.addEventListener('click', (e) => {
        if (e.target === pickerModal) {
          pickerModal.classList.remove('active');
        }
      });
    }
  }

  ensureDatabaseReady() {
    if (!window.db) {
      if (typeof VoltShareDatabase !== 'undefined') {
        try {
          window.db = new VoltShareDatabase();
        } catch(e) {
          console.warn("Could not instantiate VoltShareDatabase, using fallback engine:", e);
        }
      }
    }
    if (!window.db) {
      // In-memory fallback DB engine
      let tables = { users:[], hosts:[], chargers:[], charging_sessions:[], transactions:[], reviews:[], telemetry_logs:[] };

      window.db = {
        tables: tables,
        save() {
          window.dispatchEvent(new CustomEvent('voltshare:db_synced', { detail: { source: 'local_save', tables: this.tables } }));
        },
        getVehicles(type = 'all') {
          const v2 = (this.tables && this.tables.ev_2wheelers && this.tables.ev_2wheelers.length) ? this.tables.ev_2wheelers : (typeof window !== 'undefined' && window.EV_2WHEELER_DATA ? window.EV_2WHEELER_DATA : []);
          const v4 = (this.tables && this.tables.ev_4wheelers && this.tables.ev_4wheelers.length) ? this.tables.ev_4wheelers : (typeof window !== 'undefined' && window.EV_4WHEELER_DATA ? window.EV_4WHEELER_DATA : []);
          const lux = (this.tables && this.tables.ev_luxury && this.tables.ev_luxury.length) ? this.tables.ev_luxury : (typeof window !== 'undefined' && window.EV_LUXURY_DATA ? window.EV_LUXURY_DATA : []);
          if (type === '2w' || type === '2-Wheeler') return v2;
          if (type === '4w' || type === '4-Wheeler') return v4;
          if (type === 'lux' || type === 'luxury' || type === '4-Wheeler (Luxury)') return lux;
          return [...v2, ...v4, ...lux];
        },
        getUser(emailOrId) {
          if (!emailOrId) return null;
          const term = String(emailOrId).toLowerCase().trim();
          return (this.tables.users || []).find(u => (u.id && u.id.toLowerCase() === term) || (u.email && u.email.toLowerCase() === term)) || null;
        },
        insertUser(user) {
          if (!this.tables.users) this.tables.users = [];
          const newUser = Object.assign({ id: user.id || `usr-${Date.now()}`, email: user.email, full_name: user.name || user.full_name || 'EV Driver', created_at: new Date().toISOString() }, user);
          this.tables.users.unshift(newUser);
          this.save();
          return newUser;
        },
        upsertUser(user) {
          if (!this.tables.users) this.tables.users = [];
          const idx = this.tables.users.findIndex(u => (user.id && u.id === user.id) || (user.email && u.email && u.email.toLowerCase() === user.email.toLowerCase()));
          if (idx >= 0) {
            this.tables.users[idx] = Object.assign({}, this.tables.users[idx], user);
            this.save();
            return this.tables.users[idx];
          }
          return this.insertUser(user);
        },
        getHostByUserId(userId) {
          return (this.tables.hosts || []).find(h => h.user_id === userId || h.id === userId) || null;
        },
        insertHost(hostData) {
          if (!this.tables.hosts) this.tables.hosts = [];
          const newHost = Object.assign({ id: hostData.id || `host-${Date.now()}`, user_id: hostData.user_id || 'usr-default', display_name: hostData.display_name || 'Community Host' }, hostData);
          this.tables.hosts.unshift(newHost);
          this.save();
          return newHost;
        },
        upsertHost(hostData) {
          if (!this.tables.hosts) this.tables.hosts = [];
          const idx = this.tables.hosts.findIndex(h => (hostData.id && h.id === hostData.id) || (hostData.user_id && h.user_id === hostData.user_id));
          if (idx >= 0) {
            this.tables.hosts[idx] = Object.assign({}, this.tables.hosts[idx], hostData);
            this.save();
            return this.tables.hosts[idx];
          }
          return this.insertHost(hostData);
        },
        getChargers() { return this.tables.chargers || []; }
      };
    }
    return window.db;
  }

  async saveUserDetailsFromForm() {
    if (this.currentUser && this.currentUser.isDemo) {
      this.showToast('🔒 Demo Mode: Profile is view-only. Changes cannot be saved.');
      return false;
    }

    this.ensureDatabaseReady();

    const nameInp = document.getElementById('profileFullName');
    const emailInp = document.getElementById('profileEmail');
    const phoneInp = document.getElementById('profilePhone');
    const rolePrefInp = document.getElementById('profileRolePreference');
    const evModelInp = document.getElementById('profileEvModel');
    const battInp = document.getElementById('profileBatteryCapacity');
    const plateInp = document.getElementById('profilePlateNumber');
    const hostNameInp = document.getElementById('profileHostDisplayName');
    const hostUpiInp = document.getElementById('profileHostUpi');
    const hostBankInp = document.getElementById('profileHostBankAcc');
    const addrInp = document.getElementById('profileAddress');
    const latInp = document.getElementById('profileLat');
    const lngInp = document.getElementById('profileLng');
    const validationBox = document.getElementById('profileValidationMsg');

    const name = nameInp?.value.trim() || '';
    const email = emailInp?.value.trim().toLowerCase() || '';
    const phone = phoneInp?.value.trim() || '';
    const rolePref = rolePrefInp?.value || this.userRole || 'driver';
    const address = addrInp?.value.trim() || '';
    const evModel = evModelInp?.value.trim() || '';
    const battVal = battInp?.value.trim() || '';
    const battKwh = parseFloat(battVal);
    const plateNum = plateInp?.value.trim() || '';
    const hostName = hostNameInp?.value.trim() || '';
    const hostUpi = hostUpiInp?.value.trim() || '';
    const hostBank = hostBankInp?.value.trim() || '';

    // Clear previous error states
    document.querySelectorAll('#userProfileDetailsForm .input-error').forEach(el => el.classList.remove('input-error'));
    if (validationBox) {
      validationBox.style.display = 'none';
      validationBox.textContent = '';
    }

    // Validate ALL required fields based on the mode chosen
    const missing = [];

    if (!name) {
      missing.push('Full Name');
      nameInp?.classList.add('input-error');
    }
    if (!email || !email.includes('@')) {
      missing.push('Valid Email Address');
      emailInp?.classList.add('input-error');
    }
    if (!phone) {
      missing.push('Phone Number');
      phoneInp?.classList.add('input-error');
    }
    if (!address) {
      missing.push('Street Address / Location');
      addrInp?.classList.add('input-error');
    }

    if (rolePref === 'driver' || rolePref === 'both') {
      if (!evModel) {
        missing.push('EV Vehicle Model');
        evModelInp?.classList.add('input-error');
      }
      if (!battVal || isNaN(battKwh) || battKwh <= 0) {
        missing.push('Battery Capacity (kWh)');
        battInp?.classList.add('input-error');
      }
      if (!plateNum) {
        missing.push('Vehicle License Plate');
        plateInp?.classList.add('input-error');
      }
    }

    if (rolePref === 'host' || rolePref === 'both') {
      if (!hostName) {
        missing.push('Host Business / Display Name');
        hostNameInp?.classList.add('input-error');
      }
      if (!hostUpi || !hostUpi.includes('@')) {
        missing.push('Payout UPI ID');
        hostUpiInp?.classList.add('input-error');
      }
      if (!hostBank) {
        missing.push('Bank Account Number');
        hostBankInp?.classList.add('input-error');
      }
      // Require minimum 3 charger setup photos
      if (!this.hostUploadedPhotos || this.hostUploadedPhotos.length < 3) {
        const photoCount = this.hostUploadedPhotos ? this.hostUploadedPhotos.length : 0;
        missing.push(`Charger Photos (${photoCount}/3 minimum uploaded)`);
        const dropzone = document.getElementById('profilePhotoDropzone');
        if (dropzone) dropzone.classList.add('input-error');
      }
    }

    // Remove red error highlight as soon as user types into the field
    document.querySelectorAll('#userProfileDetailsForm .input-error').forEach(el => {
      el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
    });

    // If ANY required detail is missing, DO NOT SAVE!
    if (missing.length > 0) {
      const errorText = `⚠️ Profile Not Completed: Please fill in all required fields (${missing.join(', ')}) before continuing.`;
      if (validationBox) {
        validationBox.textContent = errorText;
        validationBox.style.display = 'block';
        validationBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      this.showToast(`⚠️ Not completed: Please fill in all details (${missing.length} missing).`);
      
      const firstError = document.querySelector('#userProfileDetailsForm .input-error');
      if (firstError) firstError.focus();
      return false; // Stays on profile screen
    }

    // ALL DETAILS FILLED -> If demo mode, update in memory only and return immediately!
    if (this.currentUser && this.currentUser.isDemo) {
      this.userRole = rolePref;
      this.currentUser.name = name || this.currentUser.name;
      this.showToast('⚡ Demo profile updated (In-Memory Simulation).');
      this.applyRoleInterface(rolePref);
      this.updateDemoModeUI();
      return true;
    }

    // Upload host charger photos to Supabase Storage bucket so public URLs are saved in Supabase
    if (this.hostUploadedPhotos && this.hostUploadedPhotos.some(p => typeof p === 'string' && p.startsWith('data:image'))) {
      if (window.db && typeof window.db.uploadPhotoListToSupabaseStorage === 'function') {
        this.showToast('☁️ Uploading charger photos to Supabase Storage...');
        try {
          this.hostUploadedPhotos = await window.db.uploadPhotoListToSupabaseStorage(this.hostUploadedPhotos, 'chargers');
          this.renderHostPhotoPreviews();
        } catch (uploadErr) {
          console.warn('⚠️ Cloud photo upload fallback:', uploadErr);
        }
      }
    }

    // ALL DETAILS FILLED -> Persist authoritatively to database
    const existingUserWithEmail = window.db.getUser(email);
    const currentUserSql = this.currentUser?.sqlId ? window.db.getUser(this.currentUser.sqlId) : null;

    let savedUser;
    let isNewRow = false;

    if (existingUserWithEmail) {
      savedUser = window.db.upsertUser({
        id: existingUserWithEmail.id,
        email: email,
        full_name: name,
        phone: phone,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : existingUserWithEmail.lat,
        lng: lngInp?.value ? parseFloat(lngInp.value) : existingUserWithEmail.lng,
        role_preference: rolePref,
        ev_model: evModel,
        ev_battery_capacity_kwh: battKwh || null,
        ev_plate_number: plateNum,
        wallet_balance: existingUserWithEmail.wallet_balance !== undefined ? existingUserWithEmail.wallet_balance : this.walletBalance,
        kyc_status: 'VERIFIED'
      });
      window.db.upsertHost({
        user_id: existingUserWithEmail.id,
        display_name: hostName || `${name} (Host)`,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : null,
        lng: lngInp?.value ? parseFloat(lngInp.value) : null,
        payout_upi_id: hostUpi,
        bank_account_no: hostBank,
        photos: this.hostUploadedPhotos || []
      });
    } else if (currentUserSql && currentUserSql.email.toLowerCase() === email.toLowerCase()) {
      savedUser = window.db.upsertUser({
        id: currentUserSql.id,
        email: email,
        full_name: name,
        phone: phone,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : currentUserSql.lat,
        lng: lngInp?.value ? parseFloat(lngInp.value) : currentUserSql.lng,
        role_preference: rolePref,
        ev_model: evModel,
        ev_battery_capacity_kwh: battKwh || null,
        ev_plate_number: plateNum,
        wallet_balance: this.walletBalance,
        kyc_status: 'VERIFIED'
      });
      window.db.upsertHost({
        user_id: currentUserSql.id,
        display_name: hostName || `${name} (Host)`,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : null,
        lng: lngInp?.value ? parseFloat(lngInp.value) : null,
        payout_upi_id: hostUpi,
        bank_account_no: hostBank,
        photos: this.hostUploadedPhotos || []
      });
    } else {
      const newUserId = `usr-${Date.now()}`;
      savedUser = window.db.insertUser({
        id: newUserId,
        email: email,
        full_name: name,
        phone: phone,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : null,
        lng: lngInp?.value ? parseFloat(lngInp.value) : null,
        role_preference: rolePref,
        ev_model: evModel,
        ev_battery_capacity_kwh: battKwh || null,
        ev_plate_number: plateNum,
        wallet_balance: 1500.00,
        kyc_status: 'VERIFIED'
      });
      window.db.insertHost({
        id: `host-${Date.now()}`,
        user_id: newUserId,
        display_name: hostName || `${name} (Host)`,
        address: address,
        lat: latInp?.value ? parseFloat(latInp.value) : null,
        lng: lngInp?.value ? parseFloat(lngInp.value) : null,
        payout_upi_id: hostUpi,
        bank_account_no: hostBank,
        photos: this.hostUploadedPhotos || []
      });
      isNewRow = true;
    }

    // Persist host charger photos and ensure community charger is registered
    if (rolePref === 'host' || rolePref === 'both') {
      if (window.db && window.db.tables) {
        // Ensure the host row in hosts table has photos updated and synced to Supabase
        let hostEntry = window.db.tables.hosts.find(h => h.user_id === savedUser.id || h.id === savedUser.id);
        if (!hostEntry) {
          hostEntry = window.db.insertHost({
            id: `host-${Date.now()}`,
            user_id: savedUser.id,
            display_name: hostName || `${name} (Host)`,
            address: address || '',
            lat: latInp?.value ? parseFloat(latInp.value) : null,
            lng: lngInp?.value ? parseFloat(lngInp.value) : null,
            payout_upi_id: hostUpi || '',
            bank_account_no: hostBank || '',
            photos: this.hostUploadedPhotos || []
          });
        } else if (this.hostUploadedPhotos && this.hostUploadedPhotos.length > 0) {
          hostEntry.photos = this.hostUploadedPhotos;
          if (window.db.supabase && !this.currentUser?.isDemo) {
            window.db.pushToSupabase('hosts', hostEntry);
          }
        }

        const validOwnerIds = new Set([savedUser.id, hostEntry.id]);
        let existingCharger = window.db.tables.chargers.find(c => validOwnerIds.has(c.host_id));

        if (!existingCharger) {
          const chargerId = `ch-host-${Date.now()}`;
          const chargerLat = latInp?.value ? parseFloat(latInp.value) : (this.userLocation.lat || 12.9716);
          const chargerLng = lngInp?.value ? parseFloat(lngInp.value) : (this.userLocation.lng || 77.5946);
          window.db.insertCharger({
            id: chargerId,
            host_id: hostEntry.id,
            title: hostName ? `${hostName} Station` : `${name}'s Community Charger`,
            address: address || 'Community Host Address',
            city: this.currentCity || 'bengaluru',
            latitude: chargerLat,
            longitude: chargerLng,
            connector_type: 'Type 2 (AC 11kW)',
            power_kw: 11.0,
            rate_per_kwh: 14.50,
            parking_type: 'Private Covered Driveway',
            access_hours: '24/7 Access',
            is_solar_powered: true,
            photos: this.hostUploadedPhotos || [],
            notes: 'Host verified community EV charger. Gated access and CCTV security.'
          });
        } else if (this.hostUploadedPhotos && this.hostUploadedPhotos.length > 0) {
          existingCharger.photos = this.hostUploadedPhotos;
          if (window.db.supabase && !this.currentUser?.isDemo) {
            window.db.pushToSupabase('chargers', existingCharger);
          }
        }

        window.db.save();
        this.chargers = this.loadChargersFromDB();
        this.saveChargersState();
        this.renderMapMarkers();
        this.renderNearbyList();
      }
    }

    // Update active session user state & role (In-Memory)
    this.userRole = rolePref;

    this.currentUser = {
      email: savedUser.email,
      name: savedUser.full_name,
      sqlId: savedUser.id,
      isDemo: false,
      loggedInAt: Date.now()
    };

    const sqlUserIdEl = document.getElementById('profileSqlUserId');
    if (sqlUserIdEl) sqlUserIdEl.textContent = savedUser.id;

    this.showToast(`✅ Profile saved successfully!`);

    // Transition smoothly into the respective app mode dashboard
    setTimeout(() => {
      this.applyRoleInterface(this.userRole);
      if (this.userRole === 'host') {
        this.switchTab('tab-host-dashboard');
      } else {
        this.switchTab('tab-explore');
      }
      this.updateWalletRoleUI();
    }, 400);

    return true;
  }

  setCity(cityKey) {
    const presets = window.CITY_PRESETS || {};
    if (!presets[cityKey]) return;
    this.currentCity = cityKey;

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
    // Locked to INR
    this.currentCurrency = 'INR';
  }

  // =========================================================================
  // 8.8. Notification Center Methods
  // =========================================================================
  showToast(message, title = 'System Update') {
    // Keep all GPS and location tracking notifications completely hidden per user preference
    const lower = (message || '').toLowerCase();
    if (lower.includes('gps') || lower.includes('geolocation') || (lower.includes('location') && (lower.includes('requesting') || lower.includes('detecting') || lower.includes('pinned') || lower.includes('locked') || lower.includes('blocked') || lower.includes('unavailable') || lower.includes('timed out') || lower.includes('tracking')))) {
      return;
    }

    // 1. Add to Notifications history
    const icon = message.includes('⚡') ? '⚡' : message.includes('📍') ? '📍' : message.includes('💳') ? '💳' : message.includes('⚠️') ? '⚠️' : message.includes('⭐') ? '⭐' : '🔔';
    const cleanMsg = message.replace(/^[⚡📍💳⚠️⭐👋✨🔄🗺️💾❌📡⏱️]+\s*/, '');
    
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: title || 'Alert',
      msg: cleanMsg || message,
      time: 'Just now',
      icon: icon,
      unread: true
    });

    // Cap at 25 notifications
    if (this.notifications.length > 25) this.notifications.pop();
    this.renderNotifications();

    // 2. Show brief unobtrusive toast
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerHTML = `<i class="fa-solid fa-bell" style="color: var(--accent-cyan-light); font-size: 0.8rem;"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  renderNotifications() {
    const listEl = document.getElementById('notificationsList');
    const badgeEl = document.getElementById('notifBadgeCount');
    const bellIcon = document.getElementById('notifBellIcon');
    const bellBtn = document.getElementById('btnOpenNotifications');

    const unreadCount = this.notifications.filter(n => n.unread).length;
    if (badgeEl) {
      if (unreadCount > 0) {
        badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badgeEl.style.display = 'flex';
        if (bellIcon) bellIcon.className = 'fa-solid fa-bell';
        // Animate bell when there are new unread notifications
        if (bellBtn && !bellBtn.classList.contains('bell-ring')) {
          bellBtn.classList.add('bell-ring');
          setTimeout(() => bellBtn.classList.remove('bell-ring'), 700);
        }
      } else {
        badgeEl.style.display = 'none';
        if (bellIcon) bellIcon.className = 'fa-regular fa-bell';
      }
    }

    if (!listEl) return;

    if (this.notifications.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 35px 20px; color: var(--text-muted);">
          <i class="fa-regular fa-bell-slash" style="font-size: 2.2rem; opacity: 0.35; margin-bottom: 10px; display: block;"></i>
          <p style="font-size: 0.82rem; font-weight: 600;">No notifications yet</p>
          <p style="font-size: 0.72rem; margin-top: 3px;">Alerts, charging updates and receipts will appear here.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.notifications.map(n => `
      <div class="notif-card-item ${n.unread ? 'unread' : ''} ${n.type === 'credit' ? 'credit-notif' : ''}">
        <div class="notif-icon-box">${n.icon || '🔔'}</div>
        <div class="notif-content-wrap">
          <div class="notif-title-row">
            <span class="notif-item-title">${n.title}</span>
            <span class="notif-item-time">${n.time || 'Just now'}</span>
          </div>
          <p class="notif-item-msg">${n.msg}</p>
          ${n.amount != null ? `<span class="notif-credit-amount">+${n.amount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  markAllNotificationsRead() {
    this.notifications.forEach(n => { n.unread = false; });
    this.renderNotifications();
  }

  clearAllNotifications() {
    this.notifications = [];
    this.renderNotifications();
  }

  // Load host-specific notifications from DB into the in-memory notification list
  loadHostNotificationsFromDB() {
    if (!window.db || !this.currentUser) return;
    const userId = this.currentUser.sqlId;
    if (!userId) return;

    // Resolve host record for this user
    const host = window.db.getHostByUserId ? window.db.getHostByUserId(userId) : null;
    const hostId = host ? host.id : null;
    if (!hostId) return;

    // Fetch host-tagged notifications from DB
    const dbNotifs = window.db.getNotifications(null, hostId);
    if (!dbNotifs || dbNotifs.length === 0) return;

    // Merge: avoid duplicate IDs already in this.notifications
    const existingIds = new Set(this.notifications.map(n => n.id));
    const newNotifs = dbNotifs
      .filter(n => !existingIds.has(n.id))
      .map(n => ({
        id: n.id,
        title: n.title,
        msg: n.msg,
        time: n.created_at ? new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Just now',
        icon: n.icon || '💰',
        unread: n.unread !== false,
        type: n.type || 'credit',
        amount: n.amount != null ? n.amount : null
      }));

    if (newNotifs.length > 0) {
      // Insert DB notifications at the front (they're already sorted newest-first from DB)
      this.notifications = [...newNotifs, ...this.notifications];
      if (this.notifications.length > 25) this.notifications = this.notifications.slice(0, 25);
      this.renderNotifications();
    }
  }

  // =========================================================================
  // 9. Event Listeners Setup
  // =========================================================================

  // =========================================================================
  // Host Earnings Withdrawal Engine
  // =========================================================================
  openHostWithdrawModal() {
    const modal = document.getElementById('hostWithdrawModal');
    const balEl = document.getElementById('withdrawAvailableBalance');
    const amtInp = document.getElementById('hostWithdrawAmount');
    if (!modal) return;

    if (balEl) balEl.textContent = this.formatCurrency(this.hostEarnings);
    if (amtInp) {
      amtInp.value = '';
      amtInp.max = String(Math.floor(this.hostEarnings));
      amtInp.placeholder = `Max ${this.formatCurrency(this.hostEarnings)}`;
    }
    modal.classList.add('active');
  }

  setWithdrawAmount(val) {
    const amtInp = document.getElementById('hostWithdrawAmount');
    if (!amtInp) return;
    if (val === 'all') {
      amtInp.value = Math.floor(this.hostEarnings);
    } else {
      amtInp.value = Math.min(val, Math.floor(this.hostEarnings));
    }
  }

  executeHostWithdrawal(e) {
    if (e) e.preventDefault();
    const amtInp = document.getElementById('hostWithdrawAmount');
    const methodSelect = document.getElementById('hostWithdrawMethod');
    const upiInp = document.getElementById('hostWithdrawUpi');
    const withdrawAmt = parseFloat(amtInp?.value || 0);

    if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
      this.showToast('⚠️ Please enter a valid withdrawal amount.');
      return;
    }
    if (withdrawAmt > this.hostEarnings) {
      this.showToast(`❌ Insufficient host earnings. Available: ${this.formatCurrency(this.hostEarnings)}`);
      return;
    }

    // Deduct from host earnings
    this.hostEarnings = parseFloat((this.hostEarnings - withdrawAmt).toFixed(2));
    this.updateHostDashboard();

    // Persist to host record in DB
    if (window.db) {
      const currentHost = (this.currentUser?.sqlId && window.db.tables.hosts)
        ? (window.db.getHostByUserId(this.currentUser.sqlId) || window.db.tables.hosts.find(h => h.id === this.currentUser.sqlId))
        : null;
      if (currentHost) {
        currentHost.total_earnings = this.hostEarnings;
      }
      const hostId = currentHost ? currentHost.id : ((this.currentUser && this.currentUser.hostId) || 'host-marcus');
      window.db.recordTransaction({
        session_id: null,
        payer_user_id: 'voltshare-escrow',
        payee_host_id: hostId,
        charger_id: null,
        subtotal_amount: withdrawAmt,
        platform_fee_amount: 0,
        grand_total_amount: withdrawAmt,
        currency: this.currentCurrency || 'INR',
        payment_method: methodSelect?.value === 'bank' ? 'Bank IMPS Transfer' : 'Instant UPI Payout'
      });
      window.db.save(true);
    }

    const modal = document.getElementById('hostWithdrawModal');
    if (modal) modal.classList.remove('active');

    const dest = methodSelect?.value === 'bank' ? 'Bank Account' : (upiInp?.value || 'UPI ID');
    this.showToast(`✅ ${this.formatCurrency(withdrawAmt)} successfully withdrawn to ${dest}!`, 'Payout Transferred');
    this.showInAppNotification(
      'Payout Transferred',
      `${this.formatCurrency(withdrawAmt)} has been sent to your ${dest}.`,
      'success'
    );
  }

  initEventListeners() {
    // Google Sign-In with Firebase
    const googleSignInBtn = document.getElementById('btnGoogleSignIn');
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', () => {
        this.signInWithGoogle();
      });
    }

    // Auth Form & Demo Logins
    const authForm = document.getElementById('authLoginForm');
    const emailInput = document.getElementById('loginEmailInput');
    const emailError = document.getElementById('loginEmailError');

    if (authForm) {
      authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawEmail = (emailInput ? emailInput.value : '').trim();
        const pwdInput = document.getElementById('loginPasswordInput');
        const pwd = pwdInput ? pwdInput.value : '';

        // Strict Email Format Validation (Requires genuine user@domain.tld format)
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(rawEmail)) {
          if (emailError) {
            emailError.textContent = '⚠️ Please enter a valid email address (e.g. yourname@gmail.com).';
            emailError.style.display = 'block';
          }
          if (emailInput) emailInput.focus();
          this.showToast('⚠️ Invalid email address format');
          return;
        }

        if (emailError) {
          emailError.style.display = 'none';
        }

        if (!pwd || pwd.length < 4) {
          this.showToast('⚠️ Please enter a valid password (minimum 4 characters).');
          return;
        }

        // If email is a Google address, advise user about 1-click Google Sign-In
        const isGoogleAccount = rawEmail.endsWith('@gmail.com') || rawEmail.endsWith('@googlemail.com');
        if (isGoogleAccount) {
          this.showToast('✨ Google Account detected! Signing in...');
        }

        const loginResult = this.loginUser(rawEmail, "EV Enthusiast", null, false, pwd);
        if (loginResult && loginResult.success === false) {
          const authErrorEl = document.getElementById('loginAuthError');
          if (authErrorEl) {
            authErrorEl.textContent = `❌ ${loginResult.error}`;
            authErrorEl.style.display = 'block';
          }
          if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
          }
          this.showToast(`❌ ${loginResult.error}`);
          return;
        }

        const authErrorEl = document.getElementById('loginAuthError');
        if (authErrorEl) authErrorEl.style.display = 'none';
      });
    }

    if (emailInput) {
      emailInput.addEventListener('input', () => {
        if (emailError) emailError.style.display = 'none';
        const authErrorEl = document.getElementById('loginAuthError');
        if (authErrorEl) authErrorEl.style.display = 'none';
      });
    }

    const pwdInputEl = document.getElementById('loginPasswordInput');
    if (pwdInputEl) {
      pwdInputEl.addEventListener('input', () => {
        const authErrorEl = document.getElementById('loginAuthError');
        if (authErrorEl) authErrorEl.style.display = 'none';
      });
    }

    const demoDriverBtn = document.getElementById('btnDemoLoginDriver');
    if (demoDriverBtn) {
      demoDriverBtn.addEventListener('click', () => {
        this.loginUser("alex.driver@voltshare.io", "Alex Vance", null, true);
        this.selectRole('driver');
      });
    }

    const demoHostBtn = document.getElementById('btnDemoLoginHost');
    if (demoHostBtn) {
      demoHostBtn.addEventListener('click', () => {
        this.loginUser("marcus.host@voltshare.io", "Marcus Vance", null, true);
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

    const profileLogoutBtn = document.getElementById('btnProfileLogout');
    if (profileLogoutBtn) {
      profileLogoutBtn.addEventListener('click', () => this.logout());
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

    // Turn-by-Turn Navigation — modal navigate button
    const navBtn = document.getElementById('btnStartNavigation');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        const charger = this.selectedCharger;
        if (!charger) {
          this.showToast('⚠️ Please tap a station on the map or list first.');
          return;
        }
        this.startTurnByTurnNavigation(charger);
      });
    }

    const endNavBtn = document.getElementById('btnEndNavigation');
    if (endNavBtn) {
      endNavBtn.addEventListener('click', () => this.stopNavigation());
    }

    // Voice Direction System Controls
    const voiceToggleBtn = document.getElementById('btnNavVoiceToggle');
    if (voiceToggleBtn) {
      voiceToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleVoiceNavigation();
      });
    }

    const voiceRepeatBtn = document.getElementById('btnNavRepeatVoice');
    if (voiceRepeatBtn) {
      voiceRepeatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.replayCurrentVoiceDirection();
      });
    }

    const guidanceTextBlock = document.getElementById('navGuidanceTextBlock');
    if (guidanceTextBlock) {
      guidanceTextBlock.addEventListener('click', () => {
        this.replayCurrentVoiceDirection();
      });
    }

    // (Charge Target Slider removed — replaced by time-slot booking)


    // Modal Close Buttons
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Host Withdraw Modal Events
    const btnHostWithdraw = document.getElementById('btnHostWithdraw');
    if (btnHostWithdraw) {
      btnHostWithdraw.addEventListener('click', () => this.openHostWithdrawModal());
    }

    const btnCloseWithdrawModal = document.getElementById('btnCloseWithdrawModal');
    if (btnCloseWithdrawModal) {
      btnCloseWithdrawModal.addEventListener('click', () => {
        const modal = document.getElementById('hostWithdrawModal');
        if (modal) modal.classList.remove('active');
      });
    }

    const hostWithdrawForm = document.getElementById('hostWithdrawForm');
    if (hostWithdrawForm) {
      hostWithdrawForm.addEventListener('submit', (e) => this.executeHostWithdrawal(e));
    }



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
      stopChargeBtn.addEventListener('click', () => this.stopChargingSession(false));
    }

    // Fast-Forward to 1-Minute Test
    const test1MinBtn = document.getElementById('btnTest1MinTimer');
    if (test1MinBtn) {
      test1MinBtn.addEventListener('click', () => {
        if (!this.chargingSession) {
          this.showToast('⚠️ No active charging session to fast-forward.');
          return;
        }
        const now = Date.now();
        this.chargingSession.startTime = now;
        this.chargingSession.endTime = now + 60 * 1000;
        this.chargingSession.durationMinutes = 1;
        this.scheduleSessionNotifications(this.chargingSession);
        this.updateChargingScreenUI();
        this.showToast('⏱️ Fast-forwarded! 1-minute test active (warning at 30s, auto-expire & invoice at 60s).');
      });
    }

    // Host Wizard "+ Add Point" Button
    const openHostWizardBtn = document.getElementById('btnOpenHostWizard');
    if (openHostWizardBtn) {
      openHostWizardBtn.addEventListener('click', () => {
        this.openNewChargerWizard();
      });
    }

    // Host Wizard Pin My Live GPS Button
    const btnHostUseGps = document.getElementById('btnHostUseGpsLocation');
    if (btnHostUseGps) {
      btnHostUseGps.addEventListener('click', async () => {
        const origHtml = btnHostUseGps.innerHTML;
        btnHostUseGps.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pinning GPS...';
        
        const setHostCoords = async (lat, lng, isGps = true) => {
          const latInp = document.getElementById('hostFormLat');
          const lngInp = document.getElementById('hostFormLng');
          const addrInp = document.getElementById('hostFormAddress');
          if (latInp) latInp.value = lat.toFixed(6);
          if (lngInp) lngInp.value = lng.toFixed(6);

          // Reverse geocode to street address silently
          const streetAddr = await this.reverseGeocode(lat, lng);
          if (addrInp && (!addrInp.value || addrInp.value.trim() === '')) {
            addrInp.value = streetAddr;
          }
          btnHostUseGps.innerHTML = origHtml;
        };

        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              await setHostCoords(pos.coords.latitude, pos.coords.longitude, true);
            },
            async (err) => {
              await setHostCoords(this.userLocation.lat, this.userLocation.lng, false);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        } else {
          await setHostCoords(this.userLocation.lat, this.userLocation.lng, false);
        }
      });
    }

    // Host Form Submit (Create or Update Charger Profile with Specific Photos)
    const hostForm = document.getElementById('hostChargerForm');
    if (hostForm) {
      hostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this._isSubmittingHostForm) return;

        const chargerId = document.getElementById('hostFormChargerId')?.value || '';
        const chargerPhotos = (Array.isArray(this.currentWizardPhotos) && this.currentWizardPhotos.length) 
          ? [...this.currentWizardPhotos] 
          : [];

        // Enforce minimum 3 photos requirement
        if (chargerPhotos.length < 3) {
          const dropzone = document.getElementById('hostWizardPhotoDropzone');
          if (dropzone) {
            dropzone.style.borderColor = '#ef4444';
            dropzone.style.background = 'rgba(239,68,68,0.06)';
            setTimeout(() => {
              dropzone.style.borderColor = '';
              dropzone.style.background = '';
            }, 3000);
          }
          const badge = document.getElementById('hostWizardPhotosCountBadge');
          if (badge) {
            badge.style.color = '#ef4444';
            badge.style.borderColor = 'rgba(239,68,68,0.5)';
            setTimeout(() => { badge.style.color = ''; badge.style.borderColor = ''; }, 3000);
          }
          this.showToast(`📷 Please upload at least 3 charger photos (${chargerPhotos.length}/3 added). Photos help drivers verify the station.`);
          return;
        }

        this._isSubmittingHostForm = true;
        setTimeout(() => { this._isSubmittingHostForm = false; }, 800);

        const data = {
          chargerId: chargerId || null,
          title: document.getElementById('hostFormTitle').value,
          hostName: document.getElementById('hostFormName').value,
          address: document.getElementById('hostFormAddress').value,
          lat: document.getElementById('hostFormLat')?.value,
          lng: document.getElementById('hostFormLng')?.value,
          connectorType: document.getElementById('hostFormConnector').value,
          powerKw: document.getElementById('hostFormPower').value,
          ratePerHour: document.getElementById('hostFormRate').value,
          ratePerKwh: document.getElementById('hostFormRate').value,
          parkingType: document.getElementById('hostFormParking').value,
          accessHours: document.getElementById('hostFormAccess').value,
          solarPowered: document.getElementById('hostFormSolar').checked,
          notes: document.getElementById('hostFormNotes').value,
          photos: chargerPhotos
        };

        if (chargerId) {
          this.updateExistingHostCharger(data);
        } else {
          this.addNewHostCharger(data);
        }

        const modal = document.getElementById('hostWizardModal');
        if (modal) modal.classList.remove('active');
        hostForm.reset();
        this.currentWizardPhotos = [];
      });
    }

    // Wallet Top Up & Payment Modal Triggers
    const topUpBtn = document.getElementById('btnTopUpWallet');
    if (topUpBtn) {
      topUpBtn.addEventListener('click', () => this.openTopUpModal(500));
    }

    const btnPaymentMethods = document.getElementById('btnPaymentMethods');
    if (btnPaymentMethods) {
      btnPaymentMethods.addEventListener('click', () => this.openTopUpModal(500));
    }

    // Top-Up Amount Chips
    document.querySelectorAll('.topup-amount-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.topup-amount-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const amount = parseFloat(chip.dataset.amount) || 500;
        this.topUpSelectedAmount = amount;
        const customInp = document.getElementById('topUpCustomAmount');
        if (customInp) customInp.value = amount;
        this.renderGpayQrCode(amount);
      });
    });

    // Custom Amount Input
    const topUpCustomInp = document.getElementById('topUpCustomAmount');
    if (topUpCustomInp) {
      topUpCustomInp.addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        this.topUpSelectedAmount = amount;
        document.querySelectorAll('.topup-amount-chip').forEach(chip => {
          if (parseFloat(chip.dataset.amount) === amount) {
            chip.classList.add('active');
          } else {
            chip.classList.remove('active');
          }
        });
        this.renderGpayQrCode(amount);
      });
    }

    // Payment Option Switcher (UPI ID vs GPay Bank QR)
    const btnSelectUpi = document.getElementById('btnSelectUpiOption');
    const btnSelectGpay = document.getElementById('btnSelectGpayOption');
    const upiSection = document.getElementById('topUpUpiSection');
    const gpaySection = document.getElementById('topUpGpaySection');
    const iconUpiCheck = document.getElementById('iconUpiCheck');
    const iconGpayCheck = document.getElementById('iconGpayCheck');

    if (btnSelectUpi && btnSelectGpay) {
      btnSelectUpi.addEventListener('click', () => {
        btnSelectUpi.classList.add('active');
        btnSelectGpay.classList.remove('active');
        if (upiSection) upiSection.style.display = 'flex';
        if (gpaySection) gpaySection.style.display = 'none';
        if (iconUpiCheck) iconUpiCheck.style.display = 'inline-block';
        if (iconGpayCheck) iconGpayCheck.style.display = 'none';
      });

      btnSelectGpay.addEventListener('click', () => {
        btnSelectGpay.classList.add('active');
        btnSelectUpi.classList.remove('active');
        if (gpaySection) gpaySection.style.display = 'flex';
        if (upiSection) upiSection.style.display = 'none';
        if (iconGpayCheck) iconGpayCheck.style.display = 'inline-block';
        if (iconUpiCheck) iconUpiCheck.style.display = 'none';
        const amt = parseFloat(document.getElementById('topUpCustomAmount')?.value) || 500;
        this.renderGpayQrCode(amt);
      });
    }

    // Quick UPI Handles
    document.querySelectorAll('.quick-handle-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const handle = tag.dataset.handle;
        const upiInp = document.getElementById('topUpUpiIdInput');
        if (upiInp) {
          const currentVal = upiInp.value.split('@')[0] || 'alex.vance';
          upiInp.value = `${currentVal}${handle}`;
        }
      });
    });

    // Copy GPay UPI ID
    const btnCopyGpay = document.getElementById('btnCopyGpayUpi');
    if (btnCopyGpay) {
      btnCopyGpay.addEventListener('click', () => {
        const upiText = document.getElementById('gpayUpiIdText')?.textContent || 'alex.vance@okhdfcbank';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(upiText).then(() => {
            btnCopyGpay.innerHTML = '<i class="fa-solid fa-check" style="color:var(--accent-emerald-light);"></i> Copied!';
            setTimeout(() => {
              btnCopyGpay.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
            }, 2000);
            this.showToast('📋 UPI ID copied to clipboard!');
          });
        }
      });
    }

    // Execute UPI Payment Request Action
    const btnExecuteUpi = document.getElementById('btnExecuteUpiPayment');
    if (btnExecuteUpi) {
      btnExecuteUpi.addEventListener('click', () => {
        const upiInp = document.getElementById('topUpUpiIdInput');
        const upiId = upiInp ? upiInp.value.trim() : '';
        if (!upiId || !upiId.includes('@')) {
          this.showToast('⚠️ Please enter a valid UPI ID (e.g. name@okhdfcbank)');
          if (upiInp) upiInp.focus();
          return;
        }

        const amount = parseFloat(document.getElementById('topUpCustomAmount')?.value) || 500;
        btnExecuteUpi.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending UPI Request...';
        btnExecuteUpi.disabled = true;

        setTimeout(() => {
          btnExecuteUpi.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send UPI Payment Request';
          btnExecuteUpi.disabled = false;
          this.executeWalletTopUp(amount, 'upi', upiId);
        }, 900);
      });
    }

    // Confirm GPay Bank QR Payment Action
    const btnConfirmGpay = document.getElementById('btnConfirmGpayPayment');
    if (btnConfirmGpay) {
      btnConfirmGpay.addEventListener('click', () => {
        const amount = parseFloat(document.getElementById('topUpCustomAmount')?.value) || 500;
        btnConfirmGpay.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying Bank Transfer...';
        btnConfirmGpay.disabled = true;

        setTimeout(() => {
          btnConfirmGpay.innerHTML = '<i class="fa-solid fa-circle-check"></i> I Have Completed Payment &rarr; Add to Balance';
          btnConfirmGpay.disabled = false;
          this.executeWalletTopUp(amount, 'gpay');
        }, 800);
      });
    }

    // =======================================================================
    // Driver Bay Reservation Listeners (+₹30/hr)
    // =======================================================================
    const btnOpenReserve = document.getElementById('btnOpenReserveModalFromDetail');
    if (btnOpenReserve) {
      btnOpenReserve.addEventListener('click', () => {
        if (this.selectedCharger) {
          this.openReservationModal(this.selectedCharger);
        }
      });
    }

    // Duration Chips
    document.querySelectorAll('#reserveDurationChips .topup-amount-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#reserveDurationChips .topup-amount-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const hours = parseInt(chip.dataset.hours) || 1;
        this.selectedReserveHours = hours;
        const totalFee = hours * 30.00;

        const durTextEl = document.getElementById('reserveModalDurationText');
        if (durTextEl) durTextEl.textContent = `${hours} Hour${hours > 1 ? 's' : ''} (${hours * 60} mins)`;

        const feeEl = document.getElementById('reserveModalTotalFee');
        if (feeEl) feeEl.textContent = this.formatCurrency(totalFee);

        const confirmBtn = document.getElementById('btnConfirmReservation');
        if (confirmBtn) confirmBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Pay ${this.formatCurrency(totalFee)} & Lock Bay`;
      });
    });

    // Confirm Reservation Button
    const btnConfirmResv = document.getElementById('btnConfirmReservation');
    if (btnConfirmResv) {
      btnConfirmResv.addEventListener('click', () => {
        this.confirmReservation();
      });
    }

    // Reservation HUD Actions
    const btnResvStart = document.getElementById('btnResvStartCharging');
    if (btnResvStart) {
      btnResvStart.addEventListener('click', () => {
        if (this.activeReservation) {
          const ch = this.chargers.find(c => c.id === this.activeReservation.chargerId);
          if (ch) this.startChargingSession(ch);
        }
      });
    }

    const btnResvCancel = document.getElementById('btnResvCancel');
    if (btnResvCancel) {
      btnResvCancel.addEventListener('click', () => {
        this.cancelActiveReservation(true);
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

    // Profile & Details Form Save Action
    const profileForm = document.getElementById('userProfileDetailsForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.currentUser && this.currentUser.isDemo) {
          this.showToast('🔒 Demo Mode: Profile is view-only. Changes cannot be saved.');
          return;
        }
        this.saveUserDetailsFromForm();
      });
      this.initVehicleDbSelector();
    }

    // Profile Pin My Current Location Button
    const btnProfilePin = document.getElementById('btnProfilePinLocation');
    if (btnProfilePin) {
      btnProfilePin.addEventListener('click', async () => {
        if (this.currentUser && this.currentUser.isDemo) {
          this.showToast('🔒 Demo Mode: Location pinning is disabled.');
          return;
        }
        const origHtml = btnProfilePin.innerHTML;
        btnProfilePin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pinning Exact GPS...';
        btnProfilePin.disabled = true;

        const applyProfileCoords = async (lat, lng, isGps = true) => {
          const latInp = document.getElementById('profileLat');
          const lngInp = document.getElementById('profileLng');
          const addrInp = document.getElementById('profileAddress');
          const gpsBadge = document.getElementById('profileGpsStatus');

          if (latInp) latInp.value = lat.toFixed(6);
          if (lngInp) lngInp.value = lng.toFixed(6);

          this.userLocation.lat = lat;
          this.userLocation.lng = lng;
          this.userLocation.name = "My Location";

          // Reverse geocode to real readable address
          const streetAddr = await this.reverseGeocode(lat, lng);
          if (addrInp) {
            addrInp.value = streetAddr;
            addrInp.classList.remove('input-error');
          }

          // Pan map and update marker
          this.updateMapUserMarker();
          if (this.mapEngine === 'leaflet' && this.map) {
            this.map.flyTo([lat, lng], 15, { duration: 1.0 });
          } else if (this.mapEngine === 'google' && this.googleMap) {
            this.googleMap.panTo({ lat, lng });
          }

          if (gpsBadge) {
            gpsBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Location Set';
            gpsBadge.style.color = 'var(--accent-emerald)';
          }

          btnProfilePin.innerHTML = origHtml;
          btnProfilePin.disabled = false;
        };

        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              await applyProfileCoords(pos.coords.latitude, pos.coords.longitude, true);
            },
            async (err) => {
              console.warn("Profile location fallback:", err.message);
              await applyProfileCoords(this.userLocation.lat, this.userLocation.lng, false);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        } else {
          await applyProfileCoords(this.userLocation.lat, this.userLocation.lng, false);
        }
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

    // Notifications Modal Controls
    const btnOpenNotifs = document.getElementById('btnOpenNotifications');
    if (btnOpenNotifs) {
      btnOpenNotifs.addEventListener('click', () => {
        const modal = document.getElementById('notificationsModal');
        if (modal) {
          // Load any persisted host notifications from DB before showing modal
          if (this.userRole === 'host') {
            this.loadHostNotificationsFromDB();
          }
          modal.classList.add('active');
          this.markAllNotificationsRead();
        }
      });
    }

    const btnClearNotifs = document.getElementById('btnClearAllNotifs');
    if (btnClearNotifs) {
      btnClearNotifs.addEventListener('click', () => {
        this.clearAllNotifications();
      });
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
          this.loginUser("marcus.host@voltshare.io", "Marcus Vance", null, true);
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
          this.loginUser("marcus.host@voltshare.io", "Marcus Vance", null, true);
          this.selectRole('host');
        }
      });
    }

    const landingDemoDriver = document.getElementById('btnLandingDemoDriver');
    if (landingDemoDriver) {
      landingDemoDriver.addEventListener('click', () => {
        this.loginUser("alex.driver@voltshare.io", "Alex Vance", null, true);
        this.selectRole('driver');
      });
    }

    const landingDemoHost = document.getElementById('btnLandingDemoHost');
    if (landingDemoHost) {
      landingDemoHost.addEventListener('click', () => {
        this.loginUser("marcus.host@voltshare.io", "Marcus Vance", null, true);
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

    // Header Wallet Pill Quick Tab Switcher
    const headerWalletPill = document.getElementById('headerWalletPill');
    if (headerWalletPill) {
      headerWalletPill.addEventListener('click', () => {
        this.switchTab('tab-wallet');
      });
    }

    // Host Dashboard Charger Live Toggle & Multi-Point Modal
    this.setupHostOnlineToggle();
    this.initHostSelectionModalEvents();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoltShareApp();
  console.log('%c⚡ VoltShare SQL Engine Active (Background)', 'color:#64748b;font-size:14px;font-weight:bold;');
  console.log('%c🛠️ Developer Database Studio: Open "db-admin.html" in your browser for the full Password-Protected DB Studio & Table Explorer.', 'color:#16a34a;font-size:12px;');
  console.log('%c💡 Direct Console Access: window.db.executeRawSQL("SELECT * FROM transactions")', 'color:#94a3b8;font-family:monospace;');
});
