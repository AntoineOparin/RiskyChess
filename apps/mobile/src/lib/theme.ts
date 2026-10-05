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
