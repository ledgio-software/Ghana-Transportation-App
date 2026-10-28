import { Platform } from 'react-native';

/** The web app calls its own /api functions; the Android app calls the same ones on the web app. */
export const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');
