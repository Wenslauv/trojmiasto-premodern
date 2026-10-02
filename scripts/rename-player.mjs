import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EVENTS_DIR, loadEvents } from './lib/event-store.mjs';
import { PLAYERS_PATH, assertKnownPlayerIds, isValidPlayerId, loadPlayers, savePlayers } from './lib/players.mjs';

// Renames a player id everywhere: data/players.json and every event file in data/events.
// Optionally updates the displayed name in the registry (--name).
// Old links to the player's page stop working; that is accepted.

const root = process.cwd();
const ID_KEYS = ['playerId', 'playerRef', 'opponentPlayerId', 'opponentPlayerRef'];

function parseArgs(argv) {
  const positional = [];
  let name = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--name') name = argv[++i] ?? null;
    else positional.push(argv[i]);
  }
  return { oldId: positional[0], newId: positional[1], name, dryRun };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const { oldId, newId, name, dryRun } = parseArgs(process.argv.slice(2));
  if (!oldId || !newId) {
    throw new Error('Usage: node scripts/rename-player.mjs <old-id> <new-id> [--name "New Name"] [--dry-run]');
  }
  if (!isValidPlayerId(newId)) {
    throw new Error(`Invalid new id "${newId}". Use lowercase latin letters, digits and dashes.`);
  }

  const players = await loadPlayers(root);
  const player = players.find((item) => item.id === oldId);
  if (!player) throw new Error(`Player "${oldId}" not found in ${PLAYERS_PATH}.`);
  if (oldId !== newId && players.some((item) => item.id === newId)) {
    throw new Error(`Player id "${newId}" is already taken.`);
  }

  // Text-level replacement keeps the formatting of event files untouched.
  const pattern = new RegExp(`("(?:${ID_KEYS.join('|')})":\\s*)"${escapeRegExp(oldId)}"`, 'g');
  const eventsDir = path.resolve(root, EVENTS_DIR);
  const changed = [];
  for (const file of (await readdir(eventsDir)).filter((item) => item.endsWith('.json')).sort()) {
    const filePath = path.join(eventsDir, file);
    const text = await readFile(filePath, 'utf8');
    let count = 0;
    const next = text.replace(pattern, (_, prefix) => {
      count += 1;
      return `${prefix}"${newId}"`;
    });
    if (count > 0) changed.push({ file, filePath, next, count });
  }

  const summary = changed.map((item) => `${item.file} (${item.count})`).join(', ') || 'no event files';
  if (dryRun) {
    console.log(`Dry run OK. ${oldId} -> ${newId}${name ? `, name "${name}"` : ''}. Would change: ${summary}.`);
    return;
  }

  for (const item of changed) {
    await writeFile(item.filePath, item.next, 'utf8');
  }
  player.id = newId;
  if (name) player.name = name;
  await savePlayers(root, players);

  assertKnownPlayerIds(await loadEvents(root), await loadPlayers(root));
  console.log(`Renamed ${oldId} -> ${newId}${name ? `, name "${name}"` : ''}. Changed ${summary} and ${PLAYERS_PATH}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
