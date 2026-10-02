import type { DeckMatchupMatrix, EventItem, EventsIndexItem, PlayerDetail, PlayerListItem } from '../types';

// The site only loads files prepared by scripts/generate-data.mjs; nothing is computed here.

export { formatDate, formatRecord } from './format';
export { matchWinPercent } from './stats';

const cache = new Map<string, unknown>();

// Returns undefined for a missing file (unknown event or player id).
async function fetchJson<T>(path: string): Promise<T | undefined> {
  if (cache.has(path)) return cache.get(path) as T;
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  const data = (await response.json()) as T;
  cache.set(path, data);
  return data;
}

async function fetchRequired<T>(path: string): Promise<T> {
  const data = await fetchJson<T>(path);
  if (data === undefined) throw new Error(`Failed to load ${path}`);
  return data;
}

export function getEventsIndex(): Promise<EventsIndexItem[]> {
  return fetchRequired<EventsIndexItem[]>('data/events-index.json');
}

export function getEventById(id: string): Promise<EventItem | undefined> {
  return fetchJson<EventItem>(`data/event/${encodeURIComponent(id)}.json`);
}

export function getPlayersList(): Promise<PlayerListItem[]> {
  return fetchRequired<PlayerListItem[]>('data/players.json');
}

export function getPlayerById(id: string): Promise<PlayerDetail | undefined> {
  return fetchJson<PlayerDetail>(`data/player/${encodeURIComponent(id)}.json`);
}

export function getMatchups(): Promise<DeckMatchupMatrix> {
  return fetchRequired<DeckMatchupMatrix>('data/matchups.json');
}
