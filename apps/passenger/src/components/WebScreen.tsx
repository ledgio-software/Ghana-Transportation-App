import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '../lib/i18n';
import { Loading, Notice, Screen } from './ui';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/**
 * On Android, a page of the web app in a WebView (the live map, Traffic home, the family page),
 * so each has one implementation. Asks for location first when the page needs it. WhatsApp, SMS
 * and Google Maps links open in their own apps.
 */
export function WebScreen({ path, params = {}, location }: { path: string; params?: Record<string, string>; location?: boolean }) {
  const { t } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(location ? null : false);

  useEffect(() => {
    if (!location) return;
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => setAllowed(granted))
      .catch(() => setAllowed(false));
  }, [location]);

  if (!WEB_URL) {
    return (
      <Screen>
        <Notice tone="warning">{t('live.error')}</Notice>
      </Screen>
    );
  }
  if (allowed === null) {
    return (
      <Screen>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }
  const query = new URLSearchParams({ ...params, embedded: '1' });
  return (
    <View style={styles.web}>
      {location && !allowed && <Notice tone="warning">{t('live.denied')}</Notice>}
      <WebView
        source={{ uri: `${WEB_URL}${path}?${query.toString()}` }}
        style={styles.web}
        geolocationEnabled={allowed}
        javaScriptEnabled
        domStorageEnabled
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith(WEB_URL)) return true;
          void Linking.openURL(req.url).catch(() => undefined);
          return false;
        }}
        onOpenWindow={(e) => void Linking.openURL(e.nativeEvent.targetUrl).catch(() => undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ web: { flex: 1 } });
