import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, ghana, radius, space } from '../lib/theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.buttonLabel, !primary && styles.buttonLabelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' }) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.noticeWarning, tone === 'danger' && styles.noticeDanger]}>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Body muted>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, gap: space.md, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  body: { fontSize: font.body, color: colors.text, lineHeight: 24 },
  muted: { color: colors.muted },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { color: colors.primaryText, fontSize: font.body, fontWeight: '700' },
  buttonLabelSecondary: { color: colors.primary },
  notice: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderLeftWidth: 4, borderLeftColor: colors.primary },
  noticeWarning: { backgroundColor: colors.accentSoft, borderLeftColor: ghana.gold },
  noticeDanger: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
  loading: { padding: space.lg, alignItems: 'center', gap: space.sm },
});

/** The flag as a thin band: red, gold with the black star, green. Our mark across the app. */
export function FlagStripe({ height = 6 }: { height?: number }) {
  return (
    <View style={[stripe.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[stripe.band, { backgroundColor: ghana.red }]} />
      <View style={[stripe.band, stripe.middle, { backgroundColor: ghana.gold }]}>
        {height >= 12 && <Text style={[stripe.star, { fontSize: height }]}>★</Text>}
      </View>
      <View style={[stripe.band, { backgroundColor: ghana.green }]} />
    </View>
  );
}

/** A white rounded panel, the base of cards across the app. */
export function Card({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <View style={[cardStyles.card, accent && cardStyles.accent]}>{children}</View>;
}

const stripe = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  band: { flex: 1 },
  middle: { alignItems: 'center', justifyContent: 'center' },
  star: { color: ghana.black, lineHeight: undefined },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accent: { borderTopWidth: 4, borderTopColor: ghana.gold },
});

