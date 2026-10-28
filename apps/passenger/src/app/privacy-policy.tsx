import { privacyPolicy } from '@gta/shared';
import { LegalDoc } from '../components/LegalDoc';

/** P1-LEGAL: the full Privacy Policy (Act 843). Also the public link for the Play Store listing. */
export default function PrivacyPolicyScreen() {
  return <LegalDoc doc={privacyPolicy()} />;
}
