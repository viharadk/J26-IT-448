# Kelani Guard — IoT River Water Monitoring & Flood Early-Warning System

**Group:** J26-IT-448 · SLIIT Research Project

A modular, multi-component system that monitors Kelani River water levels in real time using IoT ultrasonic sensors and a React Native mobile application, with provisions for machine-learning flood prediction.

---

## 📐 System Overview

```
┌──────────────────────────────────────────────────────────┐
│              Kelani Guard System                         │
│                                                          │
│  [ESP32 + Sensors] ──POST──► [Backend API + MongoDB]     │
│                                    │                     │
│                             GET /api/readings/*          │
│                                    │                     │
│                         [React Native Mobile App]        │
│                                                          │
│  [ML Prediction Service] ──(future)──► [Backend API]     │
└──────────────────────────────────────────────────────────┘
```

| Component | Technology | Owner | Location |
|---|---|---|---|
| IoT / ESP32 Firmware | C++ / Arduino SDK | Pasindu | `components/iot-esp32/` |
| Mobile Frontend | React Native · Expo Router | Pasindu | `mobile/` |
| Backend API | Node.js · Express · MongoDB | Backend member | `backend/` |
| ML Prediction | Python (future) | ML member | `components/ml-prediction/` |

---

## 🗂️ Repository Structure

```
Research project/
├── README.md                   ← You are here
├── .env.example                ← Placeholder — copy to configure
│
├── docs/                       ← All project documentation
│   ├── project-overview.md
│   ├── system-architecture.md
│   ├── hardware/               ← ESP32 wiring, sensor calibration
│   ├── api-integration.md      ← How to call the backend API
│   └── testing/
│
├── components/                 ← Per-component READMEs and placeholders
│   ├── iot-esp32/              ← ESP32 firmware (source lives here)
│   ├── mobile-frontend/        ← Points to /mobile (actual source)
│   ├── backend-api/            ← Backend component README
│   └── ml-prediction/          ← ML interface specification
│
├── integration/                ← Cross-component API contract & test plans
│   ├── api-contract.md         ← Canonical API field definitions
│   └── integration-test-plan.md
│
├── backend/                    ← Backend API (Express + MongoDB)
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
└── mobile/                     ← React Native Expo mobile app
    ├── src/app/                ← Expo Router screens
    ├── src/components/         ← Reusable UI components
    ├── src/constants/          ← Config, types, theme
    ├── src/context/            ← Theme + navigation providers
    ├── src/hooks/              ← Custom hooks
    └── .env.example
```

---

## 🚀 Quick Start

### Backend (Node.js + Express)

```bash
cd backend
cp .env.example .env          # Fill in your MongoDB URI and PORT
npm install
node server.js                # Starts on http://0.0.0.0:3000
```

### Mobile App (Expo / React Native)

```bash
cd mobile
cp .env.example .env.local    # Set EXPO_PUBLIC_API_URL to your backend IP
npm install
npx expo start                # Scan QR with Expo Go, or press w for web
```

### ESP32 Firmware

See [`components/iot-esp32/README.md`](components/iot-esp32/README.md) for wiring, setup, and upload instructions.

---

## 🔌 API Endpoints (Summary)

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/readings` | ESP32 posts sensor data |
| `GET` | `/api/readings/latest` | Frontend polls live reading |
| `GET` | `/api/readings/history?limit=N` | Frontend fetches history |

Full field definitions → [`integration/api-contract.md`](integration/api-contract.md)

---

## 👥 Team Collaboration

- **Pasindu** → `components/iot-esp32/`, `mobile/`, `docs/hardware/`
- **Backend member** → `backend/`, `docs/api-integration.md`
- **ML member** → `components/ml-prediction/`, future backend prediction endpoint

> [!IMPORTANT]
> Do **not** commit `.env` files or real credentials. Use `.env.example` as templates.
> Run `git status` before every commit to verify sensitive files are not staged.

---

## 📄 Documentation Index

| Document | Description |
|---|---|
| [`docs/project-overview.md`](docs/project-overview.md) | Background, goals, scope |
| [`docs/system-architecture.md`](docs/system-architecture.md) | Architecture diagram, data flow |
| [`docs/hardware/components-list.md`](docs/hardware/components-list.md) | Hardware BOM |
| [`docs/hardware/wiring-connections.md`](docs/hardware/wiring-connections.md) | Pin wiring table |
| [`docs/hardware/sensor-calibration.md`](docs/hardware/sensor-calibration.md) | Calibration procedure |
| [`docs/api-integration.md`](docs/api-integration.md) | API usage and payload examples |
| [`integration/api-contract.md`](integration/api-contract.md) | Canonical API contract |
| [`integration/integration-test-plan.md`](integration/integration-test-plan.md) | Cross-component test plan |
| [`docs/testing/test-plan.md`](docs/testing/test-plan.md) | Per-component test plan |
