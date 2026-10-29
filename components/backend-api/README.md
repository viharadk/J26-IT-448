# Backend API Component

**Technology:** Node.js · Express 5 · MongoDB Atlas (Mongoose)  
**Role:** Receive sensor readings from the ESP32, store historical data, and serve live + historical readings to the mobile app.

---

## Source Location

```
backend/
├── server.js           ← All routes, schema, and risk logic (single file)
├── package.json
├── package-lock.json
├── .env                ← NOT committed (contains real MongoDB URI)
└── .env.example        ← Template — copy and fill in
```

---

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and fill in:
# MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
# PORT=3000
```

### 3. Start the Server

```bash
node server.js
# → "Backend running on port 3000"
# → "MongoDB connected"   (if MONGODB_URI is valid)
```

> **Note:** There is no `npm start` script currently. Run with `node server.js` directly.

---

## API Endpoints

| Method | Route | Used By | Description |
|---|---|---|---|
| `GET` | `/` | Health check | Returns API running message |
| `POST` | `/api/readings` | ESP32 | Receives sensor data, computes water level |
| `GET` | `/api/readings/latest` | Mobile app | Returns in-memory latest reading with risk levels |
| `GET` | `/api/readings/history?limit=N` | Mobile app | Returns up to N historical readings from MongoDB |

Full field definitions → [`../../integration/api-contract.md`](../../integration/api-contract.md)

---

## Database

- **Provider:** MongoDB Atlas (M0 free tier)
- **Collection:** `readings`
- **TTL index:** Documents automatically expire after 30 days (`receivedAt` field)
- **Save interval:** One reading saved to MongoDB per minute; all intermediate readings are kept in memory for live polling

---

## Risk Level Logic

```
waterLevel_cm = SENSOR_HEIGHT_CM − distance_cm

% = (waterLevel_cm / SENSOR_HEIGHT_CM) × 100

NORMAL  : % < 40
WATCH   : % ≥ 40
WARNING : % ≥ 60
DANGER  : % ≥ 80
```

`SENSOR_HEIGHT_CM` is currently `{ location01: 200, location02: 200 }` in `server.js`.

---

## Known Issues (Pre-existing)

1. `"main"` field in `package.json` is `"index.js"` but entry point is `server.js`. `node .` fails; use `node server.js`.
2. No `start` script in `package.json`.

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `PORT` | Server port | `3000` |

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| express | ^5.3.0 | HTTP framework |
| mongoose | ^9.11.2 | MongoDB ODM |
| cors | ^2.8.6 | Cross-Origin Resource Sharing |
| dotenv | ^18.0.8 | Load `.env` file |

