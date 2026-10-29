# Test Plan — Per-Component

**Project:** J26-IT-448 — Kelani Guard System  
**Type:** Manual + semi-automated prototype testing

---

## 1. IoT / ESP32 Component Tests

### 1.1 Sensor Reading Test
| ID | Test | Expected | Method |
|---|---|---|---|
| ESP-01 | Power on ESP32 with both sensors connected | No startup crash; serial monitor shows readings | Serial monitor (Arduino IDE) |
| ESP-02 | Sensor 1 — hold hand at known distance (e.g., 50 cm) | `location01` reported ≈ 50 ± 3 cm | Serial monitor |
| ESP-03 | Sensor 2 — same at 80 cm | `location02` reported ≈ 80 ± 3 cm | Serial monitor |
| ESP-04 | Both sensors active simultaneously | No cross-talk; both values stable | Serial monitor |

### 1.2 Wi-Fi and API POST Test
| ID | Test | Expected | Method |
|---|---|---|---|
| ESP-05 | ESP32 connects to configured Wi-Fi SSID | Serial shows "WiFi connected" | Serial monitor |
| ESP-06 | ESP32 POSTs to `/api/readings` | Backend logs "Sensor data received: …" | Serial monitor + backend logs |
| ESP-07 | Correct JSON payload fields (`deviceId`, `location01`, `location02`) | Backend receives and stores correctly | `GET /api/readings/latest` |
| ESP-08 | Wi-Fi disconnect and reconnect | ESP32 reconnects and resumes posting | Physical Wi-Fi toggle |

---

## 2. Mobile Frontend Component Tests

### 2.1 Dashboard Screen
| ID | Test | Expected | Method |
|---|---|---|---|
| MOB-01 | App loads with backend offline | Demo fallback values shown; error banner displayed | Stop backend, open app |
| MOB-02 | App connects to live backend | Live water level values appear; LIVE badge shown | Start backend + ESP32 |
| MOB-03 | Pull-to-refresh triggers visual feedback | Spinner appears briefly | Pull down on dashboard |
| MOB-04 | Risk badge reflects correct level for current water level | Badge matches backend `riskLevel01/02` | Vary sensor distance |
| MOB-05 | Alert banner appears when risk ≥ WATCH | Banner shows with correct message and colour | Raise sensor reading artificially |
| MOB-06 | Sensor online/offline dot reflects `sensorOnline` | Green = online, red = offline | Remove sensor, check dot |

### 2.2 Map Component
| ID | Test | Expected | Method |
|---|---|---|---|
| MOB-07 | Map renders on Android/iOS (native) | `react-native-maps` shows map with two markers | Expo Go on device |
| MOB-08 | Map renders on Web | Web fallback (`WaterMap.web.tsx`) shows location list | `npx expo start --web` |
| MOB-09 | Marker tooltip shows water level and status | Tapping marker shows station name and water level | Tap marker on device |

### 2.3 History Screen
| ID | Test | Expected | Method |
|---|---|---|---|
| MOB-10 | History loads from backend | Chart and table populated | Open History tab |
| MOB-11 | Time range selector (1h/6h/24h) changes data | Different number of readings returned | Tap each range tab |
| MOB-12 | Tapping a chart point shows tooltip | Tooltip card shows time, Loc 01, Loc 02 values | Tap SVG chart |
| MOB-13 | History with no data shows empty state | "No history yet" message with retry button | Fresh MongoDB instance |

### 2.4 General / Navigation
| ID | Test | Expected | Method |
|---|---|---|---|
| MOB-14 | Left slider nav opens and closes | Animated panel slides in/out | Tap hamburger handle |
| MOB-15 | Dark mode toggle works | Theme switches across all screens | Settings → Dark Mode |
| MOB-16 | TypeScript build passes | `npx tsc --noEmit` exits 0 | Terminal |

---

## 3. Backend API Component Tests

| ID | Test | Expected | Method |
|---|---|---|---|
| BE-01 | `GET /` returns health message | `{"message": "River Water Monitoring API is running"}` | `curl` or Postman |
| BE-02 | `POST /api/readings` with valid body | `{"success": true, …}` | curl / Postman |
| BE-03 | `GET /api/readings/latest` after POST | Returns enriched reading with `waterLevel01/02` and `riskLevel01/02` | curl |
| BE-04 | `GET /api/readings/history?limit=5` | Returns array of ≤ 5 readings | curl |
| BE-05 | Risk level computation — distance 50 cm (water level 150 cm = 75%) | `riskLevel01 = "WARNING"` | curl |
| BE-06 | Risk level computation — distance 20 cm (water level 180 cm = 90%) | `riskLevel01 = "DANGER"` | curl |
| BE-07 | Backend returns 404 when no readings received | Status 404, `"No sensor readings received yet"` | curl before any POST |

---

## 4. Tests Not Run / Not Applicable

| ID | Reason |
|---|---|
| Unit tests (Jest) | Not configured in project — requires separate setup |
| E2E tests (Detox) | Not configured — future work |
| ML prediction tests | ML component not implemented yet |
| Load / stress tests | Out of scope for prototype |

