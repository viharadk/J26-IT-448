# Hardware Components List

## Microcontroller

| Component | Specification | Quantity |
|---|---|---|
| ESP32 Development Board | ESP32-WROOM-32 (or equivalent) | 1 |

## Ultrasonic Sensors

| Component | Model | Quantity | Purpose |
|---|---|---|---|
| Waterproof ultrasonic sensor | JSN-SR04T | 2 | Distance-to-water measurement |

> **Note:** Both sensors are connected to the **same ESP32** in the prototype. They read two independent distances:
> - `location01` → Sensor 1 reading (mapped to Location 01 / Hanwella Station in the app)
> - `location02` → Sensor 2 reading (mapped to Location 02 / Glencourse Station in the app)

## Power Supply

| Component | Specification | Quantity |
|---|---|---|
| USB power supply / power bank | 5 V, ≥ 1 A | 1 |
| USB cable | Micro-USB or USB-C (match your ESP32 board) | 1 |

## Connectivity

| Component | Notes |
|---|---|
| Wi-Fi | ESP32 built-in (2.4 GHz 802.11 b/g/n) |
| Access Point | Local Wi-Fi router (same LAN as the laptop running the backend) |

## Miscellaneous

| Component | Purpose |
|---|---|
| Breadboard | Prototyping connections |
| Jumper wires (male-to-male, male-to-female) | Wiring sensors to ESP32 |
| USB-to-TTL programmer (optional) | Firmware flashing if no onboard USB |

---

## Software Tools

| Tool | Purpose | Download |
|---|---|---|
| Arduino IDE 2.x | Firmware development and upload | https://www.arduino.cc/en/software |
| ESP32 Board Support Package | Add ESP32 to Arduino IDE | Boards Manager → `esp32` by Espressif |
| CP210x / CH340 USB driver | USB-to-serial chip on most ESP32 boards | From chip manufacturer |

---

## Sensor Height Assumption

Both JSN-SR04T sensors are mounted **200 cm** above the lowest expected water surface. This value is hardcoded as `SENSOR_HEIGHT_CM = 200` in both the backend (`server.js`) and the mobile app (`src/constants/config.ts`).

If the actual mounting height differs, update this constant in **both** places and re-calibrate the risk thresholds accordingly.

