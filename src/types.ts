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
  opponentPlayerId: string | null;
  match: RecordStat;
};

export type Standing = {
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
  name: string;
  date: string;
  location: string;
  standings: Standing[];
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
