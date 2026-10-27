import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

// The Maps Embed key only works on our websites, so the map page claims to come from there.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** A Google map page shown inside the Android app. The web version is MapFrame.web.tsx. */
export function MapFrame({ src, title }: { src: string; title: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" allowfullscreen></iframe></body></html>`;
  return <WebView source={{ html, baseUrl: WEB_URL }} style={styles.map} accessibilityLabel={title} />;
}

const styles = StyleSheet.create({
  map: { height: 320, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
});
