# Trojmiasto Premodern

MVP frontend for events and players, designed for GitHub Pages.

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

1. Add or update events in `public/data/events.json`.
2. Run `npm run check-data`.
3. Run `npm run generate-data` (optional but recommended).
4. Verify locally in browser (`npm run dev`).
5. Run `npm run build`.
6. Commit source and derived files together.
