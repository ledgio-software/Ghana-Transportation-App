// Writes docs/legal/*.md from the texts the app shows (packages/shared/src/legal-text.ts), for
// the lawyer to review. Run again whenever the texts change: npx vite-node scripts/build-legal-docs.ts
import { writeFileSync } from 'node:fs';
import { legalMarkdown, privacyPolicy, termsOfUse } from '../packages/shared/src/legal-text';

writeFileSync('docs/legal/terms-of-use.md', legalMarkdown(termsOfUse()));
writeFileSync('docs/legal/privacy-policy.md', legalMarkdown(privacyPolicy()));
console.log('wrote docs/legal/terms-of-use.md and docs/legal/privacy-policy.md');
