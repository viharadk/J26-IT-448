import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
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
    // Primary brand colors (clean water monitoring blue)
    primary: string;
    primaryLight: string;
    primaryDark: string;
    // Aliases for compatibility
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
  primary: '#0284c7',
  primaryLight: '#e0f2fe',
  primaryDark: '#0369a1',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  headerGradientStart: '#0284c7',
  headerGradientEnd: '#0369a1',
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
  primary: '#38bdf8',
  primaryLight: '#0369a133',
  primaryDark: '#0284c7',
  success: '#4ade80',
  successLight: '#14532d',
  warning: '#fbbf24',
  warningLight: '#451a03',
  danger: '#f87171',
  dangerLight: '#450a0a',
  headerGradientStart: '#0f172a',
  headerGradientEnd: '#0369a1',
};

function buildThemeColors(mode: ThemeMode): AppTheme['colors'] {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;

  return {
    ...base,
    accentPrimary: base.primary,
    accentLight: base.primaryLight,
    accentDark: base.primaryDark,
  };
}

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      colors: buildThemeColors(mode),
      toggleMode,
    }),
    [mode, toggleMode]
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
