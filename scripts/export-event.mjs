import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateEventsArray } from './lib/events-validation.mjs';

const root = process.cwd();
const sourcePath = path.resolve(root, 'public/data/events.json');

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const eventId = parseArg('--id');
  const outFile = parseArg('--out');

  if (!eventId || !outFile) {
    throw new Error('Usage: node scripts/export-event.mjs --id <eventId> --out <file.json>');
  }

  const raw = await readFile(sourcePath, 'utf8');
  const events = JSON.parse(raw);
  validateEventsArray(events);

  const found = events.find((event) => event.id === eventId);
  if (!found) {
    throw new Error(`Event with id "${eventId}" not found.`);
  }

  const outputPath = path.resolve(root, outFile);
  await writeFile(outputPath, `${JSON.stringify(found, null, 2)}\n`, 'utf8');
  console.log(`Exported event ${eventId} -> ${outFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
