import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import HamburgerButton from '@/components/HamburgerButton';
import HistorySection from '@/components/HistorySection';
import { useAppTheme } from '@/context/ThemeContext';

export default function HistoryScreen() {
  const { colors } = useAppTheme();

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
              📊 Sensor History
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              Historical water levels & trend analysis
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* History Section Component */}
        <HistorySection title="Past Readings & Trends" showFullTableOption={true} />

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
            { label: 'Data Source', value: 'ESP32 + JSN-SR04T ultrasonic sensors' },
            { label: 'Storage Database', value: 'MongoDB Atlas (M0)' },
            { label: 'Save Frequency', value: '1 reading per minute' },
            { label: 'Timezone', value: 'Sri Lanka Time (Asia/Colombo)' },
            { label: 'Sensor Mounting Height', value: '200 cm' },
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

  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headerTitle: {
    fontSize: 24,
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

  tableTitle: {
    fontSize: 15,
    fontWeight: '800',
    padding: 16,
    paddingBottom: 12,
  },

  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    marginTop: 4,
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