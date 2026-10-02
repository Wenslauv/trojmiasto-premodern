import { Link, useNavigate } from 'react-router-dom';
import { getPlayersList } from '../lib/data';
import { rowClick } from '../lib/rowClick';
import { ErrorMessage, Loading } from '../components/Status';
import { useData } from '../lib/useData';

function PlayersPage() {
  const state = useData(getPlayersList, []);
  const navigate = useNavigate();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorMessage message={state.error} />;
  const players = state.data;

  return (
    <section>
      <h2>Players</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Preferred Colors</th>
              <th>Name</th>
              <th>Events</th>
              <th>Match Win %</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="clickable-row" onClick={rowClick(() => navigate(`/player/${player.id}`))}>
                <td>{player.preferredColors}</td>
                <td>
                  <Link className="link-btn" to={`/player/${player.id}`}>
                    {player.name}
                  </Link>
                </td>
                <td>{player.eventsCount}</td>
                <td>{player.matchWinPercent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PlayersPage;
