function buildKnownPlayers(events) {
  const nameToId = new Map();
  let maxAutoId = 0;

  for (const event of events) {
    for (const standing of event.standings ?? []) {
      if (typeof standing.playerName === 'string' && typeof standing.playerId === 'string') {
        if (!nameToId.has(standing.playerName)) {
          nameToId.set(standing.playerName, standing.playerId);
        }
      }

      if (typeof standing.playerId === 'string') {
        const match = /^p(\d+)$/i.exec(standing.playerId);
        if (match) {
          const num = Number(match[1]);
          if (Number.isInteger(num)) {
            maxAutoId = Math.max(maxAutoId, num);
          }
        }
      }
    }
  }

  return { nameToId, maxAutoId };
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

export function normalizeIncomingEvent(incomingEvent, currentEvents) {
  const normalized = structuredClone(incomingEvent);
  const { nameToId, maxAutoId } = buildKnownPlayers(currentEvents);

  let nextAutoId = maxAutoId + 1;
  const localIdMap = new Map();
  const localNameToId = new Map();
  const eventLocalToPlayerId = new Map();

  for (const [index, standing] of (normalized.standings ?? []).entries()) {
    const originalId = standing.playerId;
    const playerName = standing.playerName;

    if (standing.localId === undefined || standing.localId === null) {
      standing.localId = `s${index + 1}`;
    }

    if (typeof playerName === 'string' && nameToId.has(playerName)) {
      standing.playerId = nameToId.get(playerName);
    } else if (!originalId || isTemporaryPlayerId(originalId)) {
      const generated = `p${String(nextAutoId).padStart(2, '0')}`;
      nextAutoId += 1;
      standing.playerId = generated;
      if (typeof playerName === 'string') {
        nameToId.set(playerName, generated);
      }
    }

    if (typeof originalId === 'string' && typeof standing.playerId === 'string') {
      localIdMap.set(originalId, standing.playerId);
    }
    if (typeof standing.playerName === 'string' && typeof standing.playerId === 'string') {
      localNameToId.set(standing.playerName, standing.playerId);
    }
    if (standing.localId !== undefined && standing.localId !== null && typeof standing.playerId === 'string') {
      eventLocalToPlayerId.set(String(standing.localId), standing.playerId);
    }
  }

  for (const standing of normalized.standings ?? []) {
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

      const fromRoundName = typeof round.opponentPlayerName === 'string' ? round.opponentPlayerName : null;

      if (fromRoundName && localNameToId.has(fromRoundName)) {
        round.opponentPlayerId = localNameToId.get(fromRoundName);
        continue;
      }

      if (fromRoundName && nameToId.has(fromRoundName)) {
        round.opponentPlayerId = nameToId.get(fromRoundName);
        continue;
      }

      if (typeof round.opponentPlayerId === 'string') {
        if (localIdMap.has(round.opponentPlayerId)) {
          round.opponentPlayerId = localIdMap.get(round.opponentPlayerId);
        } else if (nameToId.has(round.opponentPlayerId)) {
          // Allow opponentPlayerId to be accidentally passed as a name.
          round.opponentPlayerId = nameToId.get(round.opponentPlayerId);
        } else if (localNameToId.has(round.opponentPlayerId)) {
          // Allow opponentPlayerId to contain local player name.
          round.opponentPlayerId = localNameToId.get(round.opponentPlayerId);
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

      if (round.match) {
        standingMatch = mergeRecord(standingMatch, round.match);
      }
      if (round.game) {
        standingGame = mergeRecord(standingGame, round.game);
      }
    }

    // Source of truth is rounds, so totals are always re-calculated.
    standing.match = standingMatch;
    standing.game = standingGame;
  }

  return normalized;
}
