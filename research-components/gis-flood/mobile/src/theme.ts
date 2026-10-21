import { DarkTheme } from '@react-navigation/native';

export const colors = {
  background: '#081525', surface: '#11243A', border: '#29415B',
  text: '#F1F6FC', muted: '#A9BCD0', accent: '#65E1CB',
  accentDark: '#123E43', warning: '#F7CC83', error: '#FFACAC',
};
export const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.accent, background: colors.background,
    card: colors.background, text: colors.text, border: colors.border },
};
