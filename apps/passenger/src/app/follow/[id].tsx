import { useLocalSearchParams } from 'expo-router';
import { WebScreen } from '../../components/WebScreen';

/** P1-SAFE-05 on Android: the family page from the website (follow/[id].web.tsx) in a WebView. */
export default function FollowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WebScreen path={`/follow/${encodeURIComponent(id ?? '')}`} />;
}
