import type { EventItem, PlayerDetail, PlayerListItem, RecordStat } from '../types';

type Cache = {
  events: EventItem[] | null;
};

const cache: Cache = {
  events: null,
};

function mergeRecord(left: RecordStat, right: RecordStat): RecordStat {
  return {
    wins: left.wins + right.wins,
    losses: left.losses + right.losses,
    draws: left.draws + right.draws,
  };
}

export function formatRecord(record: RecordStat): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

export function matchWinPercent(record: RecordStat): number {
  const played = record.wins + record.losses + record.draws;
  if (played === 0) return 0;
  return (record.wins / played) * 100;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json() as Promise<T>;
}

export async function getEvents(): Promise<EventItem[]> {
  if (cache.events) return cache.events;
  const data = await fetchJson<EventItem[]>('data/events.json');
  cache.events = [...data].sort((a, b) => b.date.localeCompare(a.date));
  return cache.events;
}

export async function getEventById(id: string): Promise<EventItem | undefined> {
  const events = await getEvents();
  return events.find((event) => event.id === id);
}

export async function getPlayersList(): Promise<PlayerListItem[]> {
  const events = await getEvents();
  const byId = new Map<string, { name: string; events: number; match: RecordStat }>();

  for (const event of events) {
    for (const row of event.standings) {
      const current = byId.get(row.playerId) ?? {
        name: row.playerName,
        events: 0,
        match: { wins: 0, losses: 0, draws: 0 },
      };
      current.events += 1;
      current.match = mergeRecord(current.match, row.match);
      byId.set(row.playerId, current);
    }
  }

  return [...byId.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      preferredColors: '',
      eventsCount: value.events,
      matchWinPercent: Number(matchWinPercent(value.match).toFixed(2)),
    }))
    .sort((a, b) => b.eventsCount - a.eventsCount || a.name.localeCompare(b.name));
}

export async function getPlayerById(id: string): Promise<PlayerDetail | undefined> {
  const events = await getEvents();
  const playerName = events.flatMap((event) => event.standings).find((standing) => standing.playerId === id)?.playerName;

  const rows = events
    .flatMap((event) =>
      event.standings
        .filter((standing) => standing.playerId === id)
        .map((standing) => ({
          eventId: event.id,
          eventName: event.name,
          date: event.date,
          points: standing.points,
          rankDisplay: `${standing.rank}/${event.standings.length}`,
          deck: standing.deck,
          match: standing.match,
          game: standing.game,
        })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) return undefined;

  let totalMatch: RecordStat = { wins: 0, losses: 0, draws: 0 };
  const deckCounter = new Map<string, { count: number; colors: string }>();

  for (const row of rows) {
    totalMatch = mergeRecord(totalMatch, row.match);
    const deckValue = deckCounter.get(row.deck.name) ?? { count: 0, colors: row.deck.colors };
    deckValue.count += 1;
    deckCounter.set(row.deck.name, deckValue);
  }

  const favoriteDeckEntry = [...deckCounter.entries()].sort((a, b) => b[1].count - a[1].count)[0];

  return {
    id,
    name: playerName ?? id,
    match: totalMatch,
    favoriteDeck: favoriteDeckEntry
      ? {
          name: favoriteDeckEntry[0],
          colors: favoriteDeckEntry[1].colors,
        }
      : null,
    events: rows,
  };
}
