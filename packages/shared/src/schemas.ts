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

export const modeIdSchema = z.enum(['all_in']);

export const gameRulesSchema = z.object({
  modes: z
    .array(modeIdSchema)
    .max(1)
    .refine((m) => new Set(m).size === m.length, 'Duplicate mode'),
});

export const turnExtrasSchema = z.object({
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

export const createGameSchema = z.object({
  mode: z.enum(['pvp', 'bot']),
  displayName: displayNameSchema,
  color: z.enum(['w', 'b', 'random']).optional(),
  rules: gameRulesSchema.optional(),
});

export const joinGameSchema = z.object({ gameId: gameIdSchema, displayName: displayNameSchema });
export const rejoinGameSchema = z.object({ gameId: gameIdSchema, playerToken: z.string().min(1).max(128) });
export const gameRefSchema = z.object({ gameId: gameIdSchema });
