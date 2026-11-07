/**
 * VoltShare — Fabian Tjoe-A-On Style High-Performance Interactive EV Engine
 * Fluid Energy Wave Field, Magnetic Spotlight Cursor & EV Calculator
 */

document.addEventListener('DOMContentLoaded', () => {
  initMagneticCursor();
  initFluidEnergyMeshCanvas();
  initElectricClickRipples();
  initCard3DTilt();
  initLiveTelemetry();
  initVehicleCalculator();
  initStationExplorer();
  initHowItWorksTabs();
  initFaqAccordion();
});

// =========================================================================
// 0. Ultra-Bright Luminous Electric Click Ripple Shockwave & Sparks System
// =========================================================================
function initElectricClickRipples() {
  window.addEventListener('pointerdown', (e) => {
    // 1. Dual Shockwave Rings
    for (let r = 0; r < 2; r++) {
      const ripple = document.createElement('div');
      ripple.className = r === 0 ? 'super-electric-ripple' : 'super-electric-ripple secondary';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 700 + r * 150);
    }

    // 2. Kinetic Glowing Electric Spark Particles (8-Ray Burst)
    const sparkCount = 8;
    for (let i = 0; i < sparkCount; i++) {
      const spark = document.createElement('div');
      spark.className = 'electric-click-spark';
      spark.style.left = `${e.clientX}px`;
      spark.style.top = `${e.clientY}px`;

      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const velocity = 35 + Math.random() * 45;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;

      spark.style.setProperty('--tx', `${tx}px`);
      spark.style.setProperty('--ty', `${ty}px`);
      document.body.appendChild(spark);

      setTimeout(() => {
        spark.remove();
      }, 550);
    }
  });
}

// =========================================================================
// 1. Magnetic Spotlight Follower & Dot Cursor
// =========================================================================
function initMagneticCursor() {
  const follower = document.getElementById('cursorFollower');
  const dot = document.getElementById('cursorDot');
  if (!follower || !dot) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let followerX = mouseX;
  let followerY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = `${mouseX}px`;
    dot.style.top = `${mouseY}px`;
  });

  function renderCursor() {
    // Smooth lerp movement
    followerX += (mouseX - followerX) * 0.12;
    followerY += (mouseY - followerY) * 0.12;
    follower.style.left = `${followerX}px`;
    follower.style.top = `${followerY}px`;

    requestAnimationFrame(renderCursor);
  }

  renderCursor();

  // Enlarge cursor when hovering interactive elements
  const hoverables = document.querySelectorAll('button, a, select, input, .feature-card, .telemetry-card, .station-card');
  hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => {
      dot.style.width = '18px';
      dot.style.height = '18px';
      dot.style.backgroundColor = 'var(--plasma-cyan)';
    });
    el.addEventListener('mouseleave', () => {
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.backgroundColor = 'var(--electric-green)';
    });
  });
}

// =========================================================================
// 2. Fluid Energy Wave Mesh Canvas (Fabian Tjoe-A-On Inspired)
// =========================================================================
function initFluidEnergyMeshCanvas() {
  const canvas = document.getElementById('energyMeshCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  let mouse = { x: width / 2, y: height / 2, vx: 0, vy: 0, lastX: width / 2, lastY: height / 2 };

  window.addEventListener('mousemove', (e) => {
    mouse.vx = e.clientX - mouse.lastX;
    mouse.vy = e.clientY - mouse.lastY;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Energy wave grid points
  const cols = 28;
  const rows = 18;
  let points = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push({
        baseX: (c / (cols - 1)) * width,
        baseY: (r / (rows - 1)) * height,
        x: (c / (cols - 1)) * width,
        y: (r / (rows - 1)) * height,
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.02
      });
    }
  }

  let time = 0;

  function draw() {
    ctx.clearRect(0, 0, width, height);
    time += 0.015;

    // Update point positions with sinusoidal electric waves + mouse displacement
    for (let i = 0; i < points.length; i++) {
      let p = points[i];
      p.phase += p.speed;

      // Natural harmonic electric undulating wave
      let waveX = Math.sin(time + p.baseY * 0.005) * 12;
      let waveY = Math.cos(time + p.baseX * 0.005) * 12;

      // Mouse interactive wave distortion
      let dx = mouse.x - p.baseX;
      let dy = mouse.y - p.baseY;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let maxDist = 200;

      if (dist < maxDist) {
        let force = (1 - dist / maxDist) * 35;
        let angle = Math.atan2(dy, dx);
        p.vx -= Math.cos(angle) * force * 0.05;
        p.vy -= Math.sin(angle) * force * 0.05;
      }

      p.vx *= 0.92;
      p.vy *= 0.92;

      p.x = p.baseX + waveX + p.vx;
      p.y = p.baseY + waveY + p.vy;
    }

    // Draw connecting electric cyan/green grid lines
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let idx = r * cols + c;
        let p = points[idx];

        // Horizontal line
        if (c < cols - 1) {
          let pRight = points[idx + 1];
          let distFromMouse = Math.hypot((p.x + pRight.x) / 2 - mouse.x, (p.y + pRight.y) / 2 - mouse.y);
          let alpha = distFromMouse < 260 ? 0.35 * (1 - distFromMouse / 260) + 0.08 : 0.06;

          ctx.beginPath();
          ctx.strokeStyle = distFromMouse < 220 ? 'rgba(0, 255, 135, ' + alpha + ')' : 'rgba(96, 239, 255, ' + alpha + ')';
          ctx.lineWidth = distFromMouse < 180 ? 1.4 : 0.8;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(pRight.x, pRight.y);
          ctx.stroke();
        }

        // Vertical line
        if (r < rows - 1) {
          let pDown = points[idx + cols];
          let distFromMouse = Math.hypot((p.x + pDown.x) / 2 - mouse.x, (p.y + pDown.y) / 2 - mouse.y);
          let alpha = distFromMouse < 260 ? 0.35 * (1 - distFromMouse / 260) + 0.08 : 0.06;

          ctx.beginPath();
          ctx.strokeStyle = distFromMouse < 220 ? 'rgba(0, 255, 135, ' + alpha + ')' : 'rgba(6, 182, 212, ' + alpha + ')';
          ctx.lineWidth = distFromMouse < 180 ? 1.4 : 0.8;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(pDown.x, pDown.y);
          ctx.stroke();
        }

        // Glowing node points near mouse
        let d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (d < 180) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5 * (1 - d / 180), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 255, 135, ' + (0.8 * (1 - d / 180)) + ')';
          ctx.fill();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
}

// =========================================================================
// 3. Card 3D Perspective Tilt on Mouse Hover
// =========================================================================
function initCard3DTilt() {
  const cards = document.querySelectorAll('.feature-card, .telemetry-card, .calc-container, .station-card');

  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  });
}

// =========================================================================
// 4. Live Telemetry Metrics
// =========================================================================
function initLiveTelemetry() {
  const stationCountEl = document.getElementById('telemetryStations');
  const hostsCountEl = document.getElementById('telemetryHosts');
  const powerEl = document.getElementById('telemetryPower');
  const carbonEl = document.getElementById('telemetryCarbon');

  const commercialStations = (typeof window !== 'undefined' && window.COMPANY_CHARGING_STATIONS) ? window.COMPANY_CHARGING_STATIONS.length : 12;
  const dbChargers = (window.db && window.db.tables && window.db.tables.chargers) ? window.db.tables.chargers.length : 0;
  const totalStations = commercialStations + dbChargers;

  const dbHosts = (window.db && window.db.tables && window.db.tables.hosts) ? window.db.tables.hosts.length : 0;
  const totalHosts = dbHosts > 0 ? dbHosts : 84;

  if (stationCountEl) stationCountEl.textContent = `${totalStations}+`;
  if (hostsCountEl) hostsCountEl.textContent = `${totalHosts}+`;
  if (powerEl) powerEl.textContent = '14.8 MW';
  if (carbonEl) carbonEl.textContent = '52.4 Tons';
}

// =========================================================================
// 5. Interactive EV Battery & Cost Calculator
// =========================================================================
function initVehicleCalculator() {
  const typeSelect = document.getElementById('calcVehicleType');
  const companySelect = document.getElementById('calcCompany');
  const modelSelect = document.getElementById('calcModel');
  const socSlider = document.getElementById('calcSocSlider');
  const socLabel = document.getElementById('calcSocLabel');

  if (!typeSelect || !companySelect || !modelSelect) return;

  const allVehicles = (typeof window !== 'undefined' && window.ALL_EV_VEHICLES) ? window.ALL_EV_VEHICLES : [];

  function getFilteredVehicles() {
    const selectedType = typeSelect.value;
    if (selectedType === 'all') return allVehicles;
    return allVehicles.filter(v => v.vehicle_type === selectedType);
  }

  function populateCompanies() {
    const list = getFilteredVehicles();
    const companies = [...new Set(list.map(v => v.company))].sort();
    
    companySelect.innerHTML = companies.map(c => `<option value="${c}">${c}</option>`).join('');
    populateModels();
  }

  function populateModels() {
    const selectedCompany = companySelect.value;
    const list = getFilteredVehicles().filter(v => v.company === selectedCompany);

    modelSelect.innerHTML = list.map(v => `
      <option value="${v.id}" data-capacity="${v.battery_capacity_kwh}" data-model="${v.model}" data-variant="${v.variant}">
        ${v.model} (${v.variant}) — ${v.battery_capacity_kwh} kWh
      </option>
    `).join('');

    calculateCost();
  }

  function calculateCost() {
    const opt = modelSelect.selectedOptions[0];
    if (!opt) return;

    const capacityKwh = parseFloat(opt.dataset.capacity) || 30.0;
    const modelName = opt.dataset.model || 'EV';
    const variant = opt.dataset.variant || '';
    const chargePercentage = parseFloat(socSlider.value) || 60;

    if (socLabel) socLabel.textContent = `${chargePercentage}% Charge (e.g. 20% → ${20 + chargePercentage}%)`;

    const energyRequired = (capacityKwh * (chargePercentage / 100)).toFixed(1);
    const communityRate = 14.50;
    const commercialRate = 20.50;

    const communityCost = Math.round(energyRequired * communityRate);
    const commercialCost = Math.round(energyRequired * commercialRate);
    const userSavings = commercialCost - communityCost;

    const hoursAc = (energyRequired / 7.4).toFixed(1);
    const minsDc = Math.round((energyRequired / 50.0) * 60);

    const nameEl = document.getElementById('calcPreviewName');
    const specEl = document.getElementById('calcPreviewSpec');
    const energyEl = document.getElementById('calcEnergyRequired');
    const costEl = document.getElementById('calcTotalCost');
    const savingsEl = document.getElementById('calcSavings');
    const timeEl = document.getElementById('calcTimeEstimate');

    if (nameEl) nameEl.textContent = `${companySelect.value} ${modelName}`;
    if (specEl) specEl.textContent = `${variant} • ${capacityKwh} kWh Total Battery Pack`;
    if (energyEl) energyEl.textContent = `${energyRequired} kWh`;
    if (costEl) costEl.textContent = `₹${communityCost}`;
    if (savingsEl) savingsEl.textContent = `₹${userSavings} Saved vs Public Fast Hub`;
    if (timeEl) timeEl.textContent = `~${minsDc} min (DC Fast) / ${hoursAc} hr (AC Wallbox)`;
  }

  typeSelect.addEventListener('change', populateCompanies);
  companySelect.addEventListener('change', populateModels);
  modelSelect.addEventListener('change', calculateCost);
  if (socSlider) socSlider.addEventListener('input', calculateCost);

  populateCompanies();
}

// =========================================================================
// 6. Interactive Charging Station Preview Explorer
// =========================================================================
function initStationExplorer() {
  const container = document.getElementById('stationsGrid');
  const filterBtns = document.querySelectorAll('.filter-btn');
  if (!container) return;

  const stations = (typeof window !== 'undefined' && window.COMPANY_CHARGING_STATIONS) ? window.COMPANY_CHARGING_STATIONS : [];

  function renderStations(filter = 'all') {
    let list = stations;
    if (filter === 'bengaluru') list = stations.filter(s => s.city === 'bengaluru');
    else if (filter === 'mumbai') list = stations.filter(s => s.city === 'mumbai');
    else if (filter === 'delhi') list = stations.filter(s => s.city === 'delhi');
    else if (filter === 'fast') list = stations.filter(s => s.powerKw >= 60);
    else if (filter === 'solar') list = stations.filter(s => s.solarPowered);

    container.innerHTML = list.map(s => `
      <div class="station-card">
        <div>
          <div class="station-header">
            <div>
              <div class="station-title">${s.title}</div>
              <div class="station-city"><i class="fa-solid fa-location-dot text-emerald"></i> ${s.address}</div>
            </div>
            <span class="station-badge ${s.powerKw >= 60 ? 'badge-fast' : 'badge-solar'}">
              ${s.powerKw >= 60 ? '⚡ Ultra DC' : '☀️ Solar Hub'}
            </span>
          </div>

          <div class="station-specs">
            <span><i class="fa-solid fa-bolt text-amber"></i> ${s.powerKw} kW</span>
            <span><i class="fa-solid fa-plug text-cyan"></i> ${s.connectorType.split(' ')[0]}</span>
            <span><i class="fa-solid fa-star text-amber"></i> ${s.hostRating} (${s.hostReviewsCount})</span>
          </div>
        </div>

        <div class="station-footer">
          <div class="station-price">₹${s.ratePerKwhINR.toFixed(2)} <small>/ kWh</small></div>
          <button class="btn-outline-emerald btn-view-station" data-id="${s.id}">
            View Station <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-view-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const station = stations.find(s => s.id === id);
        if (station) openStationModal(station);
      });
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStations(btn.dataset.filter);
    });
  });

  renderStations('all');
}

// Station Modal Handler
function openStationModal(s) {
  let modalBackdrop = document.getElementById('stationModalBackdrop');
  if (!modalBackdrop) {
    modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'stationModalBackdrop';
    modalBackdrop.className = 'station-modal-backdrop';
    document.body.appendChild(modalBackdrop);
  }

  modalBackdrop.innerHTML = `
    <div class="station-modal">
      <button class="modal-close-btn" id="closeStationModal"><i class="fa-solid fa-xmark"></i></button>
      
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
        <span class="station-badge badge-fast"><i class="fa-solid fa-bolt"></i> ${s.powerKw} kW Fast DC</span>
        <span class="station-badge badge-solar"><i class="fa-solid fa-clock"></i> ${s.accessHours}</span>
      </div>

      <h3 style="font-size: 1.5rem; margin-bottom: 6px;">${s.title}</h3>
      <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 22px;">
        <i class="fa-solid fa-location-dot text-emerald"></i> ${s.address}
      </p>

      <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; margin-bottom: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
        <div>
          <span style="font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase;">Connector Type</span>
          <div style="font-weight: 700; color: #ffffff;">${s.connectorType}</div>
        </div>
        <div>
          <span style="font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase;">Tariff / kWh</span>
          <div style="font-weight: 800; color: var(--electric-green);">₹${s.ratePerKwhINR.toFixed(2)} / kWh</div>
        </div>
      </div>

      <div style="margin-bottom: 26px;">
        <div style="font-size: 0.88rem; font-weight: 700; margin-bottom: 10px;">Station Amenities:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${(s.amenities || []).map(a => `<span class="feature-pill"><i class="fa-solid fa-check text-emerald"></i> ${a}</span>`).join('')}
        </div>
      </div>

      <div style="display: flex; gap: 14px;">
        <a href="app.html" class="btn-primary" style="flex: 1; text-align: center;">
          <i class="fa-solid fa-location-arrow"></i> Navigate in App
        </a>
      </div>
    </div>
  `;

  modalBackdrop.classList.add('active');

  modalBackdrop.querySelector('#closeStationModal').addEventListener('click', () => {
    modalBackdrop.classList.remove('active');
  });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) modalBackdrop.classList.remove('active');
  });
}

// =========================================================================
// 7. How It Works Tabs
// =========================================================================
function initHowItWorksTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// =========================================================================
// 8. Interactive FAQ Accordion
// =========================================================================
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq-item');

  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    if (question && answer) {
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        items.forEach(i => {
          i.classList.remove('open');
          const a = i.querySelector('.faq-answer');
          if (a) a.style.maxHeight = null;
        });

        if (!isOpen) {
          item.classList.add('open');
          answer.style.maxHeight = `${answer.scrollHeight}px`;
        }
      });
    }
  });
}
