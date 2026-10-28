import { termsOfUse } from '@gta/shared';
import { LegalDoc } from '../components/LegalDoc';

/** P1-LEGAL: the full Terms of Use. Works signed out and offline (the text is in the app). */
export default function TermsScreen() {
  return <LegalDoc doc={termsOfUse()} />;
}
