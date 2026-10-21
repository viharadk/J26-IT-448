import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Kelani FloodWatch',
  slug: config.slug ?? 'kelani-floodwatch',
  android: {
    ...config.android,
    // SDK 53 / react-native-maps 1.20.1 uses Expo's built-in maps configuration.
    // This is a restricted Maps SDK key, never the Earth Engine service-account key.
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY ? {
      config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } },
    } : {}),
  },
});
