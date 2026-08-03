const MINUTE_MS = 60_000;

interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

function parseField(source: string, minimum: number, maximum: number, sunday = false): CronField {
  const values = new Set<number>();
  const wildcard = source === '*';
  for (const segment of source.split(',')) {
    const [rangeSource, stepSource] = segment.split('/');
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step <= 0) throw new Error('CRON_FIELD_INVALID');
    let start: number;
    let end: number;
    if (rangeSource === '*') {
      start = minimum;
      end = maximum;
    } else if (rangeSource?.includes('-')) {
      const parts = rangeSource.split('-').map(Number);
      if (parts.length !== 2) throw new Error('CRON_FIELD_INVALID');
      [start, end] = parts as [number, number];
    } else {
      start = Number(rangeSource);
      end = start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minimum || end > maximum || start > end) {
      throw new Error('CRON_FIELD_INVALID');
    }
    for (let value = start; value <= end; value += step) values.add(sunday && value === 7 ? 0 : value);
  }
  return { values, wildcard };
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('CRON_EXPRESSION_MUST_HAVE_FIVE_FIELDS');
  return {
    minute: parseField(fields[0] as string, 0, 59),
    hour: parseField(fields[1] as string, 0, 23),
    dayOfMonth: parseField(fields[2] as string, 1, 31),
    month: parseField(fields[3] as string, 1, 12),
    dayOfWeek: parseField(fields[4] as string, 0, 7, true)
  };
}

export function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error('IANA_TIMEZONE_INVALID');
  }
}

function localParts(date: Date, timeZone: string): { minute: number; hour: number; day: number; month: number; year: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false, year: 'numeric',
    minute: '2-digit', hour: '2-digit', day: '2-digit', month: '2-digit', weekday: 'short'
  }).formatToParts(date);
  const value = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: Number(value('minute')),
    hour: Number(value('hour')) % 24,
    day: Number(value('day')),
    month: Number(value('month')),
    year: Number(value('year')),
    weekday: weekdays[value('weekday')] as number
  };
}

function localMinuteKey(date: Date, timeZone: string): string {
  const local = localParts(date, timeZone);
  return `${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}`;
}

export function cronMatches(parsed: ParsedCron, date: Date, timeZone: string): boolean {
  const local = localParts(date, timeZone);
  const dom = parsed.dayOfMonth.values.has(local.day);
  const dow = parsed.dayOfWeek.values.has(local.weekday);
  const dayMatches = parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard
    ? true
    : parsed.dayOfMonth.wildcard ? dow
      : parsed.dayOfWeek.wildcard ? dom
        : dom || dow;
  return parsed.minute.values.has(local.minute)
    && parsed.hour.values.has(local.hour)
    && parsed.month.values.has(local.month)
    && dayMatches;
}

export function nextCronOccurrence(expression: string, timeZone: string, after: Date): Date {
  validateTimeZone(timeZone);
  const parsed = parseCron(expression);
  const start = Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limit = start + 366 * 24 * 60 * MINUTE_MS;
  const priorLocalMinute = localMinuteKey(after, timeZone);
  for (let time = start; time <= limit; time += MINUTE_MS) {
    const candidate = new Date(time);
    if (cronMatches(parsed, candidate, timeZone) && localMinuteKey(candidate, timeZone) !== priorLocalMinute) return candidate;
  }
  throw new Error('CRON_OCCURRENCE_NOT_FOUND_WITHIN_ONE_YEAR');
}
