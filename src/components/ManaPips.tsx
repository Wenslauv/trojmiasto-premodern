const MANA_LETTERS = new Set(['W', 'U', 'B', 'R', 'G']);

function ManaPips({ colors }: { colors: string }) {
  if (!colors) return null;
  if (colors === '?') return <span className="mana-unknown">?</span>;

  const chars = colors.split('').filter((char) => MANA_LETTERS.has(char.toUpperCase()));
  if (chars.length === 0) return <span className="mana-unknown">{colors}</span>;

  return (
    <span className="mana-pips">
      {chars.map((char, index) => {
        const upper = char.toUpperCase();
        const isSplash = char !== upper;
        return (
          <span
            key={`${upper}-${index}`}
            className={`mana-pip mana-${upper.toLowerCase()}${isSplash ? ' mana-pip-splash' : ''}`}
            title={isSplash ? `${upper} (splash)` : upper}
          />
        );
      })}
    </span>
  );
}

export default ManaPips;
