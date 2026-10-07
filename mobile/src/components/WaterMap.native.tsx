import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet } from 'react-native';

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
  const center = {
    latitude:
      locations.reduce((sum, item) => sum + item.latitude, 0) /
      locations.length,
    longitude:
      locations.reduce((sum, item) => sum + item.longitude, 0) /
      locations.length,
  };

  const lineColor = locations.some((item) => item.status === 'HIGH')
    ? '#dc2626'
    : locations.some((item) => item.status === 'MEDIUM')
    ? '#f59e0b'
    : '#16a34a';

  return (
    <MapView
      style={styles.map}
      initialRegion={{
        ...center,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      {locations.map((location) => (
        <Marker
          key={location.id}
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          title={location.name}
          description={`${location.level.toFixed(2)} m - ${location.status}`}
        />
      ))}

      <Polyline
        coordinates={locations.map((location) => ({
          latitude: location.latitude,
          longitude: location.longitude,
        }))}
        strokeColor={lineColor}
        strokeWidth={4}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: 280,
    borderRadius: 16,
  },
});