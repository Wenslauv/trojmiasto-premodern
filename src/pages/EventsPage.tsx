import { Link, useNavigate } from 'react-router-dom';
import { formatDate, getEventsIndex } from '../lib/data';
import ManaPips from '../components/ManaPips';
import { rowClick } from '../lib/rowClick';
import { ErrorMessage, Loading } from '../components/Status';
import { useData } from '../lib/useData';

function EventsPage() {
  const state = useData(getEventsIndex, []);
  const navigate = useNavigate();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorMessage message={state.error} />;
  const events = state.data;

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
