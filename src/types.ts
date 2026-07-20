export type RecordStat = {
  wins: number;
  losses: number;
  draws: number;
};

export type DeckRef = {
  name: string;
  colors: string;
};

export type RoundResult = {
  round: number;
  opponentPlayerRef?: string;
  opponentLocalId?: string | number;
  opponentPlayerName?: string;
  opponentPlayerId: string | null;
  resultType?: 'PLAYED' | 'BYE' | 'ID';
  match: RecordStat;
  game?: RecordStat;
};

export type Standing = {
  localId?: string | number;
  playerRef?: string;
  rank: number;
  playerId: string;
  playerName: string;
  points: number;
  deck: DeckRef;
  match: RecordStat;
  game: RecordStat;
  rounds: RoundResult[];
};

export type EventItem = {
  id: string;
  mode?: 'roundByRound' | 'standingsOnly';
  name: string;
  date: string;
  location: string;
  standings: Standing[];
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
  game: RecordStat;
};

export type PlayerDetail = {
  id: string;
  name: string;
  match: RecordStat;
  favoriteDeck: DeckRef | null;
  events: PlayerEventRow[];
};
