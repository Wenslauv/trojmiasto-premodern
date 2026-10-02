import type { MouseEvent } from 'react';

// A whole table row is clickable with the mouse; keyboard and screen reader users
// use the real links inside the row, so clicks on those links are left to them.
export function rowClick(go: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    go();
  };
}
