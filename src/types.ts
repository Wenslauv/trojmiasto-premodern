import type { z } from 'zod';
import type { deckRefSchema, eventSchema, recordSchema, roundSchema, standingSchema } from './lib/schema';

// Event data types come from the schema in src/lib/schema.ts (one definition for validation and types).
export type RecordStat = z.infer<typeof recordSchema>;
export type DeckRef = z.infer<typeof deckRefSchema>;
export type RoundResult = z.infer<typeof roundSchema>;
export type Standing = z.infer<typeof standingSchema>;
export type EventItem = z.infer<typeof eventSchema>;

// Types of the files generated for the site (src/lib/stats.ts).
export type EventsIndexItem = {
  id: string;
  name: string;
  date: string;
  playersCount: number;
  winner: {
    playerId: string;
    playerName: string;
    deck: DeckRef;
  };
};

export type DeckMatchupCell = {
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winPercent: number;
};

export type DeckMatchupDeck = {
  name: string;
  colors: string;
  slug: string;
  // File name in public/icons/decks, set in data/decks.json; without it the initials are shown.
  icon?: string;
};

export type DeckMatchupMatrix = {
  decks: DeckMatchupDeck[];
  matrix: Record<string, Record<string, DeckMatchupCell>>;
};

export type PlayerListItem = {
  id: string;
  name: string;
  preferredColors: string;
  eventsCount: number;
  matchWinPercent: number;
};

export type PlayerEventRow = {
  eventId: string;
  eventName: string;
  date: string;
  points: number;
  rankDisplay: string;
  deck: DeckRef;
  match: RecordStat;
  game?: RecordStat;
};

export type PlayerDeckMatchupStat = {
  deckName: string;
  match: RecordStat;
  matchWinPercent: number;
};

export type PlayerDeckStat = {
  deckName: string;
  colors: string;
  match: RecordStat;
  matchWinPercent: number;
  matchups: PlayerDeckMatchupStat[];
};

export type PlayerDetail = {
  id: string;
  name: string;
  match: RecordStat;
  favoriteDeck: DeckRef | null;
  events: PlayerEventRow[];
  deckStats: PlayerDeckStat[];
};
