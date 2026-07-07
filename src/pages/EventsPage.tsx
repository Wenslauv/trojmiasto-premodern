import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEvents } from '../lib/data';
import type { EventItem } from '../types';

function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    getEvents().then(setEvents).catch((e: Error) => setError(e.message));
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
              const winner = event.standings.find((row) => row.rank === 1) ?? event.standings[0];
              return (
                <tr key={event.id} onClick={() => navigate(`/event/${event.id}`)}>
                  <td>{event.name}</td>
                  <td>{event.date}</td>
                  <td>{event.standings.length}</td>
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
                  <td>{winner.deck.colors}</td>
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
