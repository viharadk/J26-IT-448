# IoT / ESP32 Component

**Owner:** Pasindu  
**Technology:** ESP32 microcontroller · JSN-SR04T waterproof ultrasonic sensors · Arduino SDK  
**Role:** Read water-level distances from two sensor channels and POST them to the backend API.

---

## What This Component Does

1. Initialises two JSN-SR04T ultrasonic sensors on separate GPIO pin pairs.
2. Fires a 10 µs trigger pulse and measures the echo pulse duration to calculate distance in cm.
3. Applies a median filter to reduce sensor noise.
4. Builds a JSON payload and sends it to the backend via HTTP POST over Wi-Fi.
5. Repeats at a configurable interval.

---

## Directory Layout

```
components/iot-esp32/
├── README.md                  ← This file
├── firmware/                  ← ESP32 Arduino source files (.ino / .cpp / .h)
│   └── (firmware files go here — see setup below)
├── hardware/
│   └── hardware-notes.md      ← General hardware reference
└── tests/                     ← Manual test scripts / calibration sketches
```

> **Note:** No firmware has been committed yet. Add your `.ino` or PlatformIO project files inside `firmware/`.

---

## Hardware Setup

See the `docs/hardware/` directory for detailed information:
- [`../../docs/hardware/components-list.md`](../../docs/hardware/components-list.md) — Full BOM
- [`../../docs/hardware/wiring-connections.md`](../../docs/hardware/wiring-connections.md) — GPIO pin table and wiring diagram
- [`../../docs/hardware/sensor-calibration.md`](../../docs/hardware/sensor-calibration.md) — Calibration procedure

---

## Firmware Development Setup

### Prerequisites
- Arduino IDE 2.x (https://www.arduino.cc/en/software)
- ESP32 board package: Boards Manager → search `esp32` → install by **Espressif Systems**
- No additional libraries required for basic `pulseIn()` distance reading

### Wi-Fi and API Configuration

In your firmware, configure:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL  = "http://192.168.x.x:3000";  // Your backend IP
const char* DEVICE_ID     = "esp32-kelani-01";
```

> Never commit real Wi-Fi passwords or IP addresses to Git. Use a separate config header excluded via `.gitignore`, or use compile-time preprocessor definitions.

### Uploading Firmware
1. Connect ESP32 via USB.
2. In Arduino IDE: **Tools → Board → ESP32 Dev Module** (or your exact board).
3. Select the correct **Port**.
4. Click **Upload**.

---

## API Payload Format

The firmware sends a JSON POST body to `POST /api/readings`:

```json
{
  "deviceId": "esp32-kelani-01",
  "location01": 87.5,
  "location02": 92.1
}
```

| Field | Type | Unit | Description |
|---|---|---|---|
| `deviceId` | string | — | Unique device identifier |
| `location01` | number | cm | Raw echo distance — Sensor 1 (Location 01) |
| `location02` | number | cm | Raw echo distance — Sensor 2 (Location 02) |

The backend computes `waterLevel = SENSOR_HEIGHT_CM − distance` and risk levels. Do not compute them in firmware.

---

## Two-Channel Channel Assignment

| Channel | Sensor | App Label | Purpose |
|---|---|---|---|
| `location01` | JSN-SR04T #1 (GPIO 5/18) | Location 01 | Prototype channel A |
| `location02` | JSN-SR04T #2 (GPIO 19/21) | Location 02 | Prototype channel B |

Both sensors are on the same ESP32 in the prototype. They are presented as two stations in the mobile app for demonstration only.

---

## Dependencies (Firmware)

| Library | Purpose | Source |
|---|---|---|
| WiFi.h | Wi-Fi connection | Built into ESP32 Arduino core |
| HTTPClient.h | HTTP POST requests | Built into ESP32 Arduino core |
| ArduinoJson (optional) | JSON payload building | https://arduinojson.org |

---

## Integration Requirements

- The backend must be running and reachable on the same LAN.
- `API_BASE_URL` in firmware must match the backend's LAN IP and port.
- The POST body must include `location01` and/or `location02` as numeric values (distance in cm).
- Do not send `waterLevel` fields — the backend computes these.

