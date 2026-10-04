import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

// Accent color presets
export type AccentPreset = 'ocean' | 'emerald' | 'violet' | 'amber' | 'rose';

export const ACCENT_PRESETS: Record<
  AccentPreset,
  { primary: string; light: string; dark: string; label: string }
> = {
  ocean: {
    primary: '#0ea5e9',
    light: '#e0f2fe',
    dark: '#0369a1',
    label: 'Ocean',
  },
  emerald: {
    primary: '#10b981',
    light: '#d1fae5',
    dark: '#047857',
    label: 'Emerald',
  },
  violet: {
    primary: '#8b5cf6',
    light: '#ede9fe',
    dark: '#6d28d9',
    label: 'Violet',
  },
  amber: {
    primary: '#f59e0b',
    light: '#fef3c7',
    dark: '#b45309',
    label: 'Amber',
  },
  rose: {
    primary: '#f43f5e',
    light: '#ffe4e6',
    dark: '#be123c',
    label: 'Rose',
  },
};

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
  accent: AccentPreset;
  colors: {
    // Backgrounds
    bg: string;
    bgCard: string;
    bgElement: string;
    bgSelected: string;
    // Text
    text: string;
    textSecondary: string;
    textMuted: string;
    // Border
    border: string;
    divider: string;
    // Accent
    accentPrimary: string;
    accentLight: string;
    accentDark: string;
    // Status
    success: string;
    successLight: string;
    warning: string;
    warningLight: string;
    danger: string;
    dangerLight: string;
    // Header gradient
    headerGradientStart: string;
    headerGradientEnd: string;
  };
  toggleMode: () => void;
  setAccent: (preset: AccentPreset) => void;
}

const LIGHT_BASE = {
  bg: '#f0f4f8',
  bgCard: '#ffffff',
  bgElement: '#f1f5f9',
  bgSelected: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  divider: '#f1f5f9',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
};

const DARK_BASE = {
  bg: '#0b1120',
  bgCard: '#131e2e',
  bgElement: '#1e2d42',
  bgSelected: '#253347',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
  border: '#1e2d42',
  divider: '#1a2636',
  success: '#4ade80',
  successLight: '#14532d',
  warning: '#fbbf24',
  warningLight: '#451a03',
  danger: '#f87171',
  dangerLight: '#450a0a',
};

function buildThemeColors(
  mode: ThemeMode,
  accent: AccentPreset
): AppTheme['colors'] {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  const accentColors = ACCENT_PRESETS[accent];

  const headerGradientStart =
    mode === 'dark' ? accentColors.dark : accentColors.primary;
  const headerGradientEnd =
    mode === 'dark' ? '#0b1120' : accentColors.dark;

  return {
    ...base,
    accentPrimary: accentColors.primary,
    accentLight:
      mode === 'dark'
        ? `${accentColors.primary}22`
        : accentColors.light,
    accentDark: accentColors.dark,
    headerGradientStart,
    headerGradientEnd,
  };
}

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [accent, setAccentState] = useState<AccentPreset>('ocean');

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setAccent = useCallback((preset: AccentPreset) => {
    setAccentState(preset);
  }, []);

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      accent,
      colors: buildThemeColors(mode, accent),
      toggleMode,
      setAccent,
    }),
    [mode, accent, toggleMode, setAccent]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
}
