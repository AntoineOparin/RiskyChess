import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { TurnResult } from '@risky-chess/shared';

const SOURCES = {
  pick_a: require('../../assets/sfx/pick_a.wav'),
  pick_b: require('../../assets/sfx/pick_b.wav'),
  lock: require('../../assets/sfx/lock.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  land: require('../../assets/sfx/land.wav'),
  move: require('../../assets/sfx/move.wav'),
  capture: require('../../assets/sfx/capture.wav'),
  check: require('../../assets/sfx/check.wav'),
  castle: require('../../assets/sfx/castle.wav'),
  promote: require('../../assets/sfx/promote.wav'),
  forced: require('../../assets/sfx/forced.wav'),
  win: require('../../assets/sfx/win.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  draw: require('../../assets/sfx/draw.wav'),
} as const;

export type Sfx = keyof typeof SOURCES;

/** Ticks fire faster than they finish, so they rotate through a few players. */
const POOL: Partial<Record<Sfx, number>> = { tick: 2 };

const bank = new Map<Sfx, { players: AudioPlayer[]; next: number }>();

/**
 * Creates one long-lived player per sound so playback never waits on loading.
 * Call once at startup; safe to call again.
 */
export function initSfx() {
  if (bank.size) return;
  // Respect the mute switch and never pause the player's own music.
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  for (const name of Object.keys(SOURCES) as Sfx[]) {
    const players = Array.from({ length: POOL[name] ?? 1 }, () => createAudioPlayer(SOURCES[name]));
    bank.set(name, { players, next: 0 });
  }
}

/** Fire-and-forget. Never await this on an interaction path. */
export function playSfx(name: Sfx) {
  const entry = bank.get(name);
  if (!entry) return;
  const player = entry.players[entry.next];
  entry.next = (entry.next + 1) % entry.players.length;
  if (!player) return;
  void player.seekTo(0).catch(() => {});
  player.play();
}

/** The sound for the move a turn actually played, chess.js flags first. */
export function moveSfx(r: TurnResult): Sfx {
  const { flags } = r.executed;
  // A busted All-In plays nothing: the piece just leaves.
  if (r.effects?.some((e) => e.kind === 'all_in' && !e.won)) return 'forced';
  if (r.inCheck) return 'check';
  if (flags.includes('p')) return 'promote';
  if (flags.includes('k') || flags.includes('q')) return 'castle';
  if (r.executed.captured) return 'capture';
  return 'move';
}
