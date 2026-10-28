import { isUpdateRequired } from '@gta/shared';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { Body, Button, Screen, Title } from '../components/ui';
import { loadAppVersion } from '../lib/api';
import { I18nProvider, useI18n } from '../lib/i18n';
import { flush } from '../lib/outbox';
import { SessionProvider, useSession } from '../lib/session';
import '../lib/staleBuild';
import { colors } from '../lib/theme';

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** Minimum version check on start (rule 7). Offline or failed checks never block the app. */
function VersionGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [updateUrl, setUpdateUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
    loadAppVersion(platform)
      .then((row) => {
        if (row && isUpdateRequired(APP_VERSION, row.min_supported)) setUpdateUrl(row.update_url);
      })
      .catch(() => undefined);
  }, []);

  if (updateUrl === undefined) return <>{children}</>;
  return (
    <Screen>
      <Title>{t('app.name')}</Title>
      <Body>{t('update.required')}</Body>
      {updateUrl ? <Button label={t('update.button')} onPress={() => Linking.openURL(updateUrl)} /> : null}
    </Screen>
  );
}

/** Sends waiting reports on start, on sign-in, when the app comes back to the front and when the network returns. */
function OutboxSync() {
  const session = useSession();
  useEffect(() => {
    if (session) void flush();
  }, [session]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush();
    });
    const onOnline = () => void flush();
    if (Platform.OS === 'web') globalThis.addEventListener?.('online', onOnline);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') globalThis.removeEventListener?.('online', onOnline);
    };
  }, []);
  return null;
}

function AppStack() {
  const { t } = useI18n();
  return (
    <VersionGate>
      <OutboxSync />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.primaryText,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('app.name') }} />
        <Stack.Screen name="results" options={{ title: t('search.button') }} />
        <Stack.Screen name="report" options={{ title: t('report.button') }} />
        <Stack.Screen name="sign-in" options={{ title: t('auth.title') }} />
        <Stack.Screen name="consent" options={{ title: t('legal.title') }} />
        <Stack.Screen name="privacy" options={{ title: t('privacy.title') }} />
        <Stack.Screen name="alerts" options={{ title: t('alerts.title') }} />
        <Stack.Screen name="emergency" options={{ title: t('sos.title') }} />
        <Stack.Screen name="report-driver" options={{ title: t('driver.reportTitle') }} />
        <Stack.Screen name="rate-driver" options={{ title: t('rate.title') }} />
        <Stack.Screen name="live-map" options={{ title: t('live.title') }} />
        <Stack.Screen name="follow/[id]" options={{ title: t('follow.title') }} />
      </Stack>
    </VersionGate>
  );
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <SessionProvider>
        <AppStack />
      </SessionProvider>
    </I18nProvider>
  );
}
