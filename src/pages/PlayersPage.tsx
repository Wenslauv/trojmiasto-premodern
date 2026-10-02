import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPlayersList } from '../lib/data';
import { rowClick } from '../lib/rowClick';
import type { PlayerListItem } from '../types';

function PlayersPage() {
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    getPlayersList().then(setPlayers).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p>{error}</p>;

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
