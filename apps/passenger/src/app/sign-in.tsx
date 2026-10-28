import { maskPhone, normalizeGhanaPhone } from '@gta/shared';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, FlagStripe, Notice, Screen } from '../components/ui';
import { checkAgreed } from '../lib/consent';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, ghana, radius, space } from '../lib/theme';

/** Wait before another code can be sent (each SMS costs money and Supabase limits them anyway). */
const RESEND_AFTER_S = 30;

/**
 * P1-ACC: phone number + SMS code. Signing in and creating an account are the same step,
 * so there is no separate register page and no password. Only needed to report fares.
 */
export default function SignInScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function sendCode() {
    const normalized = normalizeGhanaPhone(phone ?? phoneInput);
    if (!normalized) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (err) {
      setError(t('common.error'));
      return;
    }
    setPhone(normalized);
    setWait(RESEND_AFTER_S);
  }

  async function verify() {
    if (!phone) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    if (err || !data.user) {
      setBusy(false);
      setError(t('auth.wrongCode'));
      return;
    }
    // New users (or a new version of the terms) see the agreement before going back.
    const agreed = await checkAgreed(data.user.id).catch(() => false);
    setBusy(false);
    if (agreed) router.back();
    else router.replace('/consent');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('auth.title') }} />
      <View style={styles.hero}>
        <FlagStripe height={14} />
        <View style={styles.heroBody}>
          <View style={styles.logo}>
            <Text style={styles.logoStar}>★</Text>
          </View>
          <Text style={styles.welcome} accessibilityRole="header">
            {t('auth.welcome')}
          </Text>
          <Text style={styles.heroText}>{t('auth.noPassword')}</Text>
        </View>
      </View>

      <Card accent>
        <Text style={styles.step}>{t('auth.step', { n: phone ? '2' : '1' })}</Text>
        {error && <Notice tone="danger">{error}</Notice>}
        {!phone ? (
          <>
            <Text style={styles.label}>{t('auth.phone')}</Text>
            <View style={styles.phoneRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>🇬🇭 +233</Text>
              </View>
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                keyboardType="phone-pad"
                inputMode="tel"
                autoComplete="tel"
                placeholder="24 123 4567"
                style={[styles.input, styles.phoneInput]}
                accessibilityLabel={t('auth.phone')}
                onSubmitEditing={sendCode}
              />
            </View>
            <Button label={t('auth.sendCode')} onPress={sendCode} loading={busy} disabled={!phoneInput} />
          </>
        ) : (
          <>
            <Body>{t('auth.codeSent', { phone: maskPhone(phone) })}</Body>
            <Text style={styles.label}>{t('auth.code')}</Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="••••••"
              style={[styles.input, styles.code]}
              accessibilityLabel={t('auth.code')}
              onSubmitEditing={verify}
            />
            <Button label={t('auth.verify')} onPress={verify} loading={busy} disabled={code.trim().length !== 6} />
            <View style={styles.links}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPhone(null);
                  setCode('');
                  setError(null);
                }}
              >
                <Text style={styles.link}>{t('auth.changeNumber')}</Text>
              </Pressable>
              {wait > 0 ? (
                <Text style={styles.muted}>{t('auth.resendIn', { seconds: String(wait) })}</Text>
              ) : (
                <Pressable accessibilityRole="button" onPress={sendCode} disabled={busy}>
                  <Text style={styles.link}>{t('auth.resend')}</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </Card>

      <View style={styles.why}>
        <Ionicons name="lock-closed" size={18} color={colors.muted} />
        <Body muted>{t('auth.why')}</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: ghana.black },
  heroBody: { padding: space.lg, gap: space.sm, alignItems: 'center' },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ghana.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoStar: { fontSize: 36, color: ghana.black, lineHeight: 40 },
  welcome: { fontSize: font.title, fontWeight: '800', color: colors.primaryText, textAlign: 'center' },
  heroText: { fontSize: font.body, color: colors.primaryText, textAlign: 'center' },
  step: { fontSize: font.small, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  prefixText: { fontSize: font.body, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: font.heading,
    letterSpacing: 1,
  },
  // minWidth 0 lets the box shrink to fit next to the +233 prefix on narrow phones.
  phoneInput: { flex: 1, minWidth: 0 },
  code: { textAlign: 'center', fontSize: font.title, letterSpacing: 10 },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  link: { fontSize: font.body, color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  muted: { fontSize: font.small, color: colors.muted },
  why: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingHorizontal: space.xs },
});
