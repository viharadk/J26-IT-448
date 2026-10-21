# Kelani FloodWatch mobile

## Current implementation — Phase M3C

Function 1 now has four separate native-stack screens: Flood Hazard Map, Location Analysis, Population Exposure and Hazard Summary. Map bottom actions open each view; Back preserves the existing map, selected layer and search state. The verified PopulationExposure route/controller remain unchanged. The app uses React Navigation, not Expo Router. Function 2 retains its existing five-screen workflow.

SAR outputs are experimental candidates. Independent flood validation remains **DATA_NOT_READY**. Backend scientific processing, environment configuration and research outputs are unchanged.

SAR outputs are experimental candidates. Independent flood validation remains **DATA_NOT_READY**; Phase 5C measures sensitivity to support/filtering and does not establish detection accuracy. M2 changes mobile reliability/labels only; backend scientific processing, environment configuration and research outputs are unchanged.

## Historical Phase 1 setup and implementation notes

A native React Native + Expo application. No WebView, DOM, CSS, Leaflet or research calculation code is included in the mobile runtime.

## Run

Prerequisite: Node 20.19.0 or newer. This project pins Expo SDK 53 (expo ~53.0.27), React 19.0.0 and React Native 0.79.6 to work with the installed Node runtime. Use an SDK 53-compatible Expo Go client, not an arbitrary latest Expo Go version. Android compatible clients are available at https://expo.dev/go?sdkVersion=53&platform=android&device=true . Physical iOS cannot install older Expo Go versions from the App Store; use a development build with a compatible macOS/Xcode or EAS setup, or plan a coordinated SDK/Node upgrade. Windows cannot run the iOS simulator.

From the project root, start the unchanged backend in one terminal:

```powershell
cd backend
npm start
```

In another terminal:

```powershell
cd mobile
npm ci
Copy-Item .env.example .env
# Edit .env with your computer's active Wi-Fi IPv4 address, then:
npm start
```

Use `ipconfig` to identify your active Wi-Fi IPv4 address (not a VMware adapter). Set `EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:5000`. The local ignored .env was configured to http://10.178.163.166:5000 during implementation; update it when your address changes. Both devices must share a network without client isolation. Allow Node/port 5000 and Metro/port 8081 through Windows Firewall on the private network if needed. Do not use localhost, 127.0.0.1 or 0.0.0.0 as a phone's backend URL. Android emulator users can use http://10.0.2.2:5000. Restart Expo with `npm start -- --clear` after environment changes.

Scan the Metro QR code with a compatible Expo Go client. Press `a` for an installed Android emulator. Open Function 1 and Function 2, verify the native back button/Android back behavior, then tap Test backend connection. No location permission is needed in Phase 1.

The test calls the existing GET /api/flood/test endpoint with a 10-second timeout and validates its JSON contract. It reports idle, loading, connected and failure states. Success proves API availability only, not Earth Engine authentication or GIS accuracy. No result is fabricated when offline. Configuration is public and included in the bundle: never put service account credentials or secrets in EXPO_PUBLIC variables. For distributed builds, use a deployed HTTPS backend. Local HTTP behavior must be verified in the chosen native build; Expo Go testing does not certify production Android cleartext/iOS ATS policy.

## Structure and new files

```text
kelani-flood-system/
  frontend/                         existing React/Vite web app; source unchanged
  backend/                          existing Express/GEE API; unchanged
  mobile/
    App.tsx                         native stack navigation
    index.ts                        Expo registration
    app.json                        native app configuration
    package.json, package-lock.json dependencies and commands
    tsconfig.json                   strict TypeScript
    .gitignore, .env.example, .env   ignored local LAN configuration
    src/
      theme.ts                      shared navy palette/navigation theme
      navigation.ts                 typed route parameters
      api/client.ts                 fetch client, validation and timeout
      components/ui.tsx             safe-area layout, cards, buttons, styles
      screens/HomeScreen.tsx        home and live connectivity test
      scripts/check-api.ts             real endpoint CLI smoke test
      tests/api.test.ts               API failure/contract tests
      README.md                       setup, inspection, compatibility and scope
```

## Existing application inspection

The frontend is a single React 19/Vite 8 application, with no routing dependency. It uses Axios, Leaflet and React Leaflet. App.jsx loads hazard and population results; component files implement maps, layer selection/legends, Nominatim location search, selected-location inspection and population exposure. Existing web services hardcode a localhost backend URL; mobile has independent environment-based configuration.

The backend uses Express 5, CORS, dotenv and @google/earthengine. server.js binds port 5000 by default and exposes GET / and GET /api/flood/test. floodRoutes.js mounts GET /elevation, /hazard, /inspect?lat=...&lon=..., /layers, /layers/:layerId, /exposure/population and /exposure/population/layer under /api/flood. Controllers delegate to hazardService and ahpService; Earth Engine authentication stays server-side. Hazard and layer responses include XYZ tile URLs and separate permanent-water tiles. AHP weights, study geometry, water masking, population calculations and all routes are untouched. There was no existing Expo project.

## Native map compatibility investigation — Phase 2

`react-native-maps` provides native MapView and UrlTile on Android/iOS. Its documented `urlTemplate` replaces {x}, {y}, {z}, matching the existing Earth Engine map URLs. Use `flipY={false}` for XYZ. Separate hazard and permanent-water UrlTile overlays can preserve server-defined masks; do not recalculate masks or hazard scores on-device. Fetch fresh backend URLs rather than persisting temporary GEE URLs indefinitely. Handle tile expiry, no-data and network errors separately from API status. Confirm overlay opacity, ordering, transparency, zoom limits and layer switching on both target platforms.

The installed Expo SDK 53 bundledNativeModules manifest specifies react-native-maps 1.20.1, compatible with its React Native 0.79.6 baseline. Use `npx expo install react-native-maps` in Phase 2 to select the Expo SDK-compatible native version. Do not install the latest maps package indiscriminately: newer Fabric releases may require a newer React Native version. MapView is deliberately not installed or rendered in Phase 1. Expo Go includes a native maps implementation; production Google Maps requires platform API-key configuration and rebuilding. Do not ship Earth Engine private keys to the app. Test Android Google Maps and the selected iOS provider in real builds before claiming compatibility.

Sources reviewed:
- https://docs.expo.dev/versions/v53.0.0/sdk/map-view/
- https://github.com/react-native-maps/react-native-maps/blob/v1.20.1/README.md#tile-overlay-using-tile-server

This is API-level compatibility research, not an executed GEE overlay proof.

## Checks

```powershell
npm run typecheck
npm test
npm run test:api
npm run check:expo
npx expo-doctor
npx expo export --platform android --platform ios
```

## Phase 2 scope

Implement Function 1's native map, real GEE XYZ raster and permanent-water overlays, layer controls/legends, location search, map-tap AHP inspection, and population exposure views using existing endpoints. Preserve all backend research semantics. Validate location bounds, water/no-data responses, offline/error handling, tile refresh and touch interaction on physical Android/iOS devices. Function 2 remains Coming Soon until independently implemented. No Function 1 analysis or Function 2 simulation is executed in this Phase 1 shell.
