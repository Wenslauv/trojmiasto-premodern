export function assertDate(dateValue) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  if (!ok) throw new Error(`Invalid date format: ${dateValue}. Use YYYY-MM-DD.`);
}

export function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.wins === 'number' &&
    typeof value.losses === 'number' &&
    typeof value.draws === 'number'
  );
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${fieldName}" must be a non-empty string.`);
  }
}

function assertInteger(value, fieldName) {
  if (!Number.isInteger(value)) {
    throw new Error(`Field "${fieldName}" must be an integer.`);
  }
}

function assertOptionalInteger(value, fieldName) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value)) {
    throw new Error(`Field "${fieldName}" must be an integer when provided.`);
  }
}

function assertOptionalLocalId(value, fieldName) {
  if (value === undefined || value === null) return;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`Field "${fieldName}" must be integer when number is used.`);
    }
    return;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return;
  }
  throw new Error(`Field "${fieldName}" must be non-empty string or integer when provided.`);
}

function assertOptionalString(value, fieldName) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${fieldName}" must be a non-empty string when provided.`);
  }
}

function sameRecord(a, b) {
  return a.wins === b.wins && a.losses === b.losses && a.draws === b.draws;
}

function matchFromGame(game) {
  if (game.wins > game.losses) return { wins: 1, losses: 0, draws: 0 };
  if (game.wins < game.losses) return { wins: 0, losses: 1, draws: 0 };
  return { wins: 0, losses: 0, draws: 1 };
}

function assertOptionalRecord(value, fieldName) {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    throw new Error(`Invalid record object at ${fieldName}.`);
  }
}

function mirrorRecord(left, right) {
  return left.wins === right.losses && left.losses === right.wins && left.draws === right.draws;
}

export function validateEvent(event, indexHint = 'new event') {
  if (typeof event !== 'object' || event === null) {
    throw new Error(`Invalid ${indexHint}: must be an object.`);
  }

  assertNonEmptyString(event.id, `${indexHint}.id`);
  assertNonEmptyString(event.name, `${indexHint}.name`);
  assertNonEmptyString(event.location, `${indexHint}.location`);
  assertDate(event.date);

  if (!Array.isArray(event.standings) || event.standings.length === 0) {
    throw new Error(`Field "${indexHint}.standings" must be a non-empty array.`);
  }

  const playerIds = new Set();
  const localIds = new Set();
  const localKeyByPlayerId = new Map();
  const roundsByLocalKey = new Map();
  const byeByRound = new Map();
  let expectedRoundsCount = null;

  for (const [rowIndex, row] of event.standings.entries()) {
    const rowHint = `${indexHint}.standings[${rowIndex}]`;
    assertInteger(row.rank, `${rowHint}.rank`);
    assertInteger(row.points, `${rowHint}.points`);
    assertOptionalLocalId(row.localId, `${rowHint}.localId`);
    assertNonEmptyString(row.playerId, `${rowHint}.playerId`);
    assertNonEmptyString(row.playerName, `${rowHint}.playerName`);

    if (playerIds.has(row.playerId)) {
      throw new Error(`Duplicate playerId "${row.playerId}" in ${rowHint}.`);
    }
    playerIds.add(row.playerId);

    if (row.localId !== undefined && row.localId !== null) {
      const localKey = String(row.localId);
      if (localIds.has(localKey)) {
        throw new Error(`Duplicate localId "${row.localId}" in ${indexHint}.standings.`);
      }
      localIds.add(localKey);
      localKeyByPlayerId.set(row.playerId, localKey);
    } else {
      localKeyByPlayerId.set(row.playerId, row.playerId);
    }

    if (!Array.isArray(row.rounds)) {
      throw new Error(`Field "${rowHint}.rounds" must be an array.`);
    }

    const currentRoundsCount = row.rounds.length;
    if (expectedRoundsCount === null) {
      expectedRoundsCount = currentRoundsCount;
    } else if (currentRoundsCount !== expectedRoundsCount) {
      throw new Error(
        `All players must have same rounds count in ${indexHint}. Expected ${expectedRoundsCount}, got ${currentRoundsCount} at ${rowHint}.`,
      );
    }

    const playerLocalKey = localKeyByPlayerId.get(row.playerId);
    const playerRounds = new Map();

    if (typeof row.deck !== 'object' || row.deck === null) {
      throw new Error(`Field "${rowHint}.deck" must be an object.`);
    }
    assertNonEmptyString(row.deck.name, `${rowHint}.deck.name`);
    assertNonEmptyString(row.deck.colors, `${rowHint}.deck.colors`);

    assertOptionalRecord(row.match, `${rowHint}.match`);
    assertOptionalRecord(row.game, `${rowHint}.game`);

    for (const [roundIndex, round] of row.rounds.entries()) {
      const roundHint = `${rowHint}.rounds[${roundIndex}]`;
      assertInteger(round.round, `${roundHint}.round`);
      if (!(round.opponentPlayerId === undefined || round.opponentPlayerId === null || typeof round.opponentPlayerId === 'string')) {
        throw new Error(`Field "${roundHint}.opponentPlayerId" must be string, null, or omitted.`);
      }
      assertOptionalLocalId(round.opponentLocalId, `${roundHint}.opponentLocalId`);
      assertOptionalString(round.opponentPlayerName, `${roundHint}.opponentPlayerName`);

      const resultType = (round.resultType ?? 'PLAYED');
      if (!['PLAYED', 'BYE', 'ID'].includes(resultType)) {
        throw new Error(`Field "${roundHint}.resultType" must be PLAYED, BYE, or ID.`);
      }

      if (playerRounds.has(round.round)) {
        throw new Error(`Duplicate round number ${round.round} for ${rowHint}.`);
      }
      playerRounds.set(round.round, round);

      if (resultType === 'BYE') {
        const byeCount = (byeByRound.get(round.round) ?? 0) + 1;
        byeByRound.set(round.round, byeCount);
        if (byeCount > 1) {
          throw new Error(`Round ${round.round} has more than one BYE in ${indexHint}.`);
        }
      }

      if (resultType === 'PLAYED') {
        const hasMatch = round.match !== undefined;
        const hasGame = round.game !== undefined;
        if (!hasMatch && !hasGame) {
          throw new Error(`PLAYED round must contain at least one of ${roundHint}.game or ${roundHint}.match.`);
        }

        if (hasMatch && !isRecord(round.match)) {
          throw new Error(`Invalid record object at ${roundHint}.match.`);
        }
        if (hasGame && !isRecord(round.game)) {
          throw new Error(`Invalid record object at ${roundHint}.game.`);
        }

        if (hasMatch && hasGame) {
          const derivedMatch = matchFromGame(round.game);
          if (!sameRecord(round.match, derivedMatch)) {
            throw new Error(`For PLAYED round, ${roundHint}.match must be consistent with ${roundHint}.game.`);
          }
        }
      }

      if (resultType === 'BYE') {
        if (round.match !== undefined) {
          if (!isRecord(round.match)) {
            throw new Error(`Invalid record object at ${roundHint}.match.`);
          }
          if (!sameRecord(round.match, { wins: 1, losses: 0, draws: 0 })) {
            throw new Error(`BYE round must have match 1-0-0 at ${roundHint}.match.`);
          }
        }
      }

      if (resultType === 'ID') {
        if (round.match !== undefined) {
          if (!isRecord(round.match)) {
            throw new Error(`Invalid record object at ${roundHint}.match.`);
          }
          if (!sameRecord(round.match, { wins: 0, losses: 0, draws: 0 })) {
            throw new Error(`ID round must have match 0-0-0 at ${roundHint}.match.`);
          }
        }
      }

      if (round.game !== undefined) {
        if (!isRecord(round.game)) {
          throw new Error(`Invalid record object at ${roundHint}.game.`);
        }
        if ((resultType === 'BYE' || resultType === 'ID') && !sameRecord(round.game, { wins: 0, losses: 0, draws: 0 })) {
          throw new Error(`${resultType} round must have game 0-0-0 at ${roundHint}.game.`);
        }
      }
    }

    roundsByLocalKey.set(playerLocalKey, playerRounds);
  }

  // Pairing consistency: if A references B in round X, B must reference A in round X with mirrored result.
  for (const [localKey, roundsMap] of roundsByLocalKey.entries()) {
    for (const [roundNumber, round] of roundsMap.entries()) {
      const resultType = (round.resultType ?? 'PLAYED');
      if (resultType !== 'PLAYED') continue;

      let opponentKey = null;
      if (round.opponentLocalId !== undefined && round.opponentLocalId !== null) {
        opponentKey = String(round.opponentLocalId);
      } else if (typeof round.opponentPlayerId === 'string') {
        opponentKey = localKeyByPlayerId.get(round.opponentPlayerId) ?? round.opponentPlayerId;
      }

      if (!opponentKey) continue;

      const opponentRounds = roundsByLocalKey.get(opponentKey);
      if (!opponentRounds) {
        throw new Error(`Unknown opponent in round ${roundNumber}: localId/playerId "${opponentKey}".`);
      }

      const mirrorRound = opponentRounds.get(roundNumber);
      if (!mirrorRound) {
        throw new Error(`Missing mirror record for pairing ${localKey} vs ${opponentKey} in round ${roundNumber}.`);
      }

      let mirrorBackKey = null;
      if (mirrorRound.opponentLocalId !== undefined && mirrorRound.opponentLocalId !== null) {
        mirrorBackKey = String(mirrorRound.opponentLocalId);
      } else if (typeof mirrorRound.opponentPlayerId === 'string') {
        mirrorBackKey = localKeyByPlayerId.get(mirrorRound.opponentPlayerId) ?? mirrorRound.opponentPlayerId;
      }

      if (mirrorBackKey !== String(localKey)) {
        throw new Error(`Non-mirrored pairing in round ${roundNumber}: ${localKey} -> ${opponentKey}, but reverse is ${mirrorBackKey ?? 'missing'}.`);
      }

      if (round.game && mirrorRound.game) {
        if (!mirrorRecord(round.game, mirrorRound.game)) {
          throw new Error(`Game record mismatch for pairing ${localKey} vs ${opponentKey} in round ${roundNumber}.`);
        }
      } else if (round.match && mirrorRound.match) {
        if (!mirrorRecord(round.match, mirrorRound.match)) {
          throw new Error(`Match record mismatch for pairing ${localKey} vs ${opponentKey} in round ${roundNumber}.`);
        }
      }
    }
  }
}

export function validateEventsArray(events) {
  if (!Array.isArray(events)) {
    throw new Error('events.json must contain an array.');
  }

  const ids = new Set();
  for (const [eventIndex, event] of events.entries()) {
    validateEvent(event, `events[${eventIndex}]`);
    if (ids.has(event.id)) {
      throw new Error(`Duplicate event id: ${event.id}`);
    }
    ids.add(event.id);
  }
}
