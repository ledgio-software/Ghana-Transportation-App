/**
 * Ghana colours (red, gold, green and the black star) with large text and strong contrast for
 * outdoor sunlight (Phase 0 doc 6.3). Gold is too light for text on white: use it behind dark
 * text or on green only.
 */
export const ghana = {
  red: '#CE1126',
  gold: '#FCD116',
  green: '#006B3F',
  black: '#111111',
};

export const colors = {
  primary: ghana.green,
  primaryDark: '#00522F',
  primaryText: '#FFFFFF',
  accent: ghana.gold,
  accentSoft: '#FFF6CC',
  text: '#111111',
  muted: '#4A4A4A',
  border: '#D3D9D6',
  background: '#FFFFFF',
  surface: '#F2F6F4',
  danger: ghana.red,
  dangerSoft: '#FCE4E6',
  warning: '#8A5A00',
  ok: ghana.green,
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const font = { body: 17, small: 15, title: 26, heading: 20, amount: 22, hero: 30 };

export const radius = { md: 12, lg: 16, pill: 999 };
