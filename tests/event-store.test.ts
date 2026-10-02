import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assertNotImportedTwice, eventIdFor, findSameDayEvent } from '../scripts/lib/event-store.mjs';

const existing = [
  { id: '20260921-sidequest-weekly', name: 'SideQuest weekly', date: '2026-09-21', place: 'SideQuest', type: 'weekly' },
];

describe('same-day import guard', () => {
  test('finds an event with the same date, place and type', () => {
    const incoming = { id: '20260921-sidequest-weekly-2', name: 'SideQuest weekly', date: '2026-09-21', place: 'SideQuest', type: 'weekly' };
    assert.equal(findSameDayEvent(existing, incoming)?.id, '20260921-sidequest-weekly');
    assert.throws(() => assertNotImportedTwice(existing, incoming, false), /--allow-same-day/);
    assert.doesNotThrow(() => assertNotImportedTwice(existing, incoming, true));
  });

  test('allows other places and other dates', () => {
    const otherPlace = { id: 'x', name: 'Futurex monthly', date: '2026-09-21', place: 'Futurex', type: 'monthly' };
    const otherDate = { id: 'y', name: 'SideQuest weekly', date: '2026-09-28', place: 'SideQuest', type: 'weekly' };
    assert.equal(findSameDayEvent(existing, otherPlace), undefined);
    assert.equal(findSameDayEvent(existing, otherDate), undefined);
  });
});

describe('event ids', () => {
  test('are built from date, place and type', () => {
    assert.equal(eventIdFor({ date: '2026-10-05', place: 'Futurex', type: 'monthly' }, []), '2026-10-05-futurex-monthly');
  });

  test('get a suffix when another event already has the id', () => {
    const taken = ['2026-09-21-sidequest-weekly', '2026-09-21-sidequest-weekly-2'];
    assert.equal(eventIdFor({ date: '2026-09-21', place: 'SideQuest', type: 'weekly' }, taken), '2026-09-21-sidequest-weekly-3');
  });

  test('fall back to the name without place and type', () => {
    assert.equal(eventIdFor({ date: '2026-10-05', name: 'Premodern Open' }, []), '2026-10-05-premodern-open');
  });
});
