import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const snapshotDir = path.join(import.meta.dirname, '..', '__snapshots__');

// Compares a value with tests/__snapshots__/<name>.json.
// Run `npm run test:update` to accept intended changes; a missing snapshot is
// created locally but fails on CI so that it is always committed.
export function matchSnapshot(name: string, value: unknown): void {
  const file = path.join(snapshotDir, `${name}.json`);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const update = process.env.UPDATE_SNAPSHOTS === '1';

  if (update || !existsSync(file)) {
    assert.ok(update || !process.env.CI, `Snapshot "${name}" is missing. Run npm run test:update and commit it.`);
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(file, serialized, 'utf8');
    return;
  }

  assert.deepStrictEqual(
    JSON.parse(serialized),
    JSON.parse(readFileSync(file, 'utf8')),
    `Snapshot "${name}" changed. If the change is intended, run npm run test:update.`,
  );
}
