# Legal documents

`terms-of-use.md` and `privacy-policy.md` are copies of what the app shows at `/terms` and `/privacy-policy`, for the lawyer to review. Do not edit them here: change `packages/shared/src/legal-text.ts`, then run `npx vite-node scripts/build-legal-docs.ts` (a unit test checks they match).

Before launch:

1. Fill in `LEGAL_ENTITY` (company name, address, email, Data Protection Commission registration number, database region).
2. A Ghanaian lawyer reviews both documents against the Data Protection Act, 2012 (Act 843) and the app.
3. Register with the Data Protection Commission.
4. Translate into Twi and have it checked.
5. Set `LEGAL_IS_DRAFT` to `false` and bump `LEGAL_VERSIONS`, so everyone agrees to the final text.
