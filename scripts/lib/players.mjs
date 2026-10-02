import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// data/players.json is the registry of players: [{ id, name, aliases? }].
// The id is the name in latin letters ("marcin-kowalski"); it is set once when the
// player is added and only changes through scripts/rename-player.mjs.
export const PLAYERS_PATH = 'data/players.json';

const PLAYER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRANSLITERATION = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ø: 'o', Ø: 'O', ß: 'ss' };

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Aliases computed from a name: full name, first name, first + last name, initials.
export function aliasesFromName(name) {
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

export function isValidPlayerId(id) {
  return typeof id === 'string' && PLAYER_ID_PATTERN.test(id);
}

// Latin-letter slug of a name, unique among takenIds (-2, -3... for a namesake).
export function uniqueSlug(name, takenIds) {
  const base =
    String(name)
      .replace(/[łŁđĐøØß]/g, (char) => TRANSLITERATION[char])
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'player';
  const taken = new Set(takenIds);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const playerIdFromName = uniqueSlug;

export function isTruncatedName(name) {
  return /(\.\.\.|…)\s*$/.test(String(name ?? ''));
}

export async function loadPlayers(root) {
  const players = JSON.parse(await readFile(path.resolve(root, PLAYERS_PATH), 'utf8'));
  validatePlayers(players);
  return players;
}

export async function savePlayers(root, players) {
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  validatePlayers(sorted);
  await writeFile(path.resolve(root, PLAYERS_PATH), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function validatePlayers(players) {
  if (!Array.isArray(players)) {
    throw new Error(`${PLAYERS_PATH} must contain an array.`);
  }
  const ids = new Set();
  for (const [index, player] of players.entries()) {
    const hint = `${PLAYERS_PATH}[${index}]`;
    if (!isValidPlayerId(player?.id)) {
      throw new Error(`Invalid player id at ${hint}: "${player?.id}". Use lowercase latin letters, digits and dashes.`);
    }
    if (typeof player.name !== 'string' || player.name.trim() === '') {
      throw new Error(`Player "${player.id}" must have a name.`);
    }
    if (player.aliases !== undefined && !(Array.isArray(player.aliases) && player.aliases.every((a) => typeof a === 'string'))) {
      throw new Error(`Player "${player.id}": aliases must be an array of strings.`);
    }
    if (ids.has(player.id)) {
      throw new Error(`Duplicate player id "${player.id}" in ${PLAYERS_PATH}.`);
    }
    ids.add(player.id);
  }
}

function addAlias(aliasToIds, alias, playerId) {
  if (!aliasToIds.has(alias)) aliasToIds.set(alias, new Set());
  aliasToIds.get(alias).add(playerId);
}

export function buildKnownPlayers(players) {
  const idToName = new Map();
  const nameToId = new Map();
  const aliasToIds = new Map();

  for (const player of players) {
    idToName.set(player.id, player.name);
    const normalizedName = normalizeText(player.name);
    if (normalizedName && !nameToId.has(normalizedName)) {
      nameToId.set(normalizedName, player.id);
    }
    for (const alias of [...aliasesFromName(player.name), ...(player.aliases ?? []).map(normalizeText)]) {
      if (alias) addAlias(aliasToIds, alias, player.id);
    }
  }

  return { idToName, nameToId, aliasToIds };
}

// Resolves a player id, full name or alias (initials, first name, registry aliases).
// Returns null for an unknown reference and throws when the reference is ambiguous.
export function resolvePlayerReference(reference, knownPlayers, hint) {
  if (typeof reference !== 'string' || reference.trim() === '') return null;

  const trimmed = reference.trim();
  const normalizedRef = normalizeText(trimmed);

  if (knownPlayers.idToName.has(trimmed)) {
    return { playerId: trimmed, playerName: knownPlayers.idToName.get(trimmed) };
  }

  if (knownPlayers.nameToId.has(normalizedRef)) {
    const playerId = knownPlayers.nameToId.get(normalizedRef);
    return { playerId, playerName: knownPlayers.idToName.get(playerId) };
  }

  const ids = [...(knownPlayers.aliasToIds.get(normalizedRef) ?? [])];
  if (ids.length === 1) {
    return { playerId: ids[0], playerName: knownPlayers.idToName.get(ids[0]) };
  }
  if (ids.length > 1) {
    const options = ids.map((id) => `${id} (${knownPlayers.idToName.get(id)})`).join(', ');
    throw new Error(
      `Ambiguous player reference "${reference}" at ${hint}: ${options}. Use the player id, the full name, or an alias from ${PLAYERS_PATH}.`,
    );
  }

  return null;
}

// Every player in event files must exist in the registry.
export function assertKnownPlayerIds(events, players) {
  const ids = new Set(players.map((player) => player.id));
  for (const event of events) {
    for (const standing of event.standings ?? []) {
      if (!ids.has(standing.playerId)) {
        throw new Error(`Unknown player "${standing.playerId}" in event ${event.id}. Add it to ${PLAYERS_PATH}.`);
      }
      for (const round of standing.rounds ?? []) {
        if (round.opponentPlayerId !== null && round.opponentPlayerId !== undefined && !ids.has(round.opponentPlayerId)) {
          throw new Error(`Unknown opponent "${round.opponentPlayerId}" in event ${event.id}, round ${round.round}.`);
        }
      }
    }
  }
}
