import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildPlayersList,
  effectiveMatchRecord,
  formatDate,
  formatRecord,
  matchWinPercent,
} from '../src/lib/data.ts';
import type { EventItem, RecordStat, RoundResult, Standing } from '../src/types.ts';

const rec = (wins: number, losses: number, draws = 0): RecordStat => ({ wins, losses, draws });

function standing(playerId: string, playerName: string, match: RecordStat, rounds: RoundResult[] = []): Standing {
  return {
    rank: 1,
    playerId,
    playerName,
    points: 0,
    deck: { name: 'Test Deck', colors: 'U' },
    match,
    rounds,
  };
}

function event(id: string, date: string, standings: Standing[]): EventItem {
  return { id, name: id, date, location: 'Test', standings };
}

describe('matchWinPercent', () => {
  test('counts a draw as half a win', () => {
    assert.equal(matchWinPercent(rec(1, 0, 1)), 75);
  });

  test('returns 0 when no matches were played', () => {
    assert.equal(matchWinPercent(rec(0, 0, 0)), 0);
  });

  test('wins over all played matches', () => {
    assert.equal(matchWinPercent(rec(2, 1)).toFixed(2), '66.67');
  });
});

describe('effectiveMatchRecord', () => {
  test('excludes byes when round data is available', () => {
    const row = standing('p01', 'Jan Nowak', rec(2, 1), [
      { round: 1, opponentPlayerId: 'p02', resultType: 'PLAYED', match: rec(1, 0) },
      { round: 2, opponentPlayerId: null, resultType: 'BYE', match: rec(1, 0) },
      { round: 3, opponentPlayerId: 'p03', resultType: 'PLAYED', match: rec(0, 1) },
    ]);
    assert.deepEqual(effectiveMatchRecord(row), rec(1, 1));
  });

  test('uses the raw record for standings-only rows without rounds', () => {
    const row = standing('p01', 'Jan Nowak', rec(2, 1));
    assert.deepEqual(effectiveMatchRecord(row), rec(2, 1));
  });
});

describe('buildPlayersList', () => {
  test('merges rows of the same player id across events', () => {
    const events = [
      event('e2', '2026-02-01', [standing('jan-nowak', 'Jan Nowak', rec(1, 1))]),
      event('e1', '2026-01-01', [standing('jan-nowak', 'Jan Nowak', rec(2, 0))]),
    ];
    const players = buildPlayersList(events);
    assert.equal(players.length, 1);
    assert.equal(players[0].id, 'jan-nowak');
    assert.equal(players[0].eventsCount, 2);
    assert.equal(players[0].matchWinPercent, 75);
  });

  test('identifies players by id, not by name', () => {
    const events = [
      event('e2', '2026-02-01', [standing('jan-nowak-2', 'Jan Nowak', rec(1, 1))]),
      event('e1', '2026-01-01', [standing('jan-nowak', 'Jan Nowak', rec(2, 0))]),
    ];
    assert.equal(buildPlayersList(events).length, 2);
  });

  test('keeps different players apart', () => {
    const events = [event('e1', '2026-01-01', [standing('jan-nowak', 'Jan Nowak', rec(1, 0)), standing('anna-nowak', 'Anna Nowak', rec(0, 1))])];
    assert.equal(buildPlayersList(events).length, 2);
  });
});

describe('formatting', () => {
  test('formatRecord', () => {
    assert.equal(formatRecord(rec(3, 1, 1)), '3-1-1');
    assert.equal(formatRecord(undefined), '-');
  });

  test('formatDate', () => {
    assert.equal(formatDate('2026-09-21'), '21 September 2026');
  });
});
