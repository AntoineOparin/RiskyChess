import type { ModeUi } from '../types';

// Plan 04 implements the toggle, banner and fade.
export const allInUi: ModeUi = {
  title: 'All-In',
  pitch: 'Bet a capture on one 50/50 coin: win a bonus move or lose the piece.',
  risk: 3,
  bullets: [
    'Instead of a pair, declare one capture All-In.',
    'Win: the capture plays and you move again. Lose: your capturing piece is removed.',
    'Once per piece type per game. Never with the king.',
  ],
};
