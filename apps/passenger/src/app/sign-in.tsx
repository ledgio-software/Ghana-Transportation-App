import { maskPhone, normalizeGhanaPhone } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, space } from '../lib/theme';

/** P1-ACC: phone number + SMS code. Only needed to report fares. */
export default function SignInScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const normalized = normalizeGhanaPhone(phoneInput);
    if (!normalized) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (err) setError(t('common.error'));
    else setPhone(normalized);
  }

  async function verify() {
    if (!phone) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (err) setError(t('common.error'));
    else router.back();
  }

  return (
    <Screen>
      <Title>{t('auth.title')}</Title>
      <Body muted>{t('auth.why')}</Body>
      {error && <Notice tone="danger">{error}</Notice>}

      {!phone ? (
        <>
          <Text style={styles.label}>{t('auth.phone')}</Text>
          <TextInput
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 123 4567"
            style={styles.input}
            accessibilityLabel={t('auth.phone')}
          />
          <Button label={t('auth.sendCode')} onPress={sendCode} loading={busy} disabled={!phoneInput} />
        </>
      ) : (
        <>
          <Body>{t('auth.codeSent', { phone: maskPhone(phone) })}</Body>
          <Text style={styles.label}>{t('auth.code')}</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            style={styles.input}
            accessibilityLabel={t('auth.code')}
          />
          <Button label={t('auth.verify')} onPress={verify} loading={busy} disabled={code.trim().length !== 6} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.heading,
    letterSpacing: 1,
  },
});
