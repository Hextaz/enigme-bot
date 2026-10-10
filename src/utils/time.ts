const ZONE = 'Europe/Paris';
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ParisClock { weekday: number; hour: number; minute: number }

/** Game days follow Paris time, whatever the host time zone. weekday: 0 = Sunday. */
export function parisClock(now: Date = new Date()): ParisClock {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { weekday: weekdays.indexOf(value('weekday')), hour: Number(value('hour')), minute: Number(value('minute')) };
}

/** Epoch milliseconds of today's `hour`:00 in Paris. */
export function parisTodayAt(hour: number, now: Date = new Date()): number {
  const { hour: currentHour, minute } = parisClock(now);
  const startOfMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  return startOfMinute - (currentHour * 60 + minute) * 60_000 + hour * 3_600_000;
}
