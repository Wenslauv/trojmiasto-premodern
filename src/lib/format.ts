import type { RecordStat } from '../types';

export function formatRecord(record?: RecordStat): string {
  if (!record) return '-';
  return `${record.wins}-${record.losses}-${record.draws}`;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return dateFormatter.format(parsed);
}
