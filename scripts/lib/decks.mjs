import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeText, uniqueSlug } from './players.mjs';

// data/decks.json is the registry of decks: [{ id, name, colors, aliases? }].
// Event files reference a deck by name (any letter case, or an alias);
// the displayed name and the colors always come from the registry.
export const DECKS_PATH = 'data/decks.json';

const DECK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadDecks(root) {
  const decks = JSON.parse(await readFile(path.resolve(root, DECKS_PATH), 'utf8'));
  validateDecks(decks);
  return decks;
}

export async function saveDecks(root, decks) {
  const sorted = [...decks].sort((a, b) => a.id.localeCompare(b.id));
  validateDecks(sorted);
  await writeFile(path.resolve(root, DECKS_PATH), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function validateDecks(decks) {
  if (!Array.isArray(decks)) throw new Error(`${DECKS_PATH} must contain an array.`);
  const ids = new Set();
  const names = new Map();
  for (const [index, deck] of decks.entries()) {
    const hint = `${DECKS_PATH}[${index}]`;
    if (typeof deck?.id !== 'string' || !DECK_ID_PATTERN.test(deck.id)) {
      throw new Error(`Invalid deck id at ${hint}: "${deck?.id}".`);
    }
    if (typeof deck.name !== 'string' || deck.name.trim() === '') throw new Error(`Deck "${deck.id}" must have a name.`);
    if (typeof deck.colors !== 'string' || deck.colors.trim() === '') throw new Error(`Deck "${deck.id}" must have colors.`);
    if (deck.aliases !== undefined && !(Array.isArray(deck.aliases) && deck.aliases.every((a) => typeof a === 'string'))) {
      throw new Error(`Deck "${deck.id}": aliases must be an array of strings.`);
    }
    if (ids.has(deck.id)) throw new Error(`Duplicate deck id "${deck.id}" in ${DECKS_PATH}.`);
    ids.add(deck.id);
    for (const name of [deck.name, ...(deck.aliases ?? [])]) {
      const key = normalizeText(name);
      if (names.has(key) && names.get(key) !== deck.id) {
        throw new Error(`Deck name "${name}" is used by both "${names.get(key)}" and "${deck.id}" in ${DECKS_PATH}.`);
      }
      names.set(key, deck.id);
    }
  }
}

// Map of normalized name / alias -> deck.
export function buildKnownDecks(decks) {
  const byName = new Map();
  for (const deck of decks) {
    for (const name of [deck.name, ...(deck.aliases ?? [])]) {
      byName.set(normalizeText(name), deck);
    }
  }
  return byName;
}

export function resolveDeck(name, knownDecks) {
  return knownDecks.get(normalizeText(name)) ?? null;
}

export function newDeck(name, colors, decks) {
  return { id: uniqueSlug(name, decks.map((deck) => deck.id)), name: name.trim(), colors: colors.trim() };
}

// Replaces every standing deck with the registry's name and colors; unknown decks are an error.
export function applyDeckRegistry(events, decks) {
  const knownDecks = buildKnownDecks(decks);
  for (const event of events) {
    for (const [index, standing] of (event.standings ?? []).entries()) {
      const deck = resolveDeck(standing.deck?.name, knownDecks);
      if (!deck) {
        throw new Error(
          `Unknown deck "${standing.deck?.name}" in event ${event.id}, standings[${index}]. Add it to ${DECKS_PATH} or fix the name.`,
        );
      }
      standing.deck = { name: deck.name, colors: deck.colors };
    }
  }
  return events;
}
