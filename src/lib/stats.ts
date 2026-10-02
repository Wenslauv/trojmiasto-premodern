// Pure statistics shared by the site build (scripts/generate-data.mjs) and tests.
// No value imports: the build runs this file directly with Node's type stripping.
import type {
  DeckMatchupMatrix,
  EventItem,
  EventsIndexItem,
  PlayerDeckStat,
  PlayerDetail,
  PlayerListItem,
  RecordStat,
  Standing,
} from '../types';

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
export function effectiveMatchRecord(standing: Standing): RecordStat {
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
      const key = row.playerId;
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

export function matchWinPercent(record: RecordStat): number {
  const played = record.wins + record.losses + record.draws;
  if (played === 0) return 0;
  return ((record.wins + record.draws * 0.5) / played) * 100;
}

export function sortEventsNewestFirst(events: EventItem[]): EventItem[] {
  return [...events].sort((a, b) => b.date.localeCompare(a.date));
}

// Colors of the player's favorite deck; empty when only "Unknown Deck" was recorded.
function preferredColorsOf(events: EventItem[], playerId: string): string {
  const favorite = buildPlayerDetail(events, playerId)?.favoriteDeck;
  return favorite && !isUnknownDeckName(favorite.name) ? favorite.colors : '';
}

export function buildPlayersList(events: EventItem[]): PlayerListItem[] {
  const { buckets } = buildPlayerBuckets(events);

  return [...buckets.values()]
    .map((value) => ({
      id: value.id,
      name: value.name,
      preferredColors: preferredColorsOf(events, value.id),
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

export function buildPlayerDetail(events: EventItem[], id: string): PlayerDetail | undefined {
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

  // Favorite = most played deck; "Unknown Deck" only when the player has no known deck.
  const deckEntries = [...deckCounter.entries()];
  const knownDeckEntries = deckEntries.filter(([name]) => !isUnknownDeckName(name));
  const favoriteDeckEntry = (knownDeckEntries.length > 0 ? knownDeckEntries : deckEntries).sort(
    (a, b) => b[1].count - a[1].count,
  )[0];

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function buildEventsIndex(events: EventItem[]): EventsIndexItem[] {
  return sortEventsNewestFirst(events).map((event) => {
    const winner = event.standings.find((row) => row.rank === 1) ?? event.standings[0];
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      playersCount: event.standings.length,
      winner: { playerId: winner.playerId, playerName: winner.playerName, deck: winner.deck },
    };
  });
}

type MatchupCounter = { wins: number; losses: number; draws: number; matches: number };

// Deck vs deck results from round-by-round events: each pairing counted once per round,
// mirror matches and unknown decks are skipped.
export function buildMatchups(events: EventItem[]): DeckMatchupMatrix {
  const deckMeta = new Map<string, DeckMatchupMatrix['decks'][number]>();
  const deckNameKeyToCanonical = new Map<string, string>();
  const matrixCounters = new Map<string, MatchupCounter>();
  const seenPairRounds = new Set<string>();

  function ensureDeck(name: string, colors: string) {
    if (isUnknownDeckName(name)) return null;
    const deckKey = normalizePlayerKey(name);
    const existingCanonical = deckNameKeyToCanonical.get(deckKey);
    if (existingCanonical) return deckMeta.get(existingCanonical) ?? null;
    const canonical = { name, colors, slug: slugify(name) };
    deckMeta.set(name, canonical);
    deckNameKeyToCanonical.set(deckKey, name);
    return canonical;
  }

  function addDirectionalResult(rowDeck: string, colDeck: string, outcome: 'win' | 'loss' | 'draw') {
    const key = `${rowDeck}|||${colDeck}`;
    const counter = matrixCounters.get(key) ?? { wins: 0, losses: 0, draws: 0, matches: 0 };
    if (outcome === 'win') counter.wins += 1;
    if (outcome === 'loss') counter.losses += 1;
    if (outcome === 'draw') counter.draws += 1;
    counter.matches += 1;
    matrixCounters.set(key, counter);
  }

  for (const event of events) {
    if (event.mode === 'standingsOnly') continue;

    const playerToDeck = new Map<string, { name: string; colors: string }>();
    for (const row of event.standings) {
      const canonicalDeck = ensureDeck(row.deck.name, row.deck.colors);
      if (canonicalDeck) playerToDeck.set(row.playerId, { name: canonicalDeck.name, colors: canonicalDeck.colors });
    }

    for (const row of event.standings) {
      const rowDeck = playerToDeck.get(row.playerId);
      if (!rowDeck) continue;

      for (const round of row.rounds ?? []) {
        if ((round.resultType ?? 'PLAYED') !== 'PLAYED') continue;
        if (!round.match) continue;
        if (typeof round.opponentPlayerId !== 'string' || round.opponentPlayerId.trim() === '') continue;

        const opponentDeck = playerToDeck.get(round.opponentPlayerId);
        if (!opponentDeck) continue;
        if (rowDeck.name === opponentDeck.name) continue;

        const pairKey = [row.playerId, round.opponentPlayerId].sort().join('::');
        const roundKey = `${event.id}::${round.round}::${pairKey}`;
        if (seenPairRounds.has(roundKey)) continue;
        seenPairRounds.add(roundKey);

        let outcome: 'win' | 'loss' | 'draw' = 'draw';
        if (round.match.wins > round.match.losses) outcome = 'win';
        if (round.match.wins < round.match.losses) outcome = 'loss';

        addDirectionalResult(rowDeck.name, opponentDeck.name, outcome);
        addDirectionalResult(opponentDeck.name, rowDeck.name, outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw');
      }
    }
  }

  const decks = [...deckMeta.values()].sort((a, b) => a.name.localeCompare(b.name));
  const matrix: DeckMatchupMatrix['matrix'] = {};
  for (const rowDeck of decks) {
    matrix[rowDeck.name] = {};
    for (const colDeck of decks) {
      const counter = matrixCounters.get(`${rowDeck.name}|||${colDeck.name}`);
      if (!counter) continue;
      const played = counter.wins + counter.losses + counter.draws;
      matrix[rowDeck.name][colDeck.name] = {
        wins: counter.wins,
        losses: counter.losses,
        draws: counter.draws,
        matches: counter.matches,
        winPercent: played === 0 ? 0 : round2(((counter.wins + counter.draws * 0.5) / played) * 100),
      };
    }
  }

  return { decks, matrix };
}
