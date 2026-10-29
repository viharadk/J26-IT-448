# Wiring Connections — ESP32 + JSN-SR04T (×2)

## JSN-SR04T Pin Description

| Pin | Label | Function |
|---|---|---|
| 1 | VCC | Power supply (5 V) |
| 2 | GND | Ground |
| 3 | TRIG | Trigger input (from ESP32 GPIO) |
| 4 | ECHO | Echo output (to ESP32 GPIO) — **3.3 V compatible** |

> **Note:** The JSN-SR04T ECHO pin outputs 3.3 V on most modules, making it safe to connect directly to ESP32 GPIO pins. Verify your specific module's datasheet. If the echo is 5 V, use a voltage divider (10 kΩ / 20 kΩ) to protect the ESP32.

---

## Wiring Table — Sensor 1 (Location 01)

| JSN-SR04T Pin | ESP32 GPIO | Notes |
|---|---|---|
| VCC | 5 V / VIN | Use the 5 V output on your ESP32 dev board |
| GND | GND | Common ground |
| TRIG | GPIO 5 | Trigger pin (configurable in firmware) |
| ECHO | GPIO 18 | Echo pin (configurable in firmware) |

## Wiring Table — Sensor 2 (Location 02)

| JSN-SR04T Pin | ESP32 GPIO | Notes |
|---|---|---|
| VCC | 5 V / VIN | Shared with Sensor 1 |
| GND | GND | Common ground |
| TRIG | GPIO 19 | Trigger pin (configurable in firmware) |
| ECHO | GPIO 21 | Echo pin (configurable in firmware) |

---

## Wiring Diagram (ASCII)

```
                        ┌─────────────────────┐
                        │       ESP32          │
                        │                      │
  JSN-SR04T #1          │  GPIO 5  ──────────► │ TRIG ─► Sensor 1
  (Location 01)         │  GPIO 18 ◄────────── │ ECHO ◄─ Sensor 1
                        │                      │
  JSN-SR04T #2          │  GPIO 19 ──────────► │ TRIG ─► Sensor 2
  (Location 02)         │  GPIO 21 ◄────────── │ ECHO ◄─ Sensor 2
                        │                      │
  Power                 │  5V  ──────────────► │ VCC (both sensors)
                        │  GND ──────────────► │ GND (both sensors)
                        └─────────────────────┘
```

---

## Pin Configuration in Firmware

Update these constants in your firmware source file if you use different GPIO pins:

```cpp
// Sensor 1 — Location 01
const int TRIG_PIN_1 = 5;
const int ECHO_PIN_1 = 18;

// Sensor 2 — Location 02
const int TRIG_PIN_2 = 19;
const int ECHO_PIN_2 = 21;
```

---

## Safety Notes

- Do not reverse VCC and GND — this will damage the sensor.
- Ensure the ESP32 and sensors share a common GND.
- Keep sensor cables away from sources of electrical interference.
- The JSN-SR04T is waterproof at the sensor head; the PCB and wires should be protected from water.

