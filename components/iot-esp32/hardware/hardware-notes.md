# Hardware Notes — ESP32 + JSN-SR04T

Quick reference for the ESP32 hardware setup used in this prototype.

---

## ESP32 Pinout Reference (Common)

| Function | Typical GPIO | Notes |
|---|---|---|
| Sensor 1 TRIG | GPIO 5 | Output |
| Sensor 1 ECHO | GPIO 18 | Input |
| Sensor 2 TRIG | GPIO 19 | Output |
| Sensor 2 ECHO | GPIO 21 | Input |
| 5 V out | VIN / 5V pin | Powers both sensors |
| Ground | GND | Common ground |

---

## JSN-SR04T — Key Specifications

| Specification | Value |
|---|---|
| Supply voltage | 5 V DC |
| Trigger pulse width | 10 µs |
| Effective range | 20 cm – 600 cm |
| Resolution | ~0.3 cm |
| Beam angle | ~15° |
| Cable length | ~2.5 m (standard) |

---

## Distance Formula

```
distance_cm = (echo_pulse_duration_µs / 2) / 29.1
```

Or using Arduino's `pulseIn()` helper in a convenience constant:
```cpp
float distance_cm = pulseIn(ECHO_PIN, HIGH) / 58.0;
```

---

## Common Issues

| Issue | Likely Cause | Fix |
|---|---|---|
| Reading always 0 | ECHO and TRIG swapped | Check wiring |
| Readings erratic / noisy | No filtering, power noise | Add 100 µF cap on VCC; apply median filter |
| Reading always max range | Sensor not pointed at water surface | Adjust angle; check for obstacles |
| Upload fails | Wrong COM port or board | Tools → Port; try pressing BOOT button on ESP32 during upload |
| Wi-Fi won't connect | Wrong SSID/password | Double-check credentials; use 2.4 GHz only |
| HTTP POST fails | Backend not running or wrong IP | Check `API_BASE_URL`; confirm backend is up |

