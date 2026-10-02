import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, getEventsIndex } from '../lib/data';
import ManaPips from '../components/ManaPips';
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
                <tr key={event.id} onClick={() => navigate(`/event/${event.id}`)}>
                  <td>{event.name}</td>
                  <td>{formatDate(event.date)}</td>
                  <td>{event.playersCount}</td>
                  <td>
                    <button
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/player/${winner.playerId}`);
                      }}
                    >
                      {winner.playerName}
                    </button>
                  </td>
                  <td>
                    <ManaPips colors={winner.deck.colors} />
                  </td>
                  <td>
                    <button
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/decks');
                      }}
                    >
                      {winner.deck.name}
                    </button>
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
