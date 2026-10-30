// Times from the API are UTC, often without an offset (backend Timestamp); they must not be read as local time.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {apiTime, compactDay, shortStamp, timeDayWords, timeWords, utcStamp} from '../lib/timestamps';

const zone = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });   // UTC-4 in October
afterAll(() => { process.env.TZ = zone; });

describe('API times', () => {
  it('reads a time without an offset as UTC', () => {
    expect(apiTime('2026-10-10T14:02:00').toISOString()).toBe('2026-10-10T14:02:00.000Z');
    expect(apiTime('2026-10-10T14:02:00.123456').toISOString()).toBe('2026-10-10T14:02:00.123Z');
    expect(apiTime('2026-10-10T14:02:00Z').toISOString()).toBe('2026-10-10T14:02:00.000Z');
    expect(apiTime('2026-10-10T16:02:00+02:00').toISOString()).toBe('2026-10-10T14:02:00.000Z');
  });

  it('shows it in the reader\'s own time', () => {
    expect(shortStamp('2026-10-10T14:02:00')).toBe('2026-10-10 10:02');
    expect(shortStamp('not a time')).toBe('not a time');
  });

  it('writes a time the one way every screen does: day, short month, year, then the reader\'s clock', () => {
    expect(timeWords('2026-10-10T14:02:00')).toBe('10 Oct 2026, 10:02');
    expect(timeWords('2026-09-03T02:30:00Z')).toBe('2 Sep 2026, 22:30');   // never "Sept", and the day is the reader's
    expect(timeDayWords('2026-09-03T02:30:00')).toBe('2 Sep 2026');
    expect(timeWords('not a time')).toBe('not a time');
  });

  it('drops the year in a narrow column only when it is this year, and then drops the day instead', () => {
    const now = new Date(2026, 9, 30);
    expect(compactDay('2026-10-10T14:02:00', now)).toBe('10 Oct');
    expect(compactDay('2025-09-10T14:02:00', now)).toBe('Sep 2025');
  });

  it('keeps a UTC provenance stamp in UTC', () => {
    expect(utcStamp('2026-10-10T14:02:31')).toBe('2026-10-10 14:02 UTC');
  });
});
