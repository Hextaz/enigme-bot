import config = require('../config');

// Virtual clock of the dev bot (/dev horloge): kept in memory only, lost on restart.
let offsetMs = 0;

/** Current game time: real time, shifted by the dev offset. Every game rule reads time through it. */
export function gameNow(): Date { return new Date(Date.now() + offsetMs); }

/** Game time of a real event (e.g. a Discord message timestamp). */
export function toGameTime(date: Date): Date { return new Date(date.getTime() + offsetMs); }

export function devClockOffset(): number { return offsetMs; }

export function setDevClock(target: Date): void {
  if (!config.devMode) throw new Error("L'horloge virtuelle n'est disponible qu'avec DEV_MODE=1.");
  offsetMs = target.getTime() - Date.now();
}

export function resetDevClock(): void { offsetMs = 0; }
