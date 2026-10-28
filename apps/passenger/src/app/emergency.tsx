import { useRouter } from 'expo-router';
import { EmergencyNumbers } from '../components/EmergencyNumbers';
import { Body, Button, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';

/** P1-SAFE-01 opened from the home screen or a report form. The Safety tab shows the same numbers. */
export default function EmergencyScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Screen>
      <Title>{t('sos.title')}</Title>
      <EmergencyNumbers />
      <Title>{t('driver.reportTitle')}</Title>
      <Body>{t('driver.reportWhy')}</Body>
      <Button label={t('driver.report')} variant="secondary" onPress={() => router.push('/report-driver')} />
    </Screen>
  );
}
