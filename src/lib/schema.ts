// Schema of an event as stored in data/events (after defaults and deck registry are applied)
// and as served to the site. TypeScript types in src/types.ts are inferred from it.
// Used by the scripts (validation) and by the site only as types, so zod is not bundled.
import { z } from 'zod';

const nonEmptyString = z.string().refine((value) => value.trim() !== '', 'must be a non-empty string');
const localId = z.union([z.number().int(), nonEmptyString]);

export const recordSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
});

export const deckRefSchema = z.object({
  name: nonEmptyString,
  colors: nonEmptyString,
});

export const roundSchema = z.object({
  round: z.number().int(),
  opponentLocalId: localId.nullish(),
  opponentPlayerId: z.string().nullable(),
  opponentPlayerRef: nonEmptyString.nullish(),
  opponentPlayerName: nonEmptyString.nullish(),
  resultType: z.enum(['PLAYED', 'BYE', 'ID']).optional(),
  match: recordSchema,
  game: recordSchema.optional(),
});

export const standingSchema = z.object({
  localId: localId.optional(),
  playerRef: nonEmptyString.nullish(),
  rank: z.number().int(),
  playerId: nonEmptyString,
  playerName: nonEmptyString,
  points: z.number().int(),
  deck: deckRefSchema,
  match: recordSchema,
  game: recordSchema.optional(),
  rounds: z.array(roundSchema),
});

type RecordValue = z.infer<typeof recordSchema>;

const sameRecord = (a: RecordValue, b: RecordValue) => a.wins === b.wins && a.losses === b.losses && a.draws === b.draws;
const mirrored = (a: RecordValue, b: RecordValue) => a.wins === b.losses && a.losses === b.wins && a.draws === b.draws;
const matchFromGame = (game: RecordValue): RecordValue =>
  game.wins > game.losses
    ? { wins: 1, losses: 0, draws: 0 }
    : game.wins < game.losses
      ? { wins: 0, losses: 1, draws: 0 }
      : { wins: 0, losses: 0, draws: 1 };
const ZERO = { wins: 0, losses: 0, draws: 0 };

export const eventSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date YYYY-MM-DD'),
    location: nonEmptyString,
    mode: z.enum(['roundByRound', 'standingsOnly']).optional(),
    type: z.enum(['weekly', 'monthly']).optional(),
    place: z.enum(['Futurex', 'SideQuest']).optional(),
    standings: z.array(standingSchema).min(1),
  })
  .superRefine((event, ctx) => {
    const fail = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    const roundByRound = (event.mode ?? 'roundByRound') === 'roundByRound';

    const playerIds = new Set<string>();
    const localIds = new Set<string>();
    const localKeyByPlayerId = new Map<string, string>();
    const roundsByLocalKey = new Map<string, Map<number, z.infer<typeof roundSchema>>>();
    const byesByRound = new Map<number, number>();

    event.standings.forEach((row, rowIndex) => {
      const rowPath = ['standings', rowIndex];
      if (playerIds.has(row.playerId)) fail(`duplicate playerId "${row.playerId}"`, [...rowPath, 'playerId']);
      playerIds.add(row.playerId);

      let localKey = row.playerId;
      if (row.localId !== undefined) {
        localKey = String(row.localId);
        if (localIds.has(localKey)) fail(`duplicate localId "${row.localId}"`, [...rowPath, 'localId']);
        localIds.add(localKey);
      }
      localKeyByPlayerId.set(row.playerId, localKey);

      const playerRounds = new Map<number, z.infer<typeof roundSchema>>();
      row.rounds.forEach((round, roundIndex) => {
        const roundPath = [...rowPath, 'rounds', roundIndex];
        const resultType = round.resultType ?? 'PLAYED';
        if (playerRounds.has(round.round)) fail(`duplicate round number ${round.round}`, [...roundPath, 'round']);
        playerRounds.set(round.round, round);

        if (resultType === 'BYE') {
          const byes = (byesByRound.get(round.round) ?? 0) + 1;
          byesByRound.set(round.round, byes);
          if (byes > 1) fail(`round ${round.round} has more than one BYE`, roundPath);
        }
        if (!roundByRound) return;
        if (resultType === 'PLAYED' && round.game && !sameRecord(round.match, matchFromGame(round.game))) {
          fail('match must be consistent with game', [...roundPath, 'match']);
        }
        if (resultType === 'BYE' && !sameRecord(round.match, { wins: 1, losses: 0, draws: 0 })) {
          fail('BYE round must have match 1-0-0', [...roundPath, 'match']);
        }
        if (resultType === 'ID' && !sameRecord(round.match, ZERO)) {
          fail('ID round must have match 0-0-0', [...roundPath, 'match']);
        }
        if ((resultType === 'BYE' || resultType === 'ID') && round.game && !sameRecord(round.game, ZERO)) {
          fail(`${resultType} round must have game 0-0-0`, [...roundPath, 'game']);
        }
      });
      roundsByLocalKey.set(localKey, playerRounds);
    });

    if (!roundByRound) return;

    // Pairing consistency: if A plays B in round X, B must play A in round X with a mirrored result.
    const opponentKeyOf = (round: z.infer<typeof roundSchema>) => {
      if (round.opponentLocalId !== undefined && round.opponentLocalId !== null) return String(round.opponentLocalId);
      if (typeof round.opponentPlayerId === 'string') {
        return localKeyByPlayerId.get(round.opponentPlayerId) ?? round.opponentPlayerId;
      }
      return null;
    };

    for (const [localKey, rounds] of roundsByLocalKey) {
      for (const [roundNumber, round] of rounds) {
        if ((round.resultType ?? 'PLAYED') !== 'PLAYED') continue;
        const opponentKey = opponentKeyOf(round);
        if (!opponentKey) continue;

        const opponentRounds = roundsByLocalKey.get(opponentKey);
        if (!opponentRounds) {
          fail(`unknown opponent "${opponentKey}" in round ${roundNumber}`, ['standings']);
          continue;
        }
        const mirror = opponentRounds.get(roundNumber);
        if (!mirror) {
          fail(`missing mirror record for ${localKey} vs ${opponentKey} in round ${roundNumber}`, ['standings']);
          continue;
        }
        const back = opponentKeyOf(mirror);
        if (back !== localKey) {
          fail(`non-mirrored pairing in round ${roundNumber}: ${localKey} -> ${opponentKey}, but reverse is ${back ?? 'missing'}`, ['standings']);
          continue;
        }
        if (round.game && mirror.game) {
          if (!mirrored(round.game, mirror.game)) fail(`game record mismatch for ${localKey} vs ${opponentKey} in round ${roundNumber}`, ['standings']);
        } else if (!mirrored(round.match, mirror.match)) {
          fail(`match record mismatch for ${localKey} vs ${opponentKey} in round ${roundNumber}`, ['standings']);
        }
      }
    }
  });

export type EventInput = z.infer<typeof eventSchema>;

function formatIssues(error: z.ZodError, hint: string): string {
  const lines = error.issues.slice(0, 10).map((issue) => {
    const where = issue.path.length > 0 ? `${hint}.${issue.path.join('.')}` : hint;
    return `  ${where}: ${issue.message}`;
  });
  const more = error.issues.length > 10 ? `\n  ...and ${error.issues.length - 10} more` : '';
  return `Invalid ${hint}:\n${lines.join('\n')}${more}`;
}

export function validateEvent(event: unknown, hint = 'event'): void {
  const result = eventSchema.safeParse(event);
  if (!result.success) throw new Error(formatIssues(result.error, hint));
}

export function validateEventsArray(events: unknown[]): void {
  const ids = new Set<string>();
  events.forEach((event, index) => {
    const id = (event as { id?: string })?.id;
    validateEvent(event, id ? `event ${id}` : `events[${index}]`);
    if (id && ids.has(id)) throw new Error(`Duplicate event id: ${id}`);
    if (id) ids.add(id);
  });
}
