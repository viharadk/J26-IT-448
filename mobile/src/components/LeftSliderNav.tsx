import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavSlider } from '../context/NavSliderContext';
import { useAppTheme } from '../context/ThemeContext';

const PANEL_WIDTH = 310;

interface NavItem {
  id: string;
  name: string;
  route: string;
  emoji: string;
  description: string;
  badge?: string;
}

const MAIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    route: '/',
    emoji: '🏠',
    description: 'Live water levels, stations & map',
  },
  {
    id: 'alerts',
    name: 'Alerts',
    route: '/alerts',
    emoji: '🔔',
    description: 'Active alarms & safety thresholds',
    badge: '1 Alert',
  },
  {
    id: 'history',
    name: 'History',
    route: '/history',
    emoji: '📊',
    description: 'Hourly trends & telemetry logs',
  },
  {
    id: 'settings',
    name: 'Settings',
    route: '/settings',
    emoji: '⚙️',
    description: 'Dark mode & system preferences',
  },
];

interface UpcomingFeature {
  id: string;
  name: string;
  emoji: string;
  tag: string;
  description: string;
}

const UPCOMING_FEATURES: UpcomingFeature[] = [
  {
    id: 'water_quality',
    name: 'Water Quality',
    emoji: '💧',
    tag: 'Phase 2',
    description: 'pH, turbidity, and dissolved oxygen tracking',
  },
  {
    id: 'flood_forecast',
    name: 'AI Flood Forecast',
    emoji: '🌧️',
    tag: 'ML Model',
    description: 'Predictive river crest modeling & warnings',
  },
  {
    id: 'sensor_health',
    name: 'Sensor Diagnostics',
    emoji: '📡',
    tag: 'IoT',
    description: 'Hardware voltage, RSSI signal & calibration',
  },
  {
    id: 'gis_basin',
    name: 'River Basin GIS',
    emoji: '🗺️',
    tag: 'GIS',
    description: 'Catchment topography & rain runoff radar',
  },
];

export default function LeftSliderNav() {
  const { colors, mode, toggleMode } = useAppTheme();
  const { isOpen, closeSlider, openSlider } = useNavSlider();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const topPadding =
    insets.top > 0
      ? insets.top + 6
      : Platform.select({
          ios: 50,
          android: (StatusBar.currentHeight ?? 24) + 12,
          default: 50,
        });

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Close button: springs in when panel opens
  const closeBtnScale = useRef(new Animated.Value(0)).current;

  // Nav item entrance: one value per item (0 = hidden, 1 = visible)
  const navItemAnims = useRef(
    MAIN_NAV_ITEMS.map(() => new Animated.Value(0))
  ).current;

  // Pull handle: looping breathe scale
  const handleBreathAnim = useRef(new Animated.Value(1)).current;

  // Status dot: looping halo pulse
  const statusPulseAnim = useRef(new Animated.Value(0)).current;

  // ── Panel slide + backdrop fade ──────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -PANEL_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, slideAnim, fadeAnim]);

  // ── Close button spring-in + nav item stagger ─────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // Close button bounces in after a short delay
      Animated.spring(closeBtnScale, {
        toValue: 1,
        delay: 120,
        useNativeDriver: true,
        bounciness: 14,
        speed: 12,
      }).start();

      // Each nav item slides + fades in with a staggered delay
      navItemAnims.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: 1,
          duration: 260,
          delay: 90 + i * 55,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Reset instantly so they re-animate next open
      closeBtnScale.setValue(0);
      navItemAnims.forEach((anim) => anim.setValue(0));
    }
  }, [isOpen, closeBtnScale, navItemAnims]);

  // ── Pull handle breathe (only while panel is closed) ─────────────────────
  useEffect(() => {
    if (isOpen) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(handleBreathAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(handleBreathAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();
    return () => { breathe.stop(); handleBreathAnim.setValue(1); };
  }, [isOpen, handleBreathAnim]);

  // ── Status dot halo pulse (always running) ───────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(statusPulseAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [statusPulseAnim]);

  const handleNavigate = (route: string) => {
    closeSlider();
    setTimeout(() => {
      if (route === '/' && pathname !== '/') {
        router.replace('/');
      } else if (route === '/alerts' && pathname !== '/alerts') {
        router.push('/alerts');
      } else if (route === '/history' && pathname !== '/history') {
        router.push('/history');
      } else if (route === '/settings' && pathname !== '/settings') {
        router.push('/settings');
      }
    }, 100);
  };

  const isActive = (route: string) => {
    if (route === '/') {
      return pathname === '/' || pathname === '/index' || pathname === '';
    }
    return pathname.startsWith(route);
  };

  return (
    <>
      {/* Pull Handle — breathes when closed to invite interaction */}
      {!isOpen && (
        <Animated.View
          style={[
            styles.floatingHandleWrapper,
            { transform: [{ scale: handleBreathAnim }] },
          ]}
        >
          <Pressable
            onPress={openSlider}
            hitSlop={{ top: 16, bottom: 16, left: 0, right: 24 }}
            style={({ pressed }) => [
              styles.floatingHandle,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            accessibilityLabel="Open Navigation Menu"
            accessibilityRole="button"
          >
            <View style={styles.handleContent}>
              <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
              <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
              <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* Modal — sits at the very top of the native view hierarchy */}
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={closeSlider}
        statusBarTranslucent
      >
        {/* Dim overlay — covers the area to the RIGHT of the panel only */}
        <Animated.View
          style={[styles.modalRoot, { opacity: fadeAnim }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[styles.backdropTouchable, { left: PANEL_WIDTH }]}
            onPress={closeSlider}
            activeOpacity={1}
            accessibilityLabel="Close navigation"
            accessibilityRole="button"
          />
        </Animated.View>

        {/* Sliding panel */}
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.bgCard,
              borderRightColor: colors.border,
              transform: [{ translateX: slideAnim }],
            },
          ]}
          pointerEvents="box-none"
        >
          {/* Header */}
          <View
            style={[
              styles.panelHeader,
              { paddingTop: topPadding, borderBottomColor: colors.divider },
            ]}
          >
            <View style={styles.brandRow}>
              <Image
                source={require('@/assets/images/kelani-guard-logo.jpg')}
                style={styles.panelLogo}
                contentFit="cover"
              />
              <View style={styles.brandTextWrap}>
                <Text
                  style={[styles.brandTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Kelani Guard
                </Text>
                <Text
                  style={[styles.brandSub, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  Navigation Menu
                </Text>
              </View>
            </View>

            {/* Close button springs in when panel opens */}
            <Animated.View style={{ transform: [{ scale: closeBtnScale }] }}>
              <TouchableOpacity
                onPress={closeSlider}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.closeButton, { backgroundColor: colors.bgElement }]}
                activeOpacity={0.6}
                accessibilityLabel="Close navigation"
                accessibilityRole="button"
              >
                <Text style={[styles.closeIcon, { color: colors.text }]}>
                  {'\u2715'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              MAIN SECTIONS
            </Text>

            <View style={styles.navGroup}>
              {MAIN_NAV_ITEMS.map((item, index) => {
                const active = isActive(item.route);
                const anim = navItemAnims[index];
                return (
                  // Each item slides in from the left + fades in
                  <Animated.View
                    key={item.id}
                    style={{
                      opacity: anim,
                      transform: [
                        {
                          translateX: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-22, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleNavigate(item.route)}
                      activeOpacity={0.7}
                      style={[
                        styles.navItem,
                        {
                          backgroundColor: active
                            ? colors.primaryLight
                            : colors.bgElement,
                          borderColor: active
                            ? colors.primary + '44'
                            : 'transparent',
                        },
                      ]}
                      accessibilityRole="menuitem"
                      accessibilityLabel={item.name}
                    >
                      <View
                        style={[
                          styles.iconWrap,
                          {
                            backgroundColor: active
                              ? colors.primary
                              : colors.bgCard,
                          },
                        ]}
                      >
                        <Text style={styles.itemEmoji}>{item.emoji}</Text>
                      </View>

                      <View style={styles.itemTextWrap}>
                        <View style={styles.itemHeaderLine}>
                          <Text
                            style={[
                              styles.itemName,
                              {
                                color: active ? colors.primaryDark : colors.text,
                                fontWeight: active ? '700' : '600',
                              },
                            ]}
                          >
                            {item.name}
                          </Text>
                          {item.badge && (
                            <View
                              style={[
                                styles.itemBadge,
                                { backgroundColor: colors.dangerLight },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.itemBadgeText,
                                  { color: colors.danger },
                                ]}
                              >
                                {item.badge}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[styles.itemDesc, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.description}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.chevron,
                          { color: active ? colors.primary : colors.textMuted },
                        ]}
                      >
                        {'\u203a'}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            {/* Upcoming Features */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                ADDITIONAL FEATURES
              </Text>
              <View
                style={[
                  styles.featureTag,
                  { backgroundColor: colors.primaryLight },
                ]}
              >
                <Text
                  style={[styles.featureTagText, { color: colors.primaryDark }]}
                >
                  Coming Soon
                </Text>
              </View>
            </View>

            <View style={styles.featuresGroup}>
              {UPCOMING_FEATURES.map((feature) => (
                <View
                  key={feature.id}
                  style={[
                    styles.featureCard,
                    {
                      backgroundColor: colors.bgElement,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.featureTop}>
                    <View style={styles.featureTitleWrap}>
                      <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                      <Text style={[styles.featureName, { color: colors.text }]}>
                        {feature.name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.tagBadge,
                        {
                          backgroundColor: colors.bgCard,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagBadgeText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {feature.tag}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.featureDesc, { color: colors.textSecondary }]}
                  >
                    {feature.description}
                  </Text>
                </View>
              ))}

              {/* Developer extension slot */}
              <View
                style={[
                  styles.addSlotCard,
                  { borderColor: colors.border, backgroundColor: colors.bgCard },
                ]}
              >
                <Text style={[styles.addSlotPlus, { color: colors.primary }]}>
                  {'\u2795'}
                </Text>
                <View style={styles.addSlotTextWrap}>
                  <Text style={[styles.addSlotTitle, { color: colors.text }]}>
                    Custom Module Slot
                  </Text>
                  <Text style={[styles.addSlotSub, { color: colors.textMuted }]}>
                    Ready for team members to plug in new screens
                  </Text>
                </View>
              </View>
            </View>

            {/* Preferences */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              PREFERENCES
            </Text>

            <View
              style={[
                styles.prefCard,
                { backgroundColor: colors.bgElement, borderColor: colors.border },
              ]}
            >
              <View style={styles.prefRow}>
                <View style={styles.prefLeft}>
                  <Text style={styles.prefEmoji}>
                    {mode === 'dark' ? '\uD83C\uDF19' : '\u2600\uFE0F'}
                  </Text>
                  <View>
                    <Text style={[styles.prefTitle, { color: colors.text }]}>
                      Dark Mode
                    </Text>
                    <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                      {mode === 'dark' ? 'Dark active' : 'Light active'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={mode === 'dark'}
                  onValueChange={toggleMode}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            {/* Footer */}
            <View style={styles.sliderFooter}>
              <View style={styles.statusIndicator}>
                {/* Pulsating halo ring behind the status dot */}
                <View style={styles.statusDotContainer}>
                  <Animated.View
                    style={[
                      styles.statusHalo,
                      {
                        backgroundColor: colors.success,
                        opacity: statusPulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 0],
                        }),
                        transform: [
                          {
                            scale: statusPulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <View
                    style={[styles.statusPulse, { backgroundColor: colors.success }]}
                  />
                </View>
                <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                  Telemetry Connected
                </Text>
              </View>
              <Text style={[styles.footerMeta, { color: colors.textMuted }]}>
                Kelani Guard System • v1.0.0
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /* The Animated.View that breathes — positioned absolutely */
  floatingHandleWrapper: {
    position: 'absolute',
    left: 0,
    top: '38%',
    zIndex: 9999,
  },

  floatingHandle: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 6 },
      default: { boxShadow: '2px 3px 10px rgba(0,0,0,0.15)' },
    }),
  },

  handleContent: { alignItems: 'center', gap: 4 },

  handleLine: { width: 14, height: 2.5, borderRadius: 2 },

  modalRoot: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  backdropTouchable: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
  },

  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    borderRightWidth: 1,
    flexDirection: 'column',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
      },
      android: { elevation: 16 },
      default: { boxShadow: '4px 0 20px rgba(0,0,0,0.25)' },
    }),
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },

  panelLogo: { width: 40, height: 40, borderRadius: 10 },

  brandTextWrap: { flex: 1, justifyContent: 'center' },

  brandTitle: { fontSize: 16, fontWeight: '800' },

  brandSub: { fontSize: 11, marginTop: 1 },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },

  scrollArea: { flex: 1 },

  scrollContent: { padding: 16, paddingBottom: 44 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 6,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
  },

  featureTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },

  featureTagText: { fontSize: 10, fontWeight: '700' },

  navGroup: { gap: 6, marginBottom: 12 },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },

  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemEmoji: { fontSize: 18 },

  itemTextWrap: { flex: 1 },

  itemHeaderLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  itemName: { fontSize: 14 },

  itemBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },

  itemBadgeText: { fontSize: 10, fontWeight: '700' },

  itemDesc: { fontSize: 11, marginTop: 2 },

  chevron: { fontSize: 20, fontWeight: '600' },

  featuresGroup: { gap: 8, marginBottom: 16 },

  featureCard: { padding: 12, borderRadius: 12, borderWidth: 1 },

  featureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  featureTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  featureEmoji: { fontSize: 15 },

  featureName: { fontSize: 13, fontWeight: '700' },

  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },

  tagBadgeText: { fontSize: 9, fontWeight: '700' },

  featureDesc: { fontSize: 11, lineHeight: 15 },

  addSlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },

  addSlotPlus: { fontSize: 16 },

  addSlotTextWrap: { flex: 1 },

  addSlotTitle: { fontSize: 12, fontWeight: '700' },

  addSlotSub: { fontSize: 10, marginTop: 2 },

  prefCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },

  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  prefLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  prefEmoji: { fontSize: 18 },

  prefTitle: { fontSize: 13, fontWeight: '700' },

  prefSub: { fontSize: 11, marginTop: 1 },

  sliderFooter: { alignItems: 'center', paddingTop: 10, gap: 6 },

  statusIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  /* Container so halo and dot share the same centre point */
  statusDotContainer: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusHalo: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusPulse: { width: 8, height: 8, borderRadius: 4 },

  statusText: { fontSize: 11, fontWeight: '600' },

  footerMeta: { fontSize: 10 },
});
