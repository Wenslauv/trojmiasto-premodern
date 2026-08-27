# AGENTS.md

## Commit message rules

Use concise, conventional commit messages. Keep one line only unless a longer explanation is absolutely necessary.

### Format

<type>: <summary>

### Allowed types

- feat: new user-facing feature or capability
- fix: bug fix
- data: change to event, standings, or generated data files
- chore: maintenance, config, tooling, or dependency updates
- docs: documentation updates
- refact: non-functional cleanup or restructuring
- style: formatting-only changes

### Examples

- feat: add player detail page
- fix: correct standings sort order
- data: add event 2026 Futurex
- chore: update Vite config
- docs: clarify event JSON schema

### Event-specific rule

When committing a newly added event, use:

- event: add {event_name}

The {event_name} must match the event JSON `name` field exactly.
For standings-only events, an optional suffix is allowed:

- event: add {event_name} (standings-only)

### Required commit discipline

- Commit only relevant changes.
- Do not mix unrelated fixes in one commit.
- Prefer small logical units over broad refactors.
- Provide the reason in the summary, not just the file names.
- Before committing, verify the smallest relevant check:
  - npm run build for UI or config changes
  - npm run check-data for data-related changes

### Do not do

- Do not use vague messages like "update" or "fix stuff".
- Do not commit generated artifacts without explaining why.
- Do not add unrelated data or formatting changes in the same commit.
