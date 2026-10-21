const express = require("express");
const cors = require("cors");
require("dotenv").config();

const floodRoutes = require("./routes/floodRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/sar", require("./routes/sarSelectionRoutes").createSarSelectionRouter());
app.use("/api/sar", require("./routes/sarPreviewRoutes").createSarPreviewRouter());
app.use("/api/sar", require("./routes/sarRoutes").createSarRouter());
app.use("/api/geocoding", require("./routes/geocodingRoutes").createGeocodingRouter());
app.use("/api/research", require("./routes/researchRoutes").createResearchRouter());
app.use("/api/flood", floodRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    status: "Backend API is running"
  });
});

app.get("/api/flood/test", (req, res) => {
  res.json({
    success: true,
    component: "GIS-Based Flood Risk Simulation",
    function1: "Flood Hazard Estimation",
    function2: "Scenario-Based Flood Risk Simulation",
    status: "Flood API is working"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
