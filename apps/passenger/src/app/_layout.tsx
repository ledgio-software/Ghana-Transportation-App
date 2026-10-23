import { isUpdateRequired } from '@gta/shared';
import Constants from 'expo-constants';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text } from 'react-native';
import { Body, Button, Screen, Title } from '../components/ui';
import { loadAppVersion } from '../lib/api';
import { I18nProvider, useI18n } from '../lib/i18n';
import { SessionProvider } from '../lib/session';
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

function AppStack() {
  const { t } = useI18n();
  return (
    <VersionGate>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.primaryText,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: t('app.name'),
            headerRight: () => (
              <Link href="/settings" asChild>
                <Pressable accessibilityRole="button" hitSlop={12}>
                  <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '600', paddingHorizontal: 8 }}>
                    {t('settings.title')}
                  </Text>
                </Pressable>
              </Link>
            ),
          }}
        />
        <Stack.Screen name="results" options={{ title: t('search.button') }} />
        <Stack.Screen name="sign-in" options={{ title: t('auth.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
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
