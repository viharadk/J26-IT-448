import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Function1Provider } from '@/function1/Function1Provider';
import { SarWorkflowProvider } from '@/sar/SarWorkflowProvider';
import { colors } from '@/theme';

export default function GisFloodLayout() {
  return (
    <SarWorkflowProvider>
      <Function1Provider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Kelani FloodWatch' }} />
          <Stack.Screen name="hazard-map" options={{ title: 'Flood Hazard Map' }} />
          <Stack.Screen name="location-analysis" options={{ title: 'Location Analysis' }} />
          <Stack.Screen name="population-exposure" options={{ title: 'Population Exposure' }} />
          <Stack.Screen name="hazard-summary" options={{ title: 'Hazard Summary' }} />
          <Stack.Screen name="sar" options={{ headerShown: false }} />
        </Stack>
      </Function1Provider>
    </SarWorkflowProvider>
  );
}
