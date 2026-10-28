import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { colors, font, ghana, radius, space } from '../lib/theme';
import { Body, Button, Card, FlagBadge, FlagStripe, Screen } from './ui';

/** What the person was trying to do, so the prompt says why an account is needed. */
export type SignInReason = 'reportDriver' | 'rateDriver' | 'reportFare' | 'privacy' | 'saved';

type IconName = ComponentProps<typeof Ionicons>['name'];

function Point({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointIcon}>
        <Ionicons name={icon} size={18} color={ghana.green} />
      </View>
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

/** Leaves the prompt: back where the person came from, or home. */
function useNotNow() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/'));
}

/**
 * "Sign in to …" for features that need an account (P1-ACC): the flag badge, why an account is
 * needed here, that it is private and free, and a way out. `compact` is a card inside a page.
 */
export function SignInPrompt({ reason, compact, before }: { reason: SignInReason; compact?: boolean; before?: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const notNow = useNotNow();
  const signIn = () => router.push('/sign-in');

  if (compact) {
    return (
      <Card accent>
        <View style={styles.compactHead}>
          <FlagBadge size={44} />
          <Text style={styles.compactTitle}>{t(`gate.title.${reason}`)}</Text>
        </View>
        <Body>{t(`gate.why.${reason}`)}</Body>
        <Button label={t('gate.button')} onPress={signIn} />
      </Card>
    );
  }

  return (
    <Screen>
      {before}
      <View style={styles.hero}>
        <FlagStripe height={12} />
        <View style={styles.heroBody}>
          <FlagBadge size={76} />
          <Text style={styles.title} accessibilityRole="header">
            {t(`gate.title.${reason}`)}
          </Text>
          <Text style={styles.why}>{t(`gate.why.${reason}`)}</Text>
        </View>
      </View>
      <Card>
        <Point icon="lock-closed" text={t('gate.private')} />
        <Point icon="chatbubble-ellipses" text={t('gate.free')} />
        <Button label={t('gate.button')} onPress={signIn} />
        <Pressable accessibilityRole="button" onPress={notNow} style={styles.notNow}>
          <Text style={styles.notNowText}>{t('gate.notNow')}</Text>
        </Pressable>
      </Card>
      <Body muted>{t('gate.noAccount')}</Body>
    </Screen>
  );
}

/** The step after signing in: agree to the terms before the first report (P1-LEGAL). */
export function ConsentPrompt({ loaded }: { loaded: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const notNow = useNotNow();
  return (
    <Screen>
      <View style={styles.hero}>
        <FlagStripe height={12} />
        <View style={styles.heroBody}>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark" size={40} color={ghana.green} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('legal.title')}
          </Text>
          <Text style={styles.why}>{t('legal.intro')}</Text>
        </View>
      </View>
      <Card>
        {loaded ? (
          <>
            <Point icon="lock-closed" text={t('legal.point1')} />
            <Point icon="eye-off" text={t('legal.point2')} />
            <Point icon="download" text={t('legal.point3')} />
            <Button label={t('legal.continue')} onPress={() => router.push('/consent')} />
            <Pressable accessibilityRole="button" onPress={notNow} style={styles.notNow}>
              <Text style={styles.notNowText}>{t('gate.notNow')}</Text>
            </Pressable>
          </>
        ) : (
          <Body muted>{t('common.loading')}</Body>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: ghana.black },
  heroBody: { padding: space.lg, gap: space.sm, alignItems: 'center' },
  title: { fontSize: font.title, fontWeight: '800', color: colors.primaryText, textAlign: 'center', marginTop: space.sm },
  why: { fontSize: font.body, color: colors.primaryText, opacity: 0.92, textAlign: 'center', lineHeight: 24 },
  shield: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 22 },
  notNow: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  compactTitle: { flex: 1, fontSize: font.heading, fontWeight: '700', color: colors.text },
});
