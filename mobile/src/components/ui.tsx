import { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}><ScrollView contentContainerStyle={styles.page}>{children}</ScrollView></SafeAreaView>;
}
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 20, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: { padding: 22, gap: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', lineHeight: 41 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  badge: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  button: { backgroundColor: colors.accent, padding: 16, borderRadius: 13, minHeight: 48, alignItems: 'center' },
  buttonText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.border },
});
