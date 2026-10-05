import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

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
  badgeColor?: string;
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

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
          duration: 200,
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

  const handleNavigate = (route: string) => {
    closeSlider();
    if (route === '/' && pathname !== '/') {
      router.replace('/');
    } else if (route === '/alerts' && pathname !== '/alerts') {
      router.push('/alerts');
    } else if (route === '/history' && pathname !== '/history') {
      router.push('/history');
    } else if (route === '/settings' && pathname !== '/settings') {
      router.push('/settings');
    }
  };

  const isActive = (route: string) => {
    if (route === '/') {
      return pathname === '/' || pathname === '/index' || pathname === '';
    }
    return pathname.startsWith(route);
  };

  return (
    <>
      {/* Floating Left-Side Slider Pull Handle */}
      {!isOpen && (
        <Pressable
          onPress={openSlider}
          style={({ pressed }) => [
            styles.floatingHandle,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityLabel="Open Navigation Slider"
          accessibilityRole="button"
        >
          <View style={styles.handleContent}>
            <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
            <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
            <View style={[styles.handleLine, { backgroundColor: colors.primary }]} />
          </View>
        </Pressable>
      )}

      {/* Dimmed Backdrop */}
      {isOpen && (
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.5],
              }),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeSlider}
            accessibilityLabel="Close Navigation"
          />
        </Animated.View>
      )}

      {/* Sliding Navigation Panel (Left-side) */}
      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            backgroundColor: colors.bgCard,
            borderRightColor: colors.border,
            transform: [{ translateX: slideAnim }],
            shadowColor: colors.text,
          },
        ]}
      >
        {/* Panel Header */}
        <View style={[styles.panelHeader, { borderBottomColor: colors.divider }]}>
          <View style={styles.brandRow}>
            <Image
              source={require('@/assets/images/kelani-guard-logo.jpg')}
              style={styles.panelLogo}
              contentFit="cover"
            />
            <View style={styles.brandTextWrap}>
              <Text style={[styles.brandTitle, { color: colors.text }]}>
                Kelani Guard
              </Text>
              <Text style={[styles.brandSub, { color: colors.textMuted }]}>
                Navigation Slider
              </Text>
            </View>
          </View>

          <Pressable
            onPress={closeSlider}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: colors.bgElement,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityLabel="Close navigation"
          >
            <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        {/* Scrollable Navigation & Features */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Sections */}
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            MAIN SECTIONS
          </Text>

          <View style={styles.navGroup}>
            {MAIN_NAV_ITEMS.map((item) => {
              const active = isActive(item.route);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleNavigate(item.route)}
                  style={({ pressed }) => [
                    styles.navItem,
                    {
                      backgroundColor: active
                        ? colors.primaryLight
                        : pressed
                        ? colors.bgElement
                        : 'transparent',
                      borderColor: active ? colors.primary + '55' : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.navItemLeft}>
                    <View
                      style={[
                        styles.iconWrap,
                        {
                          backgroundColor: active
                            ? colors.primary
                            : colors.bgElement,
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
                  </View>

                  <Text
                    style={[
                      styles.chevron,
                      { color: active ? colors.primary : colors.textMuted },
                    ]}
                  >
                    ›
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Upcoming Features / Future Extension Room */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
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
                Room for growth
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
                    <Text
                      style={[styles.featureName, { color: colors.text }]}
                    >
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

            {/* Empty Slot for Developer Extension */}
            <View
              style={[
                styles.addSlotCard,
                { borderColor: colors.border, backgroundColor: colors.bgCard },
              ]}
            >
              <Text style={[styles.addSlotPlus, { color: colors.primary }]}>
                ➕
              </Text>
              <View style={styles.addSlotTextWrap}>
                <Text style={[styles.addSlotTitle, { color: colors.text }]}>
                  Custom Module Slot
                </Text>
                <Text
                  style={[styles.addSlotSub, { color: colors.textMuted }]}
                >
                  Ready for team members to plug in new screens
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Preferences in Slider */}
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            PREFERENCES
          </Text>

          <View
            style={[
              styles.prefCard,
              {
                backgroundColor: colors.bgElement,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.prefRow}>
              <View style={styles.prefLeft}>
                <Text style={styles.prefEmoji}>
                  {mode === 'dark' ? '🌙' : '☀️'}
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
                trackColor={{
                  false: colors.border,
                  true: colors.primary,
                }}
                thumbColor="#ffffff"
              />
            </View>
          </View>

          {/* Footer Info */}
          <View style={styles.sliderFooter}>
            <View style={styles.statusIndicator}>
              <View
                style={[
                  styles.statusPulse,
                  { backgroundColor: colors.success },
                ]}
              />
              <Text
                style={[styles.statusText, { color: colors.textSecondary }]}
              >
                Telemetry Connected
              </Text>
            </View>
            <Text style={[styles.footerMeta, { color: colors.textMuted }]}>
              Kelani Guard System • v1.0.0
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  /* Floating left slider handle */
  floatingHandle: {
    position: 'absolute',
    left: 0,
    top: '38%',
    zIndex: 9999,
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
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '2px 3px 10px rgba(0,0,0,0.15)',
      },
    }),
  },

  handleContent: {
    alignItems: 'center',
    gap: 4,
  },

  handleLine: {
    width: 14,
    height: 2.5,
    borderRadius: 2,
  },

  /* Backdrop */
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 9998,
  },

  /* Sliding Panel (Left side) */
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    zIndex: 9999,
    borderRightWidth: 1,
    display: 'flex',
    flexDirection: 'column',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
      default: {
        boxShadow: '4px 0 16px rgba(0,0,0,0.2)',
      },
    }),
  },

  /* Header */
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  panelLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },

  brandTextWrap: {
    justifyContent: 'center',
  },

  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  brandSub: {
    fontSize: 11,
    marginTop: 1,
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeIcon: {
    fontSize: 14,
    fontWeight: '700',
  },

  /* Content */
  scrollArea: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  sectionTitle: {
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

  featureTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },

  featureTagText: {
    fontSize: 10,
    fontWeight: '700',
  },

  /* Main Navigation Items */
  navGroup: {
    gap: 6,
    marginBottom: 12,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemEmoji: {
    fontSize: 18,
  },

  itemTextWrap: {
    flex: 1,
  },

  itemHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  itemName: {
    fontSize: 14,
  },

  itemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },

  itemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  itemDesc: {
    fontSize: 11,
    marginTop: 2,
  },

  chevron: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 6,
  },

  /* Upcoming Features */
  featuresGroup: {
    gap: 8,
    marginBottom: 16,
  },

  featureCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  featureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  featureTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  featureEmoji: {
    fontSize: 15,
  },

  featureName: {
    fontSize: 13,
    fontWeight: '700',
  },

  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },

  tagBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  featureDesc: {
    fontSize: 11,
    lineHeight: 15,
  },

  /* Extension Slot */
  addSlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },

  addSlotPlus: {
    fontSize: 16,
  },

  addSlotTextWrap: {
    flex: 1,
  },

  addSlotTitle: {
    fontSize: 12,
    fontWeight: '700',
  },

  addSlotSub: {
    fontSize: 10,
    marginTop: 2,
  },

  /* Preferences */
  prefCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },

  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  prefEmoji: {
    fontSize: 18,
  },

  prefTitle: {
    fontSize: 13,
    fontWeight: '700',
  },

  prefSub: {
    fontSize: 11,
    marginTop: 1,
  },

  /* Footer */
  sliderFooter: {
    alignItems: 'center',
    paddingTop: 10,
    gap: 6,
  },

  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  footerMeta: {
    fontSize: 10,
  },
});
