import type {
  DeckMatchupMatrix,
  EventItem,
  PlayerDeckStat,
  PlayerDetail,
  PlayerListItem,
  RecordStat,
  Standing,
} from '../types';

type Cache = {
  events: EventItem[] | null;
  matchups: DeckMatchupMatrix | null;
};

const cache: Cache = {
  events: null,
  matchups: null,
};

function mergeRecord(left: RecordStat, right: RecordStat): RecordStat {
  return {
    wins: left.wins + right.wins,
    losses: left.losses + right.losses,
    draws: left.draws + right.draws,
  };
}

// Byes are baked into a standing's overall match record, so we recompute the record from
// individual rounds (excluding BYE) whenever round data is available. Standings-only events
// have no rounds, so byes can't be separated there and the raw record is used as-is.
function effectiveMatchRecord(standing: Standing): RecordStat {
  if (!standing.rounds || standing.rounds.length === 0) {
    return standing.match;
  }
  let record: RecordStat = { wins: 0, losses: 0, draws: 0 };
  for (const round of standing.rounds) {
    if (round.resultType === 'BYE') continue;
    record = mergeRecord(record, round.match);
  }
  return record;
}

function normalizePlayerKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function comparePlayerIds(a: string, b: string): number {
  const aMatch = /^p(\d+)$/i.exec(a);
  const bMatch = /^p(\d+)$/i.exec(b);
  if (aMatch && bMatch) {
    return Number(aMatch[1]) - Number(bMatch[1]);
  }
  return a.localeCompare(b);
}

type PlayerBucket = {
  key: string;
  id: string;
  name: string;
  ids: Set<string>;
  events: number;
  match: RecordStat;
};

function buildPlayerBuckets(events: EventItem[]): {
  buckets: Map<string, PlayerBucket>;
  idToBucketKey: Map<string, string>;
} {
  const buckets = new Map<string, PlayerBucket>();
  const idToBucketKey = new Map<string, string>();

  for (const event of events) {
    for (const row of event.standings) {
      const key = normalizePlayerKey(row.playerName) || row.playerId;
      const current = buckets.get(key) ?? {
        key,
        id: row.playerId,
        name: row.playerName,
        ids: new Set<string>(),
        events: 0,
        match: { wins: 0, losses: 0, draws: 0 },
      };

      current.ids.add(row.playerId);
      current.id = [...current.ids].sort(comparePlayerIds)[0] ?? current.id;
      current.events += 1;
      current.match = mergeRecord(current.match, effectiveMatchRecord(row));

      buckets.set(key, current);
      idToBucketKey.set(row.playerId, key);
    }
  }

  return { buckets, idToBucketKey };
}

export function formatRecord(record?: RecordStat): string {
  if (!record) return '-';
  return `${record.wins}-${record.losses}-${record.draws}`;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return dateFormatter.format(parsed);
}

export function matchWinPercent(record: RecordStat): number {
  const played = record.wins + record.losses + record.draws;
  if (played === 0) return 0;
  return ((record.wins + record.draws * 0.5) / played) * 100;
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

export async function getMatchups(): Promise<DeckMatchupMatrix> {
  if (cache.matchups) return cache.matchups;
  const data = await fetchJson<DeckMatchupMatrix>('data/cache/matchups.json');
  cache.matchups = data;
  return data;
}

export async function getEventById(id: string): Promise<EventItem | undefined> {
  const events = await getEvents();
  return events.find((event) => event.id === id);
}

export async function getPlayersList(): Promise<PlayerListItem[]> {
  const events = await getEvents();
  const { buckets } = buildPlayerBuckets(events);

  return [...buckets.values()]
    .map((value) => ({
      id: value.id,
      name: value.name,
      preferredColors: '',
      eventsCount: value.events,
      matchWinPercent: Number(matchWinPercent(value.match).toFixed(2)),
    }))
    .sort(
      (a, b) =>
        b.eventsCount - a.eventsCount ||
        b.matchWinPercent - a.matchWinPercent ||
        a.name.localeCompare(b.name),
    );
}

export async function getPlayerById(id: string): Promise<PlayerDetail | undefined> {
  const events = await getEvents();
  const { buckets, idToBucketKey } = buildPlayerBuckets(events);
  const directKey = idToBucketKey.get(id);
  const normalizedIdAsName = normalizePlayerKey(id);
  const key = directKey ?? (buckets.has(normalizedIdAsName) ? normalizedIdAsName : undefined);
  if (!key) return undefined;

  const bucket = buckets.get(key);
  if (!bucket) return undefined;

  const allIds = bucket.ids;

  const rows = events
    .flatMap((event) =>
      event.standings
        .filter((standing) => allIds.has(standing.playerId))
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

  for (const event of events) {
    for (const standing of event.standings) {
      if (!allIds.has(standing.playerId)) continue;
      totalMatch = mergeRecord(totalMatch, effectiveMatchRecord(standing));
    }
  }

  for (const row of rows) {
    const deckValue = deckCounter.get(row.deck.name) ?? { count: 0, colors: row.deck.colors };
    deckValue.count += 1;
    deckCounter.set(row.deck.name, deckValue);
  }

  const favoriteDeckEntry = [...deckCounter.entries()].sort((a, b) => b[1].count - a[1].count)[0];

  const deckStats = buildPlayerDeckStats(events, allIds);

  return {
    id: bucket.id,
    name: bucket.name,
    match: totalMatch,
    favoriteDeck: favoriteDeckEntry
      ? {
          name: favoriteDeckEntry[0],
          colors: favoriteDeckEntry[1].colors,
        }
      : null,
    events: rows,
    deckStats,
  };
}

function recordTotal(record: RecordStat): number {
  return record.wins + record.losses + record.draws;
}

function isUnknownDeckName(name: string): boolean {
  return normalizePlayerKey(name) === 'unknown deck';
}

function compareByWinPercentThenTotal(
  a: { matchWinPercent: number; match: RecordStat },
  b: { matchWinPercent: number; match: RecordStat },
): number {
  if (b.matchWinPercent !== a.matchWinPercent) return b.matchWinPercent - a.matchWinPercent;
  return recordTotal(b.match) - recordTotal(a.match);
}

function buildPlayerDeckStats(events: EventItem[], playerIds: Set<string>): PlayerDeckStat[] {
  const deckAgg = new Map<
    string,
    { name: string; colors: string; match: RecordStat; matchups: Map<string, { name: string; match: RecordStat }> }
  >();

  for (const event of events) {
    for (const standing of event.standings) {
      if (!playerIds.has(standing.playerId)) continue;
      if (isUnknownDeckName(standing.deck.name)) continue;

      const deckKey = normalizePlayerKey(standing.deck.name) || standing.deck.name;
      const current = deckAgg.get(deckKey) ?? {
        name: standing.deck.name,
        colors: standing.deck.colors,
        match: { wins: 0, losses: 0, draws: 0 },
        matchups: new Map<string, { name: string; match: RecordStat }>(),
      };
      current.match = mergeRecord(current.match, effectiveMatchRecord(standing));

      for (const round of standing.rounds ?? []) {
        if (round.resultType && round.resultType !== 'PLAYED') continue;
        if (!round.opponentPlayerId) continue;

        const opponent = event.standings.find((row) => row.playerId === round.opponentPlayerId);
        if (!opponent) continue;
        if (isUnknownDeckName(opponent.deck.name)) continue;

        const opponentKey = normalizePlayerKey(opponent.deck.name) || opponent.deck.name;
        const existingMatchup = current.matchups.get(opponentKey) ?? {
          name: opponent.deck.name,
          match: { wins: 0, losses: 0, draws: 0 },
        };
        existingMatchup.match = mergeRecord(existingMatchup.match, round.match);
        current.matchups.set(opponentKey, existingMatchup);
      }

      deckAgg.set(deckKey, current);
    }
  }

  return [...deckAgg.values()]
    .map((agg) => {
      const matchups = [...agg.matchups.values()]
        .map((matchup) => ({
          deckName: matchup.name,
          match: matchup.match,
          matchWinPercent: Number(matchWinPercent(matchup.match).toFixed(2)),
        }))
        .sort(compareByWinPercentThenTotal);

      return {
        deckName: agg.name,
        colors: agg.colors,
        match: agg.match,
        matchWinPercent: Number(matchWinPercent(agg.match).toFixed(2)),
        matchups,
      };
    })
    .sort(compareByWinPercentThenTotal);
}
