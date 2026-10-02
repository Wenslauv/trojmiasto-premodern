import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateEventsArray } from './lib/events-validation.mjs';
import { loadEvents } from './lib/event-store.mjs';
import { assertKnownPlayerIds, loadPlayers } from './lib/players.mjs';
import { buildEventsIndex, buildMatchups, buildPlayerDetail, buildPlayersList } from '../src/lib/stats.ts';

// Builds everything the site shows into public/data, so the browser only loads ready files:
//   events-index.json   list of events (Events page)
//   event/<id>.json     one event with standings and rounds (Event page)
//   players.json        list of players (Players page)
//   player/<id>.json    one player with history and deck stats (Player page)
//   matchups.json       deck vs deck matrix (Winrates page)
// With --check it only validates the data and runs the calculations, writing nothing.

const root = process.cwd();
const outDir = path.resolve(root, 'public/data');

async function writeJson(relativePath, value) {
  const target = path.join(outDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const events = await loadEvents(root);
  validateEventsArray(events);

  // Players are identified by id; the displayed name always comes from the registry.
  const registry = await loadPlayers(root);
  assertKnownPlayerIds(events, registry);
  const registryNames = new Map(registry.map((player) => [player.id, player.name]));
  for (const event of events) {
    for (const row of event.standings) {
      row.playerName = registryNames.get(row.playerId);
    }
  }

  const eventsIndex = buildEventsIndex(events);
  const players = buildPlayersList(events);
  const playerDetails = players.map((player) => {
    const detail = buildPlayerDetail(events, player.id);
    if (!detail) throw new Error(`Cannot build player page for ${player.id}.`);
    return detail;
  });
  const matchups = buildMatchups(events);

  if (checkOnly) {
    console.log('Data check passed.');
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await writeJson('events-index.json', eventsIndex);
  for (const event of events) {
    await writeJson(`event/${event.id}.json`, event);
  }
  await writeJson('players.json', players);
  for (const detail of playerDetails) {
    await writeJson(`player/${detail.id}.json`, detail);
  }
  await writeJson('matchups.json', matchups);

  console.log(`Generated public/data: ${events.length} events, ${players.length} players, ${matchups.decks.length} decks in the matrix.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
