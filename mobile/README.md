# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## GIS FloodWatch integration

Kelani FloodWatch is integrated into this Expo Router application at
`src/app/gis-flood/`. Open the left-side navigation and choose **GIS
FloodWatch** to access:

- GIS-AHP flood hazard mapping and selected-location analysis
- Study-area population exposure and hazard summaries
- The five-step historical Sentinel-1 SAR research workflow

The interactive Earth Engine maps use `react-native-maps` on Android and iOS.
Web builds show explicit non-map fallbacks while retaining the research summary
screens.

Copy `.env.example` to an ignored `.env` and set `EXPO_PUBLIC_API_URL` to the
root backend origin. A physical phone must use the computer's LAN address, for
example `http://192.168.1.100:3000`; do not use `localhost` from a phone.

`GOOGLE_MAPS_ANDROID_API_KEY` is optional in Expo Go but required for a
production Android build that uses Google Maps. Keep it restricted in Google
Cloud and never commit it. The Earth Engine service-account key belongs only on
the backend and must never use an `EXPO_PUBLIC_` variable.

GIS and SAR results are research outputs, not an operational flood warning or
independently validated flood extent.
