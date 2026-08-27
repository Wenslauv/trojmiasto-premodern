# Scenarios

## Data layout

- `public/data/events.json` — canonical source of truth for all published events
- `public/data/events/` — individual event files and incoming files used during import/export workflows
- `public/data/templates/` — starter JSON templates for new events
- `public/data/cache/` — generated cache files used by the frontend

## 1. Add New Round-by-Round Event

1. Copy a template:

```bash
cp public/data/templates/new-event.template.json public/data/events/incoming-YYYY-MM-DD.json
```

Alternative (auto-create file in the events folder):

```bash
npm run new-event-file
```

2. Fill event data in `public/data/events/incoming-YYYY-MM-DD.json`.

3. Validate append:

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json --dry-run
```

4. Apply append:

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json
```

5. Rebuild caches:

```bash
npm run generate-data
```

6. Validate + build:

```bash
npm run check-data
npm run build
```

## 2. Add New Event and Remove Source File

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json --delete-source
npm run generate-data
npm run check-data
npm run build
```

## 3. Add Standings-Only Event

Create an event file from the standings template:

```bash
npm run new-standings-file
```

1. Create event JSON with:
- `mode: "standingsOnly"`
- `standings[].match`
- `standings[].game`

2. Run:

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json
npm run generate-data
npm run check-data
npm run build
```

## 4. Add Event With Dropped Players

1. Use `mode: "roundByRound"` (or omit mode).

2. Omit missing rounds for dropped players.

3. Run:

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json
npm run generate-data
npm run check-data
npm run build
```

## 5. Reuse Existing Players Quickly

1. In `standings[]`, use one of:
- `playerRef: "pNN"`
- `playerRef: "Full Name"`
- `playerRef: "alias"`

2. For a new player, provide `playerName`; the ID is auto-generated.

3. Validate and apply:

```bash
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/events/incoming-YYYY-MM-DD.json
```

## 6. Fix Existing Event

1. Export event:

```bash
npm run export-event -- --id EVENT_ID --out public/data/events/edit-EVENT_ID.json
```

2. Edit the exported file.

3. Validate the update:

```bash
npm run update-event -- --id EVENT_ID --file public/data/events/edit-EVENT_ID.json --dry-run
```

4. Apply the update:

```bash
npm run update-event -- --id EVENT_ID --file public/data/events/edit-EVENT_ID.json
```

5. Rebuild and validate:

```bash
npm run generate-data
npm run check-data
npm run build
```

## 7. Update Matchup Deck Merge Rules

1. Edit `config/matchup-deck-rules.json`.

2. Rebuild the matrix only:

```bash
npm run generate-matrix
```

3. Full verification:

```bash
npm run build
```

## 8. Reset and Rebuild Matchup Matrix

```bash
npm run reset-matrix
npm run build
```

## 9. Local Development Run

```bash
npm install
npm run check-data
npm run dev
```

## 10. Pre-Deploy Checklist

```bash
npm run generate-data
npm run check-data
npm run build
```

Commit together:
- `public/data/events.json`
- `public/data/cache/players.json`
- `public/data/cache/events-summary.json`
- `public/data/cache/matchups.json`
