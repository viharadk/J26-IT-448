import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { navigationTheme, colors } from './src/theme';
import { RootStackParamList } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { SarAnalysisScreen } from './src/screens/SarAnalysisScreen';
import { HazardMapScreen } from './src/screens/HazardMapScreen';
import { PopulationExposureScreen } from './src/screens/PopulationExposureScreen';
import { SarWorkflowProvider } from './src/sar/SarWorkflowProvider';
import { Function1Provider } from './src/function1/Function1Provider';
import { LocationAnalysisScreen } from './src/screens/LocationAnalysisScreen';
import { HazardSummaryScreen } from './src/screens/HazardSummaryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
export default function App() {
  return <SafeAreaProvider><StatusBar style="light" /><NavigationContainer theme={navigationTheme}>
    <SarWorkflowProvider><Function1Provider><Stack.Navigator screenOptions={{ headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Kelani FloodWatch' }} />
      <Stack.Screen name="Function1" component={HazardMapScreen} options={{ title: 'Flood Hazard Map' }} />
      <Stack.Screen name="LocationAnalysis" component={LocationAnalysisScreen} options={{ title: 'Location Analysis' }} />
      <Stack.Screen name="PopulationExposure" component={PopulationExposureScreen} options={{ title: 'Population Exposure', presentation: 'card' }} />
      <Stack.Screen name="HazardSummary" component={HazardSummaryScreen} options={{ title: 'Hazard Summary' }} />
      <Stack.Screen name="Function2" component={SarAnalysisScreen} options={{ title: 'Historical SAR Analysis', headerShown: false }} />
    </Stack.Navigator></Function1Provider></SarWorkflowProvider>
  </NavigationContainer></SafeAreaProvider>;
}
