# System Architecture

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Kelani Guard System                          │
│                                                                     │
│  ┌───────────────────────┐         ┌──────────────────────────────┐ │
│  │   IoT / ESP32 Layer   │         │      Backend API Layer       │ │
│  │                       │  HTTP   │                              │ │
│  │  JSN-SR04T Sensor 01  │─POST──► │  Node.js + Express           │ │
│  │  JSN-SR04T Sensor 02  │         │  POST /api/readings          │ │
│  │                       │         │                              │ │
│  │  Reads distance (cm)  │         │  ┌────────────────────────┐  │ │
│  │  Computes payload     │         │  │  MongoDB Atlas (M0)    │  │ │
│  │  Sends JSON via Wi-Fi │         │  │  Collection: readings  │  │ │
│  └───────────────────────┘         │  │  TTL: 30 days          │  │ │
│                                    │  └────────────────────────┘  │ │
│  ┌───────────────────────┐         │                              │ │
│  │  Mobile Frontend      │  HTTP   │  GET /api/readings/latest    │ │
│  │                       │◄─GET───►│  GET /api/readings/history   │ │
│  │  React Native / Expo  │         │                              │ │
│  │  Expo Router          │         └──────────────────────────────┘ │
│  │  iOS · Android · Web  │                                          │
│  └───────────────────────┘                                          │
│                                                                     │
│  ┌───────────────────────┐                                          │
│  │  ML Prediction (TBD)  │  ── Future integration ──────────────►  │
│  │  Python service       │                                          │
│  └───────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Live Reading Path
1. ESP32 reads distance from both JSN-SR04T sensors (every N seconds).
2. ESP32 builds a JSON payload and POSTs to `POST /api/readings`.
3. Backend stores the reading in `latestReading` (in-memory) and returns `200 OK`.
4. If MongoDB is connected and ≥ 60 seconds have passed, the reading is also persisted.
5. Mobile app polls `GET /api/readings/latest` every 2 seconds.
6. Backend returns the in-memory `latestReading` enriched with `waterLevel01/02` and `riskLevel01/02`.
7. App displays live water levels, risk badges, and alert banner.

### Historical Reading Path
1. Mobile app (History screen) calls `GET /api/readings/history?limit=N`.
2. Backend queries MongoDB, sorts newest-first, applies `addRiskLevels`, returns array.
3. App renders SVG chart (Location 01 + Location 02 lines) and data table.

### Risk Level Computation
- Backend computes risk levels server-side using `RISK_THRESHOLDS_PERCENT` (40/60/80%).
- Backend sends thresholds alongside each reading; app uses them for chart threshold lines.
- Frontend also computes risk client-side as a fallback (`computeRiskLevel` in `config.ts`).

---

## Component Responsibilities

| Layer | Responsibility | Does NOT own |
|---|---|---|
| ESP32 firmware | Sensor reading, filtering, Wi-Fi, HTTP POST | Data storage, risk logic |
| Backend API | Receive readings, compute water level + risk, store, serve | UI, firmware, ML |
| Mobile frontend | Display, polling, charts, map, alerts | Data processing, ML inference |
| ML (future) | Predict future water level (30 min horizon) | Sensor reading, UI |

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| IoT | ESP32 + Arduino SDK | — |
| Sensor | JSN-SR04T waterproof ultrasonic | — |
| Backend | Node.js + Express 5 | see `backend/package.json` |
| Database | MongoDB Atlas (Mongoose) | M0 free tier |
| Mobile | React Native + Expo Router | SDK 57 |
| Maps (native) | react-native-maps | 1.27.2 |
| Charts | react-native-svg | 15.15.4 |
| ML (future) | Python (TBD) | — |

---

## Network Topology (Prototype)

```
[ESP32] ──Wi-Fi──► [LAN Router] ──Internet──► [Backend on Developer Laptop :3000]
                                                          ▲
[Phone / Emulator] ──Wi-Fi (same LAN)──────────────────────┘
```

> **Note:** In the prototype, the backend runs on the developer's laptop. `EXPO_PUBLIC_API_URL` must be set to the laptop's LAN IP address (not `localhost`).

