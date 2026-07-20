function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
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
    aliases.add(`${tokens[0][0]}${tokens[tokens.length - 1][0]}`);
    aliases.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
  }

  return [...aliases].filter((item) => item.length >= 2);
}

function addAlias(aliasToIds, alias, playerId) {
  if (!aliasToIds.has(alias)) {
    aliasToIds.set(alias, new Set([playerId]));
    return;
  }
  aliasToIds.get(alias).add(playerId);
}

function buildKnownPlayers(events) {
  const idToName = new Map();
  const nameToId = new Map();
  const aliasToIds = new Map();
  let maxAutoId = 0;

  for (const event of events) {
    for (const standing of event.standings ?? []) {
      if (typeof standing.playerId === 'string') {
        const match = /^p(\d+)$/i.exec(standing.playerId);
        if (match) {
          const num = Number(match[1]);
          if (Number.isInteger(num)) {
            maxAutoId = Math.max(maxAutoId, num);
          }
        }

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
  }

  return { idToName, nameToId, aliasToIds, maxAutoId };
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

function resolveByReference(reference, knownPlayers, hint) {
  if (typeof reference !== 'string' || reference.trim() === '') return null;

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
    throw new Error(`Ambiguous player reference "${reference}" at ${hint}. Use playerId. Options: ${options}.`);
  }

  return null;
}

export function normalizeIncomingEvent(incomingEvent, currentEvents) {
  const normalized = structuredClone(incomingEvent);
  const knownPlayers = buildKnownPlayers(currentEvents);
  normalized.mode = normalizeMode(normalized.mode);

  let nextAutoId = knownPlayers.maxAutoId + 1;
  const localIdMap = new Map();
  const localNameToId = new Map();
  const eventLocalToPlayerId = new Map();
  const standings = normalized.standings ?? [];

  for (const [index, standing] of standings.entries()) {
    const originalId = standing.playerId;
    const normalizedPlayerName = normalizeText(standing.playerName);
    const ref = typeof standing.playerRef === 'string' ? standing.playerRef : null;
    const playerHint = `standings[${index}]`;

    if (standing.localId === undefined || standing.localId === null) {
      standing.localId = `s${index + 1}`;
    }

    if (typeof originalId === 'string' && !isTemporaryPlayerId(originalId)) {
      if (knownPlayers.idToName.has(originalId)) {
        standing.playerId = originalId;
        if (typeof standing.playerName !== 'string' || standing.playerName.trim() === '') {
          standing.playerName = knownPlayers.idToName.get(originalId);
        }
      }
    } else {
      const resolvedByRef = resolveByReference(ref, knownPlayers, `${playerHint}.playerRef`);
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
        const generated = `p${String(nextAutoId).padStart(2, '0')}`;
        nextAutoId += 1;
        standing.playerId = generated;
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
      const resolvedRoundRef = resolveByReference(roundRef, knownPlayers, `${playerHint}.rounds[${round.round ?? '?'}].opponentPlayerRef`);
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

  return normalized;
}
