# Kelani Guard — IoT River Water Monitoring & Flood Early-Warning System

**Group:** J26-IT-448 · SLIIT Research Project

A modular, multi-component system that monitors Kelani River water levels in real time using IoT ultrasonic sensors and a React Native mobile application, with architectural provisions for future machine-learning flood prediction.

The sensing layer is **FloodEdge**: flood forecasting runs *on the ESP32 nodes themselves*, so the network keeps producing 15/30/60-minute stage forecasts with uncertainty bands even when cellular and grid backhaul fail.

---

## 📐 System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                      Kelani Guard System                         │
│                                                                  │
│  [FloodEdge ESP32 nodes] ── POST ─► [Backend API + MongoDB]       │
│                                           │                      │
│                                  GET /api/readings/*             │
│                                           │                      │
│                                [React Native Mobile App]         │
│                                                                  │
│  [ML Prediction Service] ─── (Future Integration) ───► [Backend] │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Technology | Owner | Location | Status |
|---|---|---|---|---|
| **FloodEdge: IoT / ESP32 Firmware** | C++ / Arduino SDK · ESP32 / ESP32-S3 · Firebase RTDB | Karunatilake V.D. (Vihara) | `components/iot-esp32/` | Firmware, transport and console built; field validation pending hardware replacement |
| **FloodEdge Web Console** | Single-file HTML/JS · Firebase RTDB | Karunatilake V.D. (Vihara) | `components/iot-esp32/dashboard/`, `simulator/` | Implemented (Working) |
| **Mobile Frontend** | React Native · Expo Router | Pasindu | `mobile/` *(docs in `components/mobile-frontend/`)* | Implemented (Working) |
| **Backend API** | Node.js · Express · MongoDB | Backend member | `backend/` *(docs in `components/backend-api/`)* | Implemented (Working) |
| **ML Prediction** | Python (Planned) | ML member | `components/ml-prediction/` | Future Component (Not Implemented Yet) |

### FloodEdge at a glance

Conventional flood nodes measure and upload; a remote rule decides. FloodEdge nodes measure, **forecast and decide locally**.

| | Conventional telemetry node | FloodEdge node |
|---|---|---|
| Primary function | Measure and upload; decision made remotely | Measure, forecast and decide locally |
| Backhaul loss | Goes silent | Keeps forecasting; degrades to a solo model |
| Warning basis | Fixed stage threshold crossed | 30–120 min forecast with a confidence band |
| Sensor faults | Found manually, usually after the event | Peer cross-check with automatic down-weighting |

Runs on the microcontroller (`03_flood_node.ino`): median-filtered stage from a 7-ping burst, least-squares rate of rise over a 20-sample window, recession-damped forecast `L(h) = L + r·τ·(1 − e^(−h/τ))`, uncertainty band, sensor-trust score, upstream coupling, and graded degradation when a peer is lost. Firebase is transport only; the web console is a viewer and runs no model.

Measured warning lead time (pond harness, 600 mm mounting height):

| Scenario | Peak depth | Lead to Advisory |
|---|---|---|
| Light rain | 283 mm | 18 min |
| Heavy rain | 323 mm | 9 min |
| Cloudburst | 379 mm | 5 min |

Lead time shortens as events get faster; this is a real limit of the approach and the figure field work must improve on. Scope: tributary and small-catchment system, not a basin-scale hydrological model, inundation mapper or evacuation router.

> [!NOTE]
> **Mobile Source Code vs. Documentation Structure:**
> - `mobile/` contains the actual working React Native Expo application source code, dependencies, and configuration.
> - `components/mobile-frontend/` contains component-level documentation and GitHub collaboration guidelines.
> - `components/ml-prediction/` currently defines the interface specification and payload contracts; the ML model and prediction engine will be developed in a future project phase.

---

## 🗂️ Repository Structure

```text
Research project/
├── README.md                   ← Root project documentation (You are here)
├── .env.example                ← Root environment variable template
│
├── docs/                       ← Detailed technical documentation
│   ├── project-overview.md     ← Project background, scope, and objectives
│   ├── system-architecture.md  ← End-to-end architecture & data flow
│   ├── hardware/               ← Hardware documentation
│   │   ├── components-list.md  ← Full Bill of Materials (BOM)
│   │   ├── wiring-connections.md ← GPIO pin mappings & schematic notes
│   │   └── sensor-calibration.md ← 200 cm sensor calibration & filtering
│   ├── api-integration.md      ← Backend API usage & payload format
│   ├── testing/
│   │   └── test-plan.md        ← Component-level test procedures
│   └── screenshots/            ← Project UI & hardware setup screenshots
│
├── components/                 ← Component documentation & modular specifications
│   ├── iot-esp32/              ← FloodEdge firmware workspace & hardware notes
│   │   ├── README.md           ← FloodEdge component guide
│   │   ├── 00_loopback/        ← GPIO / jumper-wire test, no sensor
│   │   ├── 01_sensor_*/        ← Sensor probe, test, raw, pin monitor, sweep
│   │   ├── 02_firebase_test/   ← WiFi, auth, write and stream, no sensor
│   │   ├── 03_flood_node/      ← The real node: forecasting + RTDB publishing
│   │   ├── dashboard/          ← Live web console (reads RTDB)
│   │   ├── simulator/          ← Console with pond-simulation fallback
│   │   ├── jsn_sensor.h        ← Shared JSN-SR04T driver (copied beside each .ino)
│   │   └── SETUP.md            ← Wiring, Firebase setup, build order, troubleshooting
│   ├── mobile-frontend/        ← Mobile component documentation
│   │   └── README.md           ← Points to /mobile source with architecture details
│   ├── backend-api/            ← Backend component documentation
│   │   └── README.md           ← Backend setup, routes, and data model
│   └── ml-prediction/          ← Machine Learning component (Future)
│       └── README.md           ← Future ML interface specification & data contracts
│
├── integration/                ← Cross-component contracts and testing
│   ├── README.md               ← Integration overview & boundaries
│   ├── api-contract.md         ← Canonical field-level API specifications
│   └── integration-test-plan.md← End-to-end integration test scenarios
│
├── backend/                    ← Backend service source code
│   ├── server.js               ← Express server, routes, and Mongoose model
│   ├── package.json            ← Backend dependencies and scripts
│   ├── .env.example            ← Safe environment variable template
│   └── .env                    ← Local environment config (Git-ignored)
│
└── mobile/                     ← React Native (Expo) mobile frontend source code
    ├── src/
    │   ├── app/                ← Expo Router file-based screens (_layout, index, history, etc.)
    │   ├── components/         ← Reusable UI (WaterMap, WaterLevelChart, HistorySection, etc.)
    │   ├── constants/          ← App config, theme, and risk threshold definitions
    │   ├── context/            ← ThemeContext and NavSliderContext providers
    │   └── hooks/              ← Custom React hooks
    ├── assets/                 ← Application icons, splash screen, and logos
    ├── app.json                ← Expo configuration
    ├── tsconfig.json           ← TypeScript path mapping configuration
    ├── package.json            ← Mobile dependencies and scripts
    ├── .env.example            ← Safe mobile environment template
    └── .env.local              ← Local environment config (Git-ignored)
```

---

## 🚀 Quick Start

Follow these steps to run the working system locally.

### 1. Backend Service (Node.js + Express + MongoDB)

Navigate to the `backend/` directory:
```bash
cd backend
```

Create your local `.env` configuration from the provided template:
```bash
cp .env.example .env
```
*(On Windows PowerShell, you can run: `Copy-Item .env.example .env`)*

Configure your environment variables in `backend/.env`:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>
PORT=3000
```

Install backend dependencies:
```bash
npm install
```

Start the backend server:
```bash
node server.js
```
The server will start listening at `http://0.0.0.0:3000`.

---

### 2. Mobile Application (React Native · Expo)

Navigate to the `mobile/` directory containing the application source:
```bash
cd mobile
```

Create your local `.env.local` configuration from the template:
```bash
cp .env.example .env.local
```
*(On Windows PowerShell, you can run: `Copy-Item .env.example .env.local`)*

Set your local machine's LAN IP address in `mobile/.env.local`:
```env
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP_ADDRESS>:3000
```
> **Tip:** Find your IPv4 address using `ipconfig` (Windows) or `ifconfig` (macOS/Linux). Do not use `localhost` when testing on physical mobile devices.

Install mobile dependencies:
```bash
npm install
```

Start the Expo development server:
```bash
npx expo start
```
From the interactive terminal:
- Press `w` to launch the Web dashboard in your browser.
- Press `a` to open in an Android Emulator.
- Press `i` to open in an iOS Simulator.
- Scan the displayed QR code with the **Expo Go** app on your physical mobile device.

---

### 3. FloodEdge Firmware & Hardware Setup

1. Open the Arduino IDE (v2.x recommended) and install the **esp32** board package. Select partition scheme **Huge APP (3MB No OTA)** to avoid `Sketch too big`.
2. Wire the JSN-SR04T as below, with a **10 kΩ + 20 kΩ divider on the Echo line** (the module's Echo is 5 V; the ESP32 is not 5 V tolerant). Plug the probe cable into the PCB or the module never produces a reading.

| Signal | Classic ESP32 | ESP32-S3 |
|---|---|---|
| Module Trig (RX) | GPIO 26 | GPIO 5 |
| Module Echo (TX) | GPIO 25 | GPIO 6 |
| VCC / GND | 5V / GND | 5V / GND |

3. Work through the build order. Each stage isolates one failure mode; do not skip ahead.

| Stage | Sketch | Pass condition |
|---|---|---|
| 0 | `00_loopback` | Pins and wires verified, no sensor |
| 1a | `01_sensor_probe` | Reports the module's R27 mode |
| 1b | `01_sensor_test` | Level tracks a ruler within ±5 mm |
| 2 | `02_firebase_test` | Counter increments in the Firebase console |
| 3 | `03_flood_node` → Node A | Forecast appears under `/nodes/node_a` |
| 4 | `03_flood_node` → Node B | B's forecast shifts when A rises |
| 5 | `dashboard/index.html` | Cards, chart and risk banner update live |

4. Per-node configuration (two lines change per board):

```cpp
#define NODE_ID       "node_a"       // or "node_b"
#define NODE_ROLE     ROLE_UPSTREAM  // or ROLE_DOWNSTREAM
```

Tune `TAU_MIN` (river 25.0, pond 3.0–12.0), `UPSTREAM_LAG_MIN` (river 3.0, pond 0.5–2.0) and `SENSOR_HEIGHT_MM` (site-measured; 600 for the pond harness). Measurable ceiling = `SENSOR_HEIGHT_MM` − 200 mm blind zone.

5. Open `dashboard/index.html` and paste your `firebaseConfig` and device credentials. Without a database configured, `simulator/` runs a pond simulation using the same algorithm as the firmware.

Full details: [`components/iot-esp32/README.md`](components/iot-esp32/README.md) and `SETUP.md`.

---

## 🔌 API Endpoints Summary

The backend exposes the following REST API endpoints:

| Method | Route | Producer / Consumer | Description |
|---|---|---|---|
| `GET` | `/` | All clients | Health check verifying the backend API is online |
| `POST` | `/api/readings` | ESP32 → Backend | Ingests raw distance readings (`location01`, `location02`) |
| `GET` | `/api/readings/latest` | Backend → Mobile | Returns the latest readings enriched with water levels and risk categories |
| `GET` | `/api/readings/history?limit=N` | Backend → Mobile | Returns recent historical readings from MongoDB for trends & charts |

For full request/response schemas, units, and validation rules, see the canonical [API Contract Document](integration/api-contract.md).

---

## 👥 Team Collaboration & Component Ownership

| Member / Role | Assigned Component | Primary Workspaces |
|---|---|---|
| **Karunatilake V.D. (Vihara)** | FloodEdge: IoT Hardware, ESP32 Firmware & Web Console | `components/iot-esp32/`, `docs/hardware/` |
| **Pasindu** | Mobile Frontend Application | `mobile/`, `components/mobile-frontend/` |
| **Backend Member** | REST API & Database Services | `backend/`, `components/backend-api/`, `docs/api-integration.md` |
| **ML Member** | Machine Learning Flood Prediction | `components/ml-prediction/` *(Future)* |

> [!IMPORTANT]
> **Security & Secret Management:**
> - Never commit real `.env` or `.env.local` files containing database passwords, access tokens, or private endpoints.
> - Maintain clean `.env.example` templates with generic placeholders only.
> - Always run `git status` prior to committing to ensure sensitive credentials are not staged.
> - FloodEdge sketches and the console HTML currently hold the WiFi password, Firebase API key and device password inline. Move them into `secrets.h` (git-ignored), never commit real values, rotate the device password if a filled-in sketch is shared, and print thesis appendices with credentials replaced by `<REDACTED>`.

---

## 📄 Documentation Index

Explore the detailed system documentation across the repository:

### Architecture & System Overview
- [Project Overview](docs/project-overview.md) — Problem background, objectives, and scope
- [System Architecture](docs/system-architecture.md) — System components, networking, and data pipelines
- [API Integration Guide](docs/api-integration.md) — Practical guide for integrating clients with the API

### Hardware & Sensor Engineering
- [Hardware Components List](docs/hardware/components-list.md) — Detailed bill of materials (BOM)
- [Wiring Connections](docs/hardware/wiring-connections.md) — Schematic pinouts and voltage considerations
- [Sensor Calibration Guide](docs/hardware/sensor-calibration.md) — 200 cm reference height, math, and filtering

### Component Specifications
- [IoT ESP32 Component Guide](components/iot-esp32/README.md) — Microcontroller firmware and hardware setup
- [Mobile Frontend Component Guide](components/mobile-frontend/README.md) — Mobile UI architecture and navigation
- [Backend API Component Guide](components/backend-api/README.md) — Server architecture, endpoints, and data schema
- [ML Prediction Component Specification](components/ml-prediction/README.md) — Future prediction models and interface contracts

### Integration & Quality Assurance
- [Canonical API Contract](integration/api-contract.md) — Field-by-field schema definitions and data types
- [Integration Test Plan](integration/integration-test-plan.md) — Cross-component end-to-end testing matrix
- [Component Test Plan](docs/testing/test-plan.md) — Isolated verification checklists for hardware, mobile, and backend
