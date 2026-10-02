import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildPlayerDetail,
  buildPlayersList,
  formatRecord,
  matchWinPercent,
  sortEventsNewestFirst,
} from '../src/lib/data.ts';
import type { EventItem } from '../src/types.ts';
import { matchSnapshot } from './helpers/snapshot.ts';

// Snapshots of the numbers the site shows today. Refactoring must not change them;
// intended data changes are accepted with `npm run test:update` and reviewed in the diff.

const root = path.join(import.meta.dirname, '..');

function loadEvents(): EventItem[] {
  const raw = JSON.parse(readFileSync(path.join(root, 'public/data/events.json'), 'utf8')) as EventItem[];
  return sortEventsNewestFirst(raw);
}

test('site: players list', () => {
  const players = buildPlayersList(loadEvents()).map(
    (p) => `${p.id} | ${p.name} | events ${p.eventsCount} | ${p.matchWinPercent.toFixed(2)}%`,
  );
  matchSnapshot('site-players', players);
});

test('site: player details', () => {
  const events = loadEvents();
  const details: Record<string, unknown> = {};

  for (const { id } of buildPlayersList(events)) {
    const player = buildPlayerDetail(events, id);
    assert.ok(player, `player ${id} not found`);
    details[id] = {
      name: player.name,
      record: formatRecord(player.match),
      winrate: matchWinPercent(player.match).toFixed(2),
      favoriteDeck: player.favoriteDeck ? `${player.favoriteDeck.name} (${player.favoriteDeck.colors})` : null,
      events: player.events.map(
        (row) => `${row.date} | ${row.eventName} | ${row.rankDisplay} | ${row.deck.name} | ${formatRecord(row.match)}`,
      ),
      decks: player.deckStats.map((deck) => ({
        deck: `${deck.deckName} (${deck.colors})`,
        record: formatRecord(deck.match),
        winrate: deck.matchWinPercent,
        matchups: deck.matchups.map((m) => `${m.deckName} | ${formatRecord(m.match)} | ${m.matchWinPercent}%`),
      })),
    };
  }

  matchSnapshot('site-player-details', details);
});

test('generate-data: cache files', () => {
  const workdir = mkdtempSync(path.join(tmpdir(), 'trojmiasto-generate-'));
  try {
    cpSync(path.join(root, 'public/data/events.json'), path.join(workdir, 'public/data/events.json'));
    cpSync(path.join(root, 'config'), path.join(workdir, 'config'), { recursive: true });

    const result = spawnSync(process.execPath, [path.join(root, 'scripts/generate-data.mjs')], {
      cwd: workdir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const read = (name: string) => JSON.parse(readFileSync(path.join(workdir, 'public/data/cache', name), 'utf8'));
    matchSnapshot('generated-players', read('players.json'));
    matchSnapshot('generated-events-summary', read('events-summary.json'));
    matchSnapshot('generated-matchups', read('matchups.json'));
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});
