import { Image } from 'expo-image';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  ACCENT_PRESETS,
  AccentPreset,
  useAppTheme,
} from '@/context/ThemeContext';

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionCardTitle, { color: colors.textMuted }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowDivider() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.divider, { backgroundColor: colors.divider }]} />
  );
}

export default function SettingsScreen() {
  const { colors, mode, accent, toggleMode, setAccent } = useAppTheme();

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
          ⚙️ Settings
        </Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          App preferences & customization
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* App identity */}
        <View
          style={[
            styles.identityCard,
            { backgroundColor: colors.accentLight, borderColor: colors.accentPrimary + '44' },
          ]}
        >
          <Image
            source={require('@/assets/images/kelani-guard-logo.jpg')}
            style={styles.identityLogo}
            contentFit="cover"
          />
          <View style={styles.identityText}>
            <Text style={[styles.identityName, { color: colors.accentDark }]}>
              Kelani Guard System
            </Text>
            <Text style={[styles.identityVersion, { color: colors.textSecondary }]}>
              Version 1.0.0 — Prototype
            </Text>
          </View>
        </View>

        {/* Appearance */}
        <SectionCard title="APPEARANCE">
          {/* Dark mode toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowEmoji}>🌙</Text>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Dark Mode
                </Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  {mode === 'dark' ? 'Currently dark' : 'Currently light'}
                </Text>
              </View>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleMode}
              trackColor={{
                false: colors.bgElement,
                true: colors.accentPrimary,
              }}
              thumbColor="#ffffff"
            />
          </View>

          <RowDivider />

          {/* Accent colors */}
          <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowEmoji}>🎨</Text>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Accent Color
                </Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  {ACCENT_PRESETS[accent].label} selected
                </Text>
              </View>
            </View>

            <View style={styles.accentRow}>
              {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => {
                const preset = ACCENT_PRESETS[key];
                const isSelected = accent === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setAccent(key)}
                    style={({ pressed }) => [
                      styles.accentButton,
                      {
                        backgroundColor: preset.primary,
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                        borderWidth: isSelected ? 3 : 0,
                        borderColor: isSelected ? colors.text : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && (
                      <Text style={styles.accentCheck}>✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.accentLabels}>
              {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => (
                <Text
                  key={key}
                  style={[
                    styles.accentLabel,
                    {
                      color: accent === key ? colors.accentPrimary : colors.textMuted,
                      fontWeight: accent === key ? '700' : '400',
                    },
                  ]}
                >
                  {ACCENT_PRESETS[key].label}
                </Text>
              ))}
            </View>
          </View>
        </SectionCard>

        {/* Monitoring */}
        <SectionCard title="MONITORING">
          {[
            { emoji: '🌊', label: 'River', value: 'Kelani River' },
            { emoji: '📍', label: 'Stations', value: '2 Active' },
            { emoji: '⏱️', label: 'Update Interval', value: 'Prototype' },
            { emoji: '🔮', label: 'Prediction', value: '30 min horizon' },
          ].map((item, i) => (
            <View key={item.label}>
              {i > 0 && <RowDivider />}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowEmoji}>{item.emoji}</Text>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {item.label}
                  </Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                  {item.value}
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>

        {/* Technology */}
        <SectionCard title="TECHNOLOGY">
          {[
            { emoji: '🔌', label: 'Sensor', value: 'ESP32 + JSN-SR04T' },
            { emoji: '☁️', label: 'Backend', value: 'REST API' },
            { emoji: '🤖', label: 'ML Engine', value: 'Python service' },
            { emoji: '📱', label: 'Platform', value: 'Expo / React Native' },
          ].map((item, i) => (
            <View key={item.label}>
              {i > 0 && <RowDivider />}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowEmoji}>{item.emoji}</Text>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {item.label}
                  </Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                  {item.value}
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>

        {/* Prototype notice */}
        <View
          style={[
            styles.protoNotice,
            {
              backgroundColor: colors.accentLight,
              borderColor: colors.accentPrimary + '44',
            },
          ]}
        >
          <Text style={[styles.protoTitle, { color: colors.accentDark }]}>
            🚧 Research Prototype
          </Text>
          <Text style={[styles.protoText, { color: colors.textSecondary }]}>
            This is an early-stage research prototype for the Kelani River flood
            early-warning system. Live sensor integration and production hardening
            are in progress.
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
    paddingBottom: 40,
    gap: 14,
  },

  /* Identity card */
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },

  identityLogo: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },

  identityText: {
    flex: 1,
  },

  identityName: {
    fontSize: 17,
    fontWeight: '800',
  },

  identityVersion: {
    fontSize: 12,
    marginTop: 3,
  },

  /* Section card */
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  sectionCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },

  divider: {
    height: 1,
    marginHorizontal: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  rowEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },

  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },

  rowSub: {
    fontSize: 12,
    marginTop: 1,
  },

  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 140,
    textAlign: 'right',
  },

  /* Accent colors */
  accentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 40,
  },

  accentButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  accentCheck: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  accentLabels: {
    flexDirection: 'row',
    gap: 0,
    paddingLeft: 40,
    justifyContent: 'space-around',
    width: '100%',
  },

  accentLabel: {
    fontSize: 10,
    width: 48,
    textAlign: 'center',
  },

  /* Prototype notice */
  protoNotice: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },

  protoTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 7,
  },

  protoText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
