import { getMatchups } from '../lib/data';
import ManaPips from '../components/ManaPips';
import { ErrorMessage, Loading } from '../components/Status';
import { useData } from '../lib/useData';
import type { DeckMatchupCell, DeckMatchupDeck } from '../types';

function getCellTone(value: number): string {
  if (value >= 55) return 'winrates-good';
  if (value <= 45) return 'winrates-bad';
  return 'winrates-neutral';
}

function deckIconPath(icon: string): string {
  return `${import.meta.env.BASE_URL}icons/decks/${icon}`;
}

function deckInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function cellKey(rowDeck: string, colDeck: string): string {
  return `${rowDeck}::${colDeck}`;
}

function WinratesPage() {
  const state = useData(getMatchups, []);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorMessage message={state.error} />;

  const { decks, matrix } = state.data;

  return (
    <section>
      <div className="matrix-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">Deck vs Deck</th>
              {decks.map((deck: DeckMatchupDeck) => (
                <th key={deck.name} className="matrix-col-head">
                  {deck.icon ? (
                    <img className="deck-icon" src={deckIconPath(deck.icon)} alt="" width={36} height={36} />
                  ) : (
                    <span className="deck-icon-fallback" aria-hidden="true">
                      {deckInitials(deck.name)}
                    </span>
                  )}
                  <span>{deck.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decks.map((rowDeck) => (
              <tr key={rowDeck.name}>
                <th className="matrix-row-head">
                  <span>{rowDeck.name}</span>
                  <small>
                    <ManaPips colors={rowDeck.colors} />
                  </small>
                </th>
                {decks.map((colDeck) => {
                  if (rowDeck.name === colDeck.name) {
                    return (
                      <td key={cellKey(rowDeck.name, colDeck.name)} className="matrix-cell matrix-mirror">
                        --
                      </td>
                    );
                  }

                  const cell: DeckMatchupCell | undefined = matrix[rowDeck.name]?.[colDeck.name];
                  if (!cell || cell.matches === 0) {
                    return <td key={cellKey(rowDeck.name, colDeck.name)} className="matrix-cell matrix-empty" />;
                  }

                  const toneClass = getCellTone(cell.winPercent);

                  return (
                    <td key={cellKey(rowDeck.name, colDeck.name)} className={`matrix-cell ${toneClass}`}>
                      <div className="matrix-value">{cell.winPercent.toFixed(0)}%</div>
                      <div className="matrix-meta">{cell.matches} matches</div>
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

export default WinratesPage;
