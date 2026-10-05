import type { ModeUi } from '../types';

// Plan 03 implements the badge, panel and effect text.
export const oddsMarketUi: ModeUi = {
  title: 'Odds Market',
  pitch: 'The house leans against your stronger move. Beat the line, get paid.',
  risk: 2,
  bullets: [
    'Pair a great move with junk and the coin leans toward the junk (up to 35/65).',
    'Two moves of similar strength stay close to 50/50.',
    'If your stronger move plays anyway, you collect chips.',
  ],
};
