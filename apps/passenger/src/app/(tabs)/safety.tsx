import { useRouter } from 'expo-router';
import { EmergencyNumbers } from '../../components/EmergencyNumbers';
import { Body, Button, Card, Screen, Title } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

/** Safety tab (P1-SAFE): emergency numbers, report a driver, rate the driver. */
export default function SafetyTab() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Screen>
      <Title>{t('sos.title')}</Title>
      <EmergencyNumbers />
      <Card accent>
        <Title>{t('driver.reportTitle')}</Title>
        <Body>{t('driver.reportWhy')}</Body>
        <Button label={t('driver.report')} onPress={() => router.push('/report-driver')} />
      </Card>
      <Card>
        <Title>{t('rate.title')}</Title>
        <Body>{t('rate.why')}</Body>
        <Button label={t('rate.button')} variant="secondary" onPress={() => router.push('/rate-driver')} />
      </Card>
    </Screen>
  );
}
