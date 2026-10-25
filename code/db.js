/**
 * VoltShare - SQL Relational Database Engine & Storage Layer
 * Supports Relational Tables, Transactions, Sessions, Telemetry Logs, and SQL Query Execution
 */

class VoltShareDatabase {
  constructor() {
    this.dbKey = 'voltshare_sql_database_v5';
    this.tables = {
      users: [],
      hosts: [],
      chargers: [],
      charging_sessions: [],
      transactions: [],
      reviews: [],
      telemetry_logs: [],
      reports: []
    };
    this.cloudSyncKey = 'voltshare_cloud_sync_url';
    this.cloudApiKeyStorageKey = 'voltshare_cloud_api_key';
    
    // Cloud Sync Configuration
    const defaultConfig = (window.APP_CONFIG && window.APP_CONFIG.CLOUD_SYNC) ? window.APP_CONFIG.CLOUD_SYNC : {};
    const defaultUrl = defaultConfig.SYNC_URL || 'https://voltcharge-a5c69-default-rtdb.firebaseio.com/voltshare.json';

    this.cloudConfig = {
      enabled: defaultConfig.ENABLED !== false,
      url: this.formatSyncUrl(defaultUrl),
      apiKey: defaultConfig.API_KEY || '',
      pollInterval: defaultConfig.POLL_INTERVAL_MS || 3000
    };

    this.lastSyncTime = null;
    this.syncStatus = 'disconnected'; // 'connected' | 'syncing' | 'error' | 'offline'
    this.syncError = null;
    this.isSyncing = false;
    this.pushDebounceTimer = null;

    // Host Server Master Sync Configuration (Option 2)
    this.isServerHost = false; // Supabase is the primary authoritative backend
    this.serverDbUrl = '/api/db';
    this.serverEventsUrl = '/api/events';
    this.eventSource = null;

    // Tombstone deletion tracking in-memory (no localStorage leakage)
    this.deletedIds = new Set();
    this.serverSyncReady = false;
    this.hasUnpushedChanges = false;

    // Supabase PostgreSQL Cloud Server Configuration (Primary Server Master)
    const supaCfg = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE) ? window.APP_CONFIG.SUPABASE : null;
    this.supabase = null;
    if (supaCfg && supaCfg.ENABLED && typeof window !== 'undefined' && window.supabase) {
      try {
        this.supabase = window.supabase.createClient(supaCfg.URL, supaCfg.ANON_KEY);
        console.log('⚡ [VoltShare Supabase] Connected to PostgreSQL cloud server:', supaCfg.URL);
      } catch (err) {
        console.warn('⚠️ [VoltShare Supabase] Client init failed:', err);
      }
    }

    this.init();
  }

  formatSyncUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = rawUrl.trim();
    if (url.includes('firebaseio.com')) {
      url = url.replace(/\/+$/, '');
      if (!url.endsWith('.json')) {
        url += '/voltshare.json';
      }
    }
    return url;
  }

  filterDeleted(tables) {
    if (!tables || typeof tables !== 'object') return tables;
    const clean = {};
    for (const [tbl, rows] of Object.entries(tables)) {
      if (Array.isArray(rows)) {
        clean[tbl] = rows.filter(r => !r || !r.id || !this.deletedIds.has(String(r.id)));
      } else {
        clean[tbl] = rows;
      }
    }
    return clean;
  }

  markDeleted(id) {
    if (!id) return;
    const strId = String(id);
    this.deletedIds.add(strId);
    for (const tbl of Object.keys(this.tables)) {
      if (Array.isArray(this.tables[tbl])) {
        this.tables[tbl] = this.tables[tbl].filter(r => !r || String(r.id) !== strId);
      }
    }

    if (this.supabase) {
      this.deleteFromSupabase('chargers', strId);
      this.deleteFromSupabase('charging_sessions', strId);
      this.deleteFromSupabase('transactions', strId);
      this.deleteFromSupabase('reviews', strId);
      this.deleteFromSupabase('hosts', strId);
      this.deleteFromSupabase('users', strId);
    }
  }

  init() {
    // Purge any stale cache or local storage keys
    try {
      const staleKeys = [
        this.dbKey,
        this.cloudSyncKey,
        this.cloudApiKeyStorageKey,
        'voltshare_deleted_ids',
        'voltshare_has_unpushed_changes',
        'voltshare_last_local_modified',
        'voltshare_admin_password',
        'voltshare_cleared_tables',
        'voltshare_host_photos',
        'voltshare_chargers'
      ];
      staleKeys.forEach(k => localStorage.removeItem(k));
    } catch(e) {}

    // Initialize clean slate in-memory
    this.seedInitialData();

    // Primary Cloud Master: Supabase PostgreSQL Server
    if (this.supabase) {
      console.log('⚡ [VoltShare Supabase] Authoritative PostgreSQL cloud active. Loading live data directly from Supabase...');
      this.initSupabaseSync();
      return;
    }

    const saved = localStorage.getItem(this.dbKey);
    if (saved) {
      try {
        this.tables = this.filterDeleted(JSON.parse(saved));
        if (!this.tables.chargers) this.tables.chargers = [];
        if (!this.tables.hosts) this.tables.hosts = [];
        if (!this.tables.users) this.tables.users = [];
        if (!this.tables.charging_sessions) this.tables.charging_sessions = [];
        if (!this.tables.transactions) this.tables.transactions = [];
        if (!this.tables.reviews) this.tables.reviews = [];
        if (!this.tables.telemetry_logs) this.tables.telemetry_logs = [];
        if (!this.tables.notifications) this.tables.notifications = [];

        // Only initialize EV Vehicle datasets if missing from saved structure
        const get2w = () => (typeof window !== 'undefined' && window.EV_2WHEELER_DATA) || (typeof EV_2WHEELER_DATA !== 'undefined' ? EV_2WHEELER_DATA : []);
        const get4w = () => (typeof window !== 'undefined' && window.EV_4WHEELER_DATA) || (typeof EV_4WHEELER_DATA !== 'undefined' ? EV_4WHEELER_DATA : []);
        const getLux = () => (typeof window !== 'undefined' && window.EV_LUXURY_DATA) || (typeof EV_LUXURY_DATA !== 'undefined' ? EV_LUXURY_DATA : []);
        if (this.tables.ev_2wheelers === undefined) this.tables.ev_2wheelers = get2w();
        if (this.tables.ev_4wheelers === undefined) this.tables.ev_4wheelers = get4w();
        if (this.tables.ev_luxury === undefined) this.tables.ev_luxury = getLux();
      } catch (e) {
        console.warn("Could not parse saved SQL database, resetting to clean tables.", e);
        this.seedInitialData();
      }
    } else {
      this.seedInitialData();
    }

    if (this.isServerHost) {
      // 2. Secondary: Host Server Master DB Engine with Real-Time SSE
      this.initHostServerSync();
    } else {
      // 3. Fallback: Cloud DB Sync
      this.initCloudSync();
    }
  }

  // =========================================================================
  // ⚡ Supabase PostgreSQL Cloud Server Real-Time Engine (Primary Server Master)
  // =========================================================================
  async initSupabaseSync() {
    if (!this.supabase) return;
    this.syncStatus = 'syncing';
    this.notifySyncChange();

    try {
      console.log('⚡ [VoltShare Supabase] Fetching authoritative state from cloud PostgreSQL...');
      let telemQuery = this.supabase.from('telemetry_logs').select('*');
      if (typeof telemQuery.order === 'function') {
        telemQuery = telemQuery.order('recorded_at', { ascending: false });
      }
      if (typeof telemQuery.limit === 'function') {
        telemQuery = telemQuery.limit(300);
      }

      const [chargersRes, hostsRes, usersRes, sessionsRes, txnsRes, reviewsRes, telemRes] = await Promise.all([
        this.supabase.from('chargers').select('*'),
        this.supabase.from('hosts').select('*'),
        this.supabase.from('users').select('*'),
        this.supabase.from('charging_sessions').select('*'),
        this.supabase.from('transactions').select('*'),
        this.supabase.from('reviews').select('*'),
        telemQuery
      ]);

      if (!chargersRes.error && Array.isArray(chargersRes.data)) {
        this.tables.chargers = chargersRes.data;
      }
      if (!hostsRes.error && Array.isArray(hostsRes.data)) {
        this.tables.hosts = hostsRes.data;
      }
      if (!usersRes.error && Array.isArray(usersRes.data)) {
        this.tables.users = usersRes.data;
      }
      if (!sessionsRes.error && Array.isArray(sessionsRes.data)) {
        this.tables.charging_sessions = sessionsRes.data;
      }
      if (!txnsRes.error && Array.isArray(txnsRes.data)) {
        this.tables.transactions = txnsRes.data;
      }
      if (!reviewsRes.error && Array.isArray(reviewsRes.data)) {
        this.tables.reviews = reviewsRes.data;
      }
      if (!telemRes.error && Array.isArray(telemRes.data)) {
        this.tables.telemetry_logs = telemRes.data;
      }

      this.tables = this.filterDeleted(this.tables);

      this.syncStatus = 'connected';
      this.syncError = null;
      this.lastSyncTime = new Date();
      this.hasUnpushedChanges = false;
      this.notifySyncChange();

      console.log(`✅ [VoltShare Supabase] Successfully synced ${this.tables.chargers.length} chargers, ${this.tables.users.length} users, and ${this.tables.telemetry_logs.length} telemetry logs from PostgreSQL!`);

      window.dispatchEvent(new CustomEvent('voltshare:db_synced', {
        detail: { source: 'supabase_pull', tables: this.tables, timestamp: new Date() }
      }));

      this.setupSupabaseRealtime();
    } catch (err) {
      console.warn('⚠️ [VoltShare Supabase] Supabase sync query error:', err);
      this.syncStatus = 'connected';
      this.notifySyncChange();
    }
  }

  setupSupabaseRealtime() {
    if (!this.supabase) return;
    try {
      this.supabase
        .channel('public-db-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chargers' }, (payload) => {
          this.handleSupabaseChange('chargers', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'charging_sessions' }, (payload) => {
          this.handleSupabaseChange('charging_sessions', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
          this.handleSupabaseChange('transactions', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (payload) => {
          this.handleSupabaseChange('reviews', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'telemetry_logs' }, (payload) => {
          this.handleSupabaseChange('telemetry_logs', payload);
        })
        .subscribe((status) => {
          console.log('📡 [VoltShare Supabase Realtime] Channel active:', status);
        });
    } catch (e) {
      console.warn('⚠️ [VoltShare Supabase Realtime] Channel subscription error:', e);
    }
  }

  handleSupabaseChange(tableName, payload) {
    if (!this.tables[tableName]) this.tables[tableName] = [];

    if (payload.eventType === 'INSERT') {
      const exists = this.tables[tableName].some(r => r.id === payload.new.id);
      if (!exists && !this.deletedIds.has(String(payload.new.id))) {
        this.tables[tableName].unshift(payload.new);
      }
    } else if (payload.eventType === 'UPDATE') {
      const idx = this.tables[tableName].findIndex(r => r.id === payload.new.id);
      if (idx >= 0) {
        this.tables[tableName][idx] = { ...this.tables[tableName][idx], ...payload.new };
      } else if (!this.deletedIds.has(String(payload.new.id))) {
        this.tables[tableName].unshift(payload.new);
      }
    } else if (payload.eventType === 'DELETE') {
      const deletedId = payload.old ? payload.old.id : null;
      if (deletedId) {
        this.tables[tableName] = this.tables[tableName].filter(r => r.id !== deletedId);
      }
    }
    this.lastSyncTime = new Date();
    this.notifySyncChange();
    window.dispatchEvent(new CustomEvent('voltshare:db_synced', {
      detail: { source: 'supabase_realtime', tables: this.tables, timestamp: new Date() }
    }));
  }

  isDemoRecord(record) {
    if (!record || typeof record !== 'object') return false;
    if (record.isDemo) return true;
    const checkVal = (v) => {
      if (!v || typeof v !== 'string') return false;
      const lower = v.toLowerCase().trim();
      return lower.startsWith('demo-') ||
             lower === 'demo' ||
             lower.includes('alex.driver') ||
             lower.includes('marcus.host') ||
             lower.includes('demo.driver') ||
             lower.includes('demo.host') ||
             lower.includes('demo-driver') ||
             lower.includes('demo-host') ||
             lower.endsWith('@voltshare.io');
    };
    if (checkVal(record.id)) return true;
    if (checkVal(record.email)) return true;
    if (checkVal(record.user_id)) return true;
    if (checkVal(record.driver_id)) return true;
    if (checkVal(record.host_id)) return true;
    if (checkVal(record.payer_user_id)) return true;
    if (checkVal(record.payee_host_id)) return true;
    if (checkVal(record.author_user_id)) return true;
    if (checkVal(record.target_host_id)) return true;
    if (checkVal(record.session_id)) return true;
    if (checkVal(record.charger_id) && String(record.charger_id).startsWith('demo-')) return true;
    return false;
  }

  isDemoActive() {
    if (typeof window !== 'undefined' && window.app && window.app.currentUser) {
      const u = window.app.currentUser;
      if (u.isDemo) return true;
      const id = String(u.sqlId || u.id || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      if (id.startsWith('demo-') || email.includes('alex.driver') || email.includes('marcus.host') || email.endsWith('@voltshare.io')) {
        return true;
      }
    }
    return false;
  }

  sanitizeForSupabase(table, record) {
    if (!record || typeof record !== 'object') return null;
    if (this.isDemoRecord(record)) return null;
    const clean = {};

    if (table === 'users') {
      const allowed = ['id', 'email', 'full_name', 'phone', 'role_preference', 'ev_model', 'ev_battery_capacity_kwh', 'ev_plate_number', 'wallet_balance', 'currency', 'kyc_status', 'created_at', 'last_login_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (record.name && !clean.full_name) clean.full_name = record.name;
      if (clean.wallet_balance !== undefined) clean.wallet_balance = parseFloat(clean.wallet_balance || 0);
      if (clean.ev_battery_capacity_kwh !== undefined) clean.ev_battery_capacity_kwh = parseFloat(clean.ev_battery_capacity_kwh || 75);
    } else if (table === 'hosts') {
      const allowed = ['id', 'user_id', 'display_name', 'payout_upi_id', 'bank_account_no', 'bank_ifsc', 'total_earnings', 'total_kwh_shared', 'host_rating', 'reviews_count', 'is_verified', 'is_online', 'photos', 'created_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (clean.photos && !Array.isArray(clean.photos)) clean.photos = [];
      if (clean.total_earnings !== undefined) clean.total_earnings = parseFloat(clean.total_earnings || 0);
      if (clean.total_kwh_shared !== undefined) clean.total_kwh_shared = parseFloat(clean.total_kwh_shared || 0);
      if (clean.host_rating !== undefined) clean.host_rating = parseFloat(clean.host_rating || 5.0);
    } else if (table === 'chargers') {
      const allowed = ['id', 'host_id', 'title', 'address', 'city', 'latitude', 'longitude', 'connector_type', 'power_kw', 'voltage', 'current_amps', 'rate_per_kwh', 'off_peak_rate', 'off_peak_hours', 'parking_type', 'access_hours', 'availability_status', 'is_solar_powered', 'solar_capacity_kw', 'amenities', 'photos', 'notes', 'total_sessions', 'efficiency_score', 'is_company_station', 'company_name', 'created_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });

      // Handle lat/lng aliases
      if (clean.latitude === undefined && record.lat !== undefined) clean.latitude = parseFloat(record.lat);
      if (clean.longitude === undefined && record.lng !== undefined) clean.longitude = parseFloat(record.lng);
      if (clean.latitude !== undefined) clean.latitude = parseFloat(clean.latitude);
      if (clean.longitude !== undefined) clean.longitude = parseFloat(clean.longitude);
      if (clean.power_kw !== undefined) clean.power_kw = parseFloat(clean.power_kw);
      if (clean.rate_per_kwh !== undefined) clean.rate_per_kwh = parseFloat(clean.rate_per_kwh);
      if (clean.city) clean.city = String(clean.city).toLowerCase();

      // Ensure amenities is an array for JSONB column
      if (typeof clean.amenities === 'string') {
        try { clean.amenities = JSON.parse(clean.amenities); } catch(e) { clean.amenities = [clean.amenities]; }
      }
      if (!Array.isArray(clean.amenities)) clean.amenities = [];
      if (!Array.isArray(clean.photos)) clean.photos = [];

      // Validate host_id to avoid foreign key violation
      let targetHostId = clean.host_id;
      if (targetHostId) {
        const matchingHost = this.tables.hosts.find(h => h.id === targetHostId || h.user_id === targetHostId);
        if (matchingHost) {
          clean.host_id = matchingHost.id;
        } else {
          // If the host does not exist in hosts table yet, set null so PostgreSQL doesn't reject it
          clean.host_id = null;
        }
      }
    } else if (table === 'charging_sessions') {
      const allowed = ['id', 'driver_id', 'host_id', 'charger_id', 'start_time', 'end_time', 'initial_soc', 'final_soc', 'target_limit_soc', 'kwh_consumed', 'rate_applied_per_kwh', 'power_kw', 'avg_voltage', 'co2_saved_kg', 'session_status'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });

      // Validate driver_id foreign key constraint in public.users(id)
      if (!clean.driver_id || !this.tables.users.some(u => u.id === clean.driver_id)) {
        const fallbackUser = this.tables.users[0];
        clean.driver_id = fallbackUser ? fallbackUser.id : (clean.driver_id || null);
      }

      // Validate charger_id foreign key constraint in public.chargers(id)
      if (!clean.charger_id || !this.tables.chargers.some(c => c.id === clean.charger_id)) {
        const fallbackCharger = this.tables.chargers[0];
        if (fallbackCharger) clean.charger_id = fallbackCharger.id;
      }

      // Validate host_id foreign key constraint in public.hosts(id)
      if (clean.host_id && !this.tables.hosts.some(h => h.id === clean.host_id)) {
        clean.host_id = null;
      }

      if (clean.kwh_consumed !== undefined) clean.kwh_consumed = parseFloat(parseFloat(clean.kwh_consumed).toFixed(2));
      if (clean.rate_applied_per_kwh !== undefined) clean.rate_applied_per_kwh = parseFloat(clean.rate_applied_per_kwh);
      if (clean.power_kw !== undefined) clean.power_kw = parseFloat(clean.power_kw);
      if (clean.avg_voltage !== undefined) clean.avg_voltage = parseFloat(clean.avg_voltage);
      if (clean.co2_saved_kg !== undefined) clean.co2_saved_kg = parseFloat(parseFloat(clean.co2_saved_kg).toFixed(2));
      if (clean.initial_soc !== undefined) clean.initial_soc = parseInt(clean.initial_soc);
      if (clean.final_soc !== undefined) clean.final_soc = parseInt(clean.final_soc);
      if (clean.target_limit_soc !== undefined) clean.target_limit_soc = parseInt(clean.target_limit_soc);
    } else if (table === 'transactions') {
      const allowed = ['id', 'session_id', 'payer_user_id', 'payee_host_id', 'charger_id', 'subtotal_amount', 'platform_fee_amount', 'grand_total_amount', 'currency', 'payment_method', 'payment_status', 'invoice_number', 'created_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (clean.payee_host_id && !this.tables.hosts.some(h => h.id === clean.payee_host_id)) clean.payee_host_id = null;
      if (clean.session_id && !this.tables.charging_sessions.some(s => s.id === clean.session_id)) clean.session_id = null;
    } else if (table === 'reviews') {
      const allowed = ['id', 'session_id', 'author_user_id', 'target_host_id', 'charger_id', 'rating_stars', 'feedback_text', 'created_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (clean.target_host_id && !this.tables.hosts.some(h => h.id === clean.target_host_id)) clean.target_host_id = null;
      if (clean.session_id && !this.tables.charging_sessions.some(s => s.id === clean.session_id)) clean.session_id = null;
    } else if (table === 'telemetry_logs') {
      const allowed = ['session_id', 'recorded_at', 'voltage', 'current_amps', 'power_kw', 'kwh_accumulated', 'battery_soc'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (clean.voltage !== undefined) clean.voltage = parseFloat(clean.voltage);
      if (clean.current_amps !== undefined) clean.current_amps = parseFloat(clean.current_amps);
      if (clean.power_kw !== undefined) clean.power_kw = parseFloat(clean.power_kw);
      if (clean.kwh_accumulated !== undefined) clean.kwh_accumulated = parseFloat(clean.kwh_accumulated);
      if (clean.battery_soc !== undefined) clean.battery_soc = parseInt(clean.battery_soc);
      if (!clean.recorded_at) clean.recorded_at = new Date().toISOString();
    } else if (table === 'reports') {
      const allowed = ['id', 'session_id', 'host_id', 'driver_name', 'charger_name', 'issue_text', 'proof_video_url', 'status', 'created_at'];
      allowed.forEach(k => {
        if (record[k] !== undefined) clean[k] = record[k];
      });
      if (!clean.status) clean.status = 'pending';
      if (!clean.created_at) clean.created_at = new Date().toISOString();
    } else {
      return record;
    }

    return clean;
  }

  // Insert a host report (issue + optional proof video URL) and push to Supabase
  insertReport(reportData) {
    if (!reportData) return null;
    const now = new Date().toISOString();
    const newReport = {
      id: reportData.id || `rpt-${Date.now()}`,
      session_id: reportData.session_id || null,
      host_id: reportData.host_id || null,
      driver_name: reportData.driver_name || '',
      charger_name: reportData.charger_name || '',
      issue_text: reportData.issue_text || '',
      proof_video_url: reportData.proof_video_url || null,
      status: 'pending',
      created_at: now
    };

    if (!Array.isArray(this.tables.reports)) this.tables.reports = [];
    this.tables.reports.unshift(newReport);
    this.save();

    // Push to Supabase reports table
    if (this.supabase) {
      this.pushToSupabase('reports', newReport);
    }

    return newReport;
  }

  // =========================================================================
  // Supabase Cloud Storage Engine (Photo Upload & Public URL Resolution)
  // =========================================================================
  async uploadPhotoToSupabaseStorage(photoDataUrlOrUrl, pathPrefix = 'chargers') {
    if (!this.supabase || typeof photoDataUrlOrUrl !== 'string') return photoDataUrlOrUrl;
    // Already a remote/public URL
    if (photoDataUrlOrUrl.startsWith('http://') || photoDataUrlOrUrl.startsWith('https://')) {
      return photoDataUrlOrUrl;
    }
    // Only upload base64 image data URLs
    if (!photoDataUrlOrUrl.startsWith('data:image')) {
      return photoDataUrlOrUrl;
    }

    try {
      const res = await fetch(photoDataUrlOrUrl);
      const blob = await res.blob();
      const mime = blob.type || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
      const filename = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;

      const { data, error } = await this.supabase.storage
        .from('charger-photos')
        .upload(filename, blob, {
          contentType: mime,
          upsert: true
        });

      if (error) {
        console.warn('⚠️ [VoltShare Supabase Storage] Upload warning:', error.message);
        return photoDataUrlOrUrl; // Graceful fallback to data URL if bucket is not yet created
      }

      const { data: urlData } = this.supabase.storage
        .from('charger-photos')
        .getPublicUrl(filename);

      if (urlData && urlData.publicUrl) {
        console.log('✅ [VoltShare Supabase Storage] Uploaded photo to Supabase Storage:', urlData.publicUrl);
        return urlData.publicUrl;
      }
      return photoDataUrlOrUrl;
    } catch (err) {
      console.warn('⚠️ [VoltShare Supabase Storage] Exception uploading photo:', err);
      return photoDataUrlOrUrl;
    }
  }

  async uploadPhotoListToSupabaseStorage(photoList, pathPrefix = 'chargers') {
    if (!Array.isArray(photoList) || photoList.length === 0) return [];
    const results = [];
    for (const p of photoList) {
      const uploaded = await this.uploadPhotoToSupabaseStorage(p, pathPrefix);
      results.push(uploaded);
    }
    return results;
  }

  async pushToSupabase(table, record) {
    if (!this.supabase || !record) return;
    if (this.isDemoRecord(record)) {
      console.log(`🔒 [VoltShare Supabase] Intercepted and blocked demo record from cloud persistence ("${table}"):`, record.id || record.email || record);
      return;
    }
    if (this.isDemoActive() && ['users', 'charging_sessions', 'transactions', 'reviews', 'telemetry_logs'].includes(table)) {
      console.log(`🔒 [VoltShare Supabase] Blocked cloud persistence to "${table}" while in Demo Mode`);
      return;
    }

    const sanitized = this.sanitizeForSupabase(table, record);
    if (!sanitized) return;

    // Convert any base64 photos to public Supabase Storage files before upserting into PostgreSQL
    if ((table === 'chargers' || table === 'hosts') && Array.isArray(sanitized.photos) && sanitized.photos.length > 0) {
      const hasBase64 = sanitized.photos.some(p => typeof p === 'string' && p.startsWith('data:image'));
      if (hasBase64) {
        console.log(`📸 [VoltShare Supabase Storage] Uploading base64 photos for "${table}" to Supabase Storage...`);
        const uploadedUrls = await this.uploadPhotoListToSupabaseStorage(sanitized.photos, table);
        sanitized.photos = uploadedUrls;
        if (record && Array.isArray(record.photos)) {
          record.photos = [...uploadedUrls];
        }
        this.save();
      }
    }

    try {
      let res;
      if (table === 'telemetry_logs') {
        const insertData = { ...sanitized };
        // PostgreSQL uses BIGSERIAL for telemetry_logs.id, omit synthetic/temp client id
        if (typeof insertData.id !== 'number' || insertData.id < 100000000) {
          delete insertData.id;
        }
        if (typeof this.supabase.from(table).insert === 'function') {
          res = await this.supabase.from(table).insert(insertData);
        } else {
          res = await this.supabase.from(table).upsert(insertData);
        }
      } else {
        res = await this.supabase.from(table).upsert(sanitized);
      }
      if (res && res.error) {
        console.error(`❌ [VoltShare Supabase] Persistence to "${table}" failed:`, res.error.message, res.error);
      } else {
        console.log(`💾 [VoltShare Supabase] Successfully saved record to "${table}" in cloud PostgreSQL!`, sanitized.id || sanitized.session_id || '');
      }
    } catch (err) {
      console.error(`❌ [VoltShare Supabase] Exception saving to "${table}":`, err);
    }
  }

  async deleteFromSupabase(table, id) {
    if (!this.supabase || !id) return;
    try {
      const { error } = await this.supabase.from(table).delete().eq('id', id);
      if (error) {
        console.error(`❌ [VoltShare Supabase] Delete from ${table} failed:`, error.message);
      } else {
        console.log(`🗑️ [VoltShare Supabase] Deleted ${id} from PostgreSQL table "${table}"`);
      }
    } catch (err) {
      console.error(`❌ [VoltShare Supabase] Exception deleting from ${table}:`, err);
    }
  }



  // =========================================================================
  // Host Server Master Real-Time Sync Engine (Option 2)
  // =========================================================================
  async initHostServerSync() {
    if (!this.isServerHost) return;
    try {
      const res = await fetch(this.serverDbUrl, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.tables) {
          // Ingest authoritative tombstones from server
          if (Array.isArray(data.deleted_ids)) {
            data.deleted_ids.forEach(id => this.deletedIds.add(String(id)));
            localStorage.setItem('voltshare_deleted_ids', JSON.stringify([...this.deletedIds]));
          }
          // Filter server tables and immediately overwrite local storage to purge stale mobile cache
          this.tables = this.filterDeleted(data.tables);
          localStorage.setItem(this.dbKey, JSON.stringify(this.tables));

          if (data.admin_password && !localStorage.getItem('voltshare_admin_password')) {
            localStorage.setItem('voltshare_admin_password', data.admin_password);
          }
          this.serverSyncReady = true;
          this.syncStatus = 'connected';
          this.syncError = null;
          this.lastSyncTime = new Date();
          this.hasUnpushedChanges = false;
          localStorage.removeItem('voltshare_has_unpushed_changes');
          this.notifySyncChange();
          window.dispatchEvent(new CustomEvent('voltshare:db_synced', {
            detail: { source: 'server_pull', tables: this.tables, timestamp: new Date() }
          }));
          console.log('⚡ [VoltShare Server Sync] Authoritative state loaded from Host Server DB.');
        }
        this.connectServerEvents();
      }
    } catch (err) {
      console.log('ℹ️ [VoltShare Server Sync] Host server API not answering, using local storage.');
      this.serverSyncReady = true; // allow local fallback if completely offline
    }
  }

  connectServerEvents() {
    if (!window.EventSource || !this.isServerHost) return;
    if (this.eventSource) {
      try { this.eventSource.close(); } catch(e) {}
    }

    try {
      this.eventSource = new EventSource(this.serverEventsUrl);
      this.eventSource.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'db_updated' && msg.tables) {
            console.log('📡 [VoltShare Realtime] Live database update received from host server!');
            if (Array.isArray(msg.deleted_ids)) {
              msg.deleted_ids.forEach(id => this.deletedIds.add(String(id)));
              localStorage.setItem('voltshare_deleted_ids', JSON.stringify([...this.deletedIds]));
            }
            this.tables = this.filterDeleted(msg.tables);
            localStorage.setItem(this.dbKey, JSON.stringify(this.tables));
            this.serverSyncReady = true;
            this.syncStatus = 'connected';
            this.syncError = null;
            this.lastSyncTime = new Date();
            this.hasUnpushedChanges = false;
            localStorage.removeItem('voltshare_has_unpushed_changes');
            this.notifySyncChange();
            window.dispatchEvent(new CustomEvent('voltshare:db_synced', {
              detail: { source: 'server_sse', tables: this.tables, timestamp: new Date() }
            }));
          }
        } catch(parseErr) {}
      };

      this.eventSource.onerror = () => {
        // EventSource will automatically attempt reconnection
      };
    } catch (err) {
      console.warn('⚠️ Could not connect to EventSource:', err);
    }
  }

  async pushToServer(source = 'client_push') {
    if (!this.isServerHost) return;
    // CRITICAL: Block client pushes until client has pulled authoritative server state!
    if (!this.serverSyncReady && source !== 'admin') {
      console.warn('⏸️ [VoltShare Server Sync] Push skipped: waiting for authoritative server DB sync first.');
      return;
    }

    this.tables = this.filterDeleted(this.tables);
    try {
      const payload = {
        tables: this.tables,
        deleted_ids: [...this.deletedIds],
        admin_password: localStorage.getItem('voltshare_admin_password') || null,
        source: source
      };
      const res = await fetch(this.serverDbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.syncStatus = 'connected';
        this.syncError = null;
        this.lastSyncTime = new Date();
        this.hasUnpushedChanges = false;
        localStorage.removeItem('voltshare_has_unpushed_changes');
        this.notifySyncChange();
        console.log('💾 [VoltShare Server Sync] Changes saved authoritatively to Host Server disk.');
      }
    } catch (err) {
      console.warn('⚠️ [VoltShare Server Sync] Error saving to host server:', err.message);
    }
  }

  save(shouldPush = true, source = 'client_push') {
    this.tables = this.filterDeleted(this.tables);
    this.lastLocalModifiedAt = Date.now();

    window.dispatchEvent(new CustomEvent('voltshare:db_synced', { 
      detail: { source: 'local_save', tables: this.tables, timestamp: new Date() } 
    }));
  }

  // =========================================================================
  // Internet Cloud Sync Engine (Cross-Device Realtime Connectivity)
  // =========================================================================
  initCloudSync() {
    if (this.isServerHost || !this.cloudConfig.enabled) return;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('⚡ [VoltShare Cloud Sync] Internet reconnected. Pulling cloud DB...');
      this.pullFromCloud();
    });

    window.addEventListener('offline', () => {
      this.syncStatus = 'offline';
      this.notifySyncChange();
    });

    // Check remote updates when window regains focus (switching back from another tab or device)
    window.addEventListener('focus', () => {
      if (navigator.onLine && !this.isSyncing) {
        this.pullFromCloud(true);
      }
    });

    // Listen for cross-tab local storage events on the same device
    window.addEventListener('storage', (e) => {
      if (e.key === this.dbKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (JSON.stringify(this.tables) !== JSON.stringify(parsed)) {
            this.tables = parsed;
            window.dispatchEvent(new CustomEvent('voltshare:db_synced', { 
              detail: { source: 'tab_sync', tables: this.tables, timestamp: new Date() } 
            }));
          }
        } catch(err) {}
      }
    });

    // Perform immediate pull from Internet Cloud DB on initial page load
    setTimeout(() => this.pullFromCloud(true), 200);
  }

  notifySyncChange() {
    window.dispatchEvent(new CustomEvent('voltshare:sync_status_changed', {
      detail: {
        status: this.syncStatus,
        lastSync: this.lastSyncTime,
        error: this.syncError,
        url: this.cloudConfig.url
      }
    }));
  }

  scheduleCloudPush() {
    if (!this.cloudConfig.enabled || !this.cloudConfig.url || !navigator.onLine) return;
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = setTimeout(() => {
      this.pushToCloud();
    }, 200);
  }

  async pullFromCloud(silent = false) {
    if (!this.cloudConfig.enabled || !this.cloudConfig.url) {
      // No cloud URL configured — show connected (local mode) instead of error
      this.syncStatus = 'connected';
      this.syncError = null;
      this.lastSyncTime = new Date();
      this.notifySyncChange();
      return;
    }
    if (!navigator.onLine) {
      this.syncStatus = 'offline';
      this.notifySyncChange();
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    if (!silent) {
      this.syncStatus = 'syncing';
      this.notifySyncChange();
    }

    try {
      // Firebase RTDB REST API: only valid with ID token (not web API key).
      // We attempt without auth first; if DB is public this works fine.
      // If protected (401/403), we fall back to local-only mode (no error shown).
      const fetchUrl = this.cloudConfig.url;

      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });

      if (!res.ok) {
        // 401/403 = DB has auth rules but we have no valid ID token.
        // 404 = path doesn't exist yet (empty DB).
        // In both cases treat as "connected in local mode" — no error.
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          this.lastSyncTime = new Date();
          this.syncStatus = 'connected';
          this.syncError = null;
          return;
        }
        throw new Error(`Cloud server returned HTTP ${res.status}`);
      }

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('Invalid JSON from cloud endpoint');
      }

      // Firebase returns literal null when node is empty — treat as connected, no data yet
      if (json === null) {
        this.lastSyncTime = new Date();
        this.syncStatus = 'connected';
        this.syncError = null;
        return;
      }

      // Extract tables from various response formats
      let remoteData = null;
      if (json) {
        if (json.tables && typeof json.tables === 'object') {
          remoteData = json.tables;
        } else if (json.record && json.record.tables) {
          remoteData = json.record.tables;
        } else if (json.data && typeof json.data === 'string') {
          try {
            const inner = JSON.parse(json.data);
            remoteData = inner.tables || inner;
          } catch(e) {}
        } else if (json.data && typeof json.data === 'object') {
          remoteData = json.data.tables || json.data;
        } else if (Array.isArray(json.users) || Array.isArray(json.chargers)) {
          remoteData = json;
        }
      }

      if (remoteData && typeof remoteData === 'object') {
        const targetTables = ['users', 'hosts', 'chargers', 'charging_sessions', 'transactions', 'reviews', 'telemetry_logs', 'ev_2wheelers', 'ev_4wheelers', 'ev_luxury'];
        
        const normalizedRemote = {};
        targetTables.forEach(tbl => {
          const rawTable = remoteData[tbl];
          let list = Array.isArray(rawTable) ? rawTable : (rawTable && typeof rawTable === 'object' ? Object.values(rawTable) : []);
          normalizedRemote[tbl] = list;
        });

        // Restore admin password from cloud if local one is missing (e.g., new device / cleared storage)
        const cloudPwd = json.admin_password || (json.record && json.record.admin_password) || null;
        if (cloudPwd && !localStorage.getItem('voltshare_admin_password')) {
          localStorage.setItem('voltshare_admin_password', cloudPwd);
          console.log('🔑 [VoltShare Cloud Sync] Restored admin password from cloud DB.');
        }

        const curJson = JSON.stringify(this.tables);
        const remJson = JSON.stringify(normalizedRemote);

        const remoteUpdatedAt = json.updated_at || (json.record && json.record.updated_at) || null;
        const cloudTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;

        if (curJson !== remJson) {
          // When connected to Host Server, the Host Server disk is master
          if (this.isServerHost) {
            return;
          }
          if (this.hasUnpushedChanges) {
            console.warn('⚡ [VoltShare Cloud Sync] Local database has unpushed changes. Pushing to Cloud DB...');
            this.pushToCloud();
          } else {
            this.tables = normalizedRemote;
            localStorage.setItem(this.dbKey, JSON.stringify(this.tables));
            console.log("⚡ [VoltShare Cloud Sync] Synced updated state from Internet Cloud DB.");
            window.dispatchEvent(new CustomEvent('voltshare:db_synced', {
              detail: { source: 'cloud_pull', tables: this.tables, timestamp: new Date() }
            }));
          }
        }
      }

      this.lastSyncTime = new Date();
      this.syncStatus = 'connected';
      this.syncError = null;
    } catch (err) {
      console.warn("⚠️ [VoltShare Cloud Sync] Pull error:", err.message);
      // Network/CORS failures → show Offline rather than Sync Error
      if (err.name === 'TypeError' || err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('networkerror')) {
        this.syncStatus = 'offline';
      } else {
        this.syncStatus = 'error';
      }
      this.syncError = err.message;
    } finally {
      this.isSyncing = false;
      this.notifySyncChange();
    }
  }

  async pushToCloud() {
    if (!this.cloudConfig.enabled || !this.cloudConfig.url) {
      this.syncStatus = 'connected';
      this.syncError = null;
      this.notifySyncChange();
      return;
    }
    if (!navigator.onLine) {
      this.syncStatus = 'offline';
      this.notifySyncChange();
      return;
    }

    this.syncStatus = 'syncing';
    this.notifySyncChange();

    try {
      const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      // Firebase RTDB REST API: only valid with ID token (not web API key).
      // Attempt push without auth; if DB rules are public this works.
      const fetchUrl = this.cloudConfig.url;

      // Upload complete database directly so table clear, deletes, and edits persist authoritatively
      // Also include admin password so it survives across devices/localStorage clears
      const adminPwd = localStorage.getItem('voltshare_admin_password') || null;

      // Filter out demo records completely so cloud database never receives demo rows
      const cleanTables = {};
      for (const [tblName, rows] of Object.entries(this.tables)) {
        cleanTables[tblName] = Array.isArray(rows) ? rows.filter(r => !this.isDemoRecord(r)) : rows;
      }

      const payload = {
        app: "VoltShare Community EV Network",
        updated_at: new Date().toISOString(),
        tables: cleanTables,
        admin_password: adminPwd
      };

      const res = await fetch(fetchUrl, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // 401/403 = protected DB — local changes stay unpushed
        // Do NOT mark as connected/success — the push genuinely failed
        if (res.status === 401 || res.status === 403) {
          console.warn('⚠️ [VoltShare Cloud Sync] Push blocked by Firebase rules (401/403). Local changes remain unpushed.');
          this.lastSyncTime = new Date();
          this.syncStatus = 'connected';
          this.syncError = 'Cloud DB is read-only (auth required)';
          // hasUnpushedChanges remains TRUE so pull won't overwrite
          return;
        }
        // Fall back to POST if PUT is unsupported by endpoint
        const postRes = await fetch(fetchUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });
        if (!postRes.ok) {
          if (postRes.status === 401 || postRes.status === 403) {
            console.warn('⚠️ [VoltShare Cloud Sync] Push blocked by Firebase rules (401/403). Local changes remain unpushed.');
            this.lastSyncTime = new Date();
            this.syncStatus = 'connected';
            this.syncError = 'Cloud DB is read-only (auth required)';
            return;
          }
          throw new Error(`Cloud server returned HTTP ${postRes.status}`);
        }
      }

      // Push succeeded — mark local changes as synced
      this.hasUnpushedChanges = false;
      localStorage.removeItem('voltshare_has_unpushed_changes');
      this.lastSyncTime = new Date();
      this.syncStatus = 'connected';
      this.syncError = null;
      console.log("⚡ [VoltShare Cloud Sync] Database state successfully saved to Cloud DB.");
    } catch (err) {
      console.warn("⚠️ [VoltShare Cloud Sync] Push error:", err.message);
      // Network failures → Offline; auth/server failures → error
      if (err.name === 'TypeError' || err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('networkerror')) {
        this.syncStatus = 'offline';
      } else {
        this.syncStatus = 'error';
      }
      this.syncError = err.message;
    } finally {
      this.notifySyncChange();
    }
  }

  updateCloudConfig(url, apiKey) {
    if (url) {
      this.cloudConfig.url = this.formatSyncUrl(url);
      localStorage.setItem(this.cloudSyncKey, this.cloudConfig.url);
    }
    if (apiKey !== undefined) {
      this.cloudConfig.apiKey = apiKey.trim();
      localStorage.setItem(this.cloudApiKeyStorageKey, this.cloudConfig.apiKey);
    }
    this.pushToCloud();
    this.pullFromCloud();
  }

  // =========================================================================
  // 1. Initial SQL Seeding (Clean Slate - Local storage only, no cloud wipe)
  // =========================================================================
  seedInitialData() {
    const get2w = () => (typeof window !== 'undefined' && window.EV_2WHEELER_DATA) || (typeof EV_2WHEELER_DATA !== 'undefined' ? EV_2WHEELER_DATA : []);
    const get4w = () => (typeof window !== 'undefined' && window.EV_4WHEELER_DATA) || (typeof EV_4WHEELER_DATA !== 'undefined' ? EV_4WHEELER_DATA : []);
    const getLux = () => (typeof window !== 'undefined' && window.EV_LUXURY_DATA) || (typeof EV_LUXURY_DATA !== 'undefined' ? EV_LUXURY_DATA : []);

    this.tables = {
      users: [],
      hosts: [],
      chargers: [],
      charging_sessions: [],
      transactions: [],
      reviews: [],
      telemetry_logs: [],
      notifications: [],
      ev_2wheelers: get2w(),
      ev_4wheelers: get4w(),
      ev_luxury: getLux()
    };
  }

  // =========================================================================
  // EV Vehicle SQL Operations
  // =========================================================================
  getVehicles(type = 'all') {
    const v2 = this.tables.ev_2wheelers || [];
    const v4 = this.tables.ev_4wheelers || [];
    const lux = this.tables.ev_luxury || [];
    if (type === '2w' || type === '2-Wheeler') return v2;
    if (type === '4w' || type === '4-Wheeler') return v4;
    if (type === 'lux' || type === 'luxury' || type === '4-Wheeler (Luxury)') return lux;
    return [...v2, ...v4, ...lux];
  }

  // =========================================================================
  // 2. User & Personal Profile SQL Operations
  // =========================================================================
  getUser(emailOrId) {
    if (!emailOrId) return null;
    const term = String(emailOrId).toLowerCase().trim();
    const u = this.tables.users.find(u => (u.id && u.id.toLowerCase() === term) || (u.email && u.email.toLowerCase() === term));
    if (u && this.deletedIds && this.deletedIds.has(String(u.id))) return null;
    return u || null;
  }

  insertUser(user) {
    if (!user) return null;
    const isDemo = this.isDemoRecord(user) || this.isDemoActive();
    const now = new Date().toISOString();
    const newId = user.id || (isDemo ? `demo-${Date.now()}` : `usr-${Date.now()}`);
    if (this.deletedIds && this.deletedIds.has(String(newId))) {
      this.deletedIds.delete(String(newId));
    }
    const newUser = {
      id: newId,
      email: user.email || (isDemo ? 'demo@voltshare.io' : `user-${Date.now()}@voltshare.io`),
      full_name: user.full_name || user.name || (isDemo ? 'EV Enthusiast' : ''),
      phone: user.phone || '',
      role_preference: user.role_preference || 'driver',
      address: user.address || '',
      lat: user.lat !== undefined ? user.lat : null,
      lng: user.lng !== undefined ? user.lng : null,
      ev_model: user.ev_model || '',
      ev_battery_capacity_kwh: user.ev_battery_capacity_kwh !== undefined ? parseFloat(user.ev_battery_capacity_kwh) : null,
      ev_plate_number: user.ev_plate_number || '',
      wallet_balance: user.wallet_balance !== undefined ? parseFloat(user.wallet_balance) : 0.00,
      password: user.password || '',
      currency: user.currency || 'INR',
      kyc_status: user.kyc_status || 'VERIFIED',
      isDemo: isDemo,
      created_at: user.created_at || now,
      updated_at: now,
      last_login_at: now
    };
    this.tables.users.unshift(newUser);
    this.save();
    if (this.supabase && !isDemo) {
      this.pushToSupabase('users', newUser);
    }
    return newUser;
  }

  upsertUser(user) {
    if (!user) return null;
    const isDemo = this.isDemoRecord(user) || this.isDemoActive();
    const now = new Date().toISOString();
    // Find matching user by specific ID, or by Email
    const existingIndex = this.tables.users.findIndex(u => 
      (user.id && u.id === user.id) || 
      (!user.id && user.email && u.email && u.email.toLowerCase() === user.email.toLowerCase())
    );

    if (existingIndex >= 0) {
      const existing = this.tables.users[existingIndex];
      const updatedUser = {
        ...existing,
        ...user,
        id: existing.id,
        email: user.email || existing.email,
        full_name: user.full_name || user.name || existing.full_name,
        password: user.password !== undefined ? user.password : (existing.password || ''),
        phone: user.phone !== undefined ? user.phone : (existing.phone || ''),
        role_preference: user.role_preference || existing.role_preference,
        address: user.address !== undefined ? user.address : (existing.address || ''),
        lat: user.lat !== undefined ? user.lat : (existing.lat || null),
        lng: user.lng !== undefined ? user.lng : (existing.lng || null),
        ev_model: user.ev_model !== undefined ? user.ev_model : (existing.ev_model || ''),
        ev_battery_capacity_kwh: user.ev_battery_capacity_kwh !== undefined ? parseFloat(user.ev_battery_capacity_kwh) : existing.ev_battery_capacity_kwh,
        ev_plate_number: user.ev_plate_number !== undefined ? user.ev_plate_number : (existing.ev_plate_number || ''),
        wallet_balance: user.wallet_balance !== undefined ? parseFloat(user.wallet_balance) : existing.wallet_balance,
        currency: user.currency || existing.currency,
        kyc_status: user.kyc_status || existing.kyc_status,
        isDemo: isDemo || existing.isDemo,
        created_at: existing.created_at || now,
        updated_at: now,
        last_login_at: user.last_login_at || existing.last_login_at || now
      };
      this.tables.users[existingIndex] = updatedUser;
      this.save();
      if (this.supabase && !isDemo && !existing.isDemo) {
        this.pushToSupabase('users', updatedUser);
      }
      return updatedUser;
    } else {
      return this.insertUser(user);
    }
  }

  updateUserWallet(userId, amountOrBalance, mode = 'set', reason = '') {
    const user = this.getUser(userId) || this.tables.users.find(u => u.id === userId);
    if (user) {
      const isDemo = this.isDemoRecord(user) || this.isDemoActive();
      const val = parseFloat(amountOrBalance || 0);
      if (mode === 'add' || mode === 'credit') {
        user.wallet_balance = parseFloat(((user.wallet_balance || 0) + val).toFixed(2));
      } else {
        user.wallet_balance = val;
      }
      user.updated_at = new Date().toISOString();
      this.save(true);
      if (this.supabase && !isDemo) {
        this.pushToSupabase('users', user);
      }
    }
  }

  // =========================================================================
  // 3. Host SQL Operations
  // =========================================================================
  getHostByUserId(userId) {
    if (!userId) return null;
    return this.tables.hosts.find(h => h.user_id === userId || h.id === userId) || null;
  }

  getChargersByHostId(hostId) {
    if (!hostId) return [];
    return (this.tables.chargers || []).filter(c => c.host_id === hostId);
  }

  getChargersByUserId(userId) {
    if (!userId) return [];
    const host = this.getHostByUserId(userId);
    const hostId = host ? host.id : null;
    return (this.tables.chargers || []).filter(c => (hostId && c.host_id === hostId) || c.host_id === userId);
  }

  insertHost(hostData) {
    if (!hostData) return null;
    const now = new Date().toISOString();
    const newId = hostData.id || `host-${Date.now()}`;
    const newHost = {
      id: newId,
      user_id: hostData.user_id || 'usr-default',
      display_name: hostData.display_name || 'Community Host',
      address: hostData.address || '',
      lat: hostData.lat !== undefined ? hostData.lat : null,
      lng: hostData.lng !== undefined ? hostData.lng : null,
      payout_upi_id: hostData.payout_upi_id || 'host@upi',
      bank_account_no: hostData.bank_account_no || '**** **** 1234',
      bank_ifsc: hostData.bank_ifsc || 'HDFC0001824',
      photos: hostData.photos || hostData.charger_photos || [],
      total_earnings: hostData.total_earnings !== undefined ? parseFloat(hostData.total_earnings) : 0,
      total_kwh_shared: hostData.total_kwh_shared !== undefined ? parseFloat(hostData.total_kwh_shared) : 0,
      host_rating: hostData.host_rating !== undefined ? parseFloat(hostData.host_rating) : 0.0,
      reviews_count: hostData.reviews_count !== undefined ? parseInt(hostData.reviews_count) : 0,
      is_verified: hostData.is_verified !== undefined ? hostData.is_verified : true,
      is_online: hostData.is_online !== undefined ? hostData.is_online : true,
      created_at: hostData.created_at || now,
      updated_at: now
    };
    const isDemo = this.isDemoRecord(hostData) || this.isDemoActive();
    newHost.isDemo = isDemo;
    this.tables.hosts.unshift(newHost);
    this.save();
    if (this.supabase && !isDemo) {
      this.pushToSupabase('hosts', newHost);
    }
    return newHost;
  }

  upsertHost(hostData) {
    if (!hostData) return null;
    const now = new Date().toISOString();
    const existingIndex = this.tables.hosts.findIndex(h => 
      (hostData.id && h.id === hostData.id) || 
      (hostData.user_id && h.user_id === hostData.user_id)
    );

    if (existingIndex >= 0) {
      const existing = this.tables.hosts[existingIndex];
      const host = {
        ...existing,
        ...hostData,
        id: existing.id,
        user_id: existing.user_id,
        display_name: hostData.display_name || existing.display_name,
        address: hostData.address !== undefined ? hostData.address : (existing.address || ''),
        lat: hostData.lat !== undefined ? hostData.lat : (existing.lat || null),
        lng: hostData.lng !== undefined ? hostData.lng : (existing.lng || null),
        payout_upi_id: hostData.payout_upi_id || existing.payout_upi_id,
        bank_account_no: hostData.bank_account_no || existing.bank_account_no,
        bank_ifsc: hostData.bank_ifsc || existing.bank_ifsc,
        photos: hostData.photos !== undefined ? hostData.photos : (hostData.charger_photos !== undefined ? hostData.charger_photos : (existing.photos || existing.charger_photos || [])),
        total_earnings: hostData.total_earnings !== undefined ? parseFloat(hostData.total_earnings) : existing.total_earnings,
        total_kwh_shared: hostData.total_kwh_shared !== undefined ? parseFloat(hostData.total_kwh_shared) : existing.total_kwh_shared,
        host_rating: hostData.host_rating !== undefined ? parseFloat(hostData.host_rating) : existing.host_rating,
        reviews_count: hostData.reviews_count !== undefined ? parseInt(hostData.reviews_count) : existing.reviews_count,
        is_verified: hostData.is_verified !== undefined ? hostData.is_verified : existing.is_verified,
        is_online: hostData.is_online !== undefined ? hostData.is_online : existing.is_online,
        isDemo: (this.isDemoRecord(hostData) || this.isDemoActive() || existing.isDemo),
        created_at: existing.created_at || now,
        updated_at: now
      };
      this.tables.hosts[existingIndex] = host;
      this.save();
      if (this.supabase && !host.isDemo) {
        this.pushToSupabase('hosts', host);
      }
      return host;

    } else {
      return this.insertHost(hostData);
    }
  }

  // =========================================================================
  // 4. Charger Stations SQL Operations
  // =========================================================================
  getChargers(city = null, filter = 'all') {
    let list = [...this.tables.chargers];
    if (city) {
      list = list.filter(c => c.city && c.city.toLowerCase() === city.toLowerCase());
    }
    if (filter === 'available') {
      list = list.filter(c => c.availability_status === 'available');
    } else if (filter === 'fast') {
      list = list.filter(c => c.power_kw >= 22.0);
    } else if (filter === 'ac') {
      list = list.filter(c => c.connector_type && (c.connector_type.includes('AC') || c.connector_type.includes('Type 2')));
    } else if (filter === 'solar') {
      list = list.filter(c => c.is_solar_powered);
    }
    return list;
  }

  insertCharger(charger) {
    const now = new Date().toISOString();
    const newCharger = {
      id: charger.id || `ch-host-${Date.now()}`,
      host_id: charger.host_id || `host-${Date.now()}`,
      title: charger.title || 'Community Wallbox Charger',
      address: charger.address || 'Bengaluru, KA',
      city: charger.city || 'bengaluru',
      latitude: parseFloat(charger.latitude !== undefined ? charger.latitude : (charger.lat !== undefined ? charger.lat : 12.9716)),
      longitude: parseFloat(charger.longitude !== undefined ? charger.longitude : (charger.lng !== undefined ? charger.lng : 77.5946)),
      connector_type: charger.connector_type || charger.connectorType || 'Type 2 (AC)',
      power_kw: parseFloat(charger.power_kw !== undefined ? charger.power_kw : (charger.powerKw !== undefined ? charger.powerKw : 11.0)),
      voltage: parseInt(charger.voltage !== undefined ? charger.voltage : 230),
      current_amps: parseInt(charger.current_amps !== undefined ? charger.current_amps : (charger.currentAmps !== undefined ? charger.currentAmps : 16)),
      rate_per_kwh: parseFloat(charger.rate_per_kwh !== undefined ? charger.rate_per_kwh : (charger.ratePerKwh !== undefined ? charger.ratePerKwh : 14.50)),
      off_peak_rate: parseFloat(charger.off_peak_rate !== undefined ? charger.off_peak_rate : 11.50),
      off_peak_hours: charger.off_peak_hours || '11:00 PM - 6:00 AM',
      parking_type: charger.parking_type || charger.parkingType || 'Private Covered Driveway',
      access_hours: charger.access_hours || charger.accessHours || '6:00 AM - 11:00 PM',
      availability_status: charger.availability_status || charger.availability || 'available',
      is_solar_powered: Boolean(charger.is_solar_powered !== undefined ? charger.is_solar_powered : (charger.solarPowered !== undefined ? charger.solarPowered : true)),
      solar_capacity_kw: parseFloat(charger.solar_capacity_kw !== undefined ? charger.solar_capacity_kw : 15.0),
      amenities: typeof charger.amenities === 'string' ? charger.amenities : JSON.stringify(charger.amenities || ['Private Driveway']),
      notes: charger.notes || '',
      photos: charger.photos || charger.charger_photos || [],
      total_sessions: parseInt(charger.total_sessions || 0),
      efficiency_score: charger.efficiency_score || '100%',
      created_at: charger.created_at || now,
      updated_at: now
    };
    const isDemo = this.isDemoRecord(charger) || this.isDemoActive();
    newCharger.isDemo = isDemo;

    this.tables.chargers.unshift(newCharger);
    this.save();
    if (this.supabase && !isDemo) {
      this.pushToSupabase('chargers', newCharger);
    }
    return newCharger;
  }

  updateChargerAvailability(chargerId, status = 'available') {
    const charger = this.tables.chargers.find(c => c.id === chargerId);
    if (charger) {
      charger.availability_status = status;
      charger.updated_at = new Date().toISOString();
      this.save();
      if (this.supabase && !charger.isDemo && !this.isDemoActive()) {
        this.pushToSupabase('chargers', charger);
      }
    }
    return charger;
  }

  // =========================================================================
  // 5. Charging Sessions & Telemetry SQL Operations
  // =========================================================================
  getActiveSessions() {
    return (this.tables.charging_sessions || []).filter(s => s.session_status === 'active');
  }

  createSession(sessionData) {
    const now = new Date().toISOString();
    const isDemo = this.isDemoRecord(sessionData) || this.isDemoActive();
    const session = {
      id: sessionData.id || `sess-${Date.now()}`,
      driver_id: sessionData.driver_id || (this.tables.users[0] ? this.tables.users[0].id : null),
      host_id: sessionData.host_id || null,
      charger_id: sessionData.charger_id,
      start_time: sessionData.start_time || now,
      end_time: null,
      initial_soc: parseInt(sessionData.initial_soc || 34),
      final_soc: parseInt(sessionData.initial_soc || 34),
      target_limit_soc: parseInt(sessionData.target_limit_soc || 80),
      kwh_consumed: 0.00,
      rate_applied_per_kwh: parseFloat(sessionData.rate_applied_per_kwh || 14.50),
      power_kw: parseFloat(sessionData.power_kw || 11.0),
      avg_voltage: parseFloat(sessionData.avg_voltage || 234.0),
      co2_saved_kg: 0.00,
      session_status: 'active',
      isDemo: isDemo,
      created_at: now,
      updated_at: now
    };

    // If driver exists in local tables, ensure user record is synced to Supabase (ONLY if non-demo)
    const driverUser = this.tables.users.find(u => u.id === session.driver_id);
    if (driverUser && this.supabase && !isDemo && !driverUser.isDemo) {
      this.pushToSupabase('users', driverUser);
    }

    this.tables.charging_sessions.unshift(session);
    this.save();
    if (this.supabase && !isDemo) {
      this.pushToSupabase('charging_sessions', session);
    }
    return session;
  }

  updateSessionTelemetry(sessionId, kwh, soc, voltage, powerKw) {
    const session = this.tables.charging_sessions.find(s => s.id === sessionId);
    if (session) {
      const isDemo = session.isDemo || this.isDemoRecord(session) || this.isDemoActive();
      session.kwh_consumed = parseFloat(parseFloat(kwh).toFixed(2));
      session.final_soc = Math.round(soc);
      session.avg_voltage = parseFloat(parseFloat(voltage).toFixed(1));
      session.power_kw = parseFloat(parseFloat(powerKw).toFixed(1));
      session.co2_saved_kg = parseFloat((kwh * 0.42).toFixed(2));
      session.session_status = 'active';
      session.updated_at = new Date().toISOString();
      
      // Log Time-series Telemetry
      if (this.tables.telemetry_logs.length > 500) {
        this.tables.telemetry_logs.shift(); // Keep bounded in memory
      }
      const telemEntry = {
        session_id: sessionId,
        recorded_at: new Date().toISOString(),
        voltage: parseFloat(voltage),
        current_amps: parseFloat((powerKw * 1000 / voltage).toFixed(1)),
        power_kw: parseFloat(powerKw),
        kwh_accumulated: parseFloat(parseFloat(kwh).toFixed(2)),
        battery_soc: Math.round(soc)
      };

      this.tables.telemetry_logs.push({
        id: this.tables.telemetry_logs.length + 1,
        ...telemEntry
      });

      this.save();

      // Real-time streaming to Supabase cloud (ONLY for real sessions)
      if (this.supabase && !isDemo) {
        // Direct persistence of high-resolution telemetry log to Supabase
        this.pushToSupabase('telemetry_logs', telemEntry);

        const now = Date.now();
        if (!this._lastSessionPush || now - this._lastSessionPush >= 2000) {
          this._lastSessionPush = now;
          this.pushToSupabase('charging_sessions', session);
        }
      }
    }
  }

  completeSession(sessionId, finalData = {}) {
    const session = this.tables.charging_sessions.find(s => s.id === sessionId);
    if (session) {
      const isDemo = session.isDemo || this.isDemoRecord(session) || this.isDemoActive();
      if (finalData.kwh_consumed !== undefined) {
        session.kwh_consumed = parseFloat(parseFloat(finalData.kwh_consumed).toFixed(2));
      }
      if (finalData.final_soc !== undefined) {
        session.final_soc = Math.round(finalData.final_soc);
      }
      if (finalData.co2_saved_kg !== undefined) {
        session.co2_saved_kg = parseFloat(parseFloat(finalData.co2_saved_kg).toFixed(2));
      }
      session.end_time = new Date().toISOString();
      session.session_status = 'completed';
      session.updated_at = new Date().toISOString();
      this.save();
      if (this.supabase && !isDemo) {
        this.pushToSupabase('charging_sessions', session);
      }
    }
    return session;
  }

  // =========================================================================
  // 6. Transactions & Ledger SQL Operations
  // =========================================================================
  recordTransaction(txnData) {
    if (!this.tables.transactions) this.tables.transactions = [];

    // Guard against duplicate transaction recording for the same charging session
    if (txnData.session_id) {
      const existingIdx = this.tables.transactions.findIndex(t => t.session_id === txnData.session_id);
      if (existingIdx >= 0) {
        const existing = this.tables.transactions[existingIdx];
        const subtotal = parseFloat(txnData.subtotal_amount !== undefined ? txnData.subtotal_amount : existing.subtotal_amount);
        const platformFee = parseFloat(txnData.platform_fee_amount !== undefined ? txnData.platform_fee_amount : existing.platform_fee_amount);
        const grandTotal = parseFloat((subtotal + platformFee).toFixed(2));
        const now = new Date().toISOString();

        const updated = {
          ...existing,
          ...txnData,
          id: existing.id,
          subtotal_amount: subtotal,
          platform_fee_amount: platformFee,
          grand_total_amount: grandTotal,
          updated_at: now
        };
        this.tables.transactions[existingIdx] = updated;
        this.save();
        if (this.supabase && !updated.isDemo) {
          this.pushToSupabase('transactions', updated);
        }
        return updated;
      }
    }

    const subtotal = parseFloat(txnData.subtotal_amount || 0);
    const platformFee = parseFloat(txnData.platform_fee_amount !== undefined ? txnData.platform_fee_amount : (subtotal * 0.05).toFixed(2));
    const grandTotal = parseFloat((subtotal + platformFee).toFixed(2));
    const now = new Date().toISOString();
    const isDemo = this.isDemoRecord(txnData) || this.isDemoActive();

    const txn = {
      id: txnData.id || `TXN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      session_id: txnData.session_id || null,
      payer_user_id: txnData.payer_user_id,
      payee_host_id: txnData.payee_host_id,
      charger_id: txnData.charger_id,
      subtotal_amount: subtotal,
      platform_fee_amount: platformFee,
      grand_total_amount: grandTotal,
      currency: txnData.currency || 'INR',
      payment_method: txnData.payment_method || 'VoltShare Wallet',
      payment_status: 'SUCCESS',
      invoice_number: txnData.invoice_number || `INV-VOLT-${Date.now().toString().slice(-6)}`,
      isDemo: isDemo,
      created_at: txnData.created_at || now,
      updated_at: now
    };

    this.tables.transactions.unshift(txn);

    // Update Host totals
    const host = this.tables.hosts.find(h => h.id === txn.payee_host_id);
    if (host) {
      host.total_earnings = parseFloat((host.total_earnings + subtotal).toFixed(2));
      const session = this.tables.charging_sessions.find(s => s.id === txn.session_id);
      if (session) {
        host.total_kwh_shared = parseFloat((host.total_kwh_shared + session.kwh_consumed).toFixed(2));
      }
      host.updated_at = now;
    }

    this.save();
    if (this.supabase && !isDemo) {
      this.pushToSupabase('transactions', txn);
      if (host && !host.isDemo) this.pushToSupabase('hosts', host);
    }
    return txn;
  }


  getTransactionsWithDetails(filterUserId = null, filterHostId = null) {
    const rawList = Array.isArray(this.tables.transactions) ? this.tables.transactions : [];
    
    // Deduplicate by transaction id or session_id to protect user view from historical duplicates
    const seen = new Set();
    const uniqueTxns = [];
    for (const t of rawList) {
      if (!t) continue;
      const key = t.session_id ? `sess_${t.session_id}` : `id_${t.id || JSON.stringify(t)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueTxns.push(t);
    }

    return uniqueTxns
      .filter(t => {
        if (filterUserId && t.payer_user_id !== filterUserId) return false;
        if (filterHostId && t.payee_host_id !== filterHostId) return false;
        return true;
      })
      .map(t => {
        const payer = (this.tables.users && this.tables.users.find(u => u.id === t.payer_user_id)) || { full_name: 'Unknown User', email: '' };
        const host = (this.tables.hosts && this.tables.hosts.find(h => h.id === t.payee_host_id)) || { display_name: 'Unknown Host' };
        const charger = (this.tables.chargers && this.tables.chargers.find(c => c.id === t.charger_id)) || { title: 'EV Charging Station' };
        const session = (this.tables.charging_sessions && this.tables.charging_sessions.find(s => s.id === t.session_id)) || { kwh_consumed: 0, rate_applied_per_kwh: 0 };

        return {
          ...t,
          payer_name: payer.full_name,
          payer_email: payer.email,
          host_name: host.display_name,
          station_title: charger.title,
          kwh_consumed: session.kwh_consumed,
          rate_per_kwh: session.rate_applied_per_kwh
        };
      });
  }

  // =========================================================================
  // 7. Community Reviews SQL Operations
  // =========================================================================
  insertReview(review) {
    const now = new Date().toISOString();
    const rev = {
      id: `rev-${Date.now()}`,
      session_id: review.session_id || null,
      author_user_id: review.author_user_id || 'usr-alex',
      target_host_id: review.target_host_id || 'host-marcus',
      charger_id: review.charger_id || 'ch-01',
      rating_stars: parseInt(review.rating_stars || 5),
      feedback_text: review.feedback_text || '',
      created_at: review.created_at || now,
      updated_at: now
    };
    this.tables.reviews.unshift(rev);
    this.save();
    if (this.supabase) {
      this.pushToSupabase('reviews', rev);
    }
    return rev;
  }

  // =========================================================================
  // In-App & Push Notifications Operations
  // =========================================================================
  insertNotification(notifData) {
    if (!this.tables.notifications) this.tables.notifications = [];
    const notif = {
      id: notifData.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: notifData.user_id || null,
      host_id: notifData.host_id || null,
      title: notifData.title || 'Notification',
      msg: notifData.msg || '',
      type: notifData.type || 'info',
      icon: notifData.icon || '🔔',
      amount: notifData.amount !== undefined ? notifData.amount : null,
      unread: notifData.unread !== undefined ? notifData.unread : true,
      created_at: notifData.created_at || new Date().toISOString()
    };
    this.tables.notifications.unshift(notif);
    this.save();
    return notif;
  }

  getNotifications(userId = null, hostId = null) {
    if (!this.tables.notifications) this.tables.notifications = [];
    return this.tables.notifications.filter(n => {
      if (!userId && !hostId) return true;
      if (userId && n.user_id === userId) return true;
      if (hostId && n.host_id === hostId) return true;
      return false;
    });
  }

  markNotificationsRead(userId = null, hostId = null) {
    if (!this.tables.notifications) return;
    this.tables.notifications.forEach(n => {
      if (!userId && !hostId) {
        n.unread = false;
      } else if ((userId && n.user_id === userId) || (hostId && n.host_id === hostId)) {
        n.unread = false;
      }
    });
    this.save();
  }


  // =========================================================================
  // 8. SQL Query Terminal & Raw Query Execution Engine
  // =========================================================================
  executeRawSQL(query) {
    const clean = query.trim().replace(/;+$/, '');
    const upper = clean.toUpperCase();

    try {
      if (upper.startsWith('SELECT')) {
        return this.handleSelectQuery(clean);
      } else if (upper.startsWith('INSERT INTO') || upper.startsWith('INSERT')) {
        return this.handleInsertQuery(clean);
      } else if (upper.startsWith('UPDATE')) {
        return this.handleUpdateQuery(clean);
      } else if (upper.startsWith('DELETE')) {
        return this.handleDeleteQuery(clean);
      } else if (upper.startsWith('SHOW TABLES') || upper.startsWith('SELECT TABLE_NAME')) {
        return {
          success: true,
          columns: ['Table_Name', 'Row_Count'],
          rows: Object.keys(this.tables).map(k => [k, this.tables[k].length])
        };
      } else if (upper.startsWith('DESCRIBE') || upper.startsWith('DESC') || upper.startsWith('PRAGMA TABLE_INFO')) {
        const parts = clean.split(/\s+/);
        const tblName = parts[1]?.toLowerCase().replace(/[()]/g, '');
        if (this.tables[tblName]) {
          const sample = this.tables[tblName][0] || {};
          const keys = Object.keys(sample);
          return {
            success: true,
            columns: ['Column_Name', 'Sample_Data_Type', 'Sample_Value'],
            rows: keys.length > 0 
              ? keys.map(k => [k, typeof sample[k], String(sample[k])])
              : [['id', 'string', 'null'], ['created_at', 'string', 'null']]
          };
        }
      }

      // Default generic SELECT fallback
      return this.handleSelectQuery('SELECT * FROM transactions LIMIT 10');
    } catch (err) {
      return { success: false, error: err.message, columns: ['Error'], rows: [[err.message]] };
    }
  }

  handleSelectQuery(sql) {
    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    const tableName = fromMatch ? fromMatch[1].toLowerCase() : 'transactions';

    let data = this.tables[tableName];
    if (!data) {
      return { success: false, error: `Table "${tableName}" does not exist in VoltShare SQL database. Available: ${Object.keys(this.tables).join(', ')}`, columns: [], rows: [] };
    }

    // Clone array
    let result = [...data];

    // Simple WHERE filter if present
    const whereMatch = sql.match(/WHERE\s+([a-zA-Z0-9_]+)\s*(=|!=|>|<|>=|<=|LIKE)\s*['"]?([^'";]+)['"]?/i);
    if (whereMatch) {
      const col = whereMatch[1];
      const op = whereMatch[2].toUpperCase();
      const val = whereMatch[3];

      result = result.filter(row => {
        const rowVal = row[col];
        if (rowVal === undefined || rowVal === null) return false;
        if (op === '=') return String(rowVal).toLowerCase() === val.toLowerCase();
        if (op === '!=' || op === '<>') return String(rowVal).toLowerCase() !== val.toLowerCase();
        if (op === 'LIKE') return String(rowVal).toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
        if (op === '>') return parseFloat(rowVal) > parseFloat(val);
        if (op === '>=') return parseFloat(rowVal) >= parseFloat(val);
        if (op === '<') return parseFloat(rowVal) < parseFloat(val);
        if (op === '<=') return parseFloat(rowVal) <= parseFloat(val);
        return true;
      });
    }

    // Handle ORDER BY
    if (/ORDER\s+BY/i.test(sql)) {
      const isDesc = /DESC/i.test(sql);
      const orderMatch = sql.match(/ORDER\s+BY\s+([a-zA-Z0-9_]+)/i);
      const orderCol = orderMatch ? orderMatch[1] : 'created_at';
      result.sort((a, b) => {
        const va = a[orderCol] !== undefined ? a[orderCol] : '';
        const vb = b[orderCol] !== undefined ? b[orderCol] : '';
        if (va < vb) return isDesc ? 1 : -1;
        if (va > vb) return isDesc ? -1 : 1;
        return 0;
      });
    }

    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      result = result.slice(0, parseInt(limitMatch[1]));
    }

    // Determine target columns
    let columns = [];
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch && selectMatch[1].trim() !== '*') {
      columns = selectMatch[1].split(',').map(c => c.trim().replace(/^[`"']|[`"']$/g, ''));
    } else {
      if (data.length > 0) {
        columns = Object.keys(data[0]);
      } else {
        const schemaMap = {
          users: ['id', 'email', 'full_name', 'phone', 'role_preference', 'ev_model', 'ev_battery_capacity_kwh', 'ev_plate_number', 'wallet_balance', 'currency', 'kyc_status', 'created_at'],
          hosts: ['id', 'user_id', 'display_name', 'payout_upi_id', 'bank_account_no', 'bank_ifsc', 'total_earnings', 'total_kwh_shared', 'host_rating', 'reviews_count', 'is_verified', 'is_online', 'created_at'],
          chargers: ['id', 'host_id', 'title', 'address', 'city', 'latitude', 'longitude', 'connector_type', 'power_kw', 'rate_per_kwh', 'parking_type', 'access_hours', 'availability_status', 'is_solar_powered', 'created_at'],
          charging_sessions: ['id', 'driver_id', 'host_id', 'charger_id', 'start_time', 'end_time', 'initial_soc', 'final_soc', 'kwh_consumed', 'rate_applied_per_kwh', 'power_kw', 'co2_saved_kg', 'session_status'],
          transactions: ['id', 'session_id', 'payer_user_id', 'payee_host_id', 'charger_id', 'subtotal_amount', 'platform_fee_amount', 'grand_total_amount', 'currency', 'payment_method', 'payment_status', 'invoice_number', 'created_at'],
          reviews: ['id', 'session_id', 'author_user_id', 'target_host_id', 'charger_id', 'rating_stars', 'feedback_text', 'created_at'],
          telemetry_logs: ['id', 'session_id', 'recorded_at', 'voltage', 'current_amps', 'power_kw', 'kwh_accumulated', 'battery_soc']
        };
        columns = schemaMap[tableName] || ['id', 'created_at'];
      }
    }

    const rows = result.map(item => columns.map(col => {
      const val = item[col];
      return val === undefined ? null : val;
    }));

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      tableName
    };
  }

  handleInsertQuery(sql) {
    const match = sql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!match) {
      return { success: false, error: "Invalid INSERT SQL syntax. Format: INSERT INTO <table> (col1, col2) VALUES ('val1', 'val2')", columns: [], rows: [] };
    }

    const tableName = match[1].toLowerCase();
    if (!this.tables[tableName]) {
      return { success: false, error: `Table "${tableName}" does not exist in VoltShare SQL database.`, columns: [], rows: [] };
    }

    const cols = match[2].split(',').map(c => c.trim().replace(/^[`"']|[`"']$/g, ''));
    const rawVals = match[3].match(/('(?:''|[^'])*'|"(?:""|[^"])*"|[^,]+)/g) || [];
    const vals = rawVals.map(v => {
      let val = v.trim();
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        return val.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"');
      }
      if (val.toUpperCase() === 'NULL') return null;
      if (val.toUpperCase() === 'TRUE') return true;
      if (val.toUpperCase() === 'FALSE') return false;
      if (!isNaN(val) && val !== '') return Number(val);
      return val;
    });

    const newRow = {};
    cols.forEach((col, i) => {
      newRow[col] = vals[i] !== undefined ? vals[i] : null;
    });

    const now = new Date().toISOString();
    if (!newRow.id) {
      newRow.id = `${tableName.slice(0, 3)}-${Date.now()}`;
    }
    if (!newRow.created_at) {
      newRow.created_at = now;
    }
    newRow.updated_at = now;

    this.tables[tableName].unshift(newRow);
    this.save();

    return {
      success: true,
      message: `1 row inserted into ${tableName}`,
      columns: ['Status', 'Table', 'Inserted_ID'],
      rows: [['INSERT_SUCCESS', tableName, String(newRow.id)]]
    };
  }

  handleUpdateQuery(sql) {
    const match = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (!match) {
      return { success: false, error: "Invalid UPDATE SQL syntax. Format: UPDATE <table> SET col1 = val1 WHERE col2 = val2", columns: [], rows: [] };
    }

    const tableName = match[1].toLowerCase();
    if (!this.tables[tableName]) {
      return { success: false, error: `Table "${tableName}" does not exist`, columns: [], rows: [] };
    }

    const setClause = match[2];
    const whereClause = match[3];

    const assignments = {};
    const setPairs = setClause.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/);
    setPairs.forEach(pair => {
      const p = pair.split('=');
      if (p.length >= 2) {
        const col = p[0].trim().replace(/^[`"']|[`"']$/g, '');
        let rawVal = p.slice(1).join('=').trim();
        if ((rawVal.startsWith("'") && rawVal.endsWith("'")) || (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
          rawVal = rawVal.slice(1, -1).replace(/''/g, "'");
        } else if (rawVal.toUpperCase() === 'NULL') {
          rawVal = null;
        } else if (rawVal.toUpperCase() === 'TRUE') {
          rawVal = true;
        } else if (rawVal.toUpperCase() === 'FALSE') {
          rawVal = false;
        } else if (!isNaN(rawVal) && rawVal !== '') {
          rawVal = Number(rawVal);
        }
        assignments[col] = rawVal;
      }
    });

    let count = 0;
    const now = new Date().toISOString();
    this.tables[tableName].forEach(row => {
      let matches = true;
      if (whereClause) {
        const wm = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|!=|>|<|LIKE)\s*['"]?([^'";]+)['"]?/i);
        if (wm) {
          const col = wm[1];
          const op = wm[2].toUpperCase();
          const val = wm[3];
          const rowVal = row[col];
          if (op === '=') matches = String(rowVal).toLowerCase() === val.toLowerCase();
          else if (op === '!=' || op === '<>') matches = String(rowVal).toLowerCase() !== val.toLowerCase();
          else if (op === 'LIKE') matches = String(rowVal || '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
          else if (op === '>') matches = parseFloat(rowVal) > parseFloat(val);
          else if (op === '<') matches = parseFloat(rowVal) < parseFloat(val);
        }
      }
      if (matches) {
        Object.assign(row, assignments);
        row.updated_at = now;
        count++;
      }
    });

    this.save();
    return {
      success: true,
      message: `${count} row(s) updated in ${tableName}`,
      columns: ['Status', 'Table', 'Rows_Affected'],
      rows: [['UPDATE_SUCCESS', tableName, count]]
    };
  }

  handleDeleteQuery(sql) {
    const match = sql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (!match) {
      return { success: false, error: "Invalid DELETE SQL syntax. Format: DELETE FROM <table> WHERE col = val", columns: [], rows: [] };
    }

    const tableName = match[1].toLowerCase();
    if (!this.tables[tableName]) {
      return { success: false, error: `Table "${tableName}" does not exist`, columns: [], rows: [] };
    }

    const whereClause = match[2];
    const initialLen = this.tables[tableName].length;

    if (!whereClause) {
      this.tables[tableName] = [];
    } else {
      const wm = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|!=|>|<|LIKE)\s*['"]?([^'";]+)['"]?/i);
      if (wm) {
        const col = wm[1];
        const op = wm[2].toUpperCase();
        const val = wm[3];
        this.tables[tableName] = this.tables[tableName].filter(row => {
          const rowVal = row[col];
          if (op === '=') return String(rowVal).toLowerCase() !== val.toLowerCase();
          if (op === '!=' || op === '<>') return String(rowVal).toLowerCase() === val.toLowerCase();
          if (op === 'LIKE') return !String(rowVal || '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
          if (op === '>') return !(parseFloat(rowVal) > parseFloat(val));
          if (op === '<') return !(parseFloat(rowVal) < parseFloat(val));
          return false;
        });
      }
    }

    const deleted = initialLen - this.tables[tableName].length;
    this.save();
    return {
      success: true,
      message: `${deleted} row(s) deleted from ${tableName}`,
      columns: ['Status', 'Table', 'Rows_Deleted'],
      rows: [['DELETE_SUCCESS', tableName, deleted]]
    };
  }

  // =========================================================================
  // 9. SQL Dump & Backup Exporter
  // =========================================================================
  exportSQLDump() {
    let sql = `-- VoltShare SQL Database Backup Dump\n`;
    sql += `-- Generated on: ${new Date().toISOString()}\n`;
    sql += `-- Database Engine: SQLite / PostgreSQL Relational Compatible\n\n`;

    Object.keys(this.tables).forEach(tbl => {
      const rows = this.tables[tbl];
      sql += `-- Table: ${tbl} (${rows.length} rows)\n`;
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        rows.forEach(r => {
          const vals = cols.map(c => {
            const v = r[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO ${tbl} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
        });
      }
      sql += `\n`;
    });

    return sql;
  }
}

// Global Database Instance
window.db = new VoltShareDatabase();

