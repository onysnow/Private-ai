// @vitest-environment jsdom
// What the browser keeps for a case (lib/case-browser-data.ts): gone with the case; the names looked up gone on lock.
import {beforeEach, describe, expect, it} from 'vitest';

import {forgetCase, forgetOnLock} from '../lib/case-browser-data';

beforeEach(() => window.localStorage.clear());

describe('case data in this browser', () => {
  it('removes every per-case key, and only that case, when the case is deleted', () => {
    const s = window.localStorage;
    for (const id of ['inv-1', 'inv-2']) {
      s.setItem(`workbench.your-safety.${id}`, '{"plan":{"who":"my editor"}}');
      s.setItem(`sv-recent:${id}`, '[{"q":"Fernhill"}]');
      s.setItem(`ir-last:${id}`, 'chk-1');
      s.setItem(`wl-looked:${id}`, '{}');
      s.setItem(`pai:last-visit:${id}`, '2026-10-30');
      s.setItem(`pai:flags-visit:${id}`, '2026-10-30');
    }
    s.setItem('pai:case-places', JSON.stringify({'inv-1': {href: '/x', label: 'X'}, 'inv-2': {href: '/y', label: 'Y'}}));
    forgetCase('inv-1');
    expect(Object.keys(s).filter(k => k.includes('inv-1'))).toEqual([]);
    expect(Object.keys(s).filter(k => k.includes('inv-2'))).toHaveLength(6);
    expect(JSON.parse(s.getItem('pai:case-places')!)).toEqual({'inv-2': {href: '/y', label: 'Y'}});
  });

  it('removes recent searches and the last check of every case on lock, and keeps the safety plan', () => {
    const s = window.localStorage;
    s.setItem('sv-recent:inv-1', '[]'); s.setItem('sv-recent:all', '[]'); s.setItem('ir-last:inv-2', 'x');
    s.setItem('workbench.your-safety.inv-1', '{}');
    forgetOnLock();
    expect(Object.keys(s)).toEqual(['workbench.your-safety.inv-1']);
  });
});
