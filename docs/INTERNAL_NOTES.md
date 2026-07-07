# Trojmiasto Premodern Notes

Detailed project operations and data workflow notes.

## Implemented

- Events list page with click behavior from the specification.
- Players list page.
- Player detail page with overall winrate and favorite deck.
- Event detail page with dynamic round columns.
- Decks tab as placeholder for next iteration.
- Event-first data model in `public/data/events.json`.
- Optional script to compute and commit derived data cache.

## Data flow

1. Source of truth: `public/data/events.json`.
2. Optional derived cache generation: `npm run generate-data`.
3. Derived files are written to `public/data/cache` and can be committed together with new events.
4. Incoming file is only an input for append operation; cache is always regenerated from `public/data/events.json`.

## Add New Event (recommended flow)

Event id is optional in incoming files.
- If `id` is omitted, `add-event` generates it automatically from `date + name`.
- If generated id already exists, script appends numeric suffix (`-2`, `-3`, ...).

1. Copy template and fill it:

```bash
cp public/data/new-event.template.json public/data/incoming-2026-07-15.json
```

2. Validate and append event into source list:

```bash
npm run add-event -- --file public/data/incoming-2026-07-15.json
```

Notes about `playerId`:
- In incoming/template files you can omit `playerId` completely.
- You can keep real stable IDs if you already have them.
- If you use temporary IDs like `player-a` / `player-b` (or `auto`), script will auto-resolve IDs.
- If `playerName` already exists in the dataset, existing ID is reused automatically.
- For new names, script creates a new ID in format `pNN`.

Notes about round opponents:
- Recommended: use text `localId` in standings and `opponentLocalId` in rounds (event-local references).
- Example: player `{ "localId": "pB", ... }` can be referenced as `"opponentLocalId": "pB"`.
- Numeric local IDs are also supported for backward compatibility.
- You can set `opponentPlayerName` in each round instead of `opponentPlayerId`.
- Script will resolve it to `opponentPlayerId` automatically when possible.
- If opponent is unknown at the moment, you can leave `opponentPlayerId` omitted (it becomes `null`).

Notes about special round results:
- `resultType: "BYE"`: counts as match `1-0-0`, game `0-0-0`.
- `resultType: "ID"`: counts as match `0-0-0`, game `0-0-0` (does not affect played games).
- If `resultType` is omitted, default is `PLAYED` and regular `match` record is expected.

Notes about round records:
- For `PLAYED` rounds, preferred input is only `game`.
- `match` is derived automatically from `game`:
  - `game.wins > game.losses` -> `1-0-0`
  - `game.wins < game.losses` -> `0-1-0`
  - `game.wins == game.losses` -> `0-0-1`
- `BYE` and `ID` set round match/game automatically by special rules.

Notes about standings totals:
- `standings[].match` and `standings[].game` are auto-calculated from `rounds` on add/update.
- In incoming/template files you can omit standings totals and keep only round-level data.

3. Regenerate derived data:

```bash
npm run generate-data
```

4. Quick validation + build:

```bash
npm run check-data
npm run build
```

5. Commit updated files together:
- `public/data/events.json`
- `public/data/cache/players.json`
- `public/data/cache/events-summary.json`

Dry run mode is available:

```bash
npm run add-event -- --file public/data/incoming-2026-07-15.json --dry-run
```

If you want to remove incoming file automatically after successful append:

```bash
npm run add-event -- --file public/data/incoming-2026-07-15.json --delete-source
```

## Fix Existing Event

Use this flow when you need to correct player name, deck name, points, or match/game results.

1. Export current event to editable file:

```bash
npm run export-event -- --id 445001 --out public/data/edit-445001.json
```

2. Edit file `public/data/edit-445001.json`.

3. Validate update (dry run):

```bash
npm run update-event -- --id 445001 --file public/data/edit-445001.json --dry-run
```

4. Apply update:

```bash
npm run update-event -- --id 445001 --file public/data/edit-445001.json --delete-source
```

5. Rebuild derived data:

```bash
npm run generate-data
npm run check-data
```

`update-event` uses the same player ID normalization rules as `add-event`.

## Local run

Required: Node.js 20+.

```bash
npm install
npm run check-data
npm run dev
```

Build check:

```bash
npm run build
```

## Before GitHub Pages deploy

1. Add or update event via `npm run add-event -- --file <event-file>.json`.
2. Run `npm run generate-data`.
3. Run `npm run check-data`.
4. Verify locally in browser (`npm run dev`).
5. Run `npm run build`.
6. Commit source and derived files together.