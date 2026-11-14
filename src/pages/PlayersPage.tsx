import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPlayersList } from '../lib/data';
import ManaPips from '../components/ManaPips';
import SortableHeader from '../components/SortableHeader';
import { rowClick } from '../lib/rowClick';
import { colorSortKey, sortRows, type SortDirection, type SortValue } from '../lib/sort';
import { useTableSort } from '../lib/useTableSort';
import { ErrorMessage, Loading } from '../components/Status';
import { useData } from '../lib/useData';
import type { PlayerListItem } from '../types';

type Column = 'name' | 'deck' | 'deckWinrate' | 'colors' | 'winrate' | 'events';

type ColumnDef = {
  key: Column;
  label: string;
  // Direction of the first click on the header; the second click reverses it.
  firstDirection: SortDirection;
  value: (player: PlayerListItem) => SortValue;
  cell: (player: PlayerListItem) => ReactNode;
};

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(2)}%`;
}

// Columns in display order: header and cell come from the same entry, so reordering is one move here.
const COLUMNS: ColumnDef[] = [
  {
    key: 'name',
    label: 'Player',
    firstDirection: 'asc',
    value: (p) => p.name,
    cell: (p) => (
      <Link className="link-btn" to={`/player/${p.id}`}>
        {p.name}
      </Link>
    ),
  },
  { key: 'deck', label: 'Favorite Deck', firstDirection: 'asc', value: (p) => p.favoriteDeck, cell: (p) => p.favoriteDeck ?? '-' },
  {
    key: 'colors',
    label: 'Colors',
    firstDirection: 'asc',
    value: (p) => colorSortKey(p.preferredColors),
    cell: (p) => <ManaPips colors={p.preferredColors} />,
  },
  {
    key: 'deckWinrate',
    label: 'Deck Win %',
    firstDirection: 'desc',
    value: (p) => p.favoriteDeckWinPercent,
    cell: (p) => formatPercent(p.favoriteDeckWinPercent),
  },
  { key: 'winrate', label: 'Total Win %', firstDirection: 'desc', value: (p) => p.matchWinPercent, cell: (p) => formatPercent(p.matchWinPercent) },
  { key: 'events', label: 'Events', firstDirection: 'desc', value: (p) => p.eventsCount, cell: (p) => p.eventsCount },
];

const FIRST_DIRECTION = Object.fromEntries(COLUMNS.map((c) => [c.key, c.firstDirection])) as Record<Column, SortDirection>;

// players.json already comes ordered by events, then winrate, then name; that order matches
// "Events, descending" and breaks ties for every other column.
const DEFAULT_SORT = { column: 'events', direction: 'desc' } as const;

function PlayersPage() {
  const state = useData(getPlayersList, []);
  const navigate = useNavigate();
  const { sort, toggle } = useTableSort<Column>(FIRST_DIRECTION, DEFAULT_SORT);

  const players = state.status === 'ready' ? state.data : null;
  const sorted = useMemo(() => {
    if (!players) return [];
    const column = COLUMNS.find((c) => c.key === sort.column) ?? COLUMNS[0];
    return sortRows(players, column.value, sort.direction);
  }, [players, sort.column, sort.direction]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorMessage message={state.error} />;

  return (
    <section>
      <h2>Players</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <SortableHeader key={column.key} column={column.key} label={column.label} sort={sort} onSort={toggle} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((player) => (
              <tr key={player.id} className="clickable-row" onClick={rowClick(() => navigate(`/player/${player.id}`))}>
                {COLUMNS.map((column) => (
                  <td key={column.key}>{column.cell(player)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PlayersPage;
