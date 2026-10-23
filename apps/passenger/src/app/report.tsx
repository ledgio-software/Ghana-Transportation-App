import { parseCedisToPesewas } from '@gta/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { enqueue, flush, isPending } from '../lib/outbox';
import { useSession } from '../lib/session';
import { colors, font, space } from '../lib/theme';

type Params = {
  route_id: string;
  operator_id?: string;
  vehicle_type: string;
  class: string;
  label?: string;
};

/** P1-REPORT: "What did you pay?" after a trip. Saved on the phone first, sent when online. */
export default function ReportScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<Params>();
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'thanks' | 'queued' | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const pesewas = parseCedisToPesewas(amount);
    if (pesewas == null || pesewas <= 0) {
      setError(t('report.invalidAmount'));
      return;
    }
    setError(null);
    setBusy(true);
    const travelledAt = new Date(Date.now() - (day === 'yesterday' ? 86_400_000 : 0));
    const item = enqueue('fare_report', {
      route_id: params.route_id,
      operator_id: params.operator_id || null,
      vehicle_type: params.vehicle_type,
      class: params.class,
      amount_pesewas: pesewas,
      travelled_at: travelledAt.toISOString(),
    });
    await flush();
    if (isPending(item.client_id)) await flush();
    setBusy(false);
    setResult(isPending(item.client_id) ? 'queued' : 'thanks');
  }

  if (!session) {
    return (
      <Screen>
        <Title>{t('report.title')}</Title>
        <Body>{t('report.signInFirst')}</Body>
        <Button label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <Notice tone={result === 'queued' ? 'warning' : 'info'}>
          {result === 'queued' ? t('report.queued') : t('report.thanks')}
        </Notice>
        <Button label={t('report.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('report.title')}</Title>
      {params.label ? <Body muted>{params.label}</Body> : null}
      {error && <Notice tone="danger">{error}</Notice>}
      <Text style={styles.label}>{t('report.amount')}</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0.00"
        style={styles.input}
        accessibilityLabel={t('report.amount')}
      />
      <Text style={styles.label}>{t('report.when')}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {(['today', 'yesterday'] as const).map((d) => (
          <Pressable
            key={d}
            accessibilityRole="radio"
            accessibilityState={{ checked: day === d }}
            onPress={() => setDay(d)}
            style={[styles.choice, day === d && styles.choiceOn]}
          >
            <Text style={[styles.choiceText, day === d && styles.choiceTextOn]}>{t(`report.${d}`)}</Text>
          </Pressable>
        ))}
      </View>
      <Button label={t('report.submit')} onPress={submit} loading={busy} disabled={!amount} />
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
    fontSize: font.amount,
  },
  row: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  choiceTextOn: { color: colors.primaryText },
});
