export const colors = {
  bg: '#14161A',
  surface: '#1E2127',
  surfaceRaised: '#272B33',
  text: '#ECEFF4',
  textMuted: '#9AA3B2',
  lightSquare: '#E8DCC4',
  darkSquare: '#A47E5B',
  slotA: '#F5A524',
  slotB: '#2EC4E6',
  lastMove: 'rgba(255, 230, 80, 0.45)',
  selected: 'rgba(120, 200, 120, 0.6)',
  target: 'rgba(20, 20, 20, 0.28)',
  danger: '#E5484D',
  success: '#46A758',
  chip: '#E9C46A',
  border: '#343944',
} as const;

/** The chip glyph. Chips are play money only. */
export const CHIP = '◎';

export const slotColor = (slot: 'A' | 'B') => (slot === 'A' ? colors.slotA : colors.slotB);

/** Money and status accents: green for gains, gold for balances, blue for info, red for losses. */
export const accent = { green: '#2ED573', gold: colors.chip, blue: colors.slotB, red: colors.danger } as const;

export const radius = { sm: 10, md: 12, lg: 18, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Pages never grow wider than this, so the web layout reads like the phone one. */
export const MAX_CONTENT_WIDTH = 520;

export const type = { h1: 26, h2: 20, h3: 16, body: 15, small: 13, tiny: 11 } as const;
