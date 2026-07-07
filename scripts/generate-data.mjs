import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.resolve(root, 'public/data/events.json');
const outDir = path.resolve(root, 'public/data/cache');

function assertDate(dateValue) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  if (!ok) throw new Error(`Invalid date format: ${dateValue}. Use YYYY-MM-DD.`);
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.wins === 'number' &&
    typeof value.losses === 'number' &&
    typeof value.draws === 'number'
  );
}

function mergeRecord(a, b) {
  return {
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    draws: a.draws + b.draws,
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const sourceRaw = await readFile(sourcePath, 'utf8');
  const events = JSON.parse(sourceRaw);

  if (!Array.isArray(events)) {
    throw new Error('events.json must contain array of events');
  }

  const eventIds = new Set();
  const byPlayer = new Map();

  for (const event of events) {
    if (eventIds.has(event.id)) {
      throw new Error(`Duplicate event id: ${event.id}`);
    }
    eventIds.add(event.id);
    assertDate(event.date);

    for (const row of event.standings) {
      if (!isRecord(row.match) || !isRecord(row.game)) {
        throw new Error(`Invalid match/game record in event ${event.id}, player ${row.playerId}`);
      }

      const current = byPlayer.get(row.playerId) ?? {
        id: row.playerId,
        name: row.playerName,
        eventsCount: 0,
        match: { wins: 0, losses: 0, draws: 0 },
        decks: new Map(),
      };

      current.eventsCount += 1;
      current.match = mergeRecord(current.match, row.match);

      const deckCurrent = current.decks.get(row.deck.name) ?? {
        name: row.deck.name,
        colors: row.deck.colors,
        count: 0,
      };
      deckCurrent.count += 1;
      current.decks.set(row.deck.name, deckCurrent);

      byPlayer.set(row.playerId, current);
    }
  }

  const players = [...byPlayer.values()]
    .map((player) => {
      const played = player.match.wins + player.match.losses + player.match.draws;
      const favoriteDeck = [...player.decks.values()].sort((a, b) => b.count - a.count)[0] ?? null;
      return {
        id: player.id,
        name: player.name,
        eventsCount: player.eventsCount,
        matchWinPercent: played === 0 ? 0 : round2((player.match.wins / played) * 100),
        favoriteDeck,
      };
    })
    .sort((a, b) => b.eventsCount - a.eventsCount || a.name.localeCompare(b.name));

  if (checkOnly) {
    console.log('Data check passed.');
    return;
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.resolve(outDir, 'players.json'), `${JSON.stringify(players, null, 2)}\n`, 'utf8');
  await writeFile(path.resolve(outDir, 'events-summary.json'), `${JSON.stringify(events.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    players: e.standings.length,
  })), null, 2)}\n`, 'utf8');

  console.log('Generated cache files in public/data/cache');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
