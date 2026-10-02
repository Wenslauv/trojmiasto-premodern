import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { INCOMING_DIR, TEMPLATES_DIR } from './lib/event-store.mjs';

const root = process.cwd();

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function todayEventDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

function resolveTemplate(mode) {
  if (mode === 'standings') {
    return path.resolve(root, TEMPLATES_DIR, 'new-event.standings-only.template.json');
  }
  return path.resolve(root, TEMPLATES_DIR, 'new-event.template.json');
}

function resolveOutput(mode, outArg) {
  if (outArg) return path.resolve(root, outArg);
  const suffix = mode === 'standings' ? '-standings' : '';
  return path.resolve(root, INCOMING_DIR, `incoming_${todayEventDate()}${suffix}.json`);
}

async function main() {
  const modeRaw = parseArg('--mode') ?? 'round';
  const mode = modeRaw.toLowerCase();
  const outArg = parseArg('--out');

  if (!['round', 'standings'].includes(mode)) {
    throw new Error('Usage: node scripts/new-event-file.mjs [--mode round|standings] [--out <path>]');
  }

  const templatePath = resolveTemplate(mode);
  const outputPath = resolveOutput(mode, outArg);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(templatePath, outputPath);

  const rel = path.relative(root, outputPath);
  console.log(`Created ${rel}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
