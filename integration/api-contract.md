# API Contract — Kelani Guard System

**Version:** 1.0 (prototype)  
**Source of truth:** `backend/server.js`  
**Last updated:** 2026-10-28

> [!IMPORTANT]
> All teams must follow this contract. Do not change field names, types, or units without updating this document and coordinating with dependent components.

---

## Base URL

```
http://<BACKEND_HOST>:<PORT>
```

Default port: **3000**. Configured via `PORT` environment variable.

---

## Endpoints

---

### GET /

Health check.

**Response 200:**
```json
{
  "message": "River Water Monitoring API is running"
}
```

---

### POST /api/readings

**Consumer:** ESP32 firmware  
**Action:** Accepts raw ultrasonic sensor distances, computes water levels, stores in memory and persists to MongoDB once per minute.

**Request headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "deviceId": "esp32-kelani-01",
  "location01": 87.5,
  "location02": 92.1
}
```

#### Request Fields

| Field | Type | Unit | Required | Description |
|---|---|---|---|---|
| `deviceId` | string | — | No | Device identifier. Stored as-is in MongoDB. |
| `location01` | number \| null | cm | No | Raw echo distance from Sensor 1 to water surface. |
| `location02` | number \| null | cm | No | Raw echo distance from Sensor 2 to water surface. |

> Fields not listed above are stored on `latestReading` via spread (`...req.body`) but not on the MongoDB document.

**Response 200:**
```json
{
  "success": true,
  "message": "Sensor readings received successfully"
}
```

---

### GET /api/readings/latest

**Consumer:** Mobile app (polled every 2 seconds)  
**Action:** Returns the most recent reading, enriched with computed water levels and risk levels.

**Response 200:**
```json
{
  "deviceId": "esp32-kelani-01",
  "location01": 87.5,
  "location02": 92.1,
  "waterLevel01": 112.5,
  "waterLevel02": 107.9,
  "riskLevel01": "WATCH",
  "riskLevel02": "WATCH",
  "thresholds": {
    "watch": 40,
    "warning": 60,
    "danger": 80
  },
  "receivedAt": "2026-10-28T06:30:00.000Z"
}
```

#### Response Fields

| Field | Type | Unit | Nullable | Description |
|---|---|---|---|---|
| `deviceId` | string | — | No | Device identifier from the ESP32 POST |
| `location01` | number | cm | Yes | Raw distance — Sensor 1 (sensor → water surface) |
| `location02` | number | cm | Yes | Raw distance — Sensor 2 |
| `waterLevel01` | number | cm | Yes | Water level = `200 − location01`, clamped 0–200 |
| `waterLevel02` | number | cm | Yes | Water level = `200 − location02`, clamped 0–200 |
| `riskLevel01` | string | — | Yes | One of `"NORMAL"`, `"WATCH"`, `"WARNING"`, `"DANGER"`, or `null` |
| `riskLevel02` | string | — | Yes | Same as `riskLevel01` for Location 02 |
| `thresholds.watch` | number | % | No | Water-level % of sensor height that triggers WATCH |
| `thresholds.warning` | number | % | No | Same for WARNING |
| `thresholds.danger` | number | % | No | Same for DANGER |
| `receivedAt` | ISO 8601 string | UTC | No | Timestamp when the reading was received by the backend |

**Response 404:** No sensor readings received yet.
```json
{ "message": "No sensor readings received yet" }
```

---

### GET /api/readings/history

**Consumer:** Mobile app (History screen)  
**Action:** Returns historical readings from MongoDB, newest first.

**Query parameters:**

| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | integer | 100 | 1000 | Maximum number of readings to return |

**Response 200:** Array of reading objects.

```json
[
  {
    "_id": "6720ab12cd34ef56gh78ij90",
    "deviceId": "esp32-kelani-01",
    "location01": 87.5,
    "location02": 92.1,
    "waterLevel01": 112.5,
    "waterLevel02": 107.9,
    "riskLevel01": "WATCH",
    "riskLevel02": "WATCH",
    "receivedAt": "2026-10-28T06:30:00.000Z"
  }
]
```

> Note: `thresholds` is **not** included in history responses. `_id` is the MongoDB ObjectId. `__v` is excluded.

**Response 503:** MongoDB not connected.
```json
{ "message": "Database not connected" }
```

**Response 500:** Query failure.
```json
{ "message": "Failed to fetch reading history: <error details>" }
```

---

## Risk Level Computation

```
waterLevel_cm  = SENSOR_HEIGHT_CM − distance_cm
percent        = (waterLevel_cm / SENSOR_HEIGHT_CM) × 100

NORMAL  : percent < 40
WATCH   : percent ≥ 40
WARNING : percent ≥ 60
DANGER  : percent ≥ 80
```

`SENSOR_HEIGHT_CM` = **200** cm for both channels (defined in `server.js` and `mobile/src/constants/config.ts`).

> When `waterLevel` is `null` (sensor had no reading), `riskLevel` is also `null`.

---

## Data Storage

- **Collection:** `readings`
- **Database:** configured by `MONGODB_URI` environment variable
- **TTL index:** Documents auto-expire 30 days after `receivedAt`
- **Save frequency:** One reading per minute (when MongoDB is connected and ≥ 60 s since last save)

---

## Future Fields (Reserved — Not Yet Implemented)

The following fields are placeholders for future ML integration. They do not exist in current responses.

| Field | Type | Description |
|---|---|---|
| `prediction01` | number \| null | Predicted water level (cm) at Location 01 in N minutes |
| `prediction02` | number \| null | Predicted water level (cm) at Location 02 in N minutes |
| `predictionHorizon` | number | Forecast horizon in minutes |
| `predictionConfidence` | number | ML model confidence (0–1) |

