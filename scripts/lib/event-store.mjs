import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyEventDefaults } from './normalize-incoming-event.mjs';
import { applyDeckRegistry, loadDecks } from './decks.mjs';

// Event files in data/events are the single source of truth.
// Everything in public/data is generated from them by scripts/generate-data.mjs.
export const EVENTS_DIR = 'data/events';
export const INCOMING_DIR = 'data/incoming';
export const TEMPLATES_DIR = 'data/templates';

// Event id: <date>-<place>-<type>, for example 2026-09-21-sidequest-weekly.
// The event file is named after it: data/events/2026-09-21-sidequest-weekly.json.
export const EVENT_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// New id for an event; -2, -3... when another event already has it (same place and day).
export function eventIdFor(event, takenIds) {
  const what = event.place && event.type ? `${slug(event.place)}-${slug(event.type)}` : slug(event.name) || 'event';
  const base = `${event.date}-${what}`;
  const taken = new Set(takenIds);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function eventFileName(event) {
  return `${event.id}.json`;
}

export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

// Reads every event file with defaults applied (name = "<place> <type>", mode = "roundByRound")
// and decks resolved through data/decks.json (registry name and colors).
export async function loadEventFiles(root) {
  const dir = path.resolve(root, EVENTS_DIR);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const entries = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    if (!EVENT_ID_PATTERN.test(raw.id ?? '')) {
      throw new Error(`Invalid event id "${raw.id}" in ${EVENTS_DIR}/${file}. Use <date>-<place>-<type>, e.g. 2026-09-21-sidequest-weekly.`);
    }
    if (file !== eventFileName(raw)) {
      throw new Error(`${EVENTS_DIR}/${file} must be named ${eventFileName(raw)} after its id.`);
    }
    entries.push({ file, event: applyEventDefaults(raw) });
  }
  applyDeckRegistry(
    entries.map((entry) => entry.event),
    await loadDecks(root),
  );
  return entries;
}

export async function loadEvents(root) {
  return sortEvents((await loadEventFiles(root)).map((entry) => entry.event));
}

// An event with the same date, place and type is most likely the same event imported twice.
export function findSameDayEvent(events, event) {
  return events.find(
    (other) =>
      other.id !== event.id && other.date === event.date && other.place === event.place && other.type === event.type,
  );
}

export function assertNotImportedTwice(events, event, allowSameDay) {
  const sameDay = findSameDayEvent(events, event);
  if (sameDay && !allowSameDay) {
    throw new Error(
      `Event "${event.name}" on ${event.date} already exists (${sameDay.id}). ` +
        'If this is a different event on the same day, rerun with --allow-same-day.',
    );
  }
}

// Drops fields that equal their defaults or come from registries, so event files stay minimal.
export function toSourceEvent(event) {
  const source = structuredClone(event);
  if (source.place && source.type && source.name === `${source.place} ${source.type}`) {
    delete source.name;
  }
  if (source.mode === 'roundByRound') {
    delete source.mode;
  }
  for (const standing of source.standings ?? []) {
    if (standing.deck) standing.deck = { name: standing.deck.name };
  }
  return source;
}

export async function writeEventFile(root, file, event) {
  const target = path.resolve(root, EVENTS_DIR, file);
  await writeFile(target, `${JSON.stringify(toSourceEvent(event), null, 2)}\n`, 'utf8');
  return path.relative(root, target);
}
