import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import EventsPage from './pages/EventsPage';
import PlayersPage from './pages/PlayersPage';
import PlayerPage from './pages/PlayerPage';
import EventPage from './pages/EventPage';
import DecksPage from './pages/DecksPage';

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Trojmiasto Premodern</h1>
        <nav>
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/decks">Decks</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/event/:id" element={<EventPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
