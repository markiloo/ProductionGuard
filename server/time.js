const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Return true for a real calendar date in YYYY-MM-DD form. */
export function isValidDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Add whole days to a YYYY-MM-DD date and return the new date. */
export function addDays(date, days) {
  if (!isValidDate(date) || !Number.isInteger(Number(days))) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Count calendar days from one date to another; negative when `to` is earlier. */
export function daysBetween(from, to) {
  if (!isValidDate(from) || !isValidDate(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

/** Today's calendar date in the plant time zone. */
export function plantToday(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Validate an IANA time zone, falling back to the PC's zone. */
export function resolveTimeZone(value) {
  const candidate = String(value || '').trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: candidate });
      return candidate;
    } catch { /* Fall through to the system zone. */ }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Read the stored plant time zone, defaulting to the PC's zone. */
export function getPlantTimeZone(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'plant_timezone'").get();
  return resolveTimeZone(row?.value);
}

/** Persist the plant time zone. */
export function setPlantTimeZone(db, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES('plant_timezone',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
  return value;
}
