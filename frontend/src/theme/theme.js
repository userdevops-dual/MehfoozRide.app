// src/theme/theme.js  ← also aliased from utils/theme.js
// ─── Colour Palette ──────────────────────────────────────────────────────────
export const C = {
  rose:      '#C84B7A',
  roseDark:  '#8B1A4A',
  rosePale:  '#FFE4EF',
  roseLight: '#FFF0F8',
  plum:      '#5C1448',
  plumLight: '#F5E4F5',
  gold:      '#D4936A',
  goldLight: '#FDF0E6',
  bg:        '#FFF5FA',
  white:     '#FFFFFF',
  text:      '#2A1020',
  muted:     '#9A607A',
  border:    '#F0D0E0',
  success:   '#27AE60',
  successBg: '#E8F5E9',
  danger:    '#E53935',
  dangerBg:  '#FFEBEE',
  info:      '#1565C0',
  infoBg:    '#E3F2FD',
};

// ─── Gradient Colour Arrays (for react-native-linear-gradient) ───────────────
export const GRAD = {
  primary: [C.plum, C.rose],
  rose:    [C.rose, C.roseDark],
  success: ['#27AE60', '#1a7a40'],
  danger:  [C.danger, '#B71C1C'],
};
