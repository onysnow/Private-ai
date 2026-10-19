// Times from the API are UTC, often without an offset (backend Timestamp); they must not be read as local time.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {apiTime, shortStamp} from '../lib/timestamps';

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
});
