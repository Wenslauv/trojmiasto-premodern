// Pure helpers for sortable tables; kept free of React so they can be tested with node --test.

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | null;

const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

// Sorts rows by one column. Rows without a value (null) stay at the bottom in both directions;
// rows with equal values keep their incoming order, so the incoming order acts as the tie-breaker.
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return sign * compareValues(a, b);
  });
}

const COLOR_ORDER = 'WUBRG';

// Sort key for a color string such as "UR" or "GWru": fewer colors first, then WUBRG order
// (W, U, B, R, G, WU, WB, ...). Splash (lowercase) counts as a color; null when there are no colors.
export function colorSortKey(colors: string): string | null {
  const indexes = [...new Set(colors.toUpperCase().split(''))]
    .map((char) => COLOR_ORDER.indexOf(char))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indexes.length === 0) return null;
  return `${indexes.length}${indexes.join('')}`;
}
