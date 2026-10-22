import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const mapPlugin: ExpoConfig['plugins'] = mapsKey
    ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }]]
    : [];

  return {
    ...config,
    name: config.name ?? 'Kelani Guard System',
    slug: config.slug ?? 'kelani-guard-system',
    plugins: [...(config.plugins ?? []), ...(mapPlugin ?? [])],
  };
};
