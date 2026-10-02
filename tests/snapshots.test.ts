import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { formatRecord } from '../src/lib/format.ts';
import { matchWinPercent } from '../src/lib/stats.ts';
import type { EventItem, EventsIndexItem, PlayerDetail, PlayerListItem } from '../src/types.ts';
import { matchSnapshot } from './helpers/snapshot.ts';

// Snapshots of the numbers the site shows. They are computed from frozen copies of the event
// files and registries (tests/fixtures), so adding new events never breaks the tests.
// The fixtures go through scripts/generate-data.mjs exactly like real data, and the
// snapshots are taken from the generated files the site loads.
// Refactoring must not change them; intended changes are accepted with
// `npm run test:update` and reviewed in the diff.

const root = path.join(import.meta.dirname, '..');
const fixtures = path.join(import.meta.dirname, 'fixtures');

let workdir = '';
let eventsIndex: EventsIndexItem[] = [];
let players: PlayerListItem[] = [];

const readGenerated = (name: string) => JSON.parse(readFileSync(path.join(workdir, 'public/data', name), 'utf8'));

before(() => {
  workdir = mkdtempSync(path.join(tmpdir(), 'trojmiasto-generate-'));
  const eventsDir = path.join(workdir, 'data/events');
  mkdirSync(eventsDir, { recursive: true });
  const events = JSON.parse(readFileSync(path.join(fixtures, 'events.json'), 'utf8')) as EventItem[];
  for (const event of events) {
    writeFileSync(path.join(eventsDir, `${event.id}.json`), JSON.stringify(event, null, 2));
  }
  cpSync(path.join(fixtures, 'players.json'), path.join(workdir, 'data/players.json'));
  cpSync(path.join(fixtures, 'decks.json'), path.join(workdir, 'data/decks.json'));

  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', path.join(root, 'scripts/generate-data.mjs')], {
    cwd: workdir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  eventsIndex = readGenerated('events-index.json');
  players = readGenerated('players.json');
});

after(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test('site: players list', () => {
  const rows = players.map((p) => `${p.id} | ${p.name} | events ${p.eventsCount} | ${p.matchWinPercent.toFixed(2)}%`);
  matchSnapshot('site-players', rows);
});

test('site: player details', () => {
  const details: Record<string, unknown> = {};

  for (const { id } of players) {
    const player: PlayerDetail = readGenerated(`player/${id}.json`);
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

test('generate-data: event pages use registry names and colors', () => {
  const players = new Map(
    JSON.parse(readFileSync(path.join(fixtures, 'players.json'), 'utf8')).map((p: { id: string; name: string }) => [p.id, p.name]),
  );
  const deckColors = new Map(
    JSON.parse(readFileSync(path.join(fixtures, 'decks.json'), 'utf8')).map((d: { name: string; colors: string }) => [d.name, d.colors]),
  );
  for (const { id } of eventsIndex) {
    const event: EventItem = readGenerated(`event/${id}.json`);
    for (const row of event.standings) {
      assert.equal(row.playerName, players.get(row.playerId));
      assert.equal(row.deck.colors, deckColors.get(row.deck.name), `${event.id}: ${row.deck.name}`);
    }
  }
});

test('generate-data: events index and matchups', () => {
  matchSnapshot('generated-events-index', eventsIndex);
  matchSnapshot('generated-matchups', readGenerated('matchups.json'));
});
