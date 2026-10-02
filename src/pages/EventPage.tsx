import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, formatRecord, getEventById } from '../lib/data';
import ManaPips from '../components/ManaPips';
import { ErrorMessage, Loading } from '../components/Status';
import { useData } from '../lib/useData';
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
  const state = useData(() => (id ? getEventById(id) : Promise.resolve(undefined)), [id]);
  const eventData = state.status === 'ready' ? state.data : undefined;

  const maxRounds = useMemo(() => {
    if (!eventData) return 0;
    return Math.max(...eventData.standings.map((row) => row.rounds.length), 0);
  }, [eventData]);

  const hasGames = useMemo(() => {
    if (!eventData) return false;
    return eventData.standings.some((row) => row.game);
  }, [eventData]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorMessage message={state.error} />;
  if (!eventData) return <ErrorMessage message="Event not found" />;

  return (
    <section>
      <h2>{eventData.name}</h2>
      <div className="facts">
        <p>Date: {formatDate(eventData.date)}</p>
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
              <th>Matches</th>
              {hasGames && <th>Games</th>}
              <th>Deck Name</th>
              <th>Deck Colors</th>
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
                  <Link className="link-btn" to={`/player/${row.playerId}`}>
                    {row.playerName}
                  </Link>
                </td>
                <td>{row.points}</td>
                <td>{formatRecord(row.match)}</td>
                {hasGames && <td>{formatRecord(row.game)}</td>}
                <td>
                  <Link className="link-btn" to="/decks">
                    {row.deck.name}
                  </Link>
                </td>
                <td>
                  <ManaPips colors={row.deck.colors} />
                </td>
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
