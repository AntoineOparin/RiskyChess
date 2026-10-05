import type { ModeUi } from '../types';

// Plan 05 implements the bet slip, ledger and effect text.
export const sideBetsUi: ModeUi = {
  title: 'Side Bets',
  pitch: 'Sealed prop bets on your opponent and on chance.',
  risk: 1,
  bullets: [
    'In the first moves, place up to 3 sealed bets of 5–25 ◎.',
    'Bet only on what you can’t force: their castling, promotions, upsets, game length.',
    'Your opponent sees how many bets you hold, never which.',
  ],
};
