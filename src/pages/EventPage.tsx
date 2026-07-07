import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatRecord, getEventById } from '../lib/data';
import type { EventItem } from '../types';

function formatRoundCell(round: EventItem['standings'][number]['rounds'][number] | undefined): string {
  if (!round) return '-';
  if (round.resultType === 'BYE') return 'BYE';
  if (round.resultType === 'ID') return 'ID';
  return formatRecord(round.game ?? round.match);
}

function getRoundResultClass(round: EventItem['standings'][number]['rounds'][number] | undefined): string {
  if (!round) return '';
  if (round.resultType === 'BYE') return 'round-win';
  if (round.resultType === 'ID') return '';

  const game = round.game ?? round.match;
  if (game.wins > game.losses) return 'round-win';
  if (game.wins < game.losses) return 'round-loss';
  return 'round-draw';
}

function EventPage() {
  const { id } = useParams();
  const [eventData, setEventData] = useState<EventItem | null>(null);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    getEventById(id)
      .then((result) => {
        if (!result) {
          setError('Event not found');
          return;
        }
        setEventData(result);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const maxRounds = useMemo(() => {
    if (!eventData) return 0;
    return Math.max(...eventData.standings.map((row) => row.rounds.length), 0);
  }, [eventData]);

  if (error) return <p>{error}</p>;
  if (!eventData) return <p>Loading...</p>;

  return (
    <section>
      <h2>{eventData.name}</h2>
      <div className="facts">
        <p>Date: {eventData.date}</p>
        <p>Players: {eventData.standings.length}</p>
        <p>Location: {eventData.location}</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Name</th>
              <th>Points</th>
              <th>Deck Colors</th>
              <th>Deck Name</th>
              <th>Match</th>
              <th>Game</th>
              {Array.from({ length: maxRounds }, (_, index) => (
                <th key={`round-head-${index + 1}`}>Round {index + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventData.standings.map((row) => (
              <tr key={row.playerId}>
                <td>{row.rank}</td>
                <td>
                  <button className="link-btn" onClick={() => navigate(`/player/${row.playerId}`)}>
                    {row.playerName}
                  </button>
                </td>
                <td>{row.points}</td>
                <td>{row.deck.colors}</td>
                <td>
                  <button className="link-btn" onClick={() => navigate('/decks')}>
                    {row.deck.name}
                  </button>
                </td>
                <td>{formatRecord(row.match)}</td>
                <td>{formatRecord(row.game)}</td>
                {Array.from({ length: maxRounds }, (_, roundIndex) => {
                  const found = row.rounds.find((item) => item.round === roundIndex + 1);
                  const roundClass = getRoundResultClass(found);
                  return (
                    <td key={`${row.playerId}-r${roundIndex + 1}`} className={roundClass}>
                      {formatRoundCell(found)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default EventPage;
