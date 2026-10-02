import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { validateEvent, validateEventsArray } from '../src/lib/schema.ts';
import type { EventItem, RoundResult } from '../src/types.ts';

const events = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures/events.json'), 'utf8')) as EventItem[];
const roundByRound = events.find((e) => e.mode === 'roundByRound' && e.standings.some((s) => s.rounds.some((r) => r.resultType === 'BYE')))!;
const standingsOnly = events.find((e) => e.mode === 'standingsOnly')!;

const clone = <T>(value: T): T => structuredClone(value);
const decisive = (e: EventItem) =>
  e.standings
    .flatMap((s) => s.rounds.map((r) => ({ s, r })))
    .find(({ r }) => (r.resultType ?? 'PLAYED') === 'PLAYED' && r.game && r.game.wins !== r.game.losses)!;
const bye = (e: EventItem) => e.standings.flatMap((s) => s.rounds).find((r) => r.resultType === 'BYE')!;
const opponentOf = (e: EventItem, r: RoundResult) => e.standings.find((s) => String(s.localId) === String(r.opponentLocalId))!;

describe('event schema', () => {
  test('accepts all fixture events', () => {
    assert.doesNotThrow(() => validateEventsArray(events));
  });

  const invalid: Record<string, (e: EventItem) => unknown> = {
    'duplicate playerId': (e) => { e.standings[1].playerId = e.standings[0].playerId; return e; },
    'duplicate localId': (e) => { e.standings[1].localId = e.standings[0].localId; return e; },
    'bad date': (e) => ({ ...e, date: '21.09.2026' }),
    'bad mode': (e) => ({ ...e, mode: 'swiss' }),
    'bad place': (e) => ({ ...e, place: 'Arena' }),
    'empty standings': (e) => ({ ...e, standings: [] }),
    'empty name': (e) => ({ ...e, name: ' ' }),
    'non-integer rank': (e) => { e.standings[0].rank = 1.5; return e; },
    'empty deck colors': (e) => { e.standings[0].deck.colors = ''; return e; },
    'duplicate round number': (e) => { const r = e.standings[0].rounds; r[1].round = r[0].round; return e; },
    'match inconsistent with game': (e) => { const { r } = decisive(e); r.match = { wins: r.match.losses, losses: r.match.wins, draws: 0 }; return e; },
    'bye match not 1-0-0': (e) => { bye(e).match = { wins: 0, losses: 1, draws: 0 }; return e; },
    'bye game not 0-0-0': (e) => { bye(e).game = { wins: 2, losses: 0, draws: 0 }; return e; },
    'mirror round missing': (e) => { const { r } = decisive(e); const opp = opponentOf(e, r); opp.rounds = opp.rounds.filter((x) => x.round !== r.round); return e; },
    'non-mirrored pairing': (e) => {
      const { s, r } = decisive(e);
      const opp = opponentOf(e, r);
      const third = e.standings.find((x) => x !== s && x !== opp)!;
      opp.rounds.find((x) => x.round === r.round)!.opponentLocalId = third.localId;
      return e;
    },
    'unknown opponent': (e) => { decisive(e).r.opponentLocalId = 'NOBODY'; return e; },
  };

  for (const [name, mutate] of Object.entries(invalid)) {
    test(`rejects: ${name}`, () => {
      assert.throws(() => validateEvent(mutate(clone(roundByRound))));
    });
  }

  test('rejects: standings-only row without match', () => {
    const e = clone(standingsOnly) as Partial<EventItem>;
    delete (e.standings![0] as Partial<EventItem['standings'][number]>).match;
    assert.throws(() => validateEvent(e));
  });

  test('error message points to the field', () => {
    assert.throws(() => validateEvent({ ...clone(roundByRound), date: 'x' }, 'event test'), /event test\.date/);
  });
});
