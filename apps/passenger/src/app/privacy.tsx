import { latestConsents } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { clearConsentCache, recordConsents, useConsents } from '../lib/consent';
import { confirmAsync } from '../lib/confirm';
import { formatDate, useI18n } from '../lib/i18n';
import { clearOutbox } from '../lib/outbox';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, font, space } from '../lib/theme';

/** P1-LEGAL rights under Act 843: see and change consent, correct, download and delete your data. */
export default function PrivacyScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const session = useSession();
  const consents = useConsents();
  const [name, setName] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, home_city')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.display_name ?? '');
        setHomeCity(data?.home_city ?? '');
      });
  }, [userId]);

  if (!session || !userId) {
    return (
      <Screen>
        <Title>{t('privacy.title')}</Title>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <Button label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  const latest = latestConsents(consents.rows);
  const marketingOn = latest.marketing?.granted === true;
  const fail = () => setNotice({ tone: 'danger', text: t('common.error') });

  async function run(task: string, fn: () => Promise<void>) {
    setBusy(task);
    setNotice(null);
    try {
      await fn();
    } catch {
      fail();
    } finally {
      setBusy(null);
    }
  }

  const saveDetails = () =>
    run('details', async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim() || null, home_city: homeCity.trim() || null })
        .eq('id', userId);
      if (error) throw error;
      setNotice({ tone: 'info', text: t('privacy.saved') });
    });

  const toggleMarketing = (on: boolean) =>
    run('marketing', () => recordConsents(userId, [{ type: 'marketing', granted: on }]));

  const download = () =>
    run('download', async () => {
      const { data, error } = await supabase.rpc('export_my_data');
      if (error) throw error;
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-ghana-transport-data.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: t('privacy.download'), message: json });
      }
    });

  const deleteAccount = async () => {
    if (!(await confirmAsync(t('privacy.deleteConfirm'), t('privacy.delete'), t('common.cancel')))) return;
    await run('delete', async () => {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw error;
      clearOutbox();
      clearConsentCache(userId);
      // The account no longer exists on the server, so only the local session is cleared.
      await supabase.auth.signOut({ scope: 'local' });
      setNotice({ tone: 'info', text: t('privacy.deleted') });
    });
  };

  return (
    <Screen>
      <Title>{t('privacy.title')}</Title>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Body>
        {consents.agreed && latest.terms
          ? t('privacy.agreedOn', { date: formatDate(latest.terms.created_at, lang) })
          : t('privacy.notAgreed')}
      </Body>
      {!consents.agreed && consents.loaded && (
        <Button label={t('legal.continue')} variant="secondary" onPress={() => router.push('/consent')} />
      )}
      <View style={styles.toggle}>
        <Text style={styles.toggleLabel}>{t('privacy.marketing')}</Text>
        <Switch
          value={marketingOn}
          disabled={busy === 'marketing' || !consents.loaded}
          onValueChange={toggleMarketing}
          accessibilityLabel={t('privacy.marketing')}
        />
      </View>

      <Title>{t('privacy.details')}</Title>
      <Text style={styles.label}>{t('privacy.name')}</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} accessibilityLabel={t('privacy.name')} />
      <Text style={styles.label}>{t('privacy.homeCity')}</Text>
      <TextInput value={homeCity} onChangeText={setHomeCity} style={styles.input} accessibilityLabel={t('privacy.homeCity')} />
      <Button label={t('privacy.save')} variant="secondary" onPress={saveDetails} loading={busy === 'details'} />

      <Title>{t('privacy.download')}</Title>
      <Body muted>{t('privacy.downloadHelp')}</Body>
      <Button label={t('privacy.download')} variant="secondary" onPress={download} loading={busy === 'download'} />

      <Title>{t('privacy.delete')}</Title>
      <Body muted>{t('privacy.deleteHelp')}</Body>
      <Button label={t('privacy.delete')} variant="secondary" onPress={deleteAccount} loading={busy === 'delete'} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  toggleLabel: { flex: 1, fontSize: font.body, color: colors.text },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.body,
  },
});
