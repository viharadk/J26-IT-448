const ee = require("@google/earthengine");
const privateKey = require("./credentials/service-account-key.json");

ee.data.authenticateViaPrivateKey(
  privateKey,

  () => {
    console.log("Authentication successful");

    ee.initialize(
      null,
      null,

      () => {
        console.log("Google Earth Engine initialized successfully");

        const point = ee.Geometry.Point([79.92, 6.96]);

        const elevation = ee
          .Image("USGS/SRTMGL1_003")
          .select("elevation");

        elevation
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: point,
            scale: 30,
            maxPixels: 1000000
          })
          .evaluate((result, error) => {

            if (error) {
              console.error("Calculation error:", error);
              return;
            }

            console.log("Test Elevation Result:", result);
          });
      },

      (error) => {
        console.error("Initialization failed:", error);
      },

      "kelani-flood-risk-research"
    );
  },

  (error) => {
    console.error("Authentication failed:", error);
  }
);