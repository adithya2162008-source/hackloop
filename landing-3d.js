/**
 * VoltShare — Global Background 3D Cyber-EV Animation Engine (Three.js)
 * Modeled after the ultra-futuristic neon hypercar concept:
 * - Low-slung organic aerodynamic teardrop capsule silhouette
 * - Glowing dual-concentric neon cyan wheel rings with continuous high-speed spin
 * - Radiant amber / solar-gold flank intake energy channel
 * - Continuous front aero neon blue/cyan contour light ribbons
 * - Panoramic tinted crystal teardrop cockpit canopy
 * - High-speed highway neon light trails and cyber energy particles
 * - Dynamic scroll-linked disassembling / exploded architecture
 */

class GlobalEVBackgroundEngine {
  constructor(canvasId = 'global3dEvCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    // Scroll progress normalized [0, 1]
    this.scrollProgress = 0;
    this.targetScrollProgress = 0;

    // Mouse parallax
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    // 3D Model Hierarchy
    this.carRoot = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.doorLeft = new THREE.Group();
    this.doorRight = new THREE.Group();
    this.hoodGroup = new THREE.Group();
    this.trunkGroup = new THREE.Group();
    this.roofGroup = new THREE.Group();
    
    this.batteryPackGroup = new THREE.Group();
    this.batteryCells = [];
    
    this.wheelFL = new THREE.Group();
    this.wheelFR = new THREE.Group();
    this.wheelRL = new THREE.Group();
    this.wheelRR = new THREE.Group();
    this.wheels = [];
    this.wheelLightRings = [];
    
    this.motorFrontGroup = new THREE.Group();
    this.motorRearGroup = new THREE.Group();
    this.chassisGroup = new THREE.Group();
    this.highwayStreaksGroup = null;
    this.particlesGroup = null;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.camera.position.set(0, 3.2, 30);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;

    // -------------------------------------------------------------------------
    // DYNAMIC CYBERPUNK HIGHWAY LIGHTING
    // -------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0x061022, 2.8);
    this.scene.add(ambientLight);

    // Main Studio Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(20, 30, 20);
    this.scene.add(keyLight);

    // Electric Cyan Front & Rim Light
    const cyanRimLight = new THREE.DirectionalLight(0x00e5ff, 3.5);
    cyanRimLight.position.set(-20, 15, 25);
    this.scene.add(cyanRimLight);

    // Solar Amber Flank Accent Point Light (Matches Side Vent)
    const amberFlankLight = new THREE.PointLight(0xff9900, 6.0, 50);
    amberFlankLight.position.set(12, 2, 0);
    this.scene.add(amberFlankLight);

    // Neon Blue Wheel & Ground Glow
    const wheelGlowLight = new THREE.PointLight(0x00f0ff, 5.0, 45);
    wheelGlowLight.position.set(-10, 0, 5);
    this.scene.add(wheelGlowLight);

    // Build Cyber-EV & Highway Energy Streams
    this.buildCyberEVModel();
    this.buildHighwayEnergyStreaks();
    this.buildAmbientParticles();

    // Position Car in Global Background (Aggressive low-slung angle)
    this.carRoot.position.set(0, -1.0, 0);
    this.carRoot.rotation.set(0.16, -0.62, 0);
    this.scene.add(this.carRoot);

    // Event Listeners
    this.initEvents();

    // Start Animation Loop
    this.animate();
  }

  buildCyberEVModel() {
    // -------------------------------------------------------------------------
    // PREMIUM SHADERS & PBR MATERIALS
    // -------------------------------------------------------------------------
    // Deep Midnight Obsidian Glossy Body Paint
    const cyberBodyPaint = new THREE.MeshPhysicalMaterial({
      color: 0x050b16,
      emissive: 0x02040a,
      roughness: 0.08,
      metalness: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.99
    });

    // Dark Satin Carbon Aero Composite
    const carbonAero = new THREE.MeshStandardMaterial({
      color: 0x070b12,
      roughness: 0.3,
      metalness: 0.9
    });

    // Sleek Cyan-Tinted Teardrop Cockpit Glass
    const cockpitGlass = new THREE.MeshPhysicalMaterial({
      color: 0x00e5ff,
      emissive: 0x007799,
      emissiveIntensity: 0.3,
      roughness: 0.02,
      metalness: 0.1,
      transmission: 0.88,
      thickness: 0.6,
      transparent: true,
      opacity: 0.7
    });

    // Ultra-Luminous Electric Cyan Light Ribbon Material
    const neonCyanRibbon = new THREE.MeshStandardMaterial({
      color: 0x00f5ff,
      emissive: 0x00f5ff,
      emissiveIntensity: 4.8,
      roughness: 0.05,
      metalness: 0.8
    });

    // Radiant Solar Amber / Golden Lightbar (Matches the picture's side vent)
    const solarAmberGlow = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 5.5,
      roughness: 0.05,
      metalness: 0.8
    });

    // Laser Red Taillight Bar
    const laserRedGlow = new THREE.MeshStandardMaterial({
      color: 0xff0044,
      emissive: 0xff0044,
      emissiveIntensity: 4.5,
      roughness: 0.1,
      metalness: 0.8
    });

    const tireRubber = new THREE.MeshStandardMaterial({
      color: 0x060911,
      roughness: 0.94,
      metalness: 0.05
    });

    const wheelAlloy = new THREE.MeshStandardMaterial({
      color: 0x111c2e,
      metalness: 0.96,
      roughness: 0.18
    });

    const titaniumChassis = new THREE.MeshStandardMaterial({
      color: 0x162033,
      metalness: 0.95,
      roughness: 0.25
    });

    const copperMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.6,
      metalness: 0.95,
      roughness: 0.2
    });

    // -------------------------------------------------------------------------
    // 1. AERODYNAMIC TEARDROP CAPSULE CHASSIS & UNDERBODY
    // -------------------------------------------------------------------------
    const baseDeck = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.32, 12.0), titaniumChassis);
    baseDeck.position.y = 0.48;
    this.chassisGroup.add(baseDeck);

    // Glowing Lower Aero Edge Diffusers
    const underglowL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 11.6), neonCyanRibbon);
    underglowL.position.set(-2.38, 0.38, 0);
    const underglowR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 11.6), neonCyanRibbon);
    underglowR.position.set(2.38, 0.38, 0);
    this.chassisGroup.add(underglowL, underglowR);

    // -------------------------------------------------------------------------
    // 2. 800V SOLID-STATE HIGH-DENSITY BATTERY CORE
    // -------------------------------------------------------------------------
    const batteryTray = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.38, 8.2), new THREE.MeshStandardMaterial({
      color: 0x030712,
      metalness: 0.96,
      roughness: 0.2
    }));
    batteryTray.position.y = 0.25;
    this.batteryPackGroup.add(batteryTray);

    // Prismatic Glowing Battery Cells with Dual Cyan & Amber Energy Channels
    const cellGeo = new THREE.BoxGeometry(0.42, 0.52, 0.58);
    for (let x = -1.65; x <= 1.65; x += 0.52) {
      for (let z = -3.2; z <= 3.2; z += 0.72) {
        const isAmber = Math.abs(x) > 1.0;
        const cell = new THREE.Mesh(cellGeo, isAmber ? solarAmberGlow : neonCyanRibbon);
        cell.position.set(x, 0.58, z);
        this.batteryPackGroup.add(cell);
        this.batteryCells.push(cell);
      }
    }

    // High Voltage Interconnect Busbars
    const busbarGeo = new THREE.BoxGeometry(3.9, 0.06, 0.14);
    for (let z = -2.8; z <= 2.8; z += 1.4) {
      const busbar = new THREE.Mesh(busbarGeo, copperMaterial);
      busbar.position.set(0, 0.88, z);
      this.batteryPackGroup.add(busbar);
    }

    // -------------------------------------------------------------------------
    // 3. DUAL ELECTRIC PMSM DRIVE UNITS
    // -------------------------------------------------------------------------
    const buildMotor = (isFront) => {
      const g = new THREE.Group();
      const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.4, 24), titaniumChassis);
      stator.rotateZ(Math.PI / 2);
      const windings = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.8, 24), copperMaterial);
      windings.rotateZ(Math.PI / 2);
      const inv = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 1.4), carbonAero);
      inv.position.set(0, 0.78, 0);
      const invRibbon = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), neonCyanRibbon);
      invRibbon.position.set(0, 1.12, 0);
      g.add(stator, windings, inv, invRibbon);
      return g;
    };

    const frontDrive = buildMotor(true);
    frontDrive.position.set(0, 0.85, 3.8);
    this.motorFrontGroup.add(frontDrive);

    const rearDrive = buildMotor(false);
    rearDrive.position.set(0, 0.85, -3.8);
    this.motorRearGroup.add(rearDrive);

    // -------------------------------------------------------------------------
    // 4. FUTURISTIC NEON CONCENTRIC RING WHEELS (Exact Match to Picture)
    // -------------------------------------------------------------------------
    const buildCyberWheel = (isLeft) => {
      const wheelAssembly = new THREE.Group();

      // Wide Low-Profile Cyber Performance Tire
      const tire = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.42, 24, 48), tireRubber);
      tire.rotateY(Math.PI / 2);

      // Deep Metallic Aero Wheel Core
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.78, 32), wheelAlloy);
      core.rotateZ(Math.PI / 2);

      // Concentric Outer Glowing Neon Cyan Light Ring (Prominent in image)
      const outerNeonRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.085, 16, 48), neonCyanRibbon);
      outerNeonRing.rotateY(Math.PI / 2);
      outerNeonRing.position.x = isLeft ? 0.41 : -0.41;

      // Concentric Inner Glowing Neon Cyan Light Ring
      const innerNeonRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.065, 16, 48), neonCyanRibbon);
      innerNeonRing.rotateY(Math.PI / 2);
      innerNeonRing.position.x = isLeft ? 0.42 : -0.42;

      // Center Hub Cap with Radiant Core
      const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.86, 20), carbonAero);
      hubCap.rotateZ(Math.PI / 2);
      const hubDot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.88, 16), neonCyanRibbon);
      hubDot.rotateZ(Math.PI / 2);

      wheelAssembly.add(tire, core, outerNeonRing, innerNeonRing, hubCap, hubDot);
      this.wheels.push(wheelAssembly);
      this.wheelLightRings.push(outerNeonRing, innerNeonRing);
      return wheelAssembly;
    };

    this.wheelFL.add(buildCyberWheel(true));
    this.wheelFL.position.set(-2.55, 1.2, 3.8);

    this.wheelFR.add(buildCyberWheel(false));
    this.wheelFR.position.set(2.55, 1.2, 3.8);

    this.wheelRL.add(buildCyberWheel(true));
    this.wheelRL.position.set(-2.55, 1.2, -3.8);

    this.wheelRR.add(buildCyberWheel(false));
    this.wheelRR.position.set(2.55, 1.2, -3.8);

    // -------------------------------------------------------------------------
    // 5. CURVACEOUS ORGANIC AERO FRONT NOSE & WRAPPING LIGHT RIBBON
    // -------------------------------------------------------------------------
    // Curvaceous Lower Front Nose Cone
    const frontAeroNose = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.85, 2.6), cyberBodyPaint);
    frontAeroNose.position.set(0, 1.1, 5.7);

    // Carbon Splitter Wing
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(4.95, 0.1, 1.8), carbonAero);
    frontSplitter.position.set(0, 0.65, 6.3);

    // Continuous Curving Front LED Neon Light Ribbon (Wraps front of car in picture)
    const frontWrapRibbon = new THREE.Mesh(new THREE.BoxGeometry(4.85, 0.14, 0.35), neonCyanRibbon);
    frontWrapRibbon.position.set(0, 1.28, 6.95);

    // Front Side Light Ribbons (Winglet Edges)
    const frontWingletL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.2), neonCyanRibbon);
    frontWingletL.position.set(-2.44, 1.25, 5.8);
    const frontWingletR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.2), neonCyanRibbon);
    frontWingletR.position.set(2.44, 1.25, 5.8);

    this.bodyGroup.add(frontAeroNose, frontSplitter, frontWrapRibbon, frontWingletL, frontWingletR);

    // -------------------------------------------------------------------------
    // 6. REAR AERO DECK, DIFFUSER & CYBER TAILLIGHT
    // -------------------------------------------------------------------------
    const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.92, 2.4), cyberBodyPaint);
    rearDeck.position.set(0, 1.2, -5.7);

    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.28, 1.8), carbonAero);
    rearDiffuser.position.set(0, 0.65, -6.3);

    // Full-Width Cyber Taillight Strip
    const rearTailLight = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.15, 0.25), laserRedGlow);
    rearTailLight.position.set(0, 1.55, -6.85);

    this.bodyGroup.add(rearDeck, rearDiffuser, rearTailLight);

    // Curving Muscular Fender Flares
    const fenderGeo = new THREE.BoxGeometry(0.38, 0.55, 3.4);
    const fenderFL = new THREE.Mesh(fenderGeo, cyberBodyPaint);
    fenderFL.position.set(-2.35, 1.52, 3.8);
    const fenderFR = new THREE.Mesh(fenderGeo, cyberBodyPaint);
    fenderFR.position.set(2.35, 1.52, 3.8);
    const fenderRL = new THREE.Mesh(fenderGeo, cyberBodyPaint);
    fenderRL.position.set(-2.35, 1.55, -3.8);
    const fenderRR = new THREE.Mesh(fenderGeo, cyberBodyPaint);
    fenderRR.position.set(2.35, 1.55, -3.8);
    this.bodyGroup.add(fenderFL, fenderFR, fenderRL, fenderRR);

    // -------------------------------------------------------------------------
    // 7. SCULPTED DOORS WITH RADIANT SOLAR AMBER FLANK VENTS (Exact Match)
    // -------------------------------------------------------------------------
    // Left Door Assembly
    const doorPanelL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.38, 3.8), cyberBodyPaint);
    const doorGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 3.5), cockpitGlass);
    doorGlassL.position.set(0, 0.85, 0);

    // Radiant Solar Amber Flank Lightbar (Striking feature on the car in image!)
    const amberVentL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 2.6), solarAmberGlow);
    amberVentL.position.set(-0.16, 0.05, 0.2);

    const amberAeroTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 2.8), carbonAero);
    amberAeroTrimL.position.set(-0.14, 0.05, 0.2);

    this.doorLeft.add(doorPanelL, doorGlassL, amberVentL, amberAeroTrimL);
    this.doorLeft.position.set(-2.4, 1.85, 0);

    // Right Door Assembly
    const doorPanelR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.38, 3.8), cyberBodyPaint);
    const doorGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 3.5), cockpitGlass);
    doorGlassR.position.set(0, 0.85, 0);

    const amberVentR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 2.6), solarAmberGlow);
    amberVentR.position.set(0.16, 0.05, 0.2);

    const amberAeroTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 2.8), carbonAero);
    amberAeroTrimR.position.set(0.14, 0.05, 0.2);

    this.doorRight.add(doorPanelR, doorGlassR, amberVentR, amberAeroTrimR);
    this.doorRight.position.set(2.4, 1.85, 0);

    // -------------------------------------------------------------------------
    // 8. TEARDROP COCKPIT CANOPY, POWER HOOD & FASTBACK
    // -------------------------------------------------------------------------
    // Seamless Panoramic Capsule Bubble
    const canopyBubble = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 4.8), cockpitGlass);
    canopyBubble.position.set(0, 2.7, 0.1);

    const roofAeroSpine = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.1, 4.6), carbonAero);
    roofAeroSpine.position.set(0, 3.36, 0.1);

    // Cyan Cockpit Holographic HUD
    const cockpitHUD = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.1), neonCyanRibbon);
    cockpitHUD.position.set(0, 2.15, 1.95);

    this.roofGroup.add(canopyBubble, roofAeroSpine, cockpitHUD);

    // Sculpted Hood with Air Ducts
    const hood = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 3.2), cyberBodyPaint);
    hood.position.set(0, 1.65, 3.8);
    const hoodCyanTrim = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.04, 0.08), neonCyanRibbon);
    hoodCyanTrim.position.set(0, 1.72, 5.3);
    this.hoodGroup.add(hood, hoodCyanTrim);

    // Fastback Rear Decklid
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 3.0), cyberBodyPaint);
    trunk.position.set(0, 1.7, -3.8);
    this.trunkGroup.add(trunk);

    // Assemble All Into Root Car Group
    this.carRoot.add(
      this.chassisGroup,
      this.batteryPackGroup,
      this.motorFrontGroup,
      this.motorRearGroup,
      this.wheelFL,
      this.wheelFR,
      this.wheelRL,
      this.wheelRR,
      this.bodyGroup,
      this.doorLeft,
      this.doorRight,
      this.hoodGroup,
      this.trunkGroup,
      this.roofGroup
    );
  }

  buildHighwayEnergyStreaks() {
    // -------------------------------------------------------------------------
    // HIGH-SPEED HIGHWAY NEON LIGHT TRAILS (Beneath and alongside the car)
    // -------------------------------------------------------------------------
    this.highwayStreaksGroup = new THREE.Group();
    const streakCount = 35;
    const streakGeo = new THREE.BoxGeometry(0.12, 0.04, 8.0);

    const cyanStreakMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.85 });
    const amberStreakMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.75 });
    const blueStreakMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 });

    this.highwayStreaks = [];

    for (let i = 0; i < streakCount; i++) {
      const mat = i % 3 === 0 ? cyanStreakMat : (i % 3 === 1 ? amberStreakMat : blueStreakMat);
      const streak = new THREE.Mesh(streakGeo, mat);
      
      streak.position.set(
        (Math.random() - 0.5) * 28,
        -1.8 - Math.random() * 2.0,
        (Math.random() - 0.5) * 50
      );
      streak.scale.z = 0.8 + Math.random() * 2.5;
      streak.userData = { speed: 0.8 + Math.random() * 1.4 };

      this.highwayStreaksGroup.add(streak);
      this.highwayStreaks.push(streak);
    }

    this.scene.add(this.highwayStreaksGroup);
  }

  buildAmbientParticles() {
    const count = 160;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = Math.random() * 10 - 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;

      if (i % 2 === 0) {
        colors[i * 3] = 0.0; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 1.0; // Neon Cyan
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.65; colors[i * 3 + 2] = 0.0; // Solar Amber
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    this.particlesGroup = new THREE.Points(geometry, material);
    this.scene.add(this.particlesGroup);
  }

  initEvents() {
    // Scroll Tracking
    window.addEventListener('scroll', () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      this.targetScrollProgress = Math.min(1, Math.max(0, window.scrollY / (maxScroll * 0.75)));
    }, { passive: true });

    // Mouse Parallax
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Window Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = this.clock.getElapsedTime();

    // Smooth Lerps
    this.scrollProgress += (this.targetScrollProgress - this.scrollProgress) * 0.06;
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

    const p = this.scrollProgress; // [0, 1]

    // =========================================================================
    // 1. DYNAMIC HIGHWAY MOTION & SMOOTH CAR ROTATION
    // =========================================================================
    this.carRoot.rotation.y = -0.62 + p * (Math.PI * 1.8) + this.mouse.x * 0.22;
    this.carRoot.rotation.x = 0.16 + Math.sin(time * 0.9) * 0.035 - this.mouse.y * 0.18;
    this.carRoot.position.y = -1.0 + Math.sin(time * 1.4) * 0.2;
    this.carRoot.position.x = Math.sin(p * Math.PI) * 2.8;

    // High-Speed Continuous Wheel Rotation
    this.wheels.forEach(w => {
      w.rotation.x += 0.045;
    });

    // =========================================================================
    // 2. DISMANTLING & EXPLODED POWERTRAIN LINKED TO SCROLL
    // =========================================================================
    const explode = Math.min(1.0, p * 1.6);

    // Falcon Doors Lift and Swing Open
    this.doorLeft.position.x = -2.4 - (explode * 3.6);
    this.doorLeft.position.y = 1.85 + (explode * 2.5);
    this.doorLeft.rotation.z = explode * (Math.PI * 0.38);

    this.doorRight.position.x = 2.4 + (explode * 3.6);
    this.doorRight.position.y = 1.85 + (explode * 2.5);
    this.doorRight.rotation.z = -explode * (Math.PI * 0.38);

    // 4 Neon Ring Wheels Slide Outward on Axles
    this.wheelFL.position.x = -2.55 - (explode * 2.8);
    this.wheelFL.position.y = 1.2 + (explode * 0.5);
    this.wheelFR.position.x = 2.55 + (explode * 2.8);
    this.wheelFR.position.y = 1.2 + (explode * 0.5);
    this.wheelRL.position.x = -2.55 - (explode * 2.8);
    this.wheelRL.position.y = 1.2 + (explode * 0.5);
    this.wheelRR.position.x = 2.55 + (explode * 2.8);
    this.wheelRR.position.y = 1.2 + (explode * 0.5);

    // Teardrop Canopy Elevates Skyward
    this.roofGroup.position.y = explode * 4.2;
    this.hoodGroup.position.z = 3.8 + (explode * 3.0);
    this.hoodGroup.position.y = 1.65 + (explode * 1.5);
    this.trunkGroup.position.z = -3.8 - (explode * 3.0);
    this.trunkGroup.position.y = 1.7 + (explode * 1.5);

    // 800V Lithium Battery Core Drops Below
    this.batteryPackGroup.position.y = -(explode * 3.2);

    // Front & Rear Motors Eject
    this.motorFrontGroup.position.z = explode * 2.6;
    this.motorRearGroup.position.z = -(explode * 2.6);

    // Pulse Glowing Battery Cells
    this.batteryCells.forEach((cell, idx) => {
      const pulse = Math.sin(time * 4.0 + idx * 0.3) * 0.5 + 3.2;
      if (cell.material && cell.material.emissiveIntensity) {
        cell.material.emissiveIntensity = pulse + (explode * 1.5);
      }
    });

    // Animate Highway Speed Light Trails
    if (this.highwayStreaks) {
      this.highwayStreaks.forEach(streak => {
        streak.position.z += streak.userData.speed;
        if (streak.position.z > 25) {
          streak.position.z = -25;
          streak.position.x = (Math.random() - 0.5) * 28;
        }
      });
    }

    // Animate Ambient Particles
    if (this.particlesGroup && this.particlesGroup.geometry) {
      const pos = this.particlesGroup.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += 0.03;
        if (pos[i + 1] > 8.5) pos[i + 1] = -3;
      }
      this.particlesGroup.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Auto-instantiate when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE !== 'undefined') {
    window.global3dEvEngine = new GlobalEVBackgroundEngine('global3dEvCanvas');
  }
});
