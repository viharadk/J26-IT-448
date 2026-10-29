# API Integration Guide

This document explains how to interact with the Kelani Guard backend API from any client — including the ESP32 firmware, the mobile app, or future ML services.

For the canonical field-by-field reference, see [`../integration/api-contract.md`](../integration/api-contract.md).

---

## Base URL

The backend runs on the developer's machine during prototyping:

```
http://<LAPTOP_LAN_IP>:3000
```

- Find your LAN IP on Windows: `ipconfig` → look for **IPv4 Address** under the Wi-Fi adapter.
- Do **not** use `localhost` from a physical phone or ESP32 — it refers to the device itself.
- Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to this URL.
- Set `API_BASE_URL` in ESP32 firmware to this URL.

---

## Endpoints

### GET /

Health check. Returns a JSON message confirming the server is running.

```bash
curl http://192.168.1.42:3000/
# → { "message": "River Water Monitoring API is running" }
```

---

### POST /api/readings

**Used by: ESP32 firmware**

The ESP32 posts sensor readings to this endpoint.

**Request body (JSON):**
```json
{
  "deviceId": "esp32-kelani-01",
  "location01": 87.5,
  "location02": 92.1
}
```

| Field | Type | Description |
|---|---|---|
| `deviceId` | string | Unique identifier for the ESP32 device |
| `location01` | number | Raw ultrasonic distance in cm for Sensor 1 |
| `location02` | number | Raw ultrasonic distance in cm for Sensor 2 |

**Success response (200):**
```json
{
  "success": true,
  "message": "Sensor readings received successfully"
}
```

**Notes:**
- The backend computes `waterLevel01 = 200 − location01` (and `location02`) internally.
- A reading is persisted to MongoDB once per minute; all intermediate readings are kept in memory.

---

### GET /api/readings/latest

**Used by: Mobile app (polls every 2 s)**

Returns the most recent sensor reading, enriched with computed water levels and risk levels.

**Response (200):**
```json
{
  "deviceId": "esp32-kelani-01",
  "location01": 87.5,
  "location02": 92.1,
  "waterLevel01": 112.5,
  "waterLevel02": 107.9,
  "riskLevel01": "WATCH",
  "riskLevel02": "WATCH",
  "thresholds": { "watch": 40, "warning": 60, "danger": 80 },
  "receivedAt": "2026-10-28T12:00:00.000Z"
}
```

**Response (404):** No readings received yet.

---

### GET /api/readings/history?limit=N

**Used by: Mobile app (History screen)**

Returns up to `N` historical readings (default 100, max 1000), newest first.

**Query parameters:**
| Param | Type | Default | Max |
|---|---|---|---|
| `limit` | integer | 100 | 1000 |

**Response (200):** Array of reading objects, same shape as `/api/readings/latest` but without `thresholds`.

**Response (503):** Database not connected.

---

## Risk Level System

Risk levels are computed server-side based on what percentage of `SENSOR_HEIGHT_CM` (200 cm) the water level occupies:

| Level | Threshold | Water level (200 cm sensor) |
|---|---|---|
| `NORMAL` | < 40% | < 80 cm |
| `WATCH` | ≥ 40% | ≥ 80 cm |
| `WARNING` | ≥ 60% | ≥ 120 cm |
| `DANGER` | ≥ 80% | ≥ 160 cm |

These thresholds are pilot values and are returned in `thresholds` so the frontend can draw matching lines on the history chart.

---

## Error Handling

| HTTP Status | Meaning | Client action |
|---|---|---|
| 200 | Success | Process response |
| 404 | No readings yet | Show "Waiting for sensor data…" |
| 503 | MongoDB not connected | Show "Database not connected" |
| 500 | Internal server error | Show error message, retry later |

Network errors (no response): Show "Cannot reach server. Check Wi-Fi and API_BASE_URL."

