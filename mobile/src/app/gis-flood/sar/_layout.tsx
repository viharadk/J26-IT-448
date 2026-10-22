import { Stack } from 'expo-router';

import { SAR_STEPS } from '@/sar/workflow';
import { colors } from '@/theme';

export default function SarLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: SAR_STEPS[0].title }} />
      <Stack.Screen name="select-image-pair" options={{ title: SAR_STEPS[1].title }} />
      <Stack.Screen name="map" options={{ title: SAR_STEPS[2].title }} />
      <Stack.Screen name="analysis-setup" options={{ title: SAR_STEPS[3].title }} />
      <Stack.Screen name="results" options={{ title: SAR_STEPS[4].title }} />
    </Stack>
  );
}
