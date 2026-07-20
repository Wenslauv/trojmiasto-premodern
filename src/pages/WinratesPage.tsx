import { useEffect, useState } from 'react';
import { getMatchups } from '../lib/data';
import type { DeckMatchupCell, DeckMatchupDeck, DeckMatchupMatrix } from '../types';

function getCellTone(value: number): string {
  if (value >= 55) return 'winrates-good';
  if (value <= 45) return 'winrates-bad';
  return 'winrates-neutral';
}

function deckIconPath(deck: DeckMatchupDeck): string {
  return `${import.meta.env.BASE_URL}icons/decks/${deck.slug}.png`;
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
  const [data, setData] = useState<DeckMatchupMatrix | null>(null);
  const [error, setError] = useState('');
  const [iconBroken, setIconBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    getMatchups().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p>{error}</p>;
  if (!data) return <p>Loading...</p>;

  const { decks, matrix } = data;

  return (
    <section>
      <div className="matrix-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">Deck vs Deck</th>
              {decks.map((deck) => {
                const iconSrc = deckIconPath(deck);
                const broken = iconBroken.has(iconSrc);
                return (
                  <th key={deck.name} className="matrix-col-head">
                    {!broken ? (
                      <img
                        className="deck-icon"
                        src={iconSrc}
                        alt={`${deck.name} icon`}
                        width={36}
                        height={36}
                        onError={() => setIconBroken((prev) => new Set(prev).add(iconSrc))}
                      />
                    ) : (
                      <span className="deck-icon-fallback">{deckInitials(deck.name)}</span>
                    )}
                    <span>{deck.name}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {decks.map((rowDeck) => (
              <tr key={rowDeck.name}>
                <th className="matrix-row-head">
                  <span>{rowDeck.name}</span>
                  <small>{rowDeck.colors}</small>
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
