# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **EV Drivers (2-Wheeler & 4-Wheeler owners)**: Everyday commuters in India driving Tata Nexon EV, Tiago EV, Ola S1, Ather 450X, Mahindra XUV400, seeking reliable, affordable nearby charging without long queues.
2. **Private & Community Hosts**: Homeowners, apartment societies, and small business owners with residential solar wallboxes or standard Type 2/15A sockets who want to monetize their idle charger capacity.
3. **Commercial Operators**: Fast hub managers offering DC fast-charging (CCS2 / CHAdeMO) with dynamic grid pricing.

## Product Purpose

VoltShare solves range anxiety and charging scarcity in India by unlocking a hybrid charging network: crowdsourcing private residential wallboxes alongside verified commercial hubs with exact kWh energy metering, instant reservations, and transparent payments.

## Positioning

Unlike closed OEM-specific networks that lock users into single ecosystems, VoltShare provides an open, peer-to-peer sharing economy with exact mathematical billing (`kWh × Applied Rate = Cost`), zero arbitrary markup, live IoT telemetry streaming, and driver-to-host bay reservations.

## Operating Context

- **Situational Environment**: Urban street parking, residential gated communities, highways, and shopping malls across Indian metro and tier-2 cities.
- **Workflow Steps**:
  1. Driver discovers nearby chargers via interactive map with real-time status (`available` vs `in-use`).
  2. Driver locks an arrival slot via the +₹30/hr Bay Reservation Engine.
  3. Driver plugs in, initiates live session, and monitors real-time IoT power telemetry (kWh, SOC %, voltage, power kW, CO₂ offset).
  4. Driver stops session; invoice automatically deducts from in-app wallet balance with instant host revenue attribution.
  5. Hosts toggle availability, manage listings, and track daily/lifetime earnings.

## Capabilities and Constraints

- **Confirmed Capabilities**:
  - Dual-layer data architecture: zero-latency LocalStorage cache + authoritative Supabase PostgreSQL cloud database.
  - Real-time IoT charging simulation and bi-directional Supabase cloud synchronization.
  - Multi-connector support: Type 2 AC, CCS2 DC Fast, CHAdeMO, and 15A Indian standard domestic plugs.
  - Integrated in-app wallet with UPI, Google Pay, and Net Banking top-up simulations.
  - Role-switching: seamless one-tap toggle between Driver Mode and Host Mode.
- **Constraints**:
  - Currency fixed to Indian Rupee (₹ INR).
  - Web PWA standalone deployment with responsive desktop device frame.
  - Visual identity anchored around signature blue-green palette (`#10b981` emerald, `#06b6d4` cyan, `#00ff87` electric green) on dark midnight backgrounds.

## Brand Commitments

- **Brand Name**: VoltShare
- **Tagline**: Powering Community EV Mobility
- **Signature Aesthetics**: Dynamic dark midnight theme (`#070a12`, `#0c1220`) with vibrant electric green (`#10b981`, `#00ff87`) and electric cyan (`#06b6d4`) accents, reflecting clean energy and futuristic mobility.
- **Typography**: Plus Jakarta Sans & Space Grotesk.

## Evidence on Hand

- Fully functional interactive web application in `index.html`, `app.js`, `db.js`, `styles.css`.
- Cloud PostgreSQL schema in `supabase_schema.sql` deployed to Supabase instance (`https://gzsemckkimohwdazrkld.supabase.co`).
- Comprehensive EV vehicle battery specifications dataset in `ev vehicle data/` (`ev_2wheeler_battery_simple.csv`, `ev_4wheeler_battery_simple.csv`, `ev_luxury_battery_simple.csv`).
- Automated live synchronization test suite in `scripts/verify_live_sync.js`.

## Product Principles

1. **Fair & Transparent Energy Billing**: Every paisa is directly attributable to physical energy consumed (`kWh × Rate = Cost`), eliminating hidden fees.
2. **Real-Time Data Integrity**: Station availability and charging metrics must reflect authoritative truth across all connected clients via instant cloud sync.
3. **Zero-Friction Neighborhood Sharing**: Connecting a host with a driver should feel as seamless and trusted as booking a home or car on Airbnb.
4. **Resilient Offline-First UX**: Low-connectivity environments must never prevent a driver from tracking or stopping an active charge session.

## Accessibility & Inclusion

- Multi-screen responsiveness ensuring touch targets meet minimum 44×44px standards for mobile drivers.
- Clear high-contrast text and dual indicators (icons + text labels) for color-blind accessibility during station discovery and charging.
