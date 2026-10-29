# Sensor Calibration — JSN-SR04T Ultrasonic (200 cm Setup)

## Overview

The JSN-SR04T measures the distance from the sensor face to the target (water surface). The system converts this distance to a **water level** using:

```
water_level_cm = SENSOR_HEIGHT_CM − distance_cm
```

Where `SENSOR_HEIGHT_CM = 200` (the mounting height of the sensor above the lowest expected water surface in centimetres).

---

## Pre-Calibration Checklist

- [ ] Sensor is mounted rigidly — vibration causes inconsistent readings.
- [ ] Sensor face points directly downward (perpendicular to water surface).
- [ ] No obstacles between sensor face and water.
- [ ] Cable connections are secure (VCC, GND, TRIG, ECHO).
- [ ] ESP32 is powered and the firmware is running.
- [ ] Backend is running and reachable on the same LAN.

---

## Step-by-Step Calibration Procedure

### Step 1 — Measure Physical Height
Measure the actual vertical distance from the **sensor face** to the **lowest expected water surface** using a measuring tape.
Record this value as `H_physical` (in cm).

### Step 2 — Update SENSOR_HEIGHT_CM
If `H_physical ≠ 200`, update the constant in two places:

**Backend** (`backend/server.js`):
```js
const SENSOR_HEIGHT_CM = { location01: 200, location02: 200 };
// Change both values to H_physical
```

**Mobile app** (`mobile/src/constants/config.ts`):
```ts
export const SENSOR_HEIGHT_CM = 200;
// Change to H_physical
```

> Both values **must be kept in sync**. The backend uses this for risk-level computation; the frontend uses it for the progress bar and client-side fallback calculation.

### Step 3 — Verify Raw Distance Reading
With the sensor running and the backend API live, check the raw `location01` and `location02` fields in the API response:

```bash
curl http://<BACKEND_IP>:3000/api/readings/latest
```

Compare `location01` / `location02` (sensor-to-surface distance in cm) against a physical measurement with a tape measure. They should agree within ±2–3 cm.

### Step 4 — Verify Water Level Calculation
Check `waterLevel01` / `waterLevel02` in the API response. Confirm:

```
waterLevel01 ≈ SENSOR_HEIGHT_CM − location01
```

### Step 5 — Verify Risk Level Display
The mobile dashboard should show the correct risk badge:
- NORMAL (green) when water is low
- WATCH (yellow) at ≥ 40% of sensor height (≥ 80 cm for 200 cm setup)
- WARNING (orange) at ≥ 60% (≥ 120 cm)
- DANGER (red) at ≥ 80% (≥ 160 cm)

---

## Sensor Filtering (Firmware Recommendation)

The JSN-SR04T can return occasional spurious readings. Recommended firmware-side filtering:

1. **Median filter** over 5 consecutive readings — discard the highest and lowest, average the remaining 3.
2. **Range clamp** — discard readings outside `[5 cm, SENSOR_HEIGHT_CM + 20 cm]`.
3. **Timeout guard** — if the ECHO pulse takes longer than `SENSOR_HEIGHT_CM * 58 µs + 10 ms`, treat as "no reading" (null).

---

## Two-Channel Notes

Both sensors are currently connected to the **same ESP32 board**. Each is read independently using its own TRIG/ECHO pin pair. They are designated:

| Channel | Firmware variable | API field | App label |
|---|---|---|---|
| Sensor 1 | `location01` | `location01` | Location 01 / Hanwella Station |
| Sensor 2 | `location02` | `location02` | Location 02 / Glencourse Station |

The station names in the app are for prototype demonstration only and do not reflect real geographically separated measurement points.

