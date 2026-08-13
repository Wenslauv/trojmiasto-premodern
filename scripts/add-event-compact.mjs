import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { validateEvent, validateEventsArray } from './lib/events-validation.mjs';
import { normalizeIncomingEvent } from './lib/normalize-incoming-event.mjs';

const root = process.cwd();
const sourcePath = path.resolve(root, 'public/data/events.json');

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function parseBoolean(flag) {
  return process.argv.includes(flag);
}

function emptyRecord() {
  return { wins: 0, losses: 0, draws: 0 };
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

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function generateEventId(incomingEvent, currentEvents) {
  if (typeof incomingEvent.id === 'string' && incomingEvent.id.trim() !== '') {
    return incomingEvent.id.trim();
  }

  const baseDate = String(incomingEvent.date ?? '').replace(/-/g, '');
  const baseName = slugify(incomingEvent.name ?? 'event');
  const base = `${baseDate || 'event'}-${baseName || 'event'}`;
  const existing = new Set(currentEvents.map((event) => event.id));

  if (!existing.has(base)) return base;

  let n = 2;
  while (existing.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

function parseResultString(result, hint) {
  const match = String(result).trim().match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid result at ${hint}. Use "2-1" or "2-1-1".`);
  }

  return {
    wins: Number(match[1]),
    losses: Number(match[2]),
    draws: Number(match[3] ?? 0),
  };
}

function matchFromGame(game) {
  if (game.wins > game.losses) return { wins: 1, losses: 0, draws: 0 };
  if (game.wins < game.losses) return { wins: 0, losses: 1, draws: 0 };
  return { wins: 0, losses: 0, draws: 1 };
}

function mergeRecord(a, b) {
  return {
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    draws: a.draws + b.draws,
  };
}

function aliasesFromName(name) {
  const normalized = normalizeText(name);
  if (!normalized) return [];

  const tokens = normalized.split(' ').filter(Boolean);
  const aliases = new Set([normalized]);

  if (tokens.length >= 1) {
    aliases.add(tokens[0]);
  }

  if (tokens.length >= 2) {
    aliases.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
    aliases.add(`${tokens[0][0]}${tokens[tokens.length - 1][0]}`);
  }

  return [...aliases].filter((alias) => alias.length >= 2);
}

function addAlias(aliasToIds, alias, localId) {
  if (!aliasToIds.has(alias)) {
    aliasToIds.set(alias, new Set([localId]));
    return;
  }
  aliasToIds.get(alias).add(localId);
}

function buildKnownPlayers(events) {
  const idToName = new Map();
  const nameToId = new Map();
  const aliasToIds = new Map();

  for (const event of events) {
    for (const standing of event.standings ?? []) {
      if (typeof standing.playerId !== 'string') continue;

      if (typeof standing.playerName === 'string' && standing.playerName.trim() !== '') {
        if (!idToName.has(standing.playerId)) {
          idToName.set(standing.playerId, standing.playerName);
        }

        const normalizedName = normalizeText(standing.playerName);
        if (normalizedName && !nameToId.has(normalizedName)) {
          nameToId.set(normalizedName, standing.playerId);
        }

        for (const alias of aliasesFromName(standing.playerName)) {
          addAlias(aliasToIds, alias, standing.playerId);
        }
      }
    }
  }

  return { idToName, nameToId, aliasToIds };
}

function resolveKnownPlayerRef(reference, knownPlayers, hint) {
  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new Error(`Missing playerRef at ${hint}.`);
  }

  const trimmed = reference.trim();
  const normalizedRef = normalizeText(trimmed);

  if (knownPlayers.idToName.has(trimmed)) {
    return {
      playerId: trimmed,
      playerName: knownPlayers.idToName.get(trimmed),
    };
  }

  if (knownPlayers.nameToId.has(normalizedRef)) {
    const playerId = knownPlayers.nameToId.get(normalizedRef);
    return {
      playerId,
      playerName: knownPlayers.idToName.get(playerId),
    };
  }

  if (knownPlayers.aliasToIds.has(normalizedRef)) {
    const ids = [...knownPlayers.aliasToIds.get(normalizedRef)];
    if (ids.length === 1) {
      return {
        playerId: ids[0],
        playerName: knownPlayers.idToName.get(ids[0]),
      };
    }

    const options = ids
      .map((id) => `${id}: ${knownPlayers.idToName.get(id) ?? 'unknown name'}`)
      .join(', ');
    throw new Error(`Ambiguous playerRef "${reference}" at ${hint}. Options: ${options}.`);
  }

  throw new Error(`Unknown playerRef "${reference}" at ${hint}.`);
}

function toInteger(value, fieldHint) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`Field ${fieldHint} must be an integer.`);
  }
  return numberValue;
}

function resolveScoring(compact) {
  const scoring = compact.scoring ?? {};
  const win = toInteger(scoring.win ?? 3, 'scoring.win');
  const draw = toInteger(scoring.draw ?? 1, 'scoring.draw');
  const loss = toInteger(scoring.loss ?? 0, 'scoring.loss');
  const bye = toInteger(scoring.bye ?? win, 'scoring.bye');
  const id = toInteger(scoring.id ?? draw, 'scoring.id');
  return { win, draw, loss, bye, id };
}

function parseDeck(row, rowHint) {
  if (typeof row.deck === 'object' && row.deck !== null) {
    const name = String(row.deck.name ?? '').trim();
    const colors = String(row.deck.colors ?? '').trim();
    if (!name || !colors) {
      throw new Error(`Field ${rowHint}.deck must include non-empty name and colors.`);
    }
    return { name, colors };
  }

  const name = String(row.deckName ?? '').trim();
  const colors = String(row.deckColors ?? '').trim();
  if (!name || !colors) {
    throw new Error(`Provide deck as ${rowHint}.deck or ${rowHint}.deckName + ${rowHint}.deckColors.`);
  }

  return { name, colors };
}

function buildStandingsContext(compact, knownPlayers) {
  if (!Array.isArray(compact.standings) || compact.standings.length === 0) {
    throw new Error('Field "standings" must be a non-empty array.');
  }

  const standings = [];
  const byLocalId = new Map();

  compact.standings.forEach((row, index) => {
    const rowHint = `standings[${index}]`;
    const localId = String(row.localId ?? '').trim();
    if (!localId) {
      throw new Error(`Field ${rowHint}.localId is required.`);
    }
    if (byLocalId.has(localId)) {
      throw new Error(`Duplicate localId "${localId}" in standings.`);
    }

    const rank = toInteger(row.rank, `${rowHint}.rank`);
    const points = toInteger(row.points, `${rowHint}.points`);
    const rawPlayerRef = typeof row.playerRef === 'string' ? row.playerRef.trim() : '';
    let playerName = String(row.playerName ?? row.player ?? row.name ?? '').trim();
    let playerRef = rawPlayerRef;

    if (rawPlayerRef) {
      const resolved = resolveKnownPlayerRef(rawPlayerRef, knownPlayers, `${rowHint}.playerRef`);
      if (!playerName) {
        playerName = resolved.playerName ?? '';
      }
      playerRef = resolved.playerId;
    } else if (playerName) {
      const normalizedName = normalizeText(playerName);
      if (knownPlayers.nameToId.has(normalizedName)) {
        playerRef = knownPlayers.nameToId.get(normalizedName);
        playerName = knownPlayers.idToName.get(playerRef) ?? playerName;
      } else {
        // New player without global reference yet.
        playerRef = `new:${localId.toLowerCase()}`;
      }
    } else {
      throw new Error(`Provide either ${rowHint}.playerRef (known player) or ${rowHint}.playerName (new player).`);
    }

    const deck = parseDeck(row, rowHint);

    const standing = {
      localId,
      rank,
      playerName,
      playerRef,
      points,
      deck,
      rounds: [],
    };

    standings.push(standing);
    byLocalId.set(localId, standing);
  });

  return { standings, byLocalId };
}

function resolveLocalId(value, standingsByLocalId, hint) {
  const localId = String(value ?? '').trim();
  if (!localId) {
    throw new Error(`Missing localId at ${hint}.`);
  }

  if (!standingsByLocalId.has(localId)) {
    throw new Error(`Unknown localId "${localId}" at ${hint}.`);
  }

  return localId;
}

function pushRoundEntry(standingsByLocalId, localId, entry) {
  const row = standingsByLocalId.get(localId);
  if (!row) {
    throw new Error(`Internal error: unknown localId ${localId}.`);
  }

  const duplicate = row.rounds.find((round) => round.round === entry.round);
  if (duplicate) {
    throw new Error(`Player ${row.playerName} has duplicate round ${entry.round}.`);
  }

  row.rounds.push(entry);
}

function readRounds(rounds, hint) {
  if (Array.isArray(rounds)) {
    const roundBlocks = rounds.map((block, index) => {
      const roundNumber = toInteger(block.round, `${hint}[${index}].round`);
      const matches = Array.isArray(block.matches) ? block.matches : [];
      return { roundNumber, matches, blockHint: `${hint}[${index}]` };
    });

    roundBlocks.sort((a, b) => a.roundNumber - b.roundNumber);
    return roundBlocks;
  }

  if (typeof rounds !== 'object' || rounds === null) {
    throw new Error('Field "rounds" must be an object or array.');
  }

  const roundBlocks = Object.entries(rounds).map(([roundKey, matches]) => {
    const roundNumber = toInteger(roundKey, `rounds.${roundKey}`);
    if (!Array.isArray(matches)) {
      throw new Error(`Field rounds.${roundKey} must be an array.`);
    }
    return { roundNumber, matches, blockHint: `rounds.${roundKey}` };
  });

  roundBlocks.sort((a, b) => a.roundNumber - b.roundNumber);
  return roundBlocks;
}

function pointsFromMatch(match, scoring) {
  if (match.wins > match.losses) return scoring.win;
  if (match.wins < match.losses) return scoring.loss;
  return scoring.draw;
}

function parseCompactRounds(rounds, standingsByLocalId, scoring) {
  const blocks = readRounds(rounds, 'rounds');

  if (blocks.length === 0) {
    throw new Error('Field "rounds" must contain at least one round.');
  }

  const pointsByLocalId = new Map();
  for (const localId of standingsByLocalId.keys()) {
    pointsByLocalId.set(localId, 0);
  }

  for (const { roundNumber, matches, blockHint } of blocks) {
    const participants = new Set();
    let byeCount = 0;

    for (const [matchIndex, matchItem] of matches.entries()) {
      const itemHint = `${blockHint}[${matchIndex}]`;

      if (typeof matchItem !== 'object' || matchItem === null) {
        throw new Error(`Round entry at ${itemHint} must be an object.`);
      }

      const byePlayerRaw = matchItem.player;
      const byeResult = String(matchItem.result ?? '').trim().toLowerCase();

      if (byePlayerRaw !== undefined || byeResult === 'bye' || byeResult === 'id') {
        const localId = resolveLocalId(byePlayerRaw, standingsByLocalId, `${itemHint}.player`);
        if (participants.has(localId)) {
          throw new Error(`Player ${localId} appears more than once in round ${roundNumber}.`);
        }
        participants.add(localId);

        if (byeResult === 'bye') {
          byeCount += 1;
          if (byeCount > 1) {
            throw new Error(`Round ${roundNumber} has more than one BYE.`);
          }

          pushRoundEntry(standingsByLocalId, localId, {
            round: roundNumber,
            resultType: 'BYE',
          });
          pointsByLocalId.set(localId, (pointsByLocalId.get(localId) ?? 0) + scoring.bye);
          continue;
        }

        if (byeResult === 'id') {
          pushRoundEntry(standingsByLocalId, localId, {
            round: roundNumber,
            resultType: 'ID',
          });
          pointsByLocalId.set(localId, (pointsByLocalId.get(localId) ?? 0) + scoring.id);
          continue;
        }

        throw new Error(`Invalid single-player result at ${itemHint}. Use "bye" or "id".`);
      }

      const leftLocalId = resolveLocalId(matchItem.player1, standingsByLocalId, `${itemHint}.player1`);
      const rightLocalId = resolveLocalId(matchItem.player2, standingsByLocalId, `${itemHint}.player2`);

      if (leftLocalId === rightLocalId) {
        throw new Error(`Player cannot face self at ${itemHint}.`);
      }
      if (participants.has(leftLocalId) || participants.has(rightLocalId)) {
        throw new Error(`A player appears more than once in round ${roundNumber}.`);
      }
      participants.add(leftLocalId);
      participants.add(rightLocalId);

      const game = matchItem.game
        ? {
            wins: toInteger(matchItem.game.wins, `${itemHint}.game.wins`),
            losses: toInteger(matchItem.game.losses, `${itemHint}.game.losses`),
            draws: toInteger(matchItem.game.draws ?? 0, `${itemHint}.game.draws`),
          }
        : parseResultString(matchItem.result, `${itemHint}.result`);

      pushRoundEntry(standingsByLocalId, leftLocalId, {
        round: roundNumber,
        opponentLocalId: rightLocalId,
        game,
      });

      pushRoundEntry(standingsByLocalId, rightLocalId, {
        round: roundNumber,
        opponentLocalId: leftLocalId,
        game: { wins: game.losses, losses: game.wins, draws: game.draws },
      });

      const leftMatch = matchFromGame(game);
      const rightMatch = { wins: leftMatch.losses, losses: leftMatch.wins, draws: leftMatch.draws };

      pointsByLocalId.set(leftLocalId, (pointsByLocalId.get(leftLocalId) ?? 0) + pointsFromMatch(leftMatch, scoring));
      pointsByLocalId.set(rightLocalId, (pointsByLocalId.get(rightLocalId) ?? 0) + pointsFromMatch(rightMatch, scoring));
    }
  }

  for (const standing of standingsByLocalId.values()) {
    standing.rounds.sort((a, b) => a.round - b.round);
  }

  return pointsByLocalId;
}

function validatePoints(standings, pointsByLocalId) {
  for (const standing of standings) {
    const expected = pointsByLocalId.get(standing.localId) ?? 0;
    if (standing.points !== expected) {
      throw new Error(
        `Points mismatch for localId ${standing.localId} (${standing.playerName}): standings=${standing.points}, calculated=${expected}.`,
      );
    }
  }
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

function buildEventFromCompact(compact, knownPlayers) {
  const name = String(compact.name ?? '').trim();
  const date = String(compact.date ?? '').trim();
  const location = String(compact.location ?? '').trim();

  if (!name || !date || !location) {
    throw new Error('Fields "name", "date", and "location" are required.');
  }

  const scoring = resolveScoring(compact);
  const { standings, byLocalId } = buildStandingsContext(compact, knownPlayers);
  const pointsByLocalId = parseCompactRounds(compact.rounds, byLocalId, scoring);
  validatePoints(standings, pointsByLocalId);

  for (const row of standings) {
    let totalMatch = emptyRecord();
    let totalGame = emptyRecord();
    for (const round of row.rounds) {
      if (round.resultType === 'BYE') {
        totalMatch = mergeRecord(totalMatch, { wins: 1, losses: 0, draws: 0 });
        continue;
      }
      if (round.resultType === 'ID') {
        continue;
      }
      const game = round.game ?? emptyRecord();
      totalGame = mergeRecord(totalGame, game);
      totalMatch = mergeRecord(totalMatch, matchFromGame(game));
    }
    row.match = totalMatch;
    row.game = totalGame;
  }

  return {
    id: typeof compact.id === 'string' ? compact.id.trim() : '',
    name,
    date,
    location,
    mode: 'roundByRound',
    standings,
  };
}

async function main() {
  const fileArg = parseArg('--file');
  const dryRun = parseBoolean('--dry-run');
  const deleteSource = parseBoolean('--delete-source');

  if (!fileArg) {
    throw new Error('Usage: node scripts/add-event-compact.mjs --file <path-to-compact-event.json> [--dry-run] [--delete-source]');
  }

  const incomingPath = path.resolve(root, fileArg);
  const incomingRaw = await readFile(incomingPath, 'utf8');
  const compactEvent = JSON.parse(incomingRaw);

  const currentRaw = await readFile(sourcePath, 'utf8');
  const currentEvents = JSON.parse(currentRaw);
  validateEventsArray(currentEvents);
  const knownPlayers = buildKnownPlayers(currentEvents);

  const expandedEvent = buildEventFromCompact(compactEvent, knownPlayers);
  const normalizedIncomingEvent = normalizeIncomingEvent(expandedEvent, currentEvents);
  normalizedIncomingEvent.id = generateEventId(normalizedIncomingEvent, currentEvents);
  validateEvent(normalizedIncomingEvent, 'incomingEvent');

  const duplicate = currentEvents.find((event) => event.id === normalizedIncomingEvent.id);
  if (duplicate) {
    throw new Error(`Event with id "${normalizedIncomingEvent.id}" already exists in public/data/events.json.`);
  }

  const nextEvents = sortEvents([...currentEvents, normalizedIncomingEvent]);
  validateEventsArray(nextEvents);

  if (dryRun) {
    console.log(`Dry run OK. Event ${normalizedIncomingEvent.id} can be added from compact format.`);
    return;
  }

  await writeFile(sourcePath, `${JSON.stringify(nextEvents, null, 2)}\n`, 'utf8');
  console.log(`Added event ${normalizedIncomingEvent.id} to public/data/events.json (compact flow).`);

  if (deleteSource) {
    await unlink(incomingPath);
    console.log(`Deleted source file ${fileArg}`);
  }

  console.log('Next step: run npm run generate-data');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
