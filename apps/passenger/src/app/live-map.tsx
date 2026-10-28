import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Loading, Notice, Screen } from '../components/ui';
import { useI18n } from '../lib/i18n';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/**
 * P1-TRIP-04 on Android: shows the web app's live map page (live-map.web.tsx) in a WebView,
 * after asking for the phone's location permission so the page can follow the traveller.
 */
export default function LiveMapScreen() {
  const { t } = useI18n();
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => setAllowed(granted))
      .catch(() => setAllowed(false));
  }, []);

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
  const params = new URLSearchParams({ from: from ?? '', to: to ?? '', embedded: '1' });
  return (
    <View style={styles.web}>
      {!allowed && <Notice tone="warning">{t('live.denied')}</Notice>}
      <WebView
        source={{ uri: `${WEB_URL}/live-map?${params.toString()}` }}
        style={styles.web}
        geolocationEnabled={allowed}
        javaScriptEnabled
        domStorageEnabled
        // WhatsApp, SMS and Google Maps links open in their own apps, not inside the map.
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
