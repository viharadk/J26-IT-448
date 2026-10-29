# Project Overview — Kelani Guard System

**Group:** J26-IT-448 · SLIIT Research Project  
**System:** IoT-Based River Water Monitoring and Flood Early-Warning System

---

## Background

The Kelani River (ගලන් ගග) in Sri Lanka is historically prone to seasonal flooding, causing significant damage to communities in its catchment area. Reliable, real-time water-level data and early-warning capabilities are critical for reducing flood impact.

This project develops a low-cost, IoT-based monitoring prototype that:
1. Measures river water levels at prototype sensor locations using ultrasonic sensors.
2. Streams readings to a cloud-connected backend API in real time.
3. Presents live water-level data, historical trends, and risk-level alerts through a mobile app.
4. Lays the groundwork for machine-learning flood-prediction integration.

---

## Scope (Research Prototype)

| In Scope | Out of Scope |
|---|---|
| Two-channel ultrasonic sensor readings (ESP32) | Deployment at a real river site |
| REST API backend with MongoDB storage | Production-grade security hardening |
| React Native mobile dashboard (iOS, Android, Web) | Official government flood-warning integration |
| Risk-level classification (NORMAL / WATCH / WARNING / DANGER) | Certified engineering measurements |
| Historical readings chart (1 h / 6 h / 24 h) | Multi-device sensor networks |
| ML prediction interface definition | Trained ML model (future phase) |

---

## Team Members & Component Ownership

| Component | Responsible Member |
|---|---|
| IoT ESP32 firmware & hardware | Pasindu |
| Mobile frontend (React Native / Expo) | Pasindu |
| Backend API & MongoDB database | Backend member |
| Machine Learning prediction | ML member |

---

## Key Technical Decisions

- **Sensor height:** Both sensors are mounted at **200 cm** above the water surface. Water level = `200 − sensor_distance_cm`.
- **Two sensor channels:** `location01` and `location02` represent **Location 01** and **Location 02** respectively. In the prototype, both sensors are co-located; they are referred to as Hanwella Station and Glencourse Station in the app for demonstration purposes.
- **Risk thresholds (pilot values):** WATCH ≥ 40%, WARNING ≥ 60%, DANGER ≥ 80% of sensor height. These are configurable via backend and served to the frontend.
- **Save interval:** The backend saves one reading to MongoDB per minute; all intermediate readings are kept in memory for live polling.
- **Polling interval:** The mobile app polls `/api/readings/latest` every 2 seconds.

---

## Prototype Disclaimer

> Risk thresholds and station coordinates used in this prototype are for research and demonstration purposes only. They do not represent official flood-warning levels or verified geospatial station positions.

