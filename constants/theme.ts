export const Colors = {
  cream: '#f5f0e8',
  paper: '#ede8de',
  warmWhite: '#faf8f4',
  terracotta: '#c4622d',
  terraLight: '#e8855a',
  terraDim: '#8b4220',
  brown: '#3d2b1f',
  brownMid: '#6b4c3b',
  brownLight: '#9c7b6a',
  olive: '#7a8c5c',
  oliveLight: '#a8bc82',
  gold: '#c9a84c',
  goldLight: '#e8c97a',
  ink: '#1e1510',
  muted: '#8a7a6e',
  border: '#d8cfc2',
  borderDark: '#c4b8a8',
  white: '#ffffff',
  error: '#d94f4f',
  success: '#5a9e6f',
};

export const Fonts = {
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// ── Dark mode variant (earthy, warm — matches brand) ──
export const DarkColors: typeof Colors = {
  cream:       '#1a1410',
  paper:       '#231c16',
  warmWhite:   '#1e1812',
  terracotta:  '#c4622d',
  terraLight:  '#e8855a',
  terraDim:    '#8b4220',
  brown:       '#e8d5c4',
  brownMid:    '#c4a898',
  brownLight:  '#a08878',
  olive:       '#8fa86e',
  oliveLight:  '#a8bc82',
  gold:        '#c9a84c',
  goldLight:   '#e8c97a',
  ink:         '#f0e8e0',
  muted:       '#9a8a7e',
  border:      '#3a2e28',
  borderDark:  '#4a3c34',
  white:       '#ffffff',
  error:       '#d94f4f',
  success:     '#5a9e6f',
};

import { useColorScheme } from 'react-native';
export function useThemeColors(): typeof Colors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DarkColors : Colors;
}
