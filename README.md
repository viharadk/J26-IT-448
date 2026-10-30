# Kelani Guard — IoT River Water Monitoring & Flood Early-Warning System

**Group:** J26-IT-448 · SLIIT Research Project

A modular research system combining IoT-based river monitoring, locally executed FloodEdge forecasting, a backend and mobile application, and a separately developed machine-learning component for longer-range river-level forecasting at Hanwella. **The standalone ML pipeline and forecasting dashboard have been developed; automatic data ingestion and integration with the group backend/mobile app are still pending.**

The sensing layer is **FloodEdge**: short-range forecasting runs *on ESP32 nodes themselves*, allowing local forecasts and decision support even if the upstream network connection fails. **Kelani Guard ML-Based Rainfall and River-Level Forecasting**, developed separately in Python, uses historical water-level and rainfall patterns to estimate Hanwella levels **1, 3, 6, 12 and 24 hours ahead**. These serve different forecasting horizons and are not yet a single deployed prediction engine.

---

## 📐 System Overview

```text
                   KELANI GUARD — CURRENT COMPONENTS AND PLANNED LINKS

    [FloodEdge ESP32 sensing / local forecasts]
                 |                    |
           local forecasts       sensor readings
                 |                    |
           [Firebase RTDB]       [Backend API + MongoDB]
                 |                    |
           [FloodEdge console]   [React Native mobile app]

    [Historical river levels + rainfall / public event records]
                              |
                      [Python ML pipeline]
                 clean -> 48-h features -> train/test
                              |
              [Saved models: XGBoost / LSTM / GRU / ...]
                              |
                 [1 / 3 / 6 / 12 / 24-h forecasts]
                              |
                  [forecast JSON + ML web demo]
                              |
                  FUTURE BACKEND INTEGRATION
                              v
                      [Backend API + DB]
                              |
                 [Mobile / alert / decision modules]
```

**Integration status:** The existing backend reading endpoints and mobile app are documented below. No ML forecast-ingestion endpoint or confirmed automatic ML-to-backend connection is documented in this repository yet. The ML web dashboard demonstrates forecast presentation and river-condition scenarios. Do not treat its scenario buttons as live IoT or API-fed model inference without verifying the connection.

| Component | Technology | Owner | Location | Status |
|---|---|---|---|---|
| **FloodEdge: IoT / ESP32 Firmware** | C++ / Arduino SDK · ESP32 / ESP32-S3 · Firebase RTDB | Karunatilake V.D. (Vihara) | `components/iot-esp32/` | Firmware, transport and console built; field validation pending hardware replacement |
| **FloodEdge Web Console** | Single-file HTML/JS · Firebase RTDB | Karunatilake V.D. (Vihara) | `components/iot-esp32/dashboard/`, `simulator/` | Implemented (Working) |
| **Mobile Frontend** | React Native · Expo Router | Pasindu | `mobile/` *(docs in `components/mobile-frontend/`)* | Implemented (Working) |
| **Backend API** | Node.js · Express · MongoDB | Backend member | `backend/` *(docs in `components/backend-api/`)* | Implemented (Working) |
| **ML-Based Rainfall & River-Level Forecasting** | Python · pandas · scikit-learn · XGBoost · TensorFlow/Keras · Google Colab | Vijayarathne K.A.D.K.B. (IT23209398) | Standalone notebook `KelaniGuard_Advanced_Flood_Forecasting_v2.ipynb`; repository specification at `components/ml-prediction/` | Training/evaluation pipeline, saved models, JSON output and separate web UI demonstrated; group API/mobile integration pending |

### ML-based river-level forecasting at a glance

**Owner:** Vijayarathne K.A.D.K.B. (IT23209398)  
**Research component:** ML-Based Rainfall and River-Level Forecasting  
**Study area:** Hanwella gauge, Kelani River Basin  
**Implementation:** Separate Google Colab / Python notebook and a local river-forecasting web interface  
**Status:** Standalone forecasting workflow developed and executed; larger-scale validation and group-system integration remain outstanding.

The ML component predicts river levels **1, 3, 6, 12 and 24 hours ahead**. It is intended to complement the FloodEdge node-level method, which supports much shorter local forecasts. The ML component is **decision support only**, not a replacement for official hydrological warnings and not an automatic reservoir gate controller.

| Aspect | Current ML implementation |
|---|---|
| Main objective | Forecast future Hanwella gauge levels, with forecast ranges and point-estimate risk labels |
| Source data | River-level and rainfall CSV files; public November 2025 Ditwah record used for a separate preliminary event check |
| Development dataset | Simulated hourly Kelani-format dataset informed by the public event; **not** official long-term Irrigation Department observations |
| Input history | A 48-hour feature window, including Hanwella level, upstream levels, historical rainfall and derived features |
| Input stations | Hanwella target gauge; Glencourse and Deraniyagala upstream gauges; configurable rainfall stations |
| Forecast horizons | 1, 3, 6, 12 and 24 hours |
| Candidate models | Ridge regression; three XGBoost configurations; LSTM, GRU, stacked LSTM, CNN-LSTM; equal-weight ensemble, plus persistence baselines |
| Training/evaluation | Chronological 60% training, 15% validation, 10% calibration, 15% final test; a 24-hour boundary embargo |
| Model selection | Lowest validation RMSE for each target/horizon, then test evaluation |
| Forecast outputs | Future river level, lower/upper interval, optional rainfall accumulation target, risk label, selected model, generation timestamp and model version |
| Artifacts | `.keras`, `.ubj`, `scalers.joblib`, `metadata.json`, `forecast_output.json`, evaluation tables and plots |

**Completed development-run evidence:** A recorded full run processed **50,236 usable windows**, compared **nine trained candidates**, selected `xgb_1` for 1h and 3h, an ensemble for 6h and 12h, and stacked LSTM for 24h. It also exported saved model artifacts and prediction JSON. These are **development-run results**, not demonstrated long-term operational accuracy. The run scorecard also reported **two failed acceptance checks**, which require follow-up.

**Public-event evaluation:** The notebook contains a preliminary check using a short public Ditwah event series and the no-rain fallback model. A short event check is not equivalent to validation across several years and flood conditions.

**Frontend demonstration:** The separate River Forecast web UI shows a Hanwella overview, past readings, five forecast points, uncertainty bands, and river-condition selectors (`Normal`, `Rising`, `High water`, `Data unavailable`). These selectors demonstrate display and risk-classification behaviour. They are not evidence that the current React Native mobile app or backend receives forecasts automatically.

#### Why this component matters to the whole project

- **FloodEdge / IoT:** Supplies physical measurements and short-range on-device forecasts. Once measurements are aligned by station, time, gauge reference and units, suitable historical observations could be used as future inputs to the ML forecasting service. One local ultrasonic sensor is **not** interchangeable with the three gauge series and rainfall features expected by the current ML model.
- **Backend / database:** Is the proposed central place to store time-stamped inputs and share ML-generated forecasts with other applications. Existing `/api/readings/*` endpoints handle readings; forecast endpoints are **not yet implemented in the shared README**.
- **Mobile app / web dashboard:** Can eventually display forecasts, their issue time, interval bounds, risk labels and stale-data status. The independent ML web demo is not the same as the team's React Native app.
- **Flood-risk and decision modules:** Can use validated forecast outputs as one input to risk interpretation and alert preparation. Forecasts must not directly command reservoir gates.

**Next steps:** Obtain more extensive verified historical river-level and rainfall records (ideally from the Irrigation Department and relevant weather data providers), retrain and validate across multiple flood events, establish reliable recent-observation ingestion, agree on an ML API contract with the backend team, and connect the mobile/alert consumers. See [ML Forecasting Integration Plan](docs/ml-forecasting-integration.md).

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
> - `components/ml-prediction/` is the repository location reserved for the component specification and contracts. ML development is already underway in a **separate notebook and saved run artifacts**; source/artifact migration and API integration with this repository remain future tasks.

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
│   ├── ml-forecasting-integration.md ← ML component, evidence and proposed connection
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
│   └── ml-prediction/          ← ML repository integration workspace
│       └── README.md           ← Existing ML interface specification & data contracts
│                                  (standalone implementation currently outside this repo)
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

### 4. ML Forecasting Component (Standalone Notebook)

The ML research implementation has been developed separately from the current Node.js backend. It is not started by the root project's backend or Expo commands.

**Existing research notebook:** `KelaniGuard_Advanced_Flood_Forecasting_v2.ipynb` (Google Colab/Jupyter). The notebook is **not included in this README upload or verified as committed under `components/ml-prediction/`**. Add it to the repository intentionally after removing private data and credentials.

1. Open the notebook in Google Colab. Run the cells in order, from the top, using **Runtime → Run all**.
2. Configure `RUN_PROFILE` as `quick`, `standard`, or `full` and ensure Google Drive contains the required `data/<MAIN_DATA>/river_levels.csv` and `rainfall.csv` inputs. The notebook documents its exact file formats.
3. The notebook cleans and combines the input data, builds training examples, trains candidates, selects models by validation RMSE, evaluates on separate data and exports artifacts to `MyDrive/KelaniGuard_Forecasting/runs/<RUN_ID>/`.
4. Inspect `model_selection.csv`, `test_metrics.csv`, `RUN_REPORT.md`, `metadata.json` and `forecast_output.json` from the **same run**. Trained XGBoost models are `.ubj` files and TensorFlow models are `.keras` files.
5. To make a new offline forecast from a saved run, use the notebook's `kg.Forecaster(run_directory).predict(history, forecasts=None, now=...)` interface. `history` must be correctly prepared, time-zone-aware canonical hourly input, with enough older records to calculate rolling features. The current code rejects missing inputs and observations that are too old.

**Operational distinction:** A large historical dataset is used for training and validation. Continuously updated forecasts require **fresh recent station readings and rainfall inputs**, consistent with the training features. The current model does not automatically retrieve new measurements from the Irrigation Department, Firebase or the Node.js backend. Model retraining is not required for every prediction, but suitable new observations are.

**Data validity:** The default notebook development data is simulated. Separate public Ditwah measurements are used for a limited event check. A larger multi-event official dataset and prospective tests are required before performance or operational readiness can be claimed.

**Frontend distinction:** A local River Forecast web interface has been demonstrated at `/forecasting`, but the shared React Native app's ML integration is not yet documented or verified. Do not assume the local web interface is served by this backend's `PORT=3000`.

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

### Proposed ML forecast integration (not an existing backend endpoint)

The trained Python forecaster currently exports `forecast_output.json` containing `station_id`, `origin_time`, `generated_at`, `model_version`, `decision_support_only`, and a `forecasts` array. Each forecast includes `horizon_hours`, `target_time`, `river_level_m`, lower/upper level bounds, rainfall accumulation, `risk_from_point_forecast` and the selected model name.

**Proposed flow:** ingestion of fresh canonical hourly gauge/rainfall data → Python forecasting service → validated JSON response → new backend forecast-ingestion/storage route → mobile/dashboard consumers. The backend team should agree on **new forecast endpoints** and authentication before implementing them. Suggested route names such as `POST /api/forecasts` and `GET /api/forecasts/latest?station_id=HANWELLA` are **design proposals only**; they are **not** included in the existing routes listed above. See [ML Forecasting Integration Plan](docs/ml-forecasting-integration.md) for an example payload and integration checklist.


---

## 👥 Team Collaboration & Component Ownership

| Member / Role | Assigned Component | Primary Workspaces |
|---|---|---|
| **Karunatilake V.D. (Vihara)** | FloodEdge: IoT Hardware, ESP32 Firmware & Web Console | `components/iot-esp32/`, `docs/hardware/` |
| **Pasindu** | Mobile Frontend Application | `mobile/`, `components/mobile-frontend/` |
| **Backend Member** | REST API & Database Services | `backend/`, `components/backend-api/`, `docs/api-integration.md` |
| **Vijayarathne K.A.D.K.B. (IT23209398)** | ML-Based Rainfall & River-Level Forecasting | Standalone Google Colab notebook and saved model run; `components/ml-prediction/` reserved for integration |

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
- [ML Prediction Component Specification](components/ml-prediction/README.md) — Repository interface specification and data contracts
- [ML Forecasting Integration Plan](docs/ml-forecasting-integration.md) — Implemented standalone forecasting pipeline, output contract and planned backend/mobile integration

### Integration & Quality Assurance
- [Canonical API Contract](integration/api-contract.md) — Field-by-field schema definitions and data types
- [Integration Test Plan](integration/integration-test-plan.md) — Cross-component end-to-end testing matrix
- [Component Test Plan](docs/testing/test-plan.md) — Isolated verification checklists for hardware, mobile, and backend
