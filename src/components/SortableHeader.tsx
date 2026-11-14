import type { TableSort } from '../lib/useTableSort';

type Props<K extends string> = {
  column: K;
  label: string;
  sort: TableSort<K>;
  onSort: (column: K) => void;
};

// Table header cell that sorts by its column on click; the button keeps it usable from the keyboard.
function SortableHeader<K extends string>({ column, label, sort, onSort }: Props<K>) {
  const active = sort.column === column;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <th aria-sort={ariaSort} className={active ? 'sorted' : undefined}>
      <button type="button" className="sort-btn" onClick={() => onSort(column)}>
        {label}
        <span className="sort-indicator" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export default SortableHeader;
