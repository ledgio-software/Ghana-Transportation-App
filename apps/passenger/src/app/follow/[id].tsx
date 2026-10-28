import { useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Notice, Screen } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/** P1-SAFE-05 on Android: the family page from the website (follow/[id].web.tsx) in a WebView. */
export default function FollowScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!WEB_URL || !id) {
    return (
      <Screen>
        <Notice tone="warning">{t('follow.missing')}</Notice>
      </Screen>
    );
  }
  return (
    <WebView
      source={{ uri: `${WEB_URL}/follow/${encodeURIComponent(id)}?embedded=1` }}
      style={styles.web}
      javaScriptEnabled
      domStorageEnabled
      onShouldStartLoadWithRequest={(req) => {
        if (req.url.startsWith(WEB_URL)) return true;
        void Linking.openURL(req.url).catch(() => undefined);
        return false;
      }}
    />
  );
}

const styles = StyleSheet.create({ web: { flex: 1 } });
