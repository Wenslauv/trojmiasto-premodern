import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyEventDefaults } from './normalize-incoming-event.mjs';

// Event files in data/events are the single source of truth.
// public/data/events.json and public/data/cache are generated from them.
export const EVENTS_DIR = 'data/events';
export const INCOMING_DIR = 'data/incoming';
export const TEMPLATES_DIR = 'data/templates';
export const GENERATED_EVENTS_PATH = 'public/data/events.json';

export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

// Reads every event file with defaults applied (name = "<place> <type>", mode = "roundByRound").
export async function loadEventFiles(root) {
  const dir = path.resolve(root, EVENTS_DIR);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const entries = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    entries.push({ file, event: applyEventDefaults(raw) });
  }
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

// Drops fields that equal their defaults, so event files stay minimal.
export function toSourceEvent(event) {
  const source = structuredClone(event);
  if (source.place && source.type && source.name === `${source.place} ${source.type}`) {
    delete source.name;
  }
  if (source.mode === 'roundByRound') {
    delete source.mode;
  }
  return source;
}

// <place>_<DD.MM.YYYY>.json, with -2, -3... when the name is taken.
export function eventFileName(event, existingFiles) {
  const [year, month, day] = String(event.date).split('-');
  const prefix =
    String(event.place ?? event.name ?? 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event';
  const base = `${prefix}_${day}.${month}.${year}`;
  const taken = new Set(existingFiles);
  if (!taken.has(`${base}.json`)) return `${base}.json`;
  let n = 2;
  while (taken.has(`${base}-${n}.json`)) n += 1;
  return `${base}-${n}.json`;
}

export async function writeEventFile(root, file, event) {
  const target = path.resolve(root, EVENTS_DIR, file);
  await writeFile(target, `${JSON.stringify(toSourceEvent(event), null, 2)}\n`, 'utf8');
  return path.relative(root, target);
}
