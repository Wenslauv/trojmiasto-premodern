# Trojmiasto Premodern

Frontend application for publishing local Premodern event standings and player statistics.

- Stack: React + TypeScript + Vite
- Hosting target: GitHub Pages

## Data layout

- `public/data/events.json` — canonical list of all published events
- `public/data/events/` — individual event JSON files used as source material or imported exports
- `public/data/templates/` — starter templates for new event files
- `public/data/cache/` — generated derived data used by the app (`players.json`, `matchups.json`, etc.)
