import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlayersList } from '../lib/data';
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
              <tr key={player.id} onClick={() => navigate(`/player/${player.id}`)}>
                <td>{player.preferredColors}</td>
                <td>{player.name}</td>
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
