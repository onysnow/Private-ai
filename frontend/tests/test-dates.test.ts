import {describe, expect, it} from 'vitest';

import {dateWords} from '../lib/dates';

describe('dateWords', () => {
  it('says a date at the precision it is known to', () => {
    expect(dateWords('2023-10-03', 'day')).toBe('3 Oct 2023');
    expect(dateWords('2023-10', 'month')).toBe('Oct 2023');
    expect(dateWords('2023', 'year')).toBe('2023');
    expect(dateWords('2023-10-03', 'before')).toBe('before 3 Oct 2023');
  });

  it('never invents a day or month the stored value does not hold', () => {
    // A range stored as years: "2009 to 2013", not "1 Jan 2009 to 1 Jan 2013".
    expect(dateWords('2009', 'range')).toBe('2009');
    expect(dateWords('2013-04', 'range')).toBe('Apr 2013');
    expect(dateWords('2011-05-20', 'range')).toBe('20 May 2011');
    expect(dateWords('2014', 'estimated')).toBe('about 2014');
    expect(dateWords('2014-06')).toBe('Jun 2014');
  });

  it('writes September as "Sep", as every other month is three letters (the browser\'s en-GB says "Sept")', () => {
    expect(dateWords('2018-09')).toBe('Sep 2018');
    expect(dateWords('2018-09-04')).toBe('4 Sep 2018');
  });
});
