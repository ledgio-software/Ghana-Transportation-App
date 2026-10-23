import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared package is TypeScript source, compiled by Next.
  transpilePackages: ['@gta/shared'],
  // Static export: the dashboard is client-only and talks to Supabase directly under RLS.
  output: 'export',
};

export default config;
