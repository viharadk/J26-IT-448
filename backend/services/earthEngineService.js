const ee = require("@google/earthengine");
const fs = require("node:fs");
const path = require("node:path");

let initialized = false;
let initializationPromise = null;
let privateKey = null;

function credentialFile() {
  const configured = process.env.EARTH_ENGINE_KEY_FILE;

  if (!configured) {
    return path.resolve(__dirname, "..", "credentials", "service-account-key.json");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, "..", configured);
}

function loadPrivateKey() {
  if (privateKey) return privateKey;

  try {
    const parsed = JSON.parse(fs.readFileSync(credentialFile(), "utf8"));
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error("The credential file is not a service-account key.");
    }
    privateKey = parsed;
    return privateKey;
  } catch {
    const error = new Error(
      "Earth Engine credentials are unavailable. Configure EARTH_ENGINE_KEY_FILE on the backend."
    );
    error.code = "EARTH_ENGINE_CREDENTIALS_UNAVAILABLE";
    throw error;
  }
}

function initializeEarthEngine() {
  if (initialized) {
    return Promise.resolve(ee);
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  let credentials;
  try {
    credentials = loadPrivateKey();
  } catch (error) {
    return Promise.reject(error);
  }

  initializationPromise = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      credentials,

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
