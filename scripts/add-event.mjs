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

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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

async function main() {
  const fileArg = parseArg('--file');
  const dryRun = parseBoolean('--dry-run');
  const deleteSource = parseBoolean('--delete-source');

  if (!fileArg) {
    throw new Error('Usage: node scripts/add-event.mjs --file <path-to-event.json> [--dry-run] [--delete-source]');
  }

  const incomingPath = path.resolve(root, fileArg);
  const incomingRaw = await readFile(incomingPath, 'utf8');
  const incomingEvent = JSON.parse(incomingRaw);

  const currentRaw = await readFile(sourcePath, 'utf8');
  const currentEvents = JSON.parse(currentRaw);
  validateEventsArray(currentEvents);

  const normalizedIncomingEvent = normalizeIncomingEvent(incomingEvent, currentEvents);
  normalizedIncomingEvent.id = generateEventId(normalizedIncomingEvent, currentEvents);
  validateEvent(normalizedIncomingEvent, 'incomingEvent');

  const duplicate = currentEvents.find((event) => event.id === normalizedIncomingEvent.id);
  if (duplicate) {
    throw new Error(`Event with id "${normalizedIncomingEvent.id}" already exists in public/data/events.json.`);
  }

  const nextEvents = [...currentEvents, normalizedIncomingEvent].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });

  validateEventsArray(nextEvents);

  if (dryRun) {
    console.log(`Dry run OK. Event ${normalizedIncomingEvent.id} can be added.`);
    return;
  }

  await writeFile(sourcePath, `${JSON.stringify(nextEvents, null, 2)}\n`, 'utf8');
  console.log(`Added event ${normalizedIncomingEvent.id} to public/data/events.json`);

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
