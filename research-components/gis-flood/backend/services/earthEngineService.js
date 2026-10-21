const ee = require("@google/earthengine");

const privateKey = require("../credentials/service-account-key.json");

let initialized = false;
let initializationPromise = null;

function initializeEarthEngine() {
  if (initialized) {
    return Promise.resolve(ee);
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,

      () => {
        ee.initialize(
          null,
          null,

          () => {
            initialized = true;

            console.log(
              "Google Earth Engine service initialized successfully"
            );

            resolve(ee);
          },

          (error) => {
            console.error(
              "Earth Engine initialization failed:",
              error
            );

            initializationPromise = null;
            reject(error);
          },

          "kelani-flood-risk-research"
        );
      },

      (error) => {
        console.error(
          "Earth Engine authentication failed:",
          error
        );

        initializationPromise = null;
        reject(error);
      }
    );
  });

  return initializationPromise;
}

module.exports = {
  ee,
  initializeEarthEngine
};