# Mobile Frontend Component

**Owner:** Pasindu  
**Technology:** React Native · Expo SDK 57 · Expo Router · TypeScript  
**Role:** Display live water-level data, historical trends, risk alerts, and a monitoring map.

---

## Source Location

> [!IMPORTANT]
> The actual mobile source code lives in **`/mobile`** at the repository root — not inside this directory.
> This `README.md` exists as a component index entry for GitHub navigation and team reference.

```
mobile/                     ← All source code is here
├── src/
│   ├── app/                ← Expo Router screens
│   ├── components/         ← Reusable UI components
│   ├── constants/          ← Config, types, risk thresholds
│   ├── context/            ← Theme + navigation providers
│   └── hooks/              ← Custom React hooks
├── assets/                 ← Images, icons, splash screen
├── app.json                ← Expo configuration
├── tsconfig.json           ← TypeScript paths (@/* → ./src/*)
└── package.json
```

---

## Screens

| File | Route | Description |
|---|---|---|
| `src/app/index.tsx` | `/` | Dashboard — live readings, risk badges, map, mini history |
| `src/app/history.tsx` | `/history` | Full historical readings chart and table |
| `src/app/alerts.tsx` | `/alerts` | Alert rules reference screen |
| `src/app/settings.tsx` | `/settings` | Dark mode toggle, system info |
| `src/app/_layout.tsx` | — | Root layout — providers, Expo Tabs config |

---

## Key Components

| File | Purpose |
|---|---|
| `WaterMap.tsx` | Platform entry point (re-exports `.native`) |
| `WaterMap.native.tsx` | `react-native-maps` — iOS/Android map with markers |
| `WaterMap.web.tsx` | Text-based fallback for web |
| `WaterLevelChart.tsx` | SVG line chart (Location 01 + 02, threshold lines) |
| `HistorySection.tsx` | Fetches `/api/readings/history`, renders chart + table |
| `LeftSliderNav.tsx` | Animated side navigation panel |
| `HamburgerButton.tsx` | Opens the slider nav |

---

## Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure API URL

```bash
cp .env.example .env.local
# Edit .env.local and set:
# EXPO_PUBLIC_API_URL=http://<YOUR_LAPTOP_LAN_IP>:3000
```

> Find your LAN IP: run `ipconfig` on Windows → IPv4 Address under your Wi-Fi adapter.

### 3. Start Expo Dev Server

```bash
npx expo start             # Opens Expo Metro bundler
```

| Key | Action |
|---|---|
| `a` | Open on Android emulator |
| `i` | Open on iOS simulator (macOS only) |
| `w` | Open in web browser |
| Scan QR | Open in Expo Go app on a physical device |

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL (LAN IP, not localhost) | `http://192.168.1.42:3000` |

Set in `mobile/.env.local` (gitignored). See `mobile/.env.example` for the template.

---

## TypeScript Check

```bash
cd mobile
npx tsc --noEmit
```

Expected: exit code 0, no errors.

---

## Platform Notes

- **Native maps:** `react-native-maps` requires Expo Go or a development build. It does not work with `expo start --web`.
- **Web map fallback:** `WaterMap.web.tsx` renders a plain text location list — no map library needed on web.
- **Platform file resolution:** Expo automatically selects `.native.tsx` for iOS/Android and `.web.tsx` for web when the base file (`WaterMap.tsx`) re-exports `.native`.

---

## Integration Requirements

- Backend must expose `GET /api/readings/latest` and `GET /api/readings/history`.
- Response shape must match the `SensorReading` type defined in `src/app/index.tsx`.
- Risk level fields (`riskLevel01`, `riskLevel02`) and `thresholds` are optional — the frontend falls back to client-side computation.
- See [`../../integration/api-contract.md`](../../integration/api-contract.md) for the complete contract.

