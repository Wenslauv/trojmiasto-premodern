import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { validateEvent, validateEventsArray } from '../src/lib/schema.ts';
import { normalizeIncomingEvent } from './lib/normalize-incoming-event.mjs';
import { buildKnownPlayers, loadPlayers, resolvePlayerReference, savePlayers } from './lib/players.mjs';
import { loadDecks, saveDecks } from './lib/decks.mjs';
import { EVENTS_DIR, assertNotImportedTwice, EVENT_ID_PATTERN, eventFileName, eventIdFor, loadEventFiles, writeEventFile } from './lib/event-store.mjs';

const root = process.cwd();

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

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
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

function resolveKnownPlayerRef(reference, knownPlayers, hint) {
  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new Error(`Missing playerRef at ${hint}.`);
  }
  const resolved = resolvePlayerReference(reference, knownPlayers, hint);
  if (!resolved) {
    throw new Error(`Unknown playerRef "${reference}" at ${hint}.`);
  }
  return resolved;
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
    if (!name) {
      throw new Error(`Field ${rowHint}.deck must include a non-empty name.`);
    }
    return colors ? { name, colors } : { name };
  }

  const name = String(row.deckName ?? '').trim();
  const colors = String(row.deckColors ?? '').trim();
  if (!name) {
    throw new Error(`Provide deck as ${rowHint}.deck or ${rowHint}.deckName (+ ${rowHint}.deckColors for a new deck).`);
  }

  return colors ? { name, colors } : { name };
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
  const place = String(compact.place ?? '').trim();
  const type = String(compact.type ?? '').trim();
  // Same rule as for event files: without an explicit name it is "<place> <type>".
  const name = String(compact.name ?? '').trim() || (place && type ? `${place} ${type}` : '');
  const date = String(compact.date ?? '').trim();
  const location = String(compact.location ?? '').trim();

  if (!name || !date || !location) {
    throw new Error('Fields "date" and "location" are required, plus either "name" or both "place" and "type".');
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
    ...(place ? { place } : {}),
    ...(type ? { type } : {}),
    date,
    location,
    mode: 'roundByRound',
    standings,
  };
}

function logNewDecks(newDecks, title) {
  if (newDecks.length === 0) return;
  console.log(`${title}: ${newDecks.map((deck) => `${deck.id} (${deck.name}, ${deck.colors})`).join(', ')}`);
}

function logNewPlayers(newPlayers, title) {
  if (newPlayers.length === 0) return;
  console.log(`${title}: ${newPlayers.map((player) => `${player.id} (${player.name})`).join(', ')}`);
}

async function main() {
  const fileArg = parseArg('--file');
  const dryRun = parseBoolean('--dry-run');
  const deleteSource = parseBoolean('--delete-source');
  const allowSameDay = parseBoolean('--allow-same-day');

  if (!fileArg) {
    throw new Error('Usage: node scripts/add-event-compact.mjs --file <path-to-compact-event.json> [--dry-run] [--delete-source] [--allow-same-day]');
  }

  const incomingPath = path.resolve(root, fileArg);
  const incomingRaw = await readFile(incomingPath, 'utf8');
  const compactEvent = JSON.parse(incomingRaw);

  const entries = await loadEventFiles(root);
  const currentEvents = entries.map((entry) => entry.event);
  validateEventsArray(currentEvents);
  const players = await loadPlayers(root);
  const knownPlayers = buildKnownPlayers(players);

  const expandedEvent = buildEventFromCompact(compactEvent, knownPlayers);
  const decks = await loadDecks(root);
  const { event: normalizedIncomingEvent, newPlayers, newDecks } = normalizeIncomingEvent(expandedEvent, players, decks);
  const explicitId = typeof normalizedIncomingEvent.id === 'string' ? normalizedIncomingEvent.id.trim() : '';
  if (explicitId && !EVENT_ID_PATTERN.test(explicitId)) {
    throw new Error(`Invalid event id "${explicitId}". Omit it or use <date>-<place>-<type>, e.g. 2026-09-21-sidequest-weekly.`);
  }
  normalizedIncomingEvent.id = explicitId || eventIdFor(normalizedIncomingEvent, currentEvents.map((event) => event.id));
  validateEvent(normalizedIncomingEvent, 'incomingEvent');

  const duplicate = currentEvents.find((event) => event.id === normalizedIncomingEvent.id);
  if (duplicate) {
    throw new Error(`Event with id "${normalizedIncomingEvent.id}" already exists in ${EVENTS_DIR}.`);
  }
  assertNotImportedTwice(currentEvents, normalizedIncomingEvent, allowSameDay);

  const nextEvents = sortEvents([...currentEvents, normalizedIncomingEvent]);
  validateEventsArray(nextEvents);
  const file = eventFileName(normalizedIncomingEvent);

  if (dryRun) {
    console.log(`Dry run OK. Event ${normalizedIncomingEvent.id} can be added from compact format as ${EVENTS_DIR}/${file}.`);
    logNewPlayers(newPlayers, 'Would add new players');
    logNewDecks(newDecks, 'Would add new decks');
    return;
  }

  const written = await writeEventFile(root, file, normalizedIncomingEvent);
  console.log(`Added event ${normalizedIncomingEvent.id} -> ${written} (compact flow).`);
  if (newPlayers.length > 0) {
    await savePlayers(root, [...players, ...newPlayers]);
    logNewPlayers(newPlayers, 'Added new players to data/players.json');
  }
  if (newDecks.length > 0) {
    await saveDecks(root, [...decks, ...newDecks]);
    logNewDecks(newDecks, 'Added new decks to data/decks.json');
  }

  if (deleteSource) {
    await unlink(incomingPath);
    console.log(`Deleted source file ${fileArg}`);
  }

  console.log('Next step: commit the event file (and data/players.json / data/decks.json when they changed). Site data is regenerated by npm run generate-data.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
