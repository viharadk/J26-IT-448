import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { SENSOR_HEIGHT_CM } from '@/constants/config';
import type { RiskThresholds } from '@/constants/config';
import { useAppTheme } from '@/context/ThemeContext';

export interface ChartDataPoint {
  timeLabel: string;
  fullTimeLabel: string;
  waterLevel01: number | null;
  waterLevel02: number | null;
  raw: any;
}

interface WaterLevelChartProps {
  data: ChartDataPoint[]; // Oldest to newest (left to right)
  height?: number;
  /** When supplied, draws horizontal watch/warning/danger lines on the chart */
  thresholds?: RiskThresholds;
}

export default function WaterLevelChart({
  data,
  height = 230,
  thresholds,
}: WaterLevelChartProps) {
  const { colors, mode } = useAppTheme();
  const [containerWidth, setContainerWidth] = useState<number>(340);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 50 && Math.abs(width - containerWidth) > 2) {
      setContainerWidth(width);
    }
  };

  // Dimensions & paddings
  const paddingLeft = 38;
  const paddingRight = 18;
  const paddingTop = 20;
  const paddingBottom = 28;

  const chartWidth = Math.max(containerWidth, 200);
  const plotWidth = Math.max(chartWidth - paddingLeft - paddingRight, 10);
  const plotHeight = Math.max(height - paddingTop - paddingBottom, 10);

  // Colors
  const loc01Color = colors.primary; // Blue
  const loc02Color = mode === 'dark' ? '#34d399' : '#16a34a'; // Green

  // Y-axis grid levels (cm)
  const yLevels = [0, 50, 100, 150, 200];

  const getY = (val: number | null) => {
    if (val == null) return null;
    const clamped = Math.max(0, Math.min(SENSOR_HEIGHT_CM, val));
    // 0 cm is at bottom (plotHeight), 200 cm is at top (0)
    return paddingTop + plotHeight - (clamped / SENSOR_HEIGHT_CM) * plotHeight;
  };

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * plotWidth;
  };

  // Build SVG Paths for Location 01 & Location 02
  const { path01, area01, path02, area02, points01, points02, closeIndices } = useMemo(() => {
    let p01 = '';
    let a01 = '';
    let p02 = '';
    let a02 = '';
    const pts01: { x: number; y: number; val: number; index: number }[] = [];
    const pts02: { x: number; y: number; val: number; index: number }[] = [];
    const closeSet = new Set<number>();

    let firstX01: number | null = null;
    let lastX01: number | null = null;
    let firstX02: number | null = null;
    let lastX02: number | null = null;

    data.forEach((d, i) => {
      const x = getX(i);
      const y1 = getY(d.waterLevel01);
      const y2 = getY(d.waterLevel02);

      // Flag points as close if vertical difference is within 14px or values within 8cm
      if (y1 != null && y2 != null && Math.abs(y1 - y2) <= 14) {
        closeSet.add(i);
      }

      if (y1 != null) {
        pts01.push({ x, y: y1, val: d.waterLevel01!, index: i });
        if (firstX01 === null) {
          firstX01 = x;
          p01 += `M ${x} ${y1}`;
        } else {
          p01 += ` L ${x} ${y1}`;
        }
        lastX01 = x;
      }

      if (y2 != null) {
        pts02.push({ x, y: y2, val: d.waterLevel02!, index: i });
        if (firstX02 === null) {
          firstX02 = x;
          p02 += `M ${x} ${y2}`;
        } else {
          p02 += ` L ${x} ${y2}`;
        }
        lastX02 = x;
      }
    });

    const bottomY = paddingTop + plotHeight;

    if (p01 && firstX01 !== null && lastX01 !== null) {
      a01 = `${p01} L ${lastX01} ${bottomY} L ${firstX01} ${bottomY} Z`;
    }
    if (p02 && firstX02 !== null && lastX02 !== null) {
      a02 = `${p02} L ${lastX02} ${bottomY} L ${firstX02} ${bottomY} Z`;
    }

    return {
      path01: p01,
      area01: a01,
      path02: p02,
      area02: a02,
      points01: pts01,
      points02: pts02,
      closeIndices: closeSet,
    };
  }, [data, containerWidth, plotWidth, plotHeight]);

  // Selected data point for tooltip
  const selectedPoint =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < data.length
      ? data[selectedIndex]
      : null;

  const selectedX = selectedIndex !== null ? getX(selectedIndex) : null;

  // X-axis label indices (e.g. show 4-5 labels across the width)
  const xLabelIndices = useMemo(() => {
    if (data.length <= 1) return [0];
    if (data.length <= 4) return data.map((_, i) => i);
    const count = 4;
    const indices: number[] = [];
    const step = (data.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      indices.push(Math.round(i * step));
    }
    return Array.from(new Set(indices));
  }, [data.length]);

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {/* Legend & Active value banner */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: loc01Color }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Location 01 (Hanwella)
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: loc02Color }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Location 02 (Glencourse)
          </Text>
        </View>
      </View>

      {/* Interactive Tooltip Card when a point is tapped */}
      {selectedPoint && (
        <View
          style={[
            styles.tooltipCard,
            {
              backgroundColor: colors.bgElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.tooltipTime, { color: colors.text }]}>
            🕒 {selectedPoint.fullTimeLabel}
          </Text>
          <View style={styles.tooltipValues}>
            <Text style={[styles.tooltipValText, { color: loc01Color }]}>
              Loc 01:{' '}
              <Text style={{ fontWeight: '800' }}>
                {selectedPoint.waterLevel01 != null
                  ? `${selectedPoint.waterLevel01.toFixed(1)} cm`
                  : 'No reading'}
              </Text>
            </Text>
            <Text style={[styles.tooltipValText, { color: loc02Color }]}>
              Loc 02:{' '}
              <Text style={{ fontWeight: '800' }}>
                {selectedPoint.waterLevel02 != null
                  ? `${selectedPoint.waterLevel02.toFixed(1)} cm`
                  : 'No reading'}
              </Text>
            </Text>
          </View>
        </View>
      )}

      {/* SVG Canvas and Touch Overlay */}
      <View style={{ height, width: chartWidth, position: 'relative' }}>
        <Svg width={chartWidth} height={height}>
          <Defs>
            {/* Gradient for Location 01 */}
            <SvgLinearGradient id="gradLoc01" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={loc01Color} stopOpacity="0.25" />
              <Stop offset="100%" stopColor={loc01Color} stopOpacity="0.0" />
            </SvgLinearGradient>

            {/* Gradient for Location 02 */}
            <SvgLinearGradient id="gradLoc02" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={loc02Color} stopOpacity="0.22" />
              <Stop offset="100%" stopColor={loc02Color} stopOpacity="0.0" />
            </SvgLinearGradient>
          </Defs>

          {/* Horizontal Grid lines & Y labels */}
          {yLevels.map((level) => {
            const y = getY(level);
            if (y == null) return null;
            return (
              <G key={`y-grid-${level}`}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  strokeOpacity={0.7}
                />
                <SvgText
                  x={paddingLeft - 6}
                  y={y + 3.5}
                  fill={colors.textMuted}
                  fontSize="9.5"
                  fontWeight="600"
                  textAnchor="end"
                >
                  {level}
                </SvgText>
              </G>
            );
          })}

          {/* Unit label at top of Y axis */}
          <SvgText
            x={paddingLeft - 4}
            y={paddingTop - 8}
            fill={colors.textMuted}
            fontSize="9"
            fontWeight="700"
            textAnchor="end"
          >
            cm
          </SvgText>

          {/* Area Fills */}
          {area02 ? <Path d={area02} fill="url(#gradLoc02)" /> : null}
          {area01 ? <Path d={area01} fill="url(#gradLoc01)" /> : null}

          {/* Threshold lines: WATCH / WARNING / DANGER */}
          {thresholds && [
            {
              pct: thresholds.watch,
              color: '#ca8a04',
              label: `Watch ${Math.round(thresholds.watch * SENSOR_HEIGHT_CM / 100)}cm`,
            },
            {
              pct: thresholds.warning,
              color: '#ea580c',
              label: `Warn ${Math.round(thresholds.warning * SENSOR_HEIGHT_CM / 100)}cm`,
            },
            {
              pct: thresholds.danger,
              color: '#dc2626',
              label: `Danger ${Math.round(thresholds.danger * SENSOR_HEIGHT_CM / 100)}cm`,
            },
          ].map(({ pct, color, label }) => {
            const levelCm = (pct / 100) * SENSOR_HEIGHT_CM;
            const ty = getY(levelCm);
            if (ty == null) return null;
            return (
              <G key={label}>
                <Line
                  x1={paddingLeft}
                  y1={ty}
                  x2={chartWidth - paddingRight}
                  y2={ty}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray="6,3"
                  strokeOpacity={0.85}
                />
                <SvgText
                  x={chartWidth - paddingRight - 2}
                  y={ty - 3}
                  fill={color}
                  fontSize="8.5"
                  fontWeight="700"
                  textAnchor="end"
                >
                  {label}
                </SvgText>
              </G>
            );
          })}

          {/* Data Lines: Location 02 drawn first (dashed, 2.0px), Location 01 drawn on top (solid, 3.0px) */}
          {path02 ? (
            <Path
              d={path02}
              fill="none"
              stroke={loc02Color}
              strokeWidth="2"
              strokeDasharray="6,4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {path01 ? (
            <Path
              d={path01}
              fill="none"
              stroke={loc01Color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Selected X indicator vertical bar */}
          {selectedX !== null && (
            <Line
              x1={selectedX}
              y1={paddingTop}
              x2={selectedX}
              y2={paddingTop + plotHeight}
              stroke={colors.textSecondary}
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
          )}

          {/* Markers:
              Location 02 = Square (Rect) drawn first.
              Location 01 = Circle drawn on top.
              Rendered when <= 35 points, when selected, or when points are close/overlapping. */}
          <G>
            {points02.map((pt) => {
              const isSelected = pt.index === selectedIndex;
              const isClose = closeIndices.has(pt.index);
              const show = data.length <= 35 || isSelected || isClose;
              if (!show) return null;

              const size = isSelected ? 10 : 7;
              return (
                <Rect
                  key={`p02-${pt.index}`}
                  x={pt.x - size / 2}
                  y={pt.y - size / 2}
                  width={size}
                  height={size}
                  fill={loc02Color}
                  stroke="#ffffff"
                  strokeWidth={isSelected ? 2 : 1}
                  rx={1}
                />
              );
            })}
            {points01.map((pt) => {
              const isSelected = pt.index === selectedIndex;
              const isClose = closeIndices.has(pt.index);
              const show = data.length <= 35 || isSelected || isClose;
              if (!show) return null;

              return (
                <Circle
                  key={`p01-${pt.index}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5.5 : 3.5}
                  fill={loc01Color}
                  stroke="#ffffff"
                  strokeWidth={isSelected ? 2 : 1}
                />
              );
            })}
          </G>

          {/* X Axis Timestamps (Sri Lanka Time) */}
          {xLabelIndices.map((idx) => {
            const pt = data[idx];
            if (!pt) return null;
            const x = getX(idx);
            return (
              <SvgText
                key={`xlabel-${idx}`}
                x={x}
                y={height - 6}
                fill={colors.textSecondary}
                fontSize="10"
                fontWeight="600"
                textAnchor={
                  idx === 0
                    ? 'start'
                    : idx === data.length - 1
                    ? 'end'
                    : 'middle'
                }
              >
                {pt.timeLabel}
              </SvgText>
            );
          })}
        </Svg>

        {/* Standard React Native Pressable touch overlay for cross-platform interactive points */}
        <View
          style={[
            styles.touchOverlay,
            {
              left: paddingLeft,
              top: paddingTop,
              width: plotWidth,
              height: plotHeight,
            },
          ]}
          pointerEvents="box-none"
        >
          {data.map((_, i) => (
            <Pressable
              key={`touch-${i}`}
              style={styles.touchColumn}
              onPress={() => {
                setSelectedIndex(selectedIndex === i ? null : i);
              }}
            />
          ))}
        </View>
      </View>

      <Text style={[styles.hintText, { color: colors.textMuted }]}>
        💡 Tip: Tap points on the chart to inspect exact measurements
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    position: 'relative',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    alignSelf: 'center',
    alignItems: 'center',
  },
  tooltipTime: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  tooltipValues: {
    flexDirection: 'row',
    gap: 14,
  },
  tooltipValText: {
    fontSize: 12,
    fontWeight: '600',
  },
  touchOverlay: {
    position: 'absolute',
    flexDirection: 'row',
  },
  touchColumn: {
    flex: 1,
    height: '100%',
  },
  hintText: {
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
