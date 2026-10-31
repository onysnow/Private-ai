// @vitest-environment jsdom
// Screens stay mounted once opened and are only hidden; their key handlers check onScreen first (code review 18 Oct).
import {describe, expect, it} from 'vitest';

import {dialogOpen, layerAbove, onScreen, typingInto} from '../lib/on-screen';

describe('onScreen and typingInto', () => {
  it('is false inside anything hidden and once removed from the page', () => {
    document.body.innerHTML = '<div id="stage"><section id="tab"><p id="inner"></p></section></div>';
    const inner = document.getElementById('inner');
    expect(onScreen(inner)).toBe(true);
    document.getElementById('tab')!.hidden = true;
    expect(onScreen(inner)).toBe(false);
    document.getElementById('tab')!.hidden = false;
    document.getElementById('stage')!.hidden = true;
    expect(onScreen(inner)).toBe(false);
    const gone = document.createElement('p');
    expect(onScreen(gone)).toBe(false);
    expect(onScreen(null)).toBe(false);
  });

  it('knows fields, list boxes and rich text', () => {
    document.body.innerHTML = '<input id="i"><select id="s"></select><div contenteditable="true"><b id="r">x</b></div><button id="b"></button>';
    for (const id of ['i', 's', 'r']) expect(typingInto(document.getElementById(id))).toBe(true);
    expect(typingInto(document.getElementById('b'))).toBe(false);
  });

  it('does not count a dialog left open inside a hidden screen as a layer', () => {
    document.body.innerHTML = '<section id="s" hidden><aside role="dialog">old drawer</aside></section><aside data-layer="" id="slot"></aside>';
    const slot = document.getElementById('slot');
    expect(layerAbove(slot)).toBe(false);
    expect(dialogOpen()).toBe(false);
    document.getElementById('s')!.hidden = false;
    expect(layerAbove(slot)).toBe(true);
    expect(dialogOpen()).toBe(true);
  });
});
