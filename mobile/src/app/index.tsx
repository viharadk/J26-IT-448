import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import WaterMap from '../components/WaterMap';

type LocationData = {
  id: string;
  name: string;
  level: number;
  status: 'LOW' | 'MEDIUM' | 'HIGH';
  prediction: number;
  sensorOnline: boolean;
  lastUpdated: string;
  latitude: number;
  longitude: number;
};

const locations: LocationData[] = [
  {
    id: 'location-01',
    name: 'Location 01',
    level: 0.72,
    status: 'MEDIUM',
    prediction: 0.84,
    sensorOnline: true,
    lastUpdated: 'Just now',
    latitude: 6.9271,
    longitude: 80.7789,
  },
  {
    id: 'location-02',
    name: 'Location 02',
    level: 0.65,
    status: 'MEDIUM',
    prediction: 0.76,
    sensorOnline: true,
    lastUpdated: '1 min ago',
    latitude: 6.9282,
    longitude: 80.7802,
  },
];

const recentReadings = [
  {
    time: '11:50',
    location01: 0.72,
    location02: 0.65,
  },
  {
    time: '11:40',
    location01: 0.69,
    location02: 0.63,
  },
  {
    time: '11:30',
    location01: 0.66,
    location02: 0.61,
  },
  {
    time: '11:20',
    location01: 0.64,
    location02: 0.59,
  },
];

function getStatusStyle(status: LocationData['status']) {
  switch (status) {
    case 'HIGH':
      return styles.highStatus;

    case 'MEDIUM':
      return styles.mediumStatus;

    default:
      return styles.lowStatus;
  }
}

function getStatusTextStyle(status: LocationData['status']) {
  switch (status) {
    case 'HIGH':
      return styles.highStatusText;

    case 'MEDIUM':
      return styles.mediumStatusText;

    default:
      return styles.lowStatusText;
  }
}

function LocationCard({ location }: { location: LocationData }) {
  return (
    <View style={styles.locationCard}>
      <View style={styles.locationHeader}>
        <View>
          <Text style={styles.locationName}>{location.name}</Text>

          <View style={styles.sensorRow}>
            <View
              style={[
                styles.sensorDot,
                {
                  backgroundColor: location.sensorOnline
                    ? '#16a34a'
                    : '#dc2626',
                },
              ]}
            />

            <Text style={styles.sensorText}>
              {location.sensorOnline ? 'Sensor Online' : 'Sensor Offline'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            getStatusStyle(location.status),
          ]}
        >
          <Text
            style={[
              styles.statusText,
              getStatusTextStyle(location.status),
            ]}
          >
            {location.status}
          </Text>
        </View>
      </View>

      <View style={styles.levelContainer}>
        <Text style={styles.levelValue}>
          {location.level.toFixed(2)}
        </Text>

        <Text style={styles.levelUnit}>m</Text>
      </View>

      <Text style={styles.levelLabel}>Current Water Level</Text>

      <View style={styles.infoRow}>
        <View>
          <Text style={styles.infoLabel}>30 min Prediction</Text>

          <Text style={styles.predictionValue}>
            {location.prediction.toFixed(2)} m
          </Text>
        </View>

        <View style={styles.updatedContainer}>
          <Text style={styles.infoLabel}>Last Updated</Text>

          <Text style={styles.updatedText}>
            {location.lastUpdated}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const onlineSensors = locations.filter(
    (location) => location.sensorOnline
  ).length;

  const highAlerts = locations.filter(
    (location) => location.status === 'HIGH'
  ).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>RiverWatch</Text>

          <Text style={styles.subtitle}>
            Real-time Water Level Monitoring
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Text style={styles.headerIconText}>💧</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {locations.length}
          </Text>

          <Text style={styles.summaryLabel}>Stations</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {onlineSensors}/{locations.length}
          </Text>

          <Text style={styles.summaryLabel}>Sensors Online</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text
            style={[
              styles.summaryNumber,
              highAlerts > 0 && styles.alertNumber,
            ]}
          >
            {highAlerts}
          </Text>

          <Text style={styles.summaryLabel}>Alerts</Text>
        </View>
      </View>

      {/* Location Cards */}
      <Text style={styles.sectionTitle}>
        Current Water Levels
      </Text>

      {locations.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
        />
      ))}

      {/* Map */}
      <Text style={styles.sectionTitle}>
        Monitoring Locations
      </Text>

      <View style={styles.mapCard}>
        <WaterMap locations={locations} />
      </View>

      {/* Recent Readings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Recent Readings
        </Text>

        <Pressable
          onPress={() => router.push('/history')}
        >
          <Text style={styles.viewText}>View History</Text>
        </Pressable>
      </View>

      <View style={styles.readingsCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.timeColumn]}>
            Time
          </Text>

          <Text style={styles.tableHeaderText}>
            Location 01
          </Text>

          <Text style={styles.tableHeaderText}>
            Location 02
          </Text>
        </View>

        {recentReadings.map((reading) => (
          <View
            key={reading.time}
            style={styles.tableRow}
          >
            <Text style={[styles.tableText, styles.timeColumn]}>
              {reading.time}
            </Text>

            <Text style={styles.tableText}>
              {reading.location01.toFixed(2)} m
            </Text>

            <Text style={styles.tableText}>
              {reading.location02.toFixed(2)} m
            </Text>
          </View>
        ))}
      </View>

      {/* Bottom Buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.primaryButtonText}>
            View History
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/alerts')}
        >
          <Text style={styles.secondaryButtonText}>
            View Alerts
          </Text>
        </Pressable>
      </View>

      {/* Prototype Notice */}
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>
          Prototype Monitoring System
        </Text>

        <Text style={styles.noticeText}>
          Current readings are prototype values. Live ESP32
          sensor data will be connected through the backend API.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#64748b',
  },

  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerIconText: {
    fontSize: 25,
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },

  summaryNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },

  alertNumber: {
    color: '#dc2626',
  },

  summaryLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },

  summaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: '#e2e8f0',
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },

  locationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  locationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },

  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },

  sensorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  sensorText: {
    fontSize: 12,
    color: '#64748b',
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  lowStatus: {
    backgroundColor: '#dcfce7',
  },

  lowStatusText: {
    color: '#15803d',
  },

  mediumStatus: {
    backgroundColor: '#fef3c7',
  },

  mediumStatusText: {
    color: '#b45309',
  },

  highStatus: {
    backgroundColor: '#fee2e2',
  },

  highStatusText: {
    color: '#b91c1c',
  },

  levelContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 22,
  },

  levelValue: {
    fontSize: 44,
    fontWeight: '800',
    color: '#0369a1',
  },

  levelUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    marginLeft: 5,
  },

  levelLabel: {
    fontSize: 12,
    color: '#64748b',
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },

  infoLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },

  predictionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },

  updatedContainer: {
    alignItems: 'flex-end',
  },

  updatedText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },

  mapCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 25,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  viewText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 12,
  },

  readingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 13,
    paddingHorizontal: 12,
  },

  tableHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },

  tableText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
  },

  timeColumn: {
    textAlign: 'left',
    flex: 0.7,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },

  primaryButton: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  secondaryButton: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: '#0369a1',
    fontSize: 14,
    fontWeight: '700',
  },

  noticeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e40af',
    marginBottom: 5,
  },

  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
});