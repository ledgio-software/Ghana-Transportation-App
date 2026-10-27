import { normalizePlate, type RatingTag, tagsForRating } from '@gta/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Choices } from '../components/Choice';
import { ReportGate } from '../components/ReportGate';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { enqueue, flush, isPending } from '../lib/outbox';
import { colors, font, space } from '../lib/theme';

type Params = { route_id?: string; operator_id?: string; label?: string };

/** P1-SAFE-03: passengers rate the driver from 1 to 5 stars, with quick tags. Works offline. */
export default function RateDriverScreen() {
  const { t } = useI18n();
  return (
    <ReportGate title={t('rate.title')}>
      <RateDriverForm />
    </ReportGate>
  );
}

function RateDriverForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [plate, setPlate] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'thanks' | 'queued' | null>(null);

  function rate(stars: number) {
    setRating(stars);
    // Keep only tags that still fit the new rating.
    const allowed = tagsForRating(stars);
    setTags((current) => current.filter((tag) => allowed.includes(tag)));
  }

  async function submit() {
    setBusy(true);
    const item = enqueue('driver_rating', {
      rating,
      tags,
      vehicle_plate: normalizePlate(plate),
      route_id: params.route_id || null,
      operator_id: params.operator_id || null,
      comment: comment.trim() || null,
      travelled_at: new Date().toISOString(),
    });
    await flush();
    setBusy(false);
    setResult(isPending(item.client_id) ? 'queued' : 'thanks');
  }

  if (result) {
    return (
      <Screen>
        <Notice tone={result === 'queued' ? 'warning' : 'info'}>
          {result === 'queued' ? t('report.queued') : t('rate.thanks')}
        </Notice>
        {rating <= 2 && (
          <>
            <Body>{t('rate.seriousProblem')}</Body>
            <Button label={t('driver.report')} variant="secondary" onPress={() => router.replace({ pathname: '/report-driver', params })} />
          </>
        )}
        <Button label={t('report.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('rate.title')}</Title>
      {params.label ? <Body muted>{params.label}</Body> : null}
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={t('rate.title')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={t('rate.stars', { n: String(n) })}
            accessibilityState={{ checked: rating === n }}
            onPress={() => rate(n)}
            hitSlop={6}
          >
            <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
          </Pressable>
        ))}
      </View>
      {rating > 0 && <Body>{t(`rate.level.${rating}` as 'rate.level.1')}</Body>}

      {rating > 0 && (
        <>
          <Text style={styles.label}>{t('rate.tags')}</Text>
          <Choices
            multiple
            label={t('rate.tags')}
            options={tagsForRating(rating).map((tag) => ({ value: tag, label: t(`rate.tag.${tag}`) }))}
            selected={tags}
            onToggle={(tag) => setTags((current) => (current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag]))}
          />
          <Text style={styles.label}>{t('driver.plate')}</Text>
          <TextInput
            value={plate}
            onChangeText={(v) => setPlate(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="GR 1234-24"
            maxLength={15}
            style={styles.input}
            accessibilityLabel={t('driver.plate')}
          />
          <Text style={styles.label}>{t('rate.comment')}</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            style={[styles.input, styles.comment]}
            accessibilityLabel={t('rate.comment')}
          />
        </>
      )}
      <Button label={t('rate.send')} onPress={submit} loading={busy} disabled={rating === 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: space.sm },
  star: { fontSize: 44, color: colors.border },
  starOn: { color: '#E8A200' },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.body,
  },
  comment: { minHeight: 80, paddingTop: space.sm, textAlignVertical: 'top' },
});
