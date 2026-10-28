import { DRIVER_REPORT_KINDS, type DriverReportKind, MAX_REPORT_PHOTOS, normalizePlate } from '@gta/shared';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Choices } from '../components/Choice';
import { ReportGate } from '../components/ReportGate';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { enqueue, flush, isPending } from '../lib/outbox';
import { type PickedPhoto, PhotoTooLargeError, uploadReportPhotos } from '../lib/safety';
import { useSession } from '../lib/session';
import { colors, font, space } from '../lib/theme';

type Params = { route_id?: string; operator_id?: string; label?: string };

/**
 * P1-SAFE-02: report reckless driving or a driver abusing passengers, with up to 3 photos of
 * the vehicle. Staff review it and forward it to MTTD, NRSA or the operator.
 */
export default function ReportDriverScreen() {
  return (
    <ReportGate reason="reportDriver">
      <ReportDriverForm />
    </ReportGate>
  );
}

function ReportDriverForm() {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<Params>();
  const [kind, setKind] = useState<DriverReportKind | null>(null);
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'thanks' | 'queued' | null>(null);

  async function addPhoto(source: 'camera' | 'library') {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t('driver.cameraDenied'));
        return;
      }
    }
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.base64) return;
    setPhotos((p) => [...p, { uri: asset.uri, base64: asset.base64!, mimeType: asset.mimeType ?? 'image/jpeg' }].slice(0, MAX_REPORT_PHOTOS));
  }

  async function submit() {
    if (!kind || !session) return;
    setError(null);
    setBusy(true);
    const reportId = randomUUID();
    let photoPaths: string[] = [];
    try {
      // Photos go up first (they need a signal); the report itself can wait on the phone.
      photoPaths = await uploadReportPhotos(session.user.id, reportId, photos);
    } catch (err) {
      setBusy(false);
      setError(err instanceof PhotoTooLargeError ? t('driver.photoTooLarge') : t('driver.photoFailed'));
      return;
    }
    const occurredAt = new Date(Date.now() - (day === 'yesterday' ? 86_400_000 : 0));
    const item = enqueue('driver_report', {
      kind,
      vehicle_plate: normalizePlate(plate),
      route_id: params.route_id || null,
      operator_id: params.operator_id || null,
      occurred_at: occurredAt.toISOString(),
      note: note.trim() || null,
      photo_paths: photoPaths,
    });
    await flush();
    setBusy(false);
    setResult(isPending(item.client_id) ? 'queued' : 'thanks');
  }

  if (result) {
    return (
      <Screen>
        <Notice tone={result === 'queued' ? 'warning' : 'info'}>
          {result === 'queued' ? t('report.queued') : t('driver.thanks')}
        </Notice>
        <Button label={t('report.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('driver.reportTitle')}</Title>
      {params.label ? <Body muted>{params.label}</Body> : null}
      <Notice tone="danger">{t('sos.danger')}</Notice>
      <Button label={t('sos.title')} variant="secondary" onPress={() => router.push('/emergency')} />

      <Text style={styles.label}>{t('driver.what')}</Text>
      <Choices
        label={t('driver.what')}
        options={DRIVER_REPORT_KINDS.map((k) => ({ value: k, label: t(`driver.kind.${k}`) }))}
        selected={kind ? [kind] : []}
        onToggle={setKind}
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

      <Text style={styles.label}>{t('report.when')}</Text>
      <Choices
        label={t('report.when')}
        options={(['today', 'yesterday'] as const).map((d) => ({ value: d, label: t(`report.${d}`) }))}
        selected={[day]}
        onToggle={setDay}
      />

      <Text style={styles.label}>{t('driver.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={1000}
        placeholder={t('driver.notePlaceholder')}
        style={[styles.input, styles.note]}
        accessibilityLabel={t('driver.note')}
      />

      <Text style={styles.label}>{t('driver.photos', { max: String(MAX_REPORT_PHOTOS) })}</Text>
      <Body muted>{t('driver.photosHelp')}</Body>
      {photos.length > 0 && (
        <View style={styles.photos}>
          {photos.map((p, i) => (
            <Pressable
              key={p.uri}
              accessibilityRole="button"
              accessibilityLabel={t('driver.removePhoto', { n: String(i + 1) })}
              onPress={() => setPhotos((all) => all.filter((x) => x !== p))}
            >
              <Image source={{ uri: p.uri }} style={styles.photo} />
              <Text style={styles.remove}>{t('driver.remove')}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {photos.length < MAX_REPORT_PHOTOS && (
        <View style={styles.row}>
          {Platform.OS !== 'web' && (
            <View style={styles.flex}>
              <Button label={t('driver.takePhoto')} variant="secondary" onPress={() => addPhoto('camera')} />
            </View>
          )}
          <View style={styles.flex}>
            <Button label={t('driver.choosePhoto')} variant="secondary" onPress={() => addPhoto('library')} />
          </View>
        </View>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      <Button label={t('driver.send')} onPress={submit} loading={busy} disabled={!kind} />
      <Body muted>{t('driver.privacy')}</Body>
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
    fontSize: font.body,
  },
  note: { minHeight: 100, paddingTop: space.sm, textAlignVertical: 'top' },
  photos: { flexDirection: 'row', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surface },
  remove: { fontSize: font.small, color: colors.danger, textAlign: 'center', paddingTop: 4 },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
