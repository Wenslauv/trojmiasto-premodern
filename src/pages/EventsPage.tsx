import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, getEventsIndex } from '../lib/data';
import ManaPips from '../components/ManaPips';
import { rowClick } from '../lib/rowClick';
import type { EventsIndexItem } from '../types';

function EventsPage() {
  const [events, setEvents] = useState<EventsIndexItem[]>([]);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    getEventsIndex().then(setEvents).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p>{error}</p>;

  return (
    <section>
      <h2>Events</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event Name</th>
              <th>Date</th>
              <th>Players</th>
              <th>Winner</th>
              <th>Deck Colors</th>
              <th>Deck Name</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const { winner } = event;
              return (
                <tr key={event.id} className="clickable-row" onClick={rowClick(() => navigate(`/event/${event.id}`))}>
                  <td>
                    <Link className="link-btn" to={`/event/${event.id}`}>
                      {event.name}
                    </Link>
                  </td>
                  <td>{formatDate(event.date)}</td>
                  <td>{event.playersCount}</td>
                  <td>
                    <Link className="link-btn" to={`/player/${winner.playerId}`}>
                      {winner.playerName}
                    </Link>
                  </td>
                  <td>
                    <ManaPips colors={winner.deck.colors} />
                  </td>
                  <td>
                    <Link className="link-btn" to="/decks">
                      {winner.deck.name}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default EventsPage;
