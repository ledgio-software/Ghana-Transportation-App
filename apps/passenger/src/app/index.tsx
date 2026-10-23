import type { StationRow } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StationPicker } from '../components/StationPicker';
import { Body, Button, Loading, Notice, Screen, Title } from '../components/ui';
import { loadStations } from '../lib/api';
import { formatDate, useI18n } from '../lib/i18n';
import { useOutboxCount } from '../lib/outbox';

/** P1-FARE: search from and to. Works signed out and offline (last saved stations). */
export default function SearchScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [from, setFrom] = useState<StationRow | null>(null);
  const [to, setTo] = useState<StationRow | null>(null);
  const waiting = useOutboxCount();

  const load = useCallback(() => {
    setFailed(false);
    loadStations()
      .then((res) => {
        setStations(res.data);
        setOfflineSince(res.offlineSince);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const same = from != null && to != null && from.id === to.id;

  return (
    <Screen>
      <Title>{t('search.title')}</Title>
      {waiting > 0 && <Notice>{t('report.pending', { count: waiting })}</Notice>}
      {offlineSince && <Notice tone="warning">{t('common.offline', { date: formatDate(offlineSince, lang) })}</Notice>}
      {failed && (
        <>
          <Notice tone="danger">{t('common.error')}</Notice>
          <Button label={t('common.retry')} variant="secondary" onPress={load} />
        </>
      )}
      {!stations && !failed && <Loading label={t('common.loading')} />}
      {stations && (
        <>
          <StationPicker label={t('search.from')} stations={stations} value={from} onChange={setFrom} />
          <StationPicker label={t('search.to')} stations={stations} value={to} onChange={setTo} />
          {same && <Body muted>{t('search.sameStation')}</Body>}
          <Button
            label={t('search.button')}
            disabled={!from || !to || same}
            onPress={() =>
              from &&
              to &&
              router.push({
                pathname: '/results',
                params: { from: from.id, to: to.id, title: `${from.name} → ${to.name}` },
              })
            }
          />
        </>
      )}
    </Screen>
  );
}
