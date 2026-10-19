require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.log("MONGODB_URI is missing. Add it to the .env file.");
} else {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log("MongoDB connected");
    })
    .catch((err) => {
      console.log(`MongoDB connection failed: ${err.message}`);
    });
}

// Reading Schema & Model
const readingSchema = new mongoose.Schema(
  {
    deviceId: { type: String },
    location01: { type: Number, default: null },
    location02: { type: Number, default: null },
    waterLevel01: { type: Number, default: null },
    waterLevel02: { type: Number, default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { collection: "readings" }
);

readingSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 }
);

const Reading = mongoose.model("Reading", readingSchema);

const SENSOR_HEIGHT_CM = { location01: 200, location02: 200 };

function toWaterLevel(distance, sensorHeight) {
  if (typeof distance !== "number") return null;
  const level = sensorHeight - distance;
  return Math.max(0, Math.min(sensorHeight, Number(level.toFixed(2))));
}

// Latest sensor reading (kept in memory)
let latestReading = null;
let lastSavedAt = 0;
const SAVE_INTERVAL_MS = 60 * 1000;

// Home API
app.get("/", (req, res) => {
  res.json({
    message: "River Water Monitoring API is running",
  });
});

// ESP32 sends sensor readings here
app.post("/api/readings", (req, res) => {
  console.log("Sensor data received:", req.body);

  latestReading = {
    ...req.body,
    waterLevel01: toWaterLevel(req.body.location01, SENSOR_HEIGHT_CM.location01),
    waterLevel02: toWaterLevel(req.body.location02, SENSOR_HEIGHT_CM.location02),
    receivedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    message: "Sensor readings received successfully",
  });

  const now = Date.now();
  if (mongoose.connection.readyState === 1 && now - lastSavedAt >= SAVE_INTERVAL_MS) {
    lastSavedAt = now;
    Reading.create({
      deviceId: latestReading.deviceId,
      location01: latestReading.location01 ?? null,
      location02: latestReading.location02 ?? null,
      waterLevel01: latestReading.waterLevel01 ?? null,
      waterLevel02: latestReading.waterLevel02 ?? null,
      receivedAt: latestReading.receivedAt,
    }).catch((err) => {
      console.log(`Failed to save reading: ${err.message}`);
    });
  }
});

// Frontend gets the latest reading here
app.get("/api/readings/latest", async (req, res) => {
  if (latestReading) {
    return res.json(latestReading);
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const reading = await Reading.findOne()
        .sort({ receivedAt: -1 })
        .lean();
      if (reading) {
        return res.json(reading);
      }
    } catch (err) {
      console.log(`Failed to fetch latest reading: ${err.message}`);
    }
  }

  return res.status(404).json({
    message: "No sensor readings received yet",
  });
});

// History endpoint for sensor readings
app.get("/api/readings/history", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "Database not connected",
    });
  }

  let limit = 100;
  if (req.query.limit !== undefined) {
    const parsed = parseInt(req.query.limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 1000);
    }
  }

  try {
    const readings = await Reading.find()
      .sort({ receivedAt: -1 })
      .limit(limit)
      .select("-__v")
      .lean();

    res.json(readings);
  } catch (err) {
    console.log(`Failed to fetch reading history: ${err.message}`);
    res.status(500).json({
      message: `Failed to fetch reading history: ${err.message}`,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});