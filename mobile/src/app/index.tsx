import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import HamburgerButton from '@/components/HamburgerButton';
import { useAppTheme } from '@/context/ThemeContext';
import WaterMap from '../components/WaterMap';

// ---------------------------------------------------------------------------
// API configuration — change the IP here if your laptop address changes
// ---------------------------------------------------------------------------
const API_BASE_URL = 'http://192.168.8.178:3000';
const POLL_INTERVAL_MS = 2000;

/** Maximum measurable water level (sensor mounting height, in cm). */
const SENSOR_HEIGHT_CM = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/readings/latest */
type SensorReading = {
  deviceId: string;
  /** Raw ultrasonic distance in cm (sensor → water surface) */
  location01: number;
  location02: number;
  /** Water level in cm = SENSOR_HEIGHT_CM − distance. Null when sensor had no reading. */
  waterLevel01: number | null;
  waterLevel02: number | null;
  receivedAt: string;
};

type LocationData = {
  id: string;
  name: string;
  /** Calculated water level in cm (null = sensor gave no reading) */
  waterLevelCm: number | null;
  /** Raw ultrasonic distance in cm — shown only as secondary info */
  distanceCm: number | null;
  /** True when values came from the live API */
  isLive: boolean;
  // ---- below fields are DEMO / mock until backend supplies them ----
  status: 'LOW' | 'MEDIUM' | 'HIGH';
  prediction: number;
  sensorOnline: boolean;
  lastUpdated: string;
  latitude: number;
  longitude: number;
};

/** Static station config — coordinates and API field names */
const STATION_CONFIG = [
  {
    id: 'location-01',
    name: 'Hanwella Station',
    waterLevelKey: 'waterLevel01' as keyof SensorReading,
    distanceKey:   'location01'   as keyof SensorReading,
    latitude: 6.9031,
    longitude: 80.0823,
  },
  {
    id: 'location-02',
    name: 'Glencourse Station',
    waterLevelKey: 'waterLevel02' as keyof SensorReading,
    distanceKey:   'location02'   as keyof SensorReading,
    latitude: 6.9786,
    longitude: 80.1737,
  },
] as const;

/** Placeholder values shown before the first successful API response */
const DEMO_LOCATIONS: LocationData[] = [
  {
    id: 'location-01',
    name: 'Hanwella Station',
    waterLevelCm: null,
    distanceCm: null,
    isLive: false,
    status: 'MEDIUM',
    prediction: 0.84,
    sensorOnline: false,
    lastUpdated: '—',
    latitude: 6.9031,
    longitude: 80.0823,
  },
  {
    id: 'location-02',
    name: 'Glencourse Station',
    waterLevelCm: null,
    distanceCm: null,
    isLive: false,
    status: 'MEDIUM',
    prediction: 0.76,
    sensorOnline: false,
    lastUpdated: '—',
    latitude: 6.9786,
    longitude: 80.1737,
  },
];

/** Demo history rows — shown greyed-out below the live row */
const DEMO_HISTORY = [
  { time: '—', waterLevel01: null as number | null, waterLevel02: null as number | null },
  { time: '—', waterLevel01: null as number | null, waterLevel02: null as number | null },
];

// ---------------------------------------------------------------------------
// Custom hook: useSensorReadings
// ---------------------------------------------------------------------------
function useSensorReadings() {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLatest() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/readings/latest`);
        if (!res.ok) {
          if (res.status === 404) {
            // Backend running but ESP32 hasn't sent data yet
            if (!cancelled) setError('Waiting for sensor data…');
          } else {
            if (!cancelled) setError(`Server error ${res.status}`);
          }
          return;
        }
        const data: SensorReading = await res.json();
        if (!cancelled) {
          setReading(data);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Cannot reach server. Check your Wi-Fi and API_BASE_URL.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLatest();
    intervalRef.current = setInterval(fetchLatest, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, []);

  return { reading, error, loading };
}

// ---------------------------------------------------------------------------
// Helper: calculate water level with fallback to (SENSOR_HEIGHT_CM - distance)
// ---------------------------------------------------------------------------
function resolveWaterLevel(
  waterLevel: number | null | undefined,
  distance: number | null | undefined
): number | null {
  if (typeof waterLevel === 'number' && !isNaN(waterLevel)) {
    return Math.max(0, Math.min(SENSOR_HEIGHT_CM, Number(waterLevel.toFixed(2))));
  }
  if (typeof distance === 'number' && !isNaN(distance)) {
    const computed = SENSOR_HEIGHT_CM - distance;
    return Math.max(0, Math.min(SENSOR_HEIGHT_CM, Number(computed.toFixed(2))));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: build LocationData array from live reading + static config
// ---------------------------------------------------------------------------
function buildLocations(
  reading: SensorReading | null,
  now: string
): LocationData[] {
  return STATION_CONFIG.map((cfg) => {
    const demo = DEMO_LOCATIONS.find((d) => d.id === cfg.id)!;
    if (reading == null) return demo;

    const rawWaterLevel = reading[cfg.waterLevelKey] as number | null | undefined;
    const rawDistance   = reading[cfg.distanceKey]   as number | null | undefined;

    // Use backend water level if present; fallback to (SENSOR_HEIGHT_CM - distance)
    const waterLevelCm = resolveWaterLevel(rawWaterLevel, rawDistance);
    const distanceCm   = typeof rawDistance === 'number' && !isNaN(rawDistance) ? rawDistance : null;
    const hasReading   = waterLevelCm != null;

    return {
      ...demo,
      waterLevelCm,
      distanceCm,
      isLive:       true,
      sensorOnline: hasReading,
      lastUpdated:  now,
    };
  });
}

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

function WaterLevelBar({ level }: { level: number | null }) {
  const { colors } = useAppTheme();

  // level is water level in cm; SENSOR_HEIGHT_CM is the 100 % mark
  const safeCm  = level ?? 0;
  const percent = Math.min(Math.max(safeCm / SENSOR_HEIGHT_CM, 0), 1);

  const barColor =
    safeCm >= SENSOR_HEIGHT_CM * 0.85
      ? colors.danger
      : safeCm >= SENSOR_HEIGHT_CM * 0.60
        ? colors.warning
        : colors.accentPrimary;

  return (
    <View style={[styles.levelBarTrack, { backgroundColor: colors.bgElement }]}>
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
          borderColor: location.isLive ? colors.accentPrimary + '55' : colors.border,
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

      {/* ── Main: water level (backend-calculated) ── */}
      <View style={styles.levelRow}>
        <View>
          {location.waterLevelCm != null ? (
            <Text style={[styles.levelValue, { color: colors.accentPrimary }]}>
              {location.waterLevelCm.toFixed(1)}
              <Text style={[styles.levelUnit, { color: colors.textSecondary }]}>
                {' '}cm
              </Text>
            </Text>
          ) : (
            <Text style={[styles.levelValue, { color: colors.textMuted, fontSize: 22 }]}>
              No reading
            </Text>
          )}
          <Text style={[styles.levelLabel, { color: colors.textMuted }]}>
            {location.isLive ? '💧 Water Level (Live)' : '💧 Water Level'}
          </Text>
          {/* Secondary: raw sensor distance */}
          {location.distanceCm != null && (
            <Text style={[styles.distanceSecondary, { color: colors.textMuted }]}>
              Distance from sensor: {location.distanceCm.toFixed(1)} cm
            </Text>
          )}
        </View>

        <View style={styles.predictionBox}>
          <Text style={[styles.predictionLabel, { color: colors.textMuted }]}>
            30 min forecast
          </Text>
          <Text style={[styles.predictionValue, { color: colors.text }]}>
            {location.prediction.toFixed(2)} m
          </Text>
          <Text style={[styles.demoTag, { color: colors.textMuted }]}>
            (demo)
          </Text>
        </View>
      </View>

      {/* Progress bar: water level as % of SENSOR_HEIGHT_CM */}
      <WaterLevelBar level={location.waterLevelCm} />

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
  const { reading, error, loading } = useSensorReadings();

  // Format timestamp in Sri Lanka time (UTC+5:30)
  const lastUpdatedLabel = reading
    ? new Date(reading.receivedAt).toLocaleTimeString('en-LK', {
        timeZone: 'Asia/Colombo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '—';

  const locations = buildLocations(reading, lastUpdatedLabel);

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
            <HamburgerButton color="#ffffff" />
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

      {/* Loading / error banner (non-blocking) */}
      {loading && (
        <View style={[styles.apiBanner, { backgroundColor: colors.bgElement }]}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={[styles.apiBannerText, { color: colors.textSecondary }]}>
            Connecting to backend…
          </Text>
        </View>
      )}
      {!loading && error != null && (
        <View style={[styles.apiBanner, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.apiBannerText, { color: colors.danger }]}>
            ⚠️ {error}
          </Text>
        </View>
      )}

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

          {/* Live row — highlighted, water level values */}
          {reading != null && (
            <View
              style={[
                styles.tableRow,
                {
                  borderTopColor: colors.divider,
                  backgroundColor: colors.accentLight + '55',
                },
              ]}
            >
              <Text
                style={[
                  styles.tableText,
                  styles.timeCol,
                  { color: colors.accentPrimary, fontWeight: '800' },
                ]}
              >
                {lastUpdatedLabel}
              </Text>
              <Text style={[styles.tableText, { color: colors.accentPrimary, fontWeight: '700' }]}>
                {locations[0]?.waterLevelCm != null
                  ? `${locations[0].waterLevelCm.toFixed(1)} cm`
                  : 'No reading'}
              </Text>
              <Text style={[styles.tableText, { color: colors.accentPrimary, fontWeight: '700' }]}>
                {locations[1]?.waterLevelCm != null
                  ? `${locations[1].waterLevelCm.toFixed(1)} cm`
                  : 'No reading'}
              </Text>
            </View>
          )}

          {/* Placeholder history rows */}
          {DEMO_HISTORY.map((row, idx) => (
            <View
              key={idx}
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
                {row.time}
              </Text>
              <Text style={[styles.tableText, { color: colors.textMuted }]}>
                {row.waterLevel01 != null ? `${row.waterLevel01.toFixed(1)} cm` : '—'}
              </Text>
              <Text style={[styles.tableText, { color: colors.textMuted }]}>
                {row.waterLevel02 != null ? `${row.waterLevel02.toFixed(1)} cm` : '—'}
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
            Water level = {SENSOR_HEIGHT_CM} cm − sensor distance. Polled every{' '}
            {POLL_INTERVAL_MS / 1000} s. Risk badges and 30-min forecasts are
            demo placeholders not based on real data.
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

  /* API status banner (loading / error) */
  apiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  apiBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },

  /* Demo tag under prediction */
  demoTag: {
    fontSize: 10,
    marginTop: 2,
  },

  /* Secondary distance label under the main water-level value */
  distanceSecondary: {
    fontSize: 11,
    marginTop: 4,
  },
});