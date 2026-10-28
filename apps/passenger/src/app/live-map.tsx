import { useLocalSearchParams } from 'expo-router';
import { WebScreen } from '../components/WebScreen';

/** P1-TRIP-04 on Android: the web app's live map page (live-map.web.tsx) in a WebView. */
export default function LiveMapScreen() {
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  return <WebScreen path="/live-map" params={{ from: from ?? '', to: to ?? '' }} location />;
}
