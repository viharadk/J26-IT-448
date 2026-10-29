# ML Prediction Component

**Status:** 🚧 Not yet implemented — interface specification only  
**Role (future):** Provide short-range flood predictions (e.g., 30-minute water-level forecast) based on historical sensor readings.

---

## Current State

The mobile app displays a "30 min forecast" field with a demo placeholder value. No trained ML model exists yet. This document defines the interface that the ML component must implement when it is developed, so it can be integrated without breaking existing endpoints.

---

## Proposed Integration Points

### Option A — ML Service Provides Predictions Directly to Backend

```
[ML Service] ──POST /api/predictions──► [Backend API]
                                              │
                                    stores in MongoDB
                                              │
                                   GET /api/readings/latest
                                              │
                                        [Mobile App]
```

The backend would add a `prediction01` / `prediction02` field to the `/api/readings/latest` response.

### Option B — ML Service Exposes Its Own Endpoint

```
[Mobile App] ──GET /api/predict?location=01──► [ML Service]
```

The mobile app queries the ML service independently.

> **Recommended:** Option A, so the mobile app only needs one base URL and the backend acts as the single source of truth.

---

## Required Output Format (Option A)

The ML component should POST to a new endpoint on the backend (to be defined), providing:

```json
{
  "prediction01": 115.3,
  "prediction02": 108.7,
  "horizon_minutes": 30,
  "confidence": 0.82,
  "predictedAt": "2026-10-28T12:00:00.000Z"
}
```

| Field | Type | Unit | Description |
|---|---|---|---|
| `prediction01` | number | cm | Predicted water level at Location 01 in N minutes |
| `prediction02` | number | cm | Predicted water level at Location 02 in N minutes |
| `horizon_minutes` | number | minutes | Forecast horizon |
| `confidence` | number | 0–1 | Model confidence score |
| `predictedAt` | ISO string | — | Timestamp of prediction |

---

## Input Data Available

The ML model can consume readings from `GET /api/readings/history`:

| Field | Description |
|---|---|
| `waterLevel01` | Water level in cm — Location 01 |
| `waterLevel02` | Water level in cm — Location 02 |
| `location01` | Raw distance in cm — Sensor 1 |
| `location02` | Raw distance in cm — Sensor 2 |
| `receivedAt` | ISO 8601 timestamp (UTC) |

MongoDB stores up to 30 days of readings, saved approximately once per minute.

---

## Integration Requirements for ML Member

1. **Do not modify existing API routes** (`/api/readings/latest`, `/api/readings/history`, `/api/readings` POST). Add a new endpoint (e.g., `/api/predictions`) in coordination with the backend member.
2. **Coordinate field names** with the backend and mobile members before implementation so `index.tsx` can consume `prediction01/02` from the API instead of the demo placeholder.
3. **Keep predictions optional** — the app must degrade gracefully when no prediction is available (show "demo" label, as it does now).
4. **Document your model** — add model training code, requirements, and usage to this directory.

---

## Placeholder Directory

When the ML component is implemented, place files here:

```
components/ml-prediction/
├── README.md                  ← This file
├── model/                     ← Trained model artifacts (.pkl, .h5, etc.)
├── training/                  ← Training scripts and notebooks
├── service/                   ← Prediction service code (Flask/FastAPI)
├── requirements.txt           ← Python dependencies
└── .env.example               ← Environment variables for the ML service
```

