import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { colorSortKey, sortRows } from '../src/lib/sort.ts';

type Row = { id: string; value: string | number | null };
const ids = (rows: Row[]) => rows.map((row) => row.id);
const byValue = (row: Row) => row.value;

describe('sortRows', () => {
  const rows: Row[] = [
    { id: 'a', value: 50 },
    { id: 'b', value: null },
    { id: 'c', value: 75 },
    { id: 'd', value: 50 },
  ];

  test('sorts numbers in both directions and keeps empty values last', () => {
    assert.deepEqual(ids(sortRows(rows, byValue, 'asc')), ['a', 'd', 'c', 'b']);
    assert.deepEqual(ids(sortRows(rows, byValue, 'desc')), ['c', 'a', 'd', 'b']);
  });

  test('keeps the incoming order for equal values', () => {
    const reversed = [...rows].reverse();
    assert.deepEqual(ids(sortRows(reversed, byValue, 'desc')), ['c', 'd', 'a', 'b']);
  });

  test('does not change the input array', () => {
    const copy = [...rows];
    sortRows(rows, byValue, 'asc');
    assert.deepEqual(rows, copy);
  });

  test('sorts names alphabetically with Polish letters in place', () => {
    const names: Row[] = ['Łukasz', 'Zenon', 'Adam', 'Ćwikliński', 'Lech', 'Cezary'].map((name) => ({ id: name, value: name }));
    assert.deepEqual(ids(sortRows(names, byValue, 'asc')), ['Adam', 'Cezary', 'Ćwikliński', 'Lech', 'Łukasz', 'Zenon']);
  });
});

describe('colorSortKey', () => {
  test('orders by number of colors, then WUBRG', () => {
    const colors = ['UR', 'G', 'W', 'GWUR', 'BRG', 'UW', 'B'];
    const sorted = sortRows(
      colors.map((c) => ({ id: c, value: colorSortKey(c) })),
      byValue,
      'asc',
    );
    assert.deepEqual(ids(sorted), ['W', 'B', 'G', 'UW', 'UR', 'BRG', 'GWUR']);
  });

  test('treats a splash as a color and ignores letter order', () => {
    assert.equal(colorSortKey('GWru'), colorSortKey('WURG'));
  });

  test('returns null when there are no colors', () => {
    assert.equal(colorSortKey(''), null);
    assert.equal(colorSortKey('?'), null);
  });
});
