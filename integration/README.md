# Integration — Overview

This directory defines the shared contracts and test plans that allow all components (IoT firmware, backend API, mobile frontend, ML prediction) to integrate without breaking each other.

---

## Component Integration Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    Integration Boundaries                        │
│                                                                  │
│  ESP32 Firmware                                                  │
│    └──► POST /api/readings  ──────────────────►  Backend API     │
│                                                      │           │
│  Mobile Frontend                                     │           │
│    └──► GET /api/readings/latest  ◄─────────────────┘           │
│    └──► GET /api/readings/history?limit=N  ◄────────┘           │
│                                                                  │
│  ML Prediction (future)                                          │
│    └──► POST /api/predictions (TBD)  ──────────► Backend API    │
│                                                      │           │
│  Mobile Frontend                                     │           │
│    └──► GET /api/readings/latest  ◄──── (prediction01/02 added) │
└──────────────────────────────────────────────────────────────────┘
```

---

## Documents in This Directory

| Document | Description |
|---|---|
| [`api-contract.md`](api-contract.md) | Canonical field-level API contract — all teams must respect this |
| [`integration-test-plan.md`](integration-test-plan.md) | Cross-component integration tests |

---

## Integration Rules

1. **Do not rename existing API fields** without a documented compatibility plan in `api-contract.md` and coordination with all affected components.
2. **New endpoints should be additive** — do not remove or redefine existing routes.
3. **Null handling:** All numeric sensor fields (`location01`, `location02`, `waterLevel01`, `waterLevel02`) can be `null` when a sensor has no reading. All consumers must handle this.
4. **Risk levels** (`riskLevel01`, `riskLevel02`) are computed by the backend and are optional in the response. Clients must fall back to client-side computation when absent.
5. **`thresholds`** object is only present on `GET /api/readings/latest`. It is not stored in MongoDB.

