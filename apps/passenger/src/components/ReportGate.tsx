import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useConsents } from '../lib/consent';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Body, Button, Screen, Title } from './ui';

/** Reports need an account and agreement to the terms (P1-ACC, P1-LEGAL); asks for whichever is missing. */
export function ReportGate({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const consents = useConsents();

  if (!session) {
    return (
      <Screen>
        <Title>{title}</Title>
        <Body>{t('report.signInFirst')}</Body>
        <Button label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }
  if (!consents.agreed) {
    return (
      <Screen>
        <Title>{t('legal.title')}</Title>
        {consents.loaded ? (
          <>
            <Body>{t('legal.intro')}</Body>
            <Button label={t('legal.continue')} onPress={() => router.push('/consent')} />
          </>
        ) : (
          <Body muted>{t('common.loading')}</Body>
        )}
      </Screen>
    );
  }
  return <>{children}</>;
}
