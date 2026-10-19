// Links & captures (mockup INTAKE_3; features/captures/format.ts): the words and shapes the screen uses.
import {beforeAll, describe, expect, it} from 'vitest';

import {addressOf, badgeOf, bytesWords, checkWords, displayedDate, hostOf, linksIn, resultWords, shortHash, utcWords} from '../features/captures/format';

beforeAll(() => { process.env.TZ = 'UTC'; });

describe('linksIn', () => {
  it('takes one or many web addresses, one to a line', () => {
    expect(linksIn('https://a.example/x')).toEqual(['https://a.example/x']);
    expect(linksIn('  https://a.example/x \r\n\nhttp://b.example  ')).toEqual(['https://a.example/x', 'http://b.example']);
  });
  it('leaves text that only mentions a link as text', () => {
    expect(linksIn('See https://a.example/x for the sale')).toEqual([]);
    expect(linksIn('https://a.example/x\nand a note')).toEqual([]);
    expect(linksIn('ftp://a.example/x')).toEqual([]);
    expect(linksIn('   ')).toEqual([]);
  });
});

describe('times and sizes', () => {
  it('shows a capture time as UTC, with the seconds, whatever the computer’s zone', () => {
    expect(utcWords('2026-10-19T10:14:09')).toBe('19 Oct 2026 10:14:09 UTC');
    expect(utcWords('2026-10-19T10:14:09', false)).toBe('19 Oct 2026 10:14 UTC');
    expect(utcWords('2026-01-05T23:59:59Z')).toBe('5 Jan 2026 23:59:59 UTC');
    expect(utcWords(null)).toBe('');
  });
  it('shows a displayed date in words when it is a full date and time, else as the page wrote it', () => {
    expect(displayedDate('2019-03-18T09:12:00Z')).toBe('18 Mar 2019 09:12 UTC');
    expect(displayedDate('18 March 2019')).toBe('18 March 2019');
  });
  it('writes sizes and fingerprints short', () => {
    expect(bytesWords(900)).toBe('900 B');
    expect(bytesWords(186 * 1024)).toBe('186 KB');
    expect(bytesWords(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(shortHash('a3f907c25b81d4e6ffffffff9c2a5d1e')).toBe('a3f9 07c2 5b81 d4e6 …9c2a 5d1e');
    expect(shortHash(null)).toBe('');
    expect(hostOf('https://www.marlow.example/2019/03/x')).toBe('www.marlow.example');
    expect(hostOf('not a url')).toBe('not a url');
    expect(addressOf('https://www.marlow.example/2019/03/sale?utm=1')).toBe('www.marlow.example/2019/03/sale');
    expect(addressOf('https://www.marlow.example/')).toBe('www.marlow.example');
  });
});

describe('what a capture is called', () => {
  it('uses a word and a mark as well as a colour for every outcome', () => {
    expect(badgeOf({outcome: 'saved'})).toEqual({word: 'Saved', tone: 'good', mark: '✓'});
    expect(badgeOf({outcome: 'saved', change: 'same'}).word).toBe('Saved');
    expect(badgeOf({outcome: 'saved', change: 'changed'})).toEqual({word: 'Changed since capture', tone: 'warn', mark: '△'});
    expect(badgeOf({outcome: 'saved', change: 'gone'}).word).toBe('Gone');
    expect(badgeOf({outcome: 'link_only'}).word).toBe('Link only');
    expect(badgeOf({outcome: 'not_seen'}).word).toBe('Not seen');
    expect(badgeOf({outcome: 'failed'}).word).toBe('Not saved');
  });
  it('says what each re-check found', () => {
    expect(checkWords({state: 'same', at: '2026-10-20T10:00:00'})).toBe('Same text · 20 Oct 2026 10:00 UTC');
    expect(checkWords({state: 'changed', at: '2026-10-20T10:00:00'})).toMatch(/^Changed: a new copy was kept/);
    expect(checkWords({state: 'gone', at: '2026-10-20T10:00:00'})).toMatch(/saved copy is kept/);
    expect(checkWords({state: 'unreachable', at: '2026-10-20T10:00:00'})).toMatch(/^Could not be reached/);
  });
  it('answers each result in a sentence, and says nothing for a plain new capture', () => {
    expect(resultWords('already_in_case', 'Harbour parcel')).toBe('Already in the case as “Harbour parcel” · same fingerprint. Nothing new was saved.');
    expect(resultWords('changed', null)).toMatch(/^this page has changed/);
    expect(resultWords('gone', 'X')).toMatch(/no longer there/);
    expect(resultWords('new', 'X')).toBe('');
  });
});
