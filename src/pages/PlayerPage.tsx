import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatRecord, getPlayerById, matchWinPercent } from '../lib/data';
import type { PlayerDetail } from '../types';

function getWinrateTone(value: number): string {
  if (value > 55) return 'winrates-good';
  if (value < 45) return 'winrates-bad';
  return 'winrates-neutral';
}

function formatRecordTotal(record: { wins: number; losses: number; draws: number }): string {
  return `total ${record.wins + record.losses + record.draws}`;
}

function PlayerPage() {
  const { id } = useParams();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    getPlayerById(id)
      .then((result) => {
        if (!result) {
          setError('Player not found');
          return;
        }
        setPlayer(result);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!player) return <p>Loading...</p>;

  return (
    <section>
      <h2>{player.name}</h2>
      <div className="facts">
        <p>
          Overall winrate: <strong>{matchWinPercent(player.match).toFixed(2)}%</strong> ({formatRecord(player.match)})
        </p>
        <p>
          Favorite deck:{' '}
          <strong>{player.favoriteDeck ? `${player.favoriteDeck.name} (${player.favoriteDeck.colors})` : 'Unknown'}</strong>
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Date</th>
              <th>Points</th>
              <th>Place</th>
              <th>Deck Colors</th>
              <th>Deck Name</th>
              <th>Match</th>
              <th>Game</th>
            </tr>
          </thead>
          <tbody>
            {player.events.map((row) => (
              <tr key={`${row.eventId}-${row.date}`}>
                <td>
                  <button className="link-btn" onClick={() => navigate(`/event/${row.eventId}`)}>
                    {row.eventName}
                  </button>
                </td>
                <td>{formatDate(row.date)}</td>
                <td>{row.points}</td>
                <td>{row.rankDisplay}</td>
                <td>{row.deck.colors}</td>
                <td>
                  <button className="link-btn" onClick={() => navigate('/decks')}>
                    {row.deck.name}
                  </button>
                </td>
                <td>{formatRecord(row.match)}</td>
                <td>{formatRecord(row.game ?? row.match)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Deck Performance</h3>
      <div className="deck-stats">
        {player.deckStats.map((deck) => (
          <details className="deck-stat-block" key={deck.deckName}>
            <summary>
              <span className="deck-stat-name">{deck.deckName}</span>
              <span className={`deck-stat-winrate ${getWinrateTone(deck.matchWinPercent)}`}>
                {deck.matchWinPercent.toFixed(2)}%
              </span>
              <span className="deck-stat-record">
                {formatRecord(deck.match)} ({formatRecordTotal(deck.match)})
              </span>
            </summary>
            {deck.matchups.length > 0 && (
              <table className="deck-matchup-table">
                <thead>
                  <tr>
                    <th>Deck</th>
                    <th>Winrate</th>
                    <th>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {deck.matchups.map((matchup) => (
                    <tr key={matchup.deckName}>
                      <td>{matchup.deckName}</td>
                      <td className={getWinrateTone(matchup.matchWinPercent)}>
                        {matchup.matchWinPercent.toFixed(2)}%
                      </td>
                      <td>
                        {formatRecord(matchup.match)} ({formatRecordTotal(matchup.match)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

export default PlayerPage;
