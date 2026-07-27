/**
 * Starff design tokens — the single visual source of truth for the mobile app.
 *
 * Ported verbatim from the approved prototype's design system
 * (starff-branding-65a14597). These MUST match the admin dashboard and portals
 * so every Starff surface looks like one product. Do not hard-code colours or
 * spacing elsewhere — always reference these tokens.
 *
 * Note: in the prototype the primary action colour is named "--green" for
 * historical reasons but is actually Starff safety-orange (#F47A20).
 */

export const colors = {
  // Brand
  navy: '#0B1F3A', // primary / headers / dark surfaces
  navy2: '#16325C',
  orange: '#F47A20', // primary action (the prototype's "--green")
  orangeDim: '#D9660F', // pressed / hover
  blue: '#3B82F6',

  // Backgrounds & surfaces
  bg: '#F5F7FA', // page background
  surface: '#FFFFFF', // cards
  surfaceAlt: '#EEF2F7', // tiles / metrics
  surfaceAlt2: '#E3E9F1',

  // Text
  text: '#0B1F3A', // t1 — primary
  textMuted: '#5A6B82', // t2 — secondary
  textFaint: '#94A3B8', // t3 — tertiary / placeholders
  onPrimary: '#FFFFFF',

  // Borders
  border: '#E6EAF0',
  borderStrong: '#CBD5E1',

  // Status
  success: '#178A50',
  successBg: '#E7F6EE',
  warning: '#B45309',
  warningBg: 'rgba(180,83,9,0.13)',
  error: '#DC2626',
  errorBg: 'rgba(220,38,38,0.12)',
  gold: '#B7791F',

  // Orange tints (compliance / highlight surfaces)
  orangeBg: '#FDEBDC',
  orangeBorder: '#F6C79E',

  // Dark auth gradient stops
  authTop: '#16325C',
  authMid: '#0B1F3A',
  authBottom: '#071224',
} as const;

export const radius = {
  card: 14,
  tile: 12,
  control: 10,
  chip: 8,
  pill: 20,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const font = {
  // Loaded via expo-font; falls back to system until loaded.
  sans: 'Mulish',
  sansBold: 'Mulish-Bold',
  mono: 'SpaceMono', // rates / numbers / times
} as const;

export const typography = {
  h1: { fontSize: 25, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '800' as const, letterSpacing: -0.3 },
  title: { fontSize: 16, fontWeight: '800' as const },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12.5 },
  tiny: { fontSize: 11 },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export type StatusKind =
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'
  | 'gray'
  | 'orange';
