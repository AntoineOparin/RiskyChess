import type { ModeUi } from '../types';

// Plan 02 implements the panel, badge and effect text.
export const loadedDiceUi: ModeUi = {
  title: 'Loaded Dice',
  pitch: 'Pay chips to tilt the coin toward the move you want.',
  risk: 2,
  bullets: [
    'Favor slot A or B and stake 4, 10 or 20 ◎ for +10, +20 or +30 points.',
    'The stake is paid whatever the coin does. Odds never pass 90%.',
    'Captures earn chips (the captured piece’s value), so stay aggressive.',
  ],
};
