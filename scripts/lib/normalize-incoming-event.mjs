import { aliasesFromName, buildKnownPlayers, isTruncatedName, playerIdFromName, resolvePlayerReference } from './players.mjs';
import { buildKnownDecks, newDeck, resolveDeck } from './decks.mjs';

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeEventType(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'weekly' || text === 'monthly') return text;
  if (text.includes('weekly')) return 'weekly';
  if (text.includes('monthly')) return 'monthly';
  return null;
}

function normalizePlace(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'futurex') return 'Futurex';
  if (text === 'sidequest') return 'SideQuest';
  if (text.includes('futurex')) return 'Futurex';
  if (text.includes('sidequest')) return 'SideQuest';
  return null;
}

function inferEventMetaFromName(name) {
  if (typeof name !== 'string') return { place: null, type: null };
  const text = name.toLowerCase();
  return {
    place: normalizePlace(text),
    type: normalizeEventType(text),
  };
}

function ensureEventMetadata(event) {
  const inferred = inferEventMetaFromName(event.name);
  const place = normalizePlace(event.place ?? event.club ?? event.host ?? '') ?? inferred.place;
  const type = normalizeEventType(event.type ?? event.eventType ?? '') ?? inferred.type;

  if (place && type) {
    event.place = place;
    event.type = type;
  }

  if (typeof event.name !== 'string' || event.name.trim() === '') {
    if (place && type) {
      event.name = `${place} ${type}`;
    }
  }

  return event;
}

function addAlias(aliasToIds, alias, playerId) {
  if (!aliasToIds.has(alias)) {
    aliasToIds.set(alias, new Set([playerId]));
    return;
  }
  aliasToIds.get(alias).add(playerId);
}

function isTemporaryPlayerId(value) {
  return typeof value === 'string' && (/^player-[a-z0-9-]+$/i.test(value) || value.toLowerCase() === 'auto');
}

function normalizeResultType(value) {
  if (typeof value !== 'string') return 'PLAYED';
  const up = value.toUpperCase();
  if (up === 'BYE' || up === 'ID' || up === 'PLAYED') return up;
  return 'PLAYED';
}

function normalizeMode(value) {
  if (typeof value !== 'string') return 'roundByRound';
  const mode = value.trim();
  if (mode === 'standingsOnly' || mode === 'roundByRound') return mode;
  return 'roundByRound';
}

function emptyRecord() {
  return { wins: 0, losses: 0, draws: 0 };
}

function mergeRecord(a, b) {
  return {
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    draws: a.draws + b.draws,
  };
}

function matchFromGame(game) {
  if (game.wins > game.losses) return { wins: 1, losses: 0, draws: 0 };
  if (game.wins < game.losses) return { wins: 0, losses: 1, draws: 0 };
  return { wins: 0, losses: 0, draws: 1 };
}

// Fills fields that event files may omit: name ("<place> <type>") and mode ("roundByRound").
export function applyEventDefaults(event) {
  const result = structuredClone(event);
  ensureEventMetadata(result);
  result.mode = normalizeMode(result.mode);
  return result;
}

// Resolves players and decks against the registries (data/players.json, data/decks.json) and
// returns the normalized event plus entries missing from them: { event, newPlayers, newDecks }.
export function normalizeIncomingEvent(incomingEvent, players, decks) {
  const normalized = structuredClone(incomingEvent);
  const knownPlayers = buildKnownPlayers(players);
  const newPlayers = [];
  const newDecks = [];
  ensureEventMetadata(normalized);
  normalized.mode = normalizeMode(normalized.mode);

  const localIdMap = new Map();
  const localNameToId = new Map();
  const eventLocalToPlayerId = new Map();
  const standings = normalized.standings ?? [];

  for (const [index, standing] of standings.entries()) {
    const hint = `standings[${index}].deck`;
    const name = String(standing.deck?.name ?? '').trim();
    const typedColors = String(standing.deck?.colors ?? '').trim();
    if (!name) {
      throw new Error(`Missing deck name at ${hint}.`);
    }
    let deck = resolveDeck(name, buildKnownDecks([...decks, ...newDecks]));
    if (!deck) {
      if (!typedColors) {
        throw new Error(`New deck "${name}" at ${hint} needs colors.`);
      }
      deck = newDeck(name, typedColors, [...decks, ...newDecks]);
      newDecks.push(deck);
    } else if (typedColors && typedColors !== deck.colors) {
      console.warn(`Warning: deck "${deck.name}" at ${hint} has colors ${typedColors}; using ${deck.colors} from data/decks.json.`);
    }
    standing.deck = { name: deck.name, colors: deck.colors };
  }

  for (const [index, standing] of standings.entries()) {
    const originalId = standing.playerId;
    const normalizedPlayerName = normalizeText(standing.playerName);
    const ref = typeof standing.playerRef === 'string' ? standing.playerRef : null;
    const playerHint = `standings[${index}]`;

    if (standing.localId === undefined || standing.localId === null) {
      standing.localId = `s${index + 1}`;
    }

    if (typeof originalId === 'string' && !isTemporaryPlayerId(originalId)) {
      if (!knownPlayers.idToName.has(originalId)) {
        throw new Error(`Unknown playerId "${originalId}" at ${playerHint}. Use playerRef or playerName instead.`);
      }
      standing.playerId = originalId;
      if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
        standing.playerName = knownPlayers.idToName.get(originalId);
      }
    } else {
      const resolvedByRef = resolvePlayerReference(ref, knownPlayers, `${playerHint}.playerRef`);
      if (resolvedByRef) {
        standing.playerId = resolvedByRef.playerId;
        if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
          standing.playerName = resolvedByRef.playerName;
        }
      } else if (normalizedPlayerName && knownPlayers.nameToId.has(normalizedPlayerName)) {
        const existingId = knownPlayers.nameToId.get(normalizedPlayerName);
        standing.playerId = existingId;
        if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
          standing.playerName = knownPlayers.idToName.get(existingId);
        }
      } else {
        if (!normalizedPlayerName) {
          throw new Error(`Cannot resolve player at ${playerHint}. Provide playerRef for a known player or playerName for a new one.`);
        }
        const generated = playerIdFromName(standing.playerName, knownPlayers.idToName.keys());
        standing.playerId = generated;
        newPlayers.push({ id: generated, name: standing.playerName.trim() });
        if (isTruncatedName(standing.playerName)) {
          console.warn(`Warning: new player name "${standing.playerName}" at ${playerHint} looks truncated. Check it is not an existing player.`);
        }
      }
    }

    if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
      const knownName = knownPlayers.idToName.get(standing.playerId);
      if (knownName) {
        standing.playerName = knownName;
      }
    }

    if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
      throw new Error(`Cannot resolve player name at ${playerHint}. Provide playerName for new players.`);
    }

    const resolvedName = normalizeText(standing.playerName);
    if (resolvedName) {
      if (!knownPlayers.nameToId.has(resolvedName)) {
        knownPlayers.nameToId.set(resolvedName, standing.playerId);
      }
      if (!knownPlayers.idToName.has(standing.playerId)) {
        knownPlayers.idToName.set(standing.playerId, standing.playerName);
      }
      for (const alias of aliasesFromName(standing.playerName)) {
        addAlias(knownPlayers.aliasToIds, alias, standing.playerId);
      }
    }

    if (typeof originalId === 'string' && typeof standing.playerId === 'string') {
      localIdMap.set(originalId, standing.playerId);
    }
    if (typeof standing.playerName === 'string' && typeof standing.playerId === 'string') {
      localNameToId.set(normalizeText(standing.playerName), standing.playerId);
    }
    if (standing.localId !== undefined && standing.localId !== null && typeof standing.playerId === 'string') {
      eventLocalToPlayerId.set(String(standing.localId), standing.playerId);
    }

    if (!Array.isArray(standing.rounds)) {
      standing.rounds = [];
    }
  }

  for (const [standingIndex, standing] of standings.entries()) {
    const playerHint = `standings[${standingIndex}]`;
    let standingMatch = emptyRecord();
    let standingGame = emptyRecord();

    for (const round of standing.rounds ?? []) {
      round.resultType = normalizeResultType(round.resultType);

      if (round.opponentLocalId !== undefined && round.opponentLocalId !== null) {
        const opponentLocalKey = String(round.opponentLocalId);
        if (eventLocalToPlayerId.has(opponentLocalKey)) {
          round.opponentPlayerId = eventLocalToPlayerId.get(opponentLocalKey);
        }
      }

      const roundRef = typeof round.opponentPlayerRef === 'string' ? round.opponentPlayerRef : null;
      const resolvedRoundRef = resolvePlayerReference(roundRef, knownPlayers, `${playerHint}.rounds[${round.round ?? '?'}].opponentPlayerRef`);
      if (resolvedRoundRef) {
        round.opponentPlayerId = resolvedRoundRef.playerId;
      }

      const fromRoundName = typeof round.opponentPlayerName === 'string' ? round.opponentPlayerName : null;
      const normalizedRoundName = normalizeText(fromRoundName);

      if (normalizedRoundName && localNameToId.has(normalizedRoundName)) {
        round.opponentPlayerId = localNameToId.get(normalizedRoundName);
        continue;
      }

      if (normalizedRoundName && knownPlayers.nameToId.has(normalizedRoundName)) {
        round.opponentPlayerId = knownPlayers.nameToId.get(normalizedRoundName);
        continue;
      }

      if (typeof round.opponentPlayerId === 'string') {
        if (localIdMap.has(round.opponentPlayerId)) {
          round.opponentPlayerId = localIdMap.get(round.opponentPlayerId);
        } else if (knownPlayers.nameToId.has(normalizeText(round.opponentPlayerId))) {
          // Allow opponentPlayerId to be accidentally passed as a name.
          round.opponentPlayerId = knownPlayers.nameToId.get(normalizeText(round.opponentPlayerId));
        } else if (localNameToId.has(normalizeText(round.opponentPlayerId))) {
          // Allow opponentPlayerId to contain local player name.
          round.opponentPlayerId = localNameToId.get(normalizeText(round.opponentPlayerId));
        }
      } else if (round.opponentPlayerId === undefined) {
        round.opponentPlayerId = null;
      }

      if (round.resultType === 'BYE') {
        round.match = { wins: 1, losses: 0, draws: 0 };
        round.game = { wins: 0, losses: 0, draws: 0 };
      } else if (round.resultType === 'ID') {
        round.match = { wins: 0, losses: 0, draws: 0 };
        round.game = { wins: 0, losses: 0, draws: 0 };
      } else if (round.game) {
        // For regular rounds, match outcome is derived from game result.
        round.match = matchFromGame(round.game);
      } else if (!round.match) {
        // Backward-compatible fallback for sparse legacy rows.
        round.match = { wins: 0, losses: 0, draws: 0 };
      }

      if (round.resultType !== 'PLAYED' && round.opponentPlayerId === undefined) {
        round.opponentPlayerId = null;
      }

      if (normalized.mode !== 'standingsOnly') {
        if (round.match) {
          standingMatch = mergeRecord(standingMatch, round.match);
        }
        if (round.game) {
          standingGame = mergeRecord(standingGame, round.game);
        }
      }
    }

    if (normalized.mode !== 'standingsOnly') {
      // Source of truth is rounds in round-by-round mode, so totals are re-calculated.
      standing.match = standingMatch;
      standing.game = standingGame;
    }
  }

  return { event: normalized, newPlayers, newDecks };
}
