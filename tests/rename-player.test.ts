import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = path.join(import.meta.dirname, '..');

test('rename-player changes the id in the registry and in every event file', () => {
  const workdir = mkdtempSync(path.join(tmpdir(), 'trojmiasto-rename-'));
  try {
    const eventsDir = path.join(workdir, 'data/events');
    mkdirSync(eventsDir, { recursive: true });
    const events = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures/events.json'), 'utf8'));
    for (const event of events) {
      writeFileSync(path.join(eventsDir, `${event.id}.json`), JSON.stringify(event, null, 2));
    }
    cpSync(path.join(import.meta.dirname, 'fixtures/players.json'), path.join(workdir, 'data/players.json'));
    cpSync(path.join(import.meta.dirname, 'fixtures/decks.json'), path.join(workdir, 'data/decks.json'));

    const run = (...args: string[]) =>
      spawnSync(process.execPath, [path.join(root, 'scripts/rename-player.mjs'), ...args], { cwd: workdir, encoding: 'utf8' });

    const result = run('marcin-kowalski', 'marcin-kowalski-test', '--name', 'Marcin Kowalski Test');
    assert.equal(result.status, 0, result.stderr);

    const players = JSON.parse(readFileSync(path.join(workdir, 'data/players.json'), 'utf8'));
    assert.ok(players.some((p: { id: string; name: string }) => p.id === 'marcin-kowalski-test' && p.name === 'Marcin Kowalski Test'));
    assert.ok(!players.some((p: { id: string }) => p.id === 'marcin-kowalski'));

    const allEvents = readdirSync(eventsDir).map((file) => readFileSync(path.join(eventsDir, file), 'utf8')).join('\n');
    assert.ok(!allEvents.includes('"marcin-kowalski"'));
    assert.ok(allEvents.includes('"marcin-kowalski-test"'));

    assert.notEqual(run('marcin-kowalski-test', 'piotr-orlowski').status, 0, 'taken id must be rejected');
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});
