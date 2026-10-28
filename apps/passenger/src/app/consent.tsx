import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { recordConsents } from '../lib/consent';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { colors, font, space } from '../lib/theme';

/** P1-LEGAL: terms and privacy agreement, stored as versioned consent records. Marketing is optional. */
export default function ConsentScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await recordConsents(session.user.id, [
        { type: 'terms', granted: true },
        { type: 'privacy', granted: true },
        { type: 'marketing', granted: marketing },
      ]);
      router.back();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{t('legal.title')}</Title>
      <Body>{t('legal.intro')}</Body>
      {(['legal.point1', 'legal.point2', 'legal.point3'] as const).map((key) => (
        <View key={key} style={styles.point}>
          <Text style={styles.bullet}>•</Text>
          <Body>{t(key)}</Body>
        </View>
      ))}
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/terms')}>
          <Text style={styles.link}>{t('legal.terms')}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/privacy-policy')}>
          <Text style={styles.link}>{t('legal.policy')}</Text>
        </Pressable>
      </View>
      <View style={styles.toggle}>
        <Text style={styles.toggleLabel}>{t('legal.marketing')}</Text>
        <Switch value={marketing} onValueChange={setMarketing} accessibilityLabel={t('legal.marketing')} />
      </View>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button label={t('legal.agree')} onPress={agree} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: space.sm, paddingRight: space.md },
  bullet: { fontSize: font.body, color: colors.primary, lineHeight: 24 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  link: { fontSize: font.body, color: colors.primary, textDecorationLine: 'underline' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  toggleLabel: { flex: 1, fontSize: font.body, color: colors.text },
});
