import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function AlertsScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back to Dashboard</Text>
      </Pressable>

      <Text style={styles.title}>Alerts</Text>

      <Text style={styles.subtitle}>
        Water-level and sensor notifications
      </Text>

      <View style={styles.statusCard}>
        <View style={styles.greenDot} />

        <View style={styles.statusContent}>
          <Text style={styles.statusTitle}>No Active Alerts</Text>

          <Text style={styles.statusText}>
            All monitoring stations are currently operating normally.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Alert Rules</Text>

      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Text style={styles.ruleTitle}>Low Level</Text>

          <Text style={styles.lowBadge}>LOW</Text>
        </View>

        <Text style={styles.ruleText}>
          Water level is within the low monitoring range.
        </Text>
      </View>

      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Text style={styles.ruleTitle}>Medium Level</Text>

          <Text style={styles.mediumBadge}>MEDIUM</Text>
        </View>

        <Text style={styles.ruleText}>
          Water level requires normal monitoring.
        </Text>
      </View>

      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Text style={styles.ruleTitle}>High Level</Text>

          <Text style={styles.highBadge}>HIGH</Text>
        </View>

        <Text style={styles.ruleText}>
          Water level is high and should be monitored closely.
        </Text>
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Prototype Notice</Text>

        <Text style={styles.noteText}>
          These alert ranges are prototype values for the application UI.
          Final flood-warning thresholds should be defined using
          site-specific measurements and project requirements.
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

  statusCard: {
    flexDirection: 'row',
    backgroundColor: '#dcfce7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
  },

  greenDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    marginTop: 5,
    marginRight: 12,
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#166534',
  },

  statusText: {
    fontSize: 13,
    color: '#166534',
    marginTop: 5,
    lineHeight: 20,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },

  ruleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  ruleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },

  ruleText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
    lineHeight: 19,
  },

  lowBadge: {
    color: '#15803d',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },

  mediumBadge: {
    color: '#b45309',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },

  highBadge: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },

  noteCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  noteTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e3a8a',
    marginBottom: 6,
  },

  noteText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
});