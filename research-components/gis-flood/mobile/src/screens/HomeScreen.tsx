import { Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Action, Card, Screen, styles } from '../components/ui';

export function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  return <Screen>
    <Text style={styles.eyebrow}>LOWER KELANI · SRI LANKA</Text>
    <Text accessibilityRole="header" style={styles.title}>Understand the basin.{ '\n' }Explore the risk.</Text>
    <Text style={styles.body}>GIS-based flood research, designed for the field. Your mobile workspace for the Kelani River basin.</Text>
    <Card>
      <Text style={styles.eyebrow}>FUNCTION 01</Text>
      <Text accessibilityRole="header" style={styles.heading}>Flood Hazard Assessment</Text>
      <Text style={styles.body}>Explore native AHP hazard and permanent-water layers. Tap a location to inspect its hazard class and index.</Text>
      <Text style={styles.badge}>Native GIS map available</Text>
      <Action label="Explore Function 1 →" onPress={() => navigation.navigate('Function1')} />
    </Card>
    <Card>
      <Text style={styles.eyebrow}>FUNCTION 02</Text>
      <Text accessibilityRole="header" style={styles.heading}>Historical SAR Flood Research</Text>
      <Text style={styles.badge}>Live observations · Experimental analysis</Text>
      <Text style={styles.body}>Select Sentinel-1 observations, compare live radar maps and investigate unvalidated flood candidates.</Text>
      <Action label="Explore Function 2" onPress={() => navigation.navigate('Function2')} />
    </Card>
    <Text style={styles.body}>RESEARCH PROTOTYPE · Preliminary and not historically validated. Not an operational flood warning service.</Text>
  </Screen>;
}
