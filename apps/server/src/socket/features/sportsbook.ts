import { placeMatchBetSchema } from '@risky-chess/shared';
import type { Sportsbook } from '../../sportsbook/Sportsbook';
import { handle, type Feature } from '../handlers';

/** Spectator bets. Settlements arrive on the account's private channel. */
export const sportsbookFeature =
  (sportsbook: Sportsbook): Feature =>
  (socket) => {
    socket.on(
      'place_match_bet',
      handle(socket, 'place_match_bet', placeMatchBetSchema, (p) => sportsbook.place({ id: socket.data.user.id, username: socket.data.user.username }, p)),
    );
  };
