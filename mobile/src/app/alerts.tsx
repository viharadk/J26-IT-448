import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import HamburgerButton from '@/components/HamburgerButton';
import { useAppTheme } from '@/context/ThemeContext';

type AlertRule = {
  id: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  threshold: string;
  emoji: string;
};

const alertRules: AlertRule[] = [
  {
    id: 'low',
    level: 'LOW',
    title: 'Low Level',
    description: 'Water level is within the safe monitoring range. No immediate action required.',
    threshold: '< 1.0 m',
    emoji: '🟢',
  },
  {
    id: 'medium',
    level: 'MEDIUM',
    title: 'Medium Level',
    description: 'Water level requires increased monitoring. Prepare for possible elevation.',
    threshold: '1.0 – 1.5 m',
    emoji: '🟡',
  },
  {
    id: 'high',
    level: 'HIGH',
    title: 'High Level',
    description: 'Water level is dangerously high. Immediate response and evacuation procedures may be triggered.',
    threshold: '> 1.5 m',
    emoji: '🔴',
  },
];

function AlertRuleCard({ rule }: { rule: AlertRule }) {
  const { colors } = useAppTheme();

  const styleMap = {
    LOW: {
      badge: colors.successLight,
      badgeText: colors.success,
      accent: colors.success,
    },
    MEDIUM: {
      badge: colors.warningLight,
      badgeText: colors.warning,
      accent: colors.warning,
    },
    HIGH: {
      badge: colors.dangerLight,
      badgeText: colors.danger,
      accent: colors.danger,
    },
  }[rule.level];

  return (
    <View
      style={[
        styles.ruleCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.border,
          borderLeftColor: styleMap.accent,
        },
      ]}
    >
      <View style={styles.ruleTop}>
        <View style={styles.ruleTitleRow}>
          <Text style={styles.ruleEmoji}>{rule.emoji}</Text>
          <Text style={[styles.ruleTitle, { color: colors.text }]}>
            {rule.title}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: styleMap.badge }]}>
          <Text style={[styles.badgeText, { color: styleMap.badgeText }]}>
            {rule.level}
          </Text>
        </View>
      </View>

      <Text style={[styles.ruleDesc, { color: colors.textSecondary }]}>
        {rule.description}
      </Text>

      <View
        style={[
          styles.thresholdRow,
          { backgroundColor: colors.bgElement },
        ]}
      >
        <Text style={[styles.thresholdLabel, { color: colors.textMuted }]}>
          Threshold
        </Text>
        <Text style={[styles.thresholdValue, { color: styleMap.accent }]}>
          {rule.threshold}
        </Text>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const { colors } = useAppTheme();

  const hasActiveAlerts = false; // prototype

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.bgCard, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerLeftGroup}>
          <HamburgerButton color={colors.text} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              🔔 Alerts
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              Water-level & sensor notifications
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: hasActiveAlerts
                ? colors.dangerLight
                : colors.successLight,
              borderColor: hasActiveAlerts
                ? colors.danger + '44'
                : colors.success + '44',
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: hasActiveAlerts
                  ? colors.danger
                  : colors.success,
              },
            ]}
          />
          <View style={styles.statusContent}>
            <Text
              style={[
                styles.statusTitle,
                {
                  color: hasActiveAlerts ? colors.danger : colors.success,
                },
              ]}
            >
              {hasActiveAlerts ? 'Active Alerts' : 'All Clear'}
            </Text>
            <Text
              style={[
                styles.statusText,
                {
                  color: hasActiveAlerts ? colors.danger : colors.success,
                },
              ]}
            >
              {hasActiveAlerts
                ? 'One or more stations require attention.'
                : 'All monitoring stations are operating normally.'}
            </Text>
          </View>
        </View>

        {/* Alert rules */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Alert Rules
        </Text>

        {alertRules.map((rule) => (
          <AlertRuleCard key={rule.id} rule={rule} />
        ))}

        {/* Note */}
        <View
          style={[
            styles.noteCard,
            {
              backgroundColor: colors.accentLight,
              borderColor: colors.accentPrimary + '44',
            },
          ]}
        >
          <Text style={[styles.noteTitle, { color: colors.accentDark }]}>
            ℹ️ Prototype Notice
          </Text>
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            Alert thresholds above are provisional values. Final flood-warning
            thresholds must be calibrated using site-specific field measurements
            and project requirements.
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

  header: {
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },

  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    gap: 12,
  },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 4,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },

  statusText: {
    fontSize: 13,
    lineHeight: 19,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 4,
  },

  ruleCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    elevation: 2,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  ruleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  ruleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  ruleEmoji: {
    fontSize: 18,
  },

  ruleTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  ruleDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },

  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  thresholdLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  thresholdValue: {
    fontSize: 14,
    fontWeight: '800',
  },

  noteCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginTop: 4,
  },

  noteTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },

  noteText: {
    fontSize: 12,
    lineHeight: 18,
  },
});