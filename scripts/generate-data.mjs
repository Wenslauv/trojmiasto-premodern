import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateEventsArray } from './lib/events-validation.mjs';

const root = process.cwd();
const sourcePath = path.resolve(root, 'public/data/events.json');
const outDir = path.resolve(root, 'public/data/cache');

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

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalizeDeckKey(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const sourceRaw = await readFile(sourcePath, 'utf8');
  const events = JSON.parse(sourceRaw);
  validateEventsArray(events);
  const byPlayer = new Map();

  for (const event of events) {
    for (const row of event.standings) {
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

  const deckMeta = new Map();
  const deckNameKeyToCanonical = new Map();
  const matrixCounters = new Map();
  const seenPairRounds = new Set();

  function ensureDeck(name, colors) {
    const deckKey = normalizeDeckKey(name);
    const existingCanonical = deckNameKeyToCanonical.get(deckKey);
    if (existingCanonical) {
      return deckMeta.get(existingCanonical);
    }

    const canonical = {
      name,
      colors,
      slug: slugify(name),
    };
    deckMeta.set(name, canonical);
    deckNameKeyToCanonical.set(deckKey, name);
    return canonical;
  }

  function getCounter(rowDeck, colDeck) {
    const key = `${rowDeck}|||${colDeck}`;
    if (!matrixCounters.has(key)) {
      matrixCounters.set(key, { wins: 0, losses: 0, draws: 0, matches: 0 });
    }
    return matrixCounters.get(key);
  }

  function addDirectionalResult(rowDeck, colDeck, outcome) {
    const counter = getCounter(rowDeck, colDeck);
    if (outcome === 'win') counter.wins += 1;
    if (outcome === 'loss') counter.losses += 1;
    if (outcome === 'draw') counter.draws += 1;
    counter.matches += 1;
  }

  for (const event of events) {
    const playerToDeck = new Map();

    for (const row of event.standings) {
      const deckName = row.deck?.name;
      const deckColors = row.deck?.colors;
      if (typeof deckName !== 'string' || typeof deckColors !== 'string') continue;
      const canonicalDeck = ensureDeck(deckName, deckColors);
      playerToDeck.set(row.playerId, { name: canonicalDeck.name, colors: canonicalDeck.colors });
    }

    if (event.mode === 'standingsOnly') continue;

    for (const row of event.standings) {
      const rowDeck = playerToDeck.get(row.playerId);
      if (!rowDeck) continue;

      for (const round of row.rounds ?? []) {
        if ((round.resultType ?? 'PLAYED') !== 'PLAYED') continue;
        if (!round.match) continue;
        if (typeof round.opponentPlayerId !== 'string' || round.opponentPlayerId.trim() === '') continue;

        const opponentDeck = playerToDeck.get(round.opponentPlayerId);
        if (!opponentDeck) continue;

        if (rowDeck.name === opponentDeck.name) continue;

        const a = String(row.playerId);
        const b = String(round.opponentPlayerId);
        const pairKey = [a, b].sort().join('::');
        const roundKey = `${event.id}::${round.round}::${pairKey}`;
        if (seenPairRounds.has(roundKey)) continue;
        seenPairRounds.add(roundKey);

        let outcome = 'draw';
        if (round.match.wins > round.match.losses) outcome = 'win';
        if (round.match.wins < round.match.losses) outcome = 'loss';

        addDirectionalResult(rowDeck.name, opponentDeck.name, outcome);
        addDirectionalResult(
          opponentDeck.name,
          rowDeck.name,
          outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw',
        );
      }
    }
  }

  const decks = [...deckMeta.values()].sort((a, b) => a.name.localeCompare(b.name));
  const matrix = {};

  for (const rowDeck of decks) {
    matrix[rowDeck.name] = {};
    for (const colDeck of decks) {
      const key = `${rowDeck.name}|||${colDeck.name}`;
      const counter = matrixCounters.get(key);
      if (!counter) continue;
      const played = counter.wins + counter.losses + counter.draws;
      matrix[rowDeck.name][colDeck.name] = {
        wins: counter.wins,
        losses: counter.losses,
        draws: counter.draws,
        matches: counter.matches,
        winPercent: played === 0 ? 0 : round2((counter.wins / played) * 100),
      };
    }
  }

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
  await writeFile(path.resolve(outDir, 'matchups.json'), `${JSON.stringify({ decks, matrix }, null, 2)}\n`, 'utf8');

  console.log('Generated cache files in public/data/cache');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
