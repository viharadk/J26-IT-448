import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
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
    name: 'Hanwella Station',
    level: 0.72,
    status: 'MEDIUM',
    prediction: 0.84,
    sensorOnline: true,
    lastUpdated: 'Just now',
    latitude: 6.9031,
    longitude: 80.0823,
  },
  {
    id: 'location-02',
    name: 'Glencourse Station',
    level: 0.65,
    status: 'MEDIUM',
    prediction: 0.76,
    sensorOnline: true,
    lastUpdated: '1 min ago',
    latitude: 6.9786,
    longitude: 80.1737,
  },
];

const recentReadings = [
  { time: '11:50', location01: 0.72, location02: 0.65 },
  { time: '11:40', location01: 0.69, location02: 0.63 },
  { time: '11:30', location01: 0.66, location02: 0.61 },
  { time: '11:20', location01: 0.64, location02: 0.59 },
];

function StatusBadge({ status }: { status: LocationData['status'] }) {
  const { colors } = useAppTheme();

  const config = {
    HIGH: { bg: colors.dangerLight, text: colors.danger, label: '🔴 HIGH' },
    MEDIUM: {
      bg: colors.warningLight,
      text: colors.warning,
      label: '🟡 MEDIUM',
    },
    LOW: { bg: colors.successLight, text: colors.success, label: '🟢 LOW' },
  }[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.statusText, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

function WaterLevelBar({ level }: { level: number }) {
  const { colors } = useAppTheme();
  const percent = Math.min(level / 2.0, 1); // max assumed 2m

  const barColor =
    level > 1.5
      ? colors.danger
      : level > 1.0
        ? colors.warning
        : colors.accentPrimary;

  return (
    <View
      style={[styles.levelBarTrack, { backgroundColor: colors.bgElement }]}
    >
      <View
        style={[
          styles.levelBarFill,
          { width: `${percent * 100}%` as `${number}%`, backgroundColor: barColor },
        ]}
      />
    </View>
  );
}

function LocationCard({ location }: { location: LocationData }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.locationCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.border,
          shadowColor: colors.text,
        },
      ]}
    >
      {/* Card Header */}
      <View style={styles.locationHeader}>
        <View style={styles.locationTitleRow}>
          <Text style={[styles.locationName, { color: colors.text }]}>
            {location.name}
          </Text>
          <View style={styles.sensorRow}>
            <View
              style={[
                styles.sensorDot,
                {
                  backgroundColor: location.sensorOnline
                    ? colors.success
                    : colors.danger,
                },
              ]}
            />
            <Text style={[styles.sensorText, { color: colors.textSecondary }]}>
              {location.sensorOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <StatusBadge status={location.status} />
      </View>

      {/* Level display */}
      <View style={styles.levelRow}>
        <View>
          <Text style={[styles.levelValue, { color: colors.accentPrimary }]}>
            {location.level.toFixed(2)}
            <Text style={[styles.levelUnit, { color: colors.textSecondary }]}>
              {' '}m
            </Text>
          </Text>
          <Text style={[styles.levelLabel, { color: colors.textMuted }]}>
            Current Water Level
          </Text>
        </View>

        <View style={styles.predictionBox}>
          <Text style={[styles.predictionLabel, { color: colors.textMuted }]}>
            30 min forecast
          </Text>
          <Text style={[styles.predictionValue, { color: colors.text }]}>
            {location.prediction.toFixed(2)} m
          </Text>
        </View>
      </View>

      <WaterLevelBar level={location.level} />

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={[styles.updatedText, { color: colors.textMuted }]}>
          🕐 {location.lastUpdated}
        </Text>
      </View>
    </View>
  );
}

function StatCard({
  emoji,
  value,
  label,
  valueColor,
}: {
  emoji: string;
  value: string;
  label: string;
  valueColor?: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.border,
          shadowColor: colors.text,
        },
      ]}
    >
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text
        style={[
          styles.statValue,
          { color: valueColor || colors.text },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { colors, mode } = useAppTheme();

  const onlineSensors = locations.filter((l) => l.sensorOnline).length;
  const highAlerts = locations.filter((l) => l.status === 'HIGH').length;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Gradient header */}
      <LinearGradient
        colors={[colors.headerGradientStart, colors.headerGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerInner}>
          <View style={styles.headerLeft}>
            <Image
              source={require('@/assets/images/kelani-guard-logo.jpg')}
              style={styles.logoImage}
              contentFit="cover"
            />
            <View>
              <Text style={styles.appName}>Kelani Guard</Text>
              <Text style={styles.appSubtitle}>Water Level Monitoring</Text>
            </View>
          </View>
          <View style={styles.headerBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard
            emoji="📍"
            value={String(locations.length)}
            label="Stations"
          />
          <StatCard
            emoji="📡"
            value={`${onlineSensors}/${locations.length}`}
            label="Online"
            valueColor={colors.success}
          />
          <StatCard
            emoji="🔔"
            value={String(highAlerts)}
            label="Alerts"
            valueColor={highAlerts > 0 ? colors.danger : colors.success}
          />
        </View>

        {/* Section: Water Levels */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Water Levels
          </Text>
          <View
            style={[
              styles.sectionChip,
              { backgroundColor: colors.accentLight },
            ]}
          >
            <Text
              style={[styles.sectionChipText, { color: colors.accentPrimary }]}
            >
              {locations.length} stations
            </Text>
          </View>
        </View>

        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}

        {/* Section: Map */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>
          Monitoring Map
        </Text>
        <View
          style={[
            styles.mapCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <WaterMap locations={locations} />
        </View>

        {/* Section: Recent Readings */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Recent Readings
          </Text>
          <Pressable onPress={() => router.push('/history')}>
            <Text style={[styles.viewLink, { color: colors.accentPrimary }]}>
              Full History →
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.readingsCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          {/* Table header */}
          <View
            style={[
              styles.tableHeader,
              { backgroundColor: colors.bgElement },
            ]}
          >
            <Text
              style={[
                styles.tableHeaderText,
                styles.timeCol,
                { color: colors.textSecondary },
              ]}
            >
              Time
            </Text>
            <Text
              style={[
                styles.tableHeaderText,
                { color: colors.textSecondary },
              ]}
            >
              Hanwella
            </Text>
            <Text
              style={[
                styles.tableHeaderText,
                { color: colors.textSecondary },
              ]}
            >
              Glencourse
            </Text>
          </View>

          {recentReadings.map((reading, idx) => (
            <View
              key={reading.time}
              style={[
                styles.tableRow,
                {
                  borderTopColor: colors.divider,
                  backgroundColor:
                    idx % 2 === 0 ? 'transparent' : colors.bgElement + '60',
                },
              ]}
            >
              <Text
                style={[
                  styles.tableText,
                  styles.timeCol,
                  { color: colors.textSecondary },
                ]}
              >
                {reading.time}
              </Text>
              <Text style={[styles.tableText, { color: colors.text }]}>
                {reading.location01.toFixed(2)} m
              </Text>
              <Text style={[styles.tableText, { color: colors.text }]}>
                {reading.location02.toFixed(2)} m
              </Text>
            </View>
          ))}
        </View>

        {/* Notice */}
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: colors.accentLight,
              borderColor: colors.accentPrimary + '44',
            },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.accentDark }]}>
            ℹ️ Prototype System
          </Text>
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            Live ESP32 sensor data will be connected through the backend API.
            Current readings are prototype values.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  /* Header gradient */
  headerGradient: {
    paddingTop: 55,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },

  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },

  appSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },

  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },

  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },

  /* Scroll */
  scrollView: {
    flex: 1,
  },

  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 0,
  },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
    marginTop: 4,
  },

  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  statEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },

  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },

  statLabel: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },

  /* Section headers */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  sectionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  sectionChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  viewLink: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },

  /* Location cards */
  locationCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 3,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  locationTitleRow: {
    flex: 1,
    marginRight: 10,
  },

  locationName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },

  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  sensorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  sensorText: {
    fontSize: 12,
    fontWeight: '500',
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },

  levelValue: {
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 42,
  },

  levelUnit: {
    fontSize: 16,
    fontWeight: '600',
  },

  levelLabel: {
    fontSize: 12,
    marginTop: 2,
  },

  predictionBox: {
    alignItems: 'flex-end',
  },

  predictionLabel: {
    fontSize: 11,
    marginBottom: 3,
  },

  predictionValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  levelBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },

  levelBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  cardFooter: {
    marginTop: 6,
  },

  updatedText: {
    fontSize: 12,
  },

  /* Map card */
  mapCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 22,
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },

  /* Readings card */
  readingsCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },

  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },

  tableHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderTopWidth: 1,
  },

  tableText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  timeCol: {
    textAlign: 'left',
    flex: 0.7,
  },

  /* Notice */
  noticeCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },

  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },

  noticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
});