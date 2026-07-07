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

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

async function main() {
  const eventId = parseArg('--id');
  const fileArg = parseArg('--file');
  const dryRun = parseBoolean('--dry-run');
  const deleteSource = parseBoolean('--delete-source');

  if (!eventId || !fileArg) {
    throw new Error('Usage: node scripts/update-event.mjs --id <eventId> --file <path-to-event.json> [--dry-run] [--delete-source]');
  }

  const incomingPath = path.resolve(root, fileArg);
  const incomingRaw = await readFile(incomingPath, 'utf8');
  const incomingEvent = JSON.parse(incomingRaw);

  const currentRaw = await readFile(sourcePath, 'utf8');
  const currentEvents = JSON.parse(currentRaw);
  validateEventsArray(currentEvents);

  const targetIndex = currentEvents.findIndex((event) => event.id === eventId);
  if (targetIndex === -1) {
    throw new Error(`Event with id "${eventId}" not found in public/data/events.json.`);
  }

  if (incomingEvent.id !== eventId) {
    throw new Error(`Incoming event id "${incomingEvent.id}" does not match --id "${eventId}".`);
  }

  const normalizedIncomingEvent = normalizeIncomingEvent(incomingEvent, currentEvents);
  validateEvent(normalizedIncomingEvent, 'incomingEvent');

  const replaced = [...currentEvents];
  replaced[targetIndex] = normalizedIncomingEvent;
  const nextEvents = sortEvents(replaced);
  validateEventsArray(nextEvents);

  if (dryRun) {
    console.log(`Dry run OK. Event ${eventId} can be updated.`);
    return;
  }

  await writeFile(sourcePath, `${JSON.stringify(nextEvents, null, 2)}\n`, 'utf8');
  console.log(`Updated event ${eventId} in public/data/events.json`);

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
