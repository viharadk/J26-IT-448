import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';

const readings = [
  { time: '11:50', location01: 0.72, location02: 0.65 },
  { time: '11:45', location01: 0.71, location02: 0.64 },
  { time: '11:40', location01: 0.70, location02: 0.63 },
  { time: '11:35', location01: 0.69, location02: 0.62 },
  { time: '11:30', location01: 0.68, location02: 0.61 },
  { time: '11:25', location01: 0.67, location02: 0.60 },
  { time: '11:20', location01: 0.66, location02: 0.59 },
];

export default function HistoryScreen() {
  const { colors } = useAppTheme();

  const current01 = readings[0].location01;
  const current02 = readings[0].location02;
  const delta01 = readings[0].location01 - readings[readings.length - 1].location01;
  const delta02 = readings[0].location02 - readings[readings.length - 1].location02;

  function DeltaBadge({ delta }: { delta: number }) {
    const isUp = delta > 0;
    const color = isUp ? colors.danger : colors.success;
    return (
      <Text style={[styles.deltaBadge, { color }]}>
        {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(2)} m
      </Text>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.bgCard, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          📊 History
        </Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          Historical sensor readings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stationLabel, { color: colors.textMuted }]}>
              Hanwella
            </Text>
            <Text style={[styles.currentValue, { color: colors.accentPrimary }]}>
              {current01.toFixed(2)} m
            </Text>
            <DeltaBadge delta={delta01} />
          </View>

          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stationLabel, { color: colors.textMuted }]}>
              Glencourse
            </Text>
            <Text style={[styles.currentValue, { color: colors.accentPrimary }]}>
              {current02.toFixed(2)} m
            </Text>
            <DeltaBadge delta={delta02} />
          </View>
        </View>

        {/* Readings table */}
        <View
          style={[
            styles.tableCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.tableTitle, { color: colors.text }]}>
            Recent Measurements
          </Text>

          <View style={[styles.tableHeader, { backgroundColor: colors.bgElement }]}>
            <Text style={[styles.thTime, styles.headerCell, { color: colors.textSecondary }]}>
              Time
            </Text>
            <Text style={[styles.thStation, styles.headerCell, { color: colors.textSecondary }]}>
              Hanwella
            </Text>
            <Text style={[styles.thStation, styles.headerCell, { color: colors.textSecondary }]}>
              Glencourse
            </Text>
          </View>

          {readings.map((r, idx) => (
            <View
              key={r.time}
              style={[
                styles.row,
                {
                  borderTopColor: colors.divider,
                  backgroundColor: idx % 2 === 0
                    ? 'transparent'
                    : colors.bgElement + '50',
                },
              ]}
            >
              <Text style={[styles.thTime, styles.cellText, { color: colors.textSecondary }]}>
                {r.time}
              </Text>
              <Text style={[styles.thStation, styles.cellText, { color: colors.text }]}>
                {r.location01.toFixed(2)} m
              </Text>
              <Text style={[styles.thStation, styles.cellText, { color: colors.text }]}>
                {r.location02.toFixed(2)} m
              </Text>
            </View>
          ))}
        </View>

        {/* System info */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.tableTitle, { color: colors.text }]}>
            System Information
          </Text>

          {[
            { label: 'Data source', value: 'ESP32 + JSN-SR04T ultrasonic sensors' },
            { label: 'Update interval', value: 'Prototype configuration' },
            { label: 'Storage', value: 'Backend database' },
            { label: 'Prediction engine', value: 'Python ML service' },
          ].map((item) => (
            <View
              key={item.label}
              style={[styles.infoRow, { borderTopColor: colors.divider }]}
            >
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                {item.label}
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  header: {
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },

  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
  },

  headerSub: {
    fontSize: 13,
    marginTop: 3,
  },

  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },

  summaryCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  stationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },

  currentValue: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 6,
  },

  deltaBadge: {
    fontSize: 13,
    fontWeight: '700',
  },

  tableCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },

  tableTitle: {
    fontSize: 16,
    fontWeight: '800',
    padding: 16,
    paddingBottom: 12,
  },

  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  headerCell: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderTopWidth: 1,
  },

  cellText: {
    fontSize: 13,
    fontWeight: '600',
  },

  thTime: {
    flex: 0.8,
  },

  thStation: {
    flex: 1.1,
    textAlign: 'center',
  },

  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    flexWrap: 'wrap',
    gap: 4,
  },

  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
});