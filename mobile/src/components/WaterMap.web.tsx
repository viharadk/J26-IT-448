import { StyleSheet, Text, View } from 'react-native';

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  level: number;
  status: string;
};

type Props = {
  locations: Location[];
};

export default function WaterMap({ locations }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🗺️</Text>

      <Text style={styles.title}>
        Monitoring Locations
      </Text>

      <Text style={styles.subtitle}>
        Map preview is available on Android / iOS.
      </Text>

      {locations.map((location) => (
        <View key={location.id} style={styles.location}>
          <Text style={styles.locationName}>
            📍 {location.name}
          </Text>

          <Text style={styles.details}>
            Water Level: {location.level.toFixed(2)} m
          </Text>

          <Text style={styles.details}>
            Status: {location.status}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 280,
    borderRadius: 16,
    backgroundColor: '#eaf3f8',
    padding: 20,
    justifyContent: 'center',
  },

  icon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 8,
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 18,
  },

  location: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
  },

  locationName: {
    fontWeight: '700',
  },

  details: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
});