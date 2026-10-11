
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "River Water Monitoring API is running"
  });
});

app.post("/api/readings", (req, res) => {
  console.log("Sensor data received:", req.body);

  res.json({
    success: true,
    message: "Sensor readings received successfully",
    receivedData: req.body
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});
