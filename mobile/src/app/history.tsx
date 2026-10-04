import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const readings = [
  {
    time: '11:50',
    location01: 0.72,
    location02: 0.65,
  },
  {
    time: '11:45',
    location01: 0.71,
    location02: 0.64,
  },
  {
    time: '11:40',
    location01: 0.70,
    location02: 0.63,
  },
  {
    time: '11:35',
    location01: 0.69,
    location02: 0.62,
  },
  {
    time: '11:30',
    location01: 0.68,
    location02: 0.61,
  },
  {
    time: '11:25',
    location01: 0.67,
    location02: 0.60,
  },
  {
    time: '11:20',
    location01: 0.66,
    location02: 0.59,
  },
];

export default function HistoryScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back to Dashboard</Text>
      </Pressable>

      <Text style={styles.title}>Water Level History</Text>

      <Text style={styles.subtitle}>
        Historical readings from the monitoring sensors
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.label}>Location 01</Text>
          <Text style={styles.value}>0.72 m</Text>
          <Text style={styles.small}>Current</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.label}>Location 02</Text>
          <Text style={styles.value}>0.65 m</Text>
          <Text style={styles.small}>Current</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Measurements</Text>

        <View style={styles.tableHeader}>
          <Text style={styles.time}>Time</Text>
          <Text style={styles.station}>Location 01</Text>
          <Text style={styles.station}>Location 02</Text>
        </View>

        {readings.map((reading) => (
          <View style={styles.row} key={reading.time}>
            <Text style={styles.time}>{reading.time}</Text>

            <Text style={styles.station}>
              {reading.location01.toFixed(2)} m
            </Text>

            <Text style={styles.station}>
              {reading.location02.toFixed(2)} m
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>System Information</Text>

        <Text style={styles.info}>
          Data source: ESP32 + JSN-SR04T ultrasonic sensors
        </Text>

        <Text style={styles.info}>
          Update interval: Prototype configuration
        </Text>

        <Text style={styles.info}>
          Storage: Backend database
        </Text>

        <Text style={styles.info}>
          Prediction: Python ML service
        </Text>
      </View>
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

  back: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginBottom: 24,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
  },

  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 24,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  label: {
    fontSize: 13,
    color: '#64748b',
  },

  value: {
    fontSize: 27,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 5,
  },

  small: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 3,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 16,
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
  },

  row: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  time: {
    flex: 1,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },

  station: {
    flex: 1.5,
    textAlign: 'center',
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },

  info: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 10,
  },
});