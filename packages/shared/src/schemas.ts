import { z } from 'zod';

export const colorSchema = z.enum(['w', 'b']);
export const squareSchema = z.string().regex(/^[a-h][1-8]$/) as z.ZodType<`${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`>;
const gameIdSchema = z.string().min(1).max(64);
const displayNameSchema = z.string().trim().min(1).max(32);

export const moveInputSchema = z.object({
  from: squareSchema,
  to: squareSchema,
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

export const modeIdSchema = z.enum(['loaded_dice', 'odds_market', 'all_in', 'side_bets']);

export const gameRulesSchema = z.object({
  modes: z
    .array(modeIdSchema)
    .max(4)
    .refine((m) => new Set(m).size === m.length, 'Duplicate mode'),
});

export const turnExtrasSchema = z.object({
  favor: z.enum(['A', 'B']).optional(),
  stake: z.number().int().min(0).max(1000).optional(),
  allIn: z.boolean().optional(),
  clientSeed: z
    .string()
    .regex(/^[0-9a-f]{8,128}$/)
    .optional(),
});

export const moveSubmissionSchema = z.object({
  gameId: gameIdSchema,
  turnNumber: z.number().int().positive(),
  clientSubmissionId: z.string().min(1).max(64),
  moveA: moveInputSchema,
  moveB: moveInputSchema.nullable(),
  extras: turnExtrasSchema.optional(),
});

const centsSchema = z.number().int().nonnegative().max(100_000_000);

export const createGameSchema = z.object({
  mode: z.enum(['pvp', 'bot']),
  displayName: displayNameSchema.optional(),
  color: z.enum(['w', 'b', 'random']).optional(),
  rules: gameRulesSchema.optional(),
  buyInCents: centsSchema.optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export const emptySchema = z.object({}).passthrough();

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(16)
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, digits and underscores only');

export const registerSchema = z.object({ username: usernameSchema });
export const amountSchema = z.object({ amountCents: z.number().int().positive().max(100_000_000) });

export const placeMatchBetSchema = z.object({
  gameId: gameIdSchema,
  clientBetId: z.string().min(1).max(64),
  side: z.enum(['w', 'b', 'd']),
  stakeCents: z.number().int().positive().max(100_000_000),
  oddsX100: z.number().int().positive(),
});

export const coinDuelBetSchema = z.object({
  roundId: z.string().min(1).max(64),
  slot: z.enum(['A', 'B']),
  stakeCents: z.number().int().positive().max(100_000_000),
});

export const puzzleStartSchema = z.object({
  tier: z.enum(['mate1', 'mate2']),
  stakeCents: z.number().int().positive().max(100_000_000),
});

export const puzzleAnswerSchema = z.object({
  roundId: z.string().min(1).max(64),
  move: moveInputSchema,
});

export const clientSeedSchema = z.object({ clientSeed: z.string().regex(/^[a-zA-Z0-9_-]{4,64}$/) });

export const propBetKindSchema = z.enum([
  'opp_castles_by',
  'opp_promotes',
  'opp_toss_upset',
  'opp_all_in_bust',
  'game_length_under',
  'game_length_over',
]);

export const placeBetSchema = z.object({
  gameId: gameIdSchema,
  clientBetId: z.string().min(1).max(64),
  kind: propBetKindSchema,
  params: z.record(z.string(), z.number().int()).optional(),
  stake: z.number().int().positive().max(1000),
});

export const joinGameSchema = z.object({ gameId: gameIdSchema, displayName: displayNameSchema.optional() });
export const gameRefSchema = z.object({ gameId: gameIdSchema });
/** Rejoin is by account now; the old token field is tolerated and ignored. */
export const rejoinGameSchema = z.object({ gameId: gameIdSchema, playerToken: z.string().optional() });
