/**
 * Every user-facing string lives here (Phase 0 doc 6.4 and 8.5). Other languages must
 * provide the same keys; the type check enforces it. Use {name} for placeholders.
 */
export const en = {
  'app.name': 'Ghana Transport',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong. Try again.',
  'common.retry': 'Try again',
  'common.offline': 'Offline. Showing fares saved on {date}.',
  'common.cancel': 'Cancel',

  'search.title': 'Where are you going?',
  'search.from': 'From',
  'search.to': 'To',
  'search.pickStation': 'Choose a station',
  'search.button': 'Find fares',
  'search.sameStation': 'Start and destination must be different.',

  'fare.official': 'Official fare',
  'fare.reported': 'People paid this week',
  'fare.lastChecked': 'Last checked {date}',
  'fare.none': 'No fares yet for this route.',
  'fare.confidence.high': 'Recently confirmed',
  'fare.confidence.medium': 'May have changed',
  'fare.confidence.low': 'Old price, check before you travel',
  'fare.departure.fill_and_go': 'Leaves when full',
  'fare.departure.scheduled': 'Scheduled departures',

  'check.title': 'Is this fare fair?',
  'check.quoted': 'Fare you were asked to pay (GH¢)',
  'check.button': 'Check',
  'check.above_normal': 'Above normal fare',
  'check.normal': 'Normal fare',
  'check.below_normal': 'Below normal fare',
  'check.unknown': 'We do not know this fare yet.',
  'check.excess': '{amount} more than the normal fare',

  'auth.title': 'Sign in',
  'auth.why': 'You only need an account to report fares. Searching is free without one.',
  'auth.phone': 'Phone number',
  'auth.sendCode': 'Send code',
  'auth.code': '6-digit code',
  'auth.verify': 'Verify',
  'auth.invalidPhone': 'Enter a valid Ghana mobile number.',
  'auth.codeSent': 'We sent a code to {phone}.',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.signIn': 'Sign in',
  'settings.signOut': 'Sign out',
  'settings.signedInAs': 'Signed in as {phone}',

  'update.required': 'This version is no longer supported. Please update the app to keep using it.',
  'update.button': 'Update',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
