# Integration Test Plan — Cross-Component

**Project:** J26-IT-448 — Kelani Guard System  
**Type:** Manual end-to-end integration testing

---

## Prerequisites

Before running integration tests:
- [ ] Backend is running: `node server.js` in `backend/`
- [ ] MongoDB Atlas is connected (check console for "MongoDB connected")
- [ ] ESP32 is powered, firmware uploaded, connected to same Wi-Fi as backend laptop
- [ ] Mobile app is running: `npx expo start` in `mobile/`
- [ ] `EXPO_PUBLIC_API_URL` in `mobile/.env.local` points to the laptop's LAN IP

---

## 1. ESP32 → Backend Integration

| ID | Test | Steps | Expected |
|---|---|---|---|
| INT-01 | ESP32 reaches backend | Power on ESP32; watch backend console | Log: `"Sensor data received: { deviceId: ..., location01: ..., location02: ... }"` |
| INT-02 | POST payload is correctly formed | Check backend console output | Both `location01` and `location02` are numeric (not null, not string) |
| INT-03 | Water level computed correctly | Call `GET /api/readings/latest`; check `waterLevel01` | `waterLevel01 ≈ 200 − location01` (within ±0.1 cm) |
| INT-04 | Risk level computed correctly | Set sensor distance ≈ 100 cm (water level 100 cm = 50%) | `riskLevel01 = "WATCH"` |
| INT-05 | MongoDB persistence | Wait 60+ s after first POST; query `GET /api/readings/history?limit=1` | At least 1 reading returned from database |

---

## 2. Backend → Mobile Frontend Integration

| ID | Test | Steps | Expected |
|---|---|---|---|
| INT-06 | Mobile app receives live reading | Open Dashboard; observe with backend running | Water level cards show numeric values, LIVE badge visible |
| INT-07 | Risk badge matches backend riskLevel | Check `riskLevel01` from API; observe mobile badge | Badge colour and label match (NORMAL/WATCH/WARNING/DANGER) |
| INT-08 | Alert banner triggers at WATCH | API returns `riskLevel01 = "WATCH"` | Yellow alert banner appears below header |
| INT-09 | Alert banner triggers at DANGER | API returns `riskLevel01 = "DANGER"` | Red alert banner with "DANGER" text |
| INT-10 | History chart populated | Open History tab | Chart shows two coloured lines (Loc 01 + Loc 02) |
| INT-11 | Threshold lines on chart | Check `thresholds` from API | Chart draws Watch/Warning/Danger horizontal lines at correct cm values |
| INT-12 | Data table shows correct times | Open History tab; inspect time column | Times shown in Sri Lanka Time (Asia/Colombo, UTC+5:30) |

---

## 3. Full End-to-End (ESP32 → Backend → Mobile)

| ID | Test | Steps | Expected |
|---|---|---|---|
| INT-13 | Live data flow | Start all components; physically move sensor | Mobile app water level changes within ~2–4 seconds |
| INT-14 | Sensor offline detection | Power off ESP32 | After 2–3 polling cycles, backend still returns last reading; app continues showing last value (no crash) |
| INT-15 | Backend restart recovery | Restart `node server.js` | ESP32 continues POSTing; mobile reconnects on next poll; no manual restart needed |
| INT-16 | Mobile app restart recovery | Close and reopen the app | App reconnects to backend and shows current reading |

---

## 4. Future: ML → Backend → Mobile Integration

> To be filled in when the ML prediction component is implemented.

| ID | Test | Steps | Expected |
|---|---|---|---|
| INT-ML-01 | ML prediction delivered to backend | TBD | TBD |
| INT-ML-02 | Mobile app shows prediction (not demo value) | TBD | "30 min forecast" shows ML-predicted value, not `0.84 m` placeholder |

---

## 5. Negative / Error Cases

| ID | Test | Steps | Expected |
|---|---|---|---|
| INT-E01 | Backend unreachable | Stop backend; open mobile app | Error banner: "Cannot reach server. Check your Wi-Fi and API_BASE_URL." |
| INT-E02 | MongoDB disconnected | Start backend without valid MONGODB_URI | `GET /api/readings/history` returns 503; History screen shows "Database not connected" |
| INT-E03 | Sensor sends null for one channel | POST `{ "location01": 87.5, "location02": null }` | `waterLevel02 = null`, `riskLevel02 = null`; app shows "No reading" for Location 02 |
| INT-E04 | Invalid POST body | POST `{ "location01": "not-a-number" }` | `waterLevel01 = null` (graceful null, not crash) |

