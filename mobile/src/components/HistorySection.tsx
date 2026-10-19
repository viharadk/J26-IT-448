import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE_URL, SENSOR_HEIGHT_CM } from '@/constants/config';
import { useAppTheme } from '@/context/ThemeContext';
import WaterLevelChart, { ChartDataPoint } from './WaterLevelChart';

export interface HistoricalReading {
  _id?: string;
  deviceId?: string;
  location01?: number | null;
  location02?: number | null;
  waterLevel01?: number | null;
  waterLevel02?: number | null;
  receivedAt: string;
}

export type TimeRange = '1h' | '6h' | '24h';

interface TimeRangeConfig {
  label: string;
  value: TimeRange;
  limit: number;
}

const TIME_RANGES: TimeRangeConfig[] = [
  { label: 'Last 1 Hour', value: '1h', limit: 60 },
  { label: 'Last 6 Hours', value: '6h', limit: 360 },
  { label: 'Last 24 Hours', value: '24h', limit: 1440 },
];

/**
 * Calculates water level with fallback to (SENSOR_HEIGHT_CM - distance)
 * Clamped between 0 and SENSOR_HEIGHT_CM.
 */
function resolveWaterLevel(
  waterLevel?: number | null,
  distance?: number | null
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

/** Formats ISO string into Sri Lanka Time (Asia/Colombo) */
function formatSriLankaTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-LK', {
      timeZone: 'Asia/Colombo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

/** Formats ISO string with date & time in Sri Lanka Time */
function formatSriLankaDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-LK', {
      timeZone: 'Asia/Colombo',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

interface HistorySectionProps {
  onRefresh?: () => void;
  title?: string;
  showFullTableOption?: boolean;
}

export default function HistorySection({
  title = 'Past Data & History',
  showFullTableOption = true,
}: HistorySectionProps) {
  const { colors, mode } = useAppTheme();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1h');
  const [readings, setReadings] = useState<HistoricalReading[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [tableLimit, setTableLimit] = useState<number>(10);

  // Fetch readings from backend
  const fetchHistory = async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
    } else if (readings.length === 0) {
      setLoading(true);
    }

    try {
      const activeRange =
        TIME_RANGES.find((r) => r.value === selectedRange) ?? TIME_RANGES[0];
      const res = await fetch(
        `${API_BASE_URL}/api/readings/history?limit=${activeRange.limit}`
      );

      if (!res.ok) {
        if (res.status === 503) {
          setError('Database not connected. Please ensure MongoDB is active.');
        } else {
          setError('Cannot load history. Check your connection.');
        }
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setReadings(data);
        setError(null);
      } else {
        setReadings([]);
      }
    } catch {
      setError('Cannot load history. Check your connection.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Auto-refresh every 60 seconds & fetch on range change
  useEffect(() => {
    fetchHistory();

    const interval = setInterval(() => {
      fetchHistory(false);
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedRange]);

  // Convert array for chart: REVERSE so time goes oldest -> newest (left to right)
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!readings || readings.length === 0) return [];

    return [...readings].reverse().map((r) => {
      const wl01 = resolveWaterLevel(r.waterLevel01, r.location01);
      const wl02 = resolveWaterLevel(r.waterLevel02, r.location02);
      const timeLabel = formatSriLankaTime(r.receivedAt);
      const fullTimeLabel = formatSriLankaDateTime(r.receivedAt);

      return {
        timeLabel,
        fullTimeLabel,
        waterLevel01: wl01,
        waterLevel02: wl02,
        raw: r,
      };
    });
  }, [readings]);

  // Table rows: show newest first (original order from backend)
  const recentTableRows = useMemo(() => {
    return readings.slice(0, tableLimit);
  }, [readings, tableLimit]);

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            📊 {title}
          </Text>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Water levels in Sri Lanka Time (Asia/Colombo)
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => fetchHistory(true)}
          style={[
            styles.refreshBtn,
            { backgroundColor: colors.bgElement, borderColor: colors.border },
          ]}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.refreshBtnText, { color: colors.primary }]}>
              🔄 Refresh
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Time Range Selector */}
      <View
        style={[
          styles.rangeSelector,
          { backgroundColor: colors.bgElement, borderColor: colors.border },
        ]}
      >
        {TIME_RANGES.map((rng) => {
          const isActive = selectedRange === rng.value;
          return (
            <Pressable
              key={rng.value}
              onPress={() => setSelectedRange(rng.value)}
              style={[
                styles.rangeTab,
                isActive && {
                  backgroundColor: colors.bgCard,
                  shadowColor: colors.text,
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.rangeTabText,
                  {
                    color: isActive ? colors.primary : colors.textSecondary,
                    fontWeight: isActive ? '800' : '600',
                  },
                ]}
              >
                {rng.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Card Content */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            shadowColor: colors.text,
          },
        ]}
      >
        {/* Loading State */}
        {loading && readings.length === 0 && (
          <View style={styles.stateWrapper}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              Loading history data…
            </Text>
          </View>
        )}

        {/* Error State */}
        {!loading && error != null && readings.length === 0 && (
          <View style={styles.stateWrapper}>
            <Text style={[styles.errorEmoji]}>⚠️</Text>
            <Text style={[styles.errorMsg, { color: colors.danger }]}>
              {error}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={() => fetchHistory(true)}
            >
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {!loading && error == null && readings.length === 0 && (
          <View style={styles.stateWrapper}>
            <Text style={styles.emptyEmoji}>🌊</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No history yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Data is saved about once per minute. Once your ESP32 starts sending
              readings, past trends will appear here.
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.retryBtn, { backgroundColor: colors.bgElement }]}
              onPress={() => fetchHistory(true)}
            >
              <Text style={[styles.retryBtnText, { color: colors.primary }]}>
                Check Again
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Chart Content when data is present */}
        {readings.length > 0 && (
          <View style={styles.chartWrapper}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>
                Water Level Trend (cm)
              </Text>
              <Text
                style={[styles.chartSampleCount, { color: colors.textMuted }]}
              >
                {readings.length} {readings.length === 1 ? 'reading' : 'readings'}
              </Text>
            </View>

            <WaterLevelChart data={chartData} height={230} />
          </View>
        )}

        {/* Background error banner if auto-refresh fails while having cached data */}
        {error != null && readings.length > 0 && (
          <View
            style={[
              styles.warningBanner,
              { backgroundColor: colors.dangerLight },
            ]}
          >
            <Text style={[styles.warningBannerText, { color: colors.danger }]}>
              ⚠️ {error}
            </Text>
          </View>
        )}

        {/* Table / List of Most Recent Readings */}
        {readings.length > 0 && (
          <View style={styles.tableWrapper}>
            <View style={styles.tableTitleRow}>
              <Text style={[styles.tableTitle, { color: colors.text }]}>
                Recent Measurements
              </Text>
              <Text style={[styles.tableCountTag, { color: colors.textMuted }]}>
                Showing top {Math.min(recentTableRows.length, readings.length)} of{' '}
                {readings.length}
              </Text>
            </View>

            {/* Table Header */}
            <View
              style={[
                styles.tableHeader,
                { backgroundColor: colors.bgElement },
              ]}
            >
              <Text
                style={[
                  styles.thCell,
                  styles.colTime,
                  { color: colors.textSecondary },
                ]}
              >
                Time (SL)
              </Text>
              <Text
                style={[
                  styles.thCell,
                  styles.colLoc,
                  { color: colors.textSecondary },
                ]}
              >
                Hanwella (01)
              </Text>
              <Text
                style={[
                  styles.thCell,
                  styles.colLoc,
                  { color: colors.textSecondary },
                ]}
              >
                Glencourse (02)
              </Text>
            </View>

            {/* Table Rows */}
            {recentTableRows.map((row, idx) => {
              const wl01 = resolveWaterLevel(row.waterLevel01, row.location01);
              const wl02 = resolveWaterLevel(row.waterLevel02, row.location02);
              const timeStr = formatSriLankaTime(row.receivedAt);

              return (
                <View
                  key={row._id || `${row.receivedAt}-${idx}`}
                  style={[
                    styles.tableRow,
                    {
                      borderTopColor: colors.divider,
                      backgroundColor:
                        idx % 2 === 0 ? 'transparent' : colors.bgElement + '40',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      styles.colTime,
                      { color: colors.textSecondary, fontWeight: '700' },
                    ]}
                  >
                    {timeStr}
                  </Text>

                  <Text
                    style={[
                      styles.cellText,
                      styles.colLoc,
                      {
                        color:
                          wl01 != null ? colors.primary : colors.textMuted,
                        fontWeight: wl01 != null ? '700' : '500',
                      },
                    ]}
                  >
                    {wl01 != null ? `${wl01.toFixed(1)} cm` : 'No reading'}
                  </Text>

                  <Text
                    style={[
                      styles.cellText,
                      styles.colLoc,
                      {
                        color:
                          wl02 != null
                            ? mode === 'dark'
                              ? '#34d399'
                              : '#16a34a'
                            : colors.textMuted,
                        fontWeight: wl02 != null ? '700' : '500',
                      },
                    ]}
                  >
                    {wl02 != null ? `${wl02.toFixed(1)} cm` : 'No reading'}
                  </Text>
                </View>
              );
            })}

            {/* Toggle show more rows if readings count > 10 */}
            {showFullTableOption && readings.length > 10 && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.showMoreBtn,
                  { borderTopColor: colors.divider },
                ]}
                onPress={() => {
                  setTableLimit((prev) => (prev <= 10 ? 50 : 10));
                }}
              >
                <Text
                  style={[styles.showMoreBtnText, { color: colors.primary }]}
                >
                  {tableLimit <= 10
                    ? `Show More Readings (${Math.min(50, readings.length)}) ↓`
                    : 'Show Fewer Readings ↑'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleWrapper: {
    flex: 1,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 11.5,
    marginTop: 2,
    fontWeight: '500',
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rangeSelector: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    marginBottom: 14,
  },
  rangeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  rangeTabText: {
    fontSize: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    elevation: 3,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  stateWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  stateText: {
    fontSize: 13,
    marginTop: 12,
    fontWeight: '600',
  },
  errorEmoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  chartWrapper: {
    marginBottom: 18,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  chartSampleCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  warningBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  warningBannerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tableWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 6,
  },
  tableTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  tableCountTag: {
    fontSize: 11,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  thCell: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  cellText: {
    fontSize: 12,
  },
  colTime: {
    flex: 1.1,
  },
  colLoc: {
    flex: 1.2,
    textAlign: 'center',
  },
  showMoreBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  showMoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
