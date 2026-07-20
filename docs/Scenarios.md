# Scenarios

## 1. Add New Round-by-Round Event

1. Copy template:

```bash
cp public/data/new-event.template.json public/data/incoming-YYYY-MM-DD.json
```

2. Fill event data in `public/data/incoming-YYYY-MM-DD.json`.

3. Validate append:

```bash
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json --dry-run
```

4. Apply append:

```bash
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json
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
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json --delete-source
npm run generate-data
npm run check-data
npm run build
```

## 3. Add Standings-Only Event

1. Create event JSON with:
- `mode: "standingsOnly"`
- `standings[].match`
- `standings[].game`

2. Run:

```bash
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json
npm run generate-data
npm run check-data
npm run build
```

## 4. Add Event With Dropped Players

1. Use `mode: "roundByRound"` (or omit mode).

2. Omit missing rounds for dropped players.

3. Run:

```bash
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json
npm run generate-data
npm run check-data
npm run build
```

## 5. Reuse Existing Players Quickly

1. In `standings[]`, use one of:
- `playerRef: "pNN"`
- `playerRef: "Full Name"`
- `playerRef: "alias"`

2. For new player, provide `playerName`; ID is auto-generated.

3. Validate and apply:

```bash
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json --dry-run
npm run add-event -- --file public/data/incoming-YYYY-MM-DD.json
```

## 6. Fix Existing Event

1. Export event:

```bash
npm run export-event -- --id EVENT_ID --out public/data/edit-EVENT_ID.json
```

2. Edit file.

3. Validate update:

```bash
npm run update-event -- --id EVENT_ID --file public/data/edit-EVENT_ID.json --dry-run
```

4. Apply update:

```bash
npm run update-event -- --id EVENT_ID --file public/data/edit-EVENT_ID.json
```

5. Rebuild + validate:

```bash
npm run generate-data
npm run check-data
npm run build
```

## 7. Update Matchup Deck Merge Rules

1. Edit `config/matchup-deck-rules.json`.

2. Rebuild matrix only:

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
