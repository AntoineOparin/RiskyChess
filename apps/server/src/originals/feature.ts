import { coinDuelBetSchema, emptySchema, puzzleAnswerSchema, puzzleStartSchema } from '@risky-chess/shared';
import type { Services } from '../platform';
import { handle, type Feature, type GameSocket } from '../socket/handlers';
import { BlitzPuzzle } from './BlitzPuzzle';
import { CoinDuel, type Bettor, type EmitToUser } from './CoinDuel';

export interface Originals {
  coinDuel: CoinDuel;
  puzzle: BlitzPuzzle;
}

export function createOriginals(services: Services, emitToUser: EmitToUser): Originals {
  return { coinDuel: new CoinDuel(services, emitToUser), puzzle: new BlitzPuzzle(services, emitToUser) };
}

const bettor = (socket: GameSocket): Bettor => ({ id: socket.data.user.id, username: socket.data.user.username });

/** Socket events for the Originals; every one acts on the calling account only. */
export function originalsFeature({ coinDuel, puzzle }: Originals): Feature {
  return (socket) => {
    socket.on('coin_duel_deal', handle(socket, 'coin_duel_deal', emptySchema, () => coinDuel.deal(bettor(socket))));
    socket.on('coin_duel_bet', handle(socket, 'coin_duel_bet', coinDuelBetSchema, (p) => coinDuel.bet(bettor(socket), p)));
    socket.on('puzzle_start', handle(socket, 'puzzle_start', puzzleStartSchema, (p) => puzzle.start(bettor(socket), p)));
    socket.on('puzzle_answer', handle(socket, 'puzzle_answer', puzzleAnswerSchema, (p) => puzzle.answer(bettor(socket), p)));
  };
}
