import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SAR_STEPS, SarStackParamList } from '../sar/workflow';
import { DiscoverImagesScreen } from '../sar/screens/DiscoverImagesScreen';
import { SelectImagePairScreen } from '../sar/screens/SelectImagePairScreen';
import { SarMapScreen } from '../sar/screens/SarMapScreen';
import { AnalysisSetupScreen } from '../sar/screens/AnalysisSetupScreen';
import { AnalysisResultsScreen } from '../sar/screens/AnalysisResultsScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<SarStackParamList>();
// Native history owns Back/Android hardware Back. There is no custom BackHandler
// and no request cancellation on an individual step's unmount.
export function SarAnalysisScreen() {
  return <Stack.Navigator initialRouteName="DiscoverImages" screenOptions={{ headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="DiscoverImages" component={DiscoverImagesScreen} options={{ title: SAR_STEPS[0].title }} />
    <Stack.Screen name="SelectImagePair" component={SelectImagePairScreen} options={{ title: SAR_STEPS[1].title }} />
    <Stack.Screen name="SarMap" component={SarMapScreen} options={{ title: SAR_STEPS[2].title }} />
    <Stack.Screen name="AnalysisSetup" component={AnalysisSetupScreen} options={{ title: SAR_STEPS[3].title }} />
    <Stack.Screen name="AnalysisResults" component={AnalysisResultsScreen} options={{ title: SAR_STEPS[4].title }} />
  </Stack.Navigator>;
}
