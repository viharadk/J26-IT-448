import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type LocationData = {
  id: string;
  name: string;
  level: number;
  status: 'LOW' | 'MEDIUM' | 'HIGH';
  prediction: number;
  lastUpdated: string;
  sensorOnline: boolean;
};

const locations: LocationData[] = [
  {
    id: '01',
    name: 'Location 01',
    level: 0.72,
    status: 'MEDIUM',
    prediction: 0.84,
    lastUpdated: 'Just now',
    sensorOnline: true,
  },
  {
    id: '02',
    name: 'Location 02',
    level: 0.65,
    status: 'MEDIUM',
    prediction: 0.76,
    lastUpdated: '1 min ago',
    sensorOnline: true,
  },
];

const recentReadings = [
  { time: '11:30', location01: 0.68, location02: 0.61 },
  { time: '11:35', location01: 0.69, location02: 0.62 },
  { time: '11:40', location01: 0.70, location02: 0.63 },
  { time: '11:45', location01: 0.71, location02: 0.64 },
  { time: '11:50', location01: 0.72, location02: 0.65 },
];

function getStatusColor(status: LocationData['status']) {
  if (status === 'HIGH') {
    return '#dc2626';
  }

  if (status === 'MEDIUM') {
    return '#d97706';
  }

  return '#16a34a';
}

function getStatusBackground(status: LocationData['status']) {
  if (status === 'HIGH') {
    return '#fee2e2';
  }

  if (status === 'MEDIUM') {
    return '#fef3c7';
  }

  return '#dcfce7';
}

export default function HomeScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.smallTitle}>IoT River Monitoring</Text>
          <Text style={styles.title}>Water Level Dashboard</Text>
        </View>

        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>LIVE</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Monitoring Stations</Text>
          <Text style={styles.summaryValue}>2</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View>
          <Text style={styles.summaryLabel}>Sensors Online</Text>
          <Text style={styles.summaryValue}>2 / 2</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View>
          <Text style={styles.summaryLabel}>Alerts</Text>
          <Text style={styles.summaryValue}>0</Text>
        </View>
      </View>

      {/* Location cards */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Current Water Levels</Text>
        <Text style={styles.sectionSubtitle}>Live sensor readings</Text>
      </View>

      {locations.map((location) => (
        <View key={location.id} style={styles.locationCard}>
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.locationName}>{location.name}</Text>

              <View style={styles.sensorStatus}>
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
                {
                  backgroundColor: getStatusBackground(location.status),
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color: getStatusColor(location.status),
                  },
                ]}
              >
                {location.status}
              </Text>
            </View>
          </View>

          <View style={styles.levelSection}>
            <Text style={styles.levelValue}>{location.level.toFixed(2)}</Text>
            <Text style={styles.levelUnit}>m</Text>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.cardInfoRow}>
            <View>
              <Text style={styles.infoLabel}>Last updated</Text>
              <Text style={styles.infoValue}>{location.lastUpdated}</Text>
            </View>

            <View style={styles.predictionBox}>
              <Text style={styles.infoLabel}>30 min prediction</Text>
              <Text style={styles.predictionValue}>
                {location.prediction.toFixed(2)} m
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* Prediction information */}
      <View style={styles.predictionCard}>
        <View style={styles.predictionHeader}>
          <View>
            <Text style={styles.predictionTitle}>AI Water Level Prediction</Text>
            <Text style={styles.predictionSubtitle}>
              Predicted water level for the next 30 minutes
            </Text>
          </View>

          <Text style={styles.aiBadge}>ML</Text>
        </View>

        <View style={styles.predictionRow}>
          <View>
            <Text style={styles.predictionLocation}>Location 01</Text>
            <Text style={styles.bigPrediction}>0.84 m</Text>
          </View>

          <View>
            <Text style={styles.predictionLocation}>Location 02</Text>
            <Text style={styles.bigPrediction}>0.76 m</Text>
          </View>
        </View>
      </View>

      {/* Recent readings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Readings</Text>
        <Text style={styles.sectionSubtitle}>
          Latest sensor measurements
        </Text>
      </View>

      <View style={styles.readingsCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableText, styles.timeColumn]}>Time</Text>
          <Text style={[styles.tableText, styles.valueColumn]}>
            Location 01
          </Text>
          <Text style={[styles.tableText, styles.valueColumn]}>
            Location 02
          </Text>
        </View>

        {recentReadings.map((reading) => (
          <View style={styles.tableRow} key={reading.time}>
            <Text style={[styles.tableText, styles.timeColumn]}>
              {reading.time}
            </Text>

            <Text style={[styles.tableValue, styles.valueColumn]}>
              {reading.location01.toFixed(2)} m
            </Text>

            <Text style={[styles.tableValue, styles.valueColumn]}>
              {reading.location02.toFixed(2)} m
            </Text>
          </View>
        ))}
      </View>

      {/* Navigation */}
      <View style={styles.navigationSection}>
        <Pressable
          style={styles.navigationButton}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.navigationButtonText}>View History</Text>
        </Pressable>

        <Pressable
          style={[styles.navigationButton, styles.alertButton]}
          onPress={() => router.push('/alerts')}
        >
          <Text style={styles.navigationButtonText}>View Alerts</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Prototype • IoT River Water Level Monitoring System
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },

  content: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
    padding: 24,
    paddingBottom: 50,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  smallTitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
  },

  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },

  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    marginRight: 6,
  },

  onlineText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803d',
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 5,
    textAlign: 'center',
  },

  summaryValue: {
    fontSize: 23,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },

  summaryDivider: {
    width: 1,
    height: 42,
    backgroundColor: '#e2e8f0',
  },

  sectionHeader: {
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0f172a',
  },

  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },

  locationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  locationName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },

  sensorStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  sensorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  sensorText: {
    fontSize: 12,
    color: '#64748b',
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },

  levelSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 22,
  },

  levelValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#0f172a',
  },

  levelUnit: {
    fontSize: 18,
    color: '#64748b',
    marginLeft: 6,
    marginBottom: 8,
  },

  cardDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 18,
  },

  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  infoLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },

  predictionBox: {
    alignItems: 'flex-end',
  },

  predictionValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563eb',
  },

  predictionCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 18,
    padding: 20,
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  predictionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e3a8a',
  },

  predictionSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },

  aiBadge: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },

  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 22,
  },

  predictionLocation: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },

  bigPrediction: {
    fontSize: 27,
    fontWeight: '800',
    color: '#1d4ed8',
    marginTop: 5,
  },

  readingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 24,
  },

  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  tableText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },

  tableValue: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },

  timeColumn: {
    flex: 1,
  },

  valueColumn: {
    flex: 1.5,
    textAlign: 'center',
  },

  navigationSection: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },

  navigationButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  alertButton: {
    backgroundColor: '#475569',
  },

  navigationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 30,
  },
});