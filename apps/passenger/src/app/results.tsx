import { checkFare, type FareOption, formatPesewas, parseCedisToPesewas } from '@gta/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FareCard } from '../components/FareCard';
import { Body, Button, Loading, Notice, Screen, Title } from '../components/ui';
import { searchFares } from '../lib/api';
import { formatDate, useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';

/** P1-FARE results with the P1-ALERT fair price check under each option. */
export default function ResultsScreen() {
  const { t, lang } = useI18n();
  const { from, to, title } = useLocalSearchParams<{ from: string; to: string; title?: string }>();
  const [fares, setFares] = useState<FareOption[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!from || !to) return;
    setFailed(false);
    searchFares(from, to)
      .then((res) => {
        setFares(res.data);
        setOfflineSince(res.offlineSince);
      })
      .catch(() => setFailed(true));
  }, [from, to]);

  useEffect(load, [load]);

  return (
    <Screen>
      {title ? <Stack.Screen options={{ title }} /> : null}
      {offlineSince && <Notice tone="warning">{t('common.offline', { date: formatDate(offlineSince, lang) })}</Notice>}
      {failed && (
        <>
          <Notice tone="danger">{t('common.error')}</Notice>
          <Button label={t('common.retry')} variant="secondary" onPress={load} />
        </>
      )}
      {!fares && !failed && <Loading label={t('common.loading')} />}
      {fares && fares.length === 0 && <Body>{t('fare.none')}</Body>}
      {fares?.map((fare) => (
        <View key={fare.fare_id} style={styles.option}>
          <FareCard fare={fare} />
          <FareCheck fare={fare} />
        </View>
      ))}
    </Screen>
  );
}

function FareCheck({ fare }: { fare: FareOption }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const quoted = parseCedisToPesewas(input);
  const result =
    quoted != null
      ? checkFare(quoted, { officialPesewas: fare.official_pesewas, reportedMedianPesewas: fare.reported_median_pesewas })
      : null;

  return (
    <View style={styles.check}>
      <Title>{t('check.title')}</Title>
      <Text style={styles.label}>{t('check.quoted')}</Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0.00"
        style={styles.input}
        accessibilityLabel={t('check.quoted')}
      />
      {result && (
        <Notice tone={result.verdict === 'above_normal' ? 'danger' : 'info'}>
          <Text style={[styles.verdict, result.verdict === 'above_normal' && styles.verdictBad]}>
            {result.verdict === 'unknown' ? t('check.unknown') : t(`check.${result.verdict}`)}
          </Text>
          {result.excessPesewas > 0 ? `\n${t('check.excess', { amount: formatPesewas(result.excessPesewas) })}` : ''}
        </Notice>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { gap: space.sm, marginBottom: space.md },
  check: { gap: space.sm, paddingHorizontal: space.xs },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.amount,
  },
  verdict: { fontSize: font.heading, fontWeight: '700', color: colors.ok },
  verdictBad: { color: colors.danger },
});
