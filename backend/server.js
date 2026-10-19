const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const SENSOR_HEIGHT_CM = { location01: 200, location02: 200 };

function toWaterLevel(distance, sensorHeight) {
  if (typeof distance !== "number") return null;
  const level = sensorHeight - distance;
  return Math.max(0, Math.min(sensorHeight, Number(level.toFixed(2))));
}

// Latest sensor reading (kept in memory)
let latestReading = null;

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
});

// Frontend gets the latest reading here
app.get("/api/readings/latest", (req, res) => {
  if (!latestReading) {
    return res.status(404).json({
      message: "No sensor readings received yet",
    });
  }

  res.json(latestReading);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});