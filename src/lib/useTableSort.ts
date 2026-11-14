import { useSearchParams } from 'react-router-dom';
import type { SortDirection } from './sort';

export type TableSort<K extends string> = { column: K; direction: SortDirection };

// Sort state of a table, kept in the URL (?sort=<column>&dir=asc|desc) so it survives
// going to a detail page and back. `firstDirection` is the direction a column gets on its
// first click (text columns usually 'asc', numbers 'desc'); a second click reverses it.
// The default sort is not written to the URL.
export function useTableSort<K extends string>(firstDirection: Record<K, SortDirection>, defaultSort: TableSort<K>) {
  const [searchParams, setSearchParams] = useSearchParams();

  const column = searchParams.get('sort');
  const direction = searchParams.get('dir');
  const sort: TableSort<K> =
    column !== null &&
    Object.prototype.hasOwnProperty.call(firstDirection, column) &&
    (direction === 'asc' || direction === 'desc')
      ? { column: column as K, direction }
      : defaultSort;

  function toggle(next: K) {
    const nextSort: TableSort<K> =
      next === sort.column
        ? { column: next, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { column: next, direction: firstDirection[next] };

    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (nextSort.column === defaultSort.column && nextSort.direction === defaultSort.direction) {
          params.delete('sort');
          params.delete('dir');
        } else {
          params.set('sort', nextSort.column);
          params.set('dir', nextSort.direction);
        }
        return params;
      },
      { replace: true },
    );
  }

  return { sort, toggle };
}
