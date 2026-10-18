// Where the network's parties sit (lib/network-arrange.ts, lib/network-rules.ts):
// each arrangement follows its stated rule, no two parties' boxes (dot and
// name) overlap in any of them, and the arrangement chosen fits the links.
import {describe, expect, it} from 'vitest';

import {arrange, arrangeAround, arrangeByKind, arrangeControl} from '../lib/network-arrange';
import {MAX_RADIUS, chooseArrangement, dotRadius, mostLinked, nameLines, partyBox, ruleOf} from '../lib/network-rules';
import type {ArrLink, ArrParty, Arrangement} from '../lib/network-rules';

const P = (id: string, label: string, kind: ArrParty['kind'] = 'company'): ArrParty => ({id, label, kind});
const L = (id: string, from: string, to: string, control = false): ArrLink => ({id, from, to, control});

// The eleven parties and fifteen links of the network Ony sent a picture of.
const parties = [P('bel', 'Bellcastle Trading Group'), P('mer', 'Meridian Holdings Ltd'), P('orr', 'Orrin Shipping SA'), P('lim', 'Limassol Nominees'),
  P('ala', 'Alaric Voss', 'person'), P('cob', 'Cobalt Freight'), P('har', 'Harborline Civic Trust', 'organisation'), P('jan', 'Jane Doe', 'person'),
  P('nor', 'Northgate Partners'), P('pri', 'Priya Kavanagh', 'person'), P('ves', 'MV Fair Tern', 'vehicle')];
const links = [L('1', 'bel', 'mer', true), L('2', 'lim', 'bel', true), L('3', 'lim', 'orr', true), L('4', 'nor', 'lim', true), L('5', 'orr', 'ves', true),
  L('6', 'ala', 'bel', true), L('7', 'ala', 'cob', true), L('8', 'jan', 'mer', true), L('9', 'jan', 'nor', true), L('10', 'pri', 'har', true),
  L('11', 'mer', 'bel'), L('12', 'mer', 'orr'), L('13', 'cob', 'orr'), L('14', 'har', 'mer'), L('15', 'jan', 'pri')];

/** Every pair of party boxes (dot on top, two lines of name under it) is apart. */
function noOverlaps(positions: Record<string, {x: number; y: number}>): void {
  const boxes = parties.map(p => {
    const box = partyBox(p.label), at = positions[p.id];
    return {id: p.id, x0: at.x - box.width / 2, x1: at.x + box.width / 2, y0: at.y - MAX_RADIUS - 2, y1: at.y - MAX_RADIUS - 2 + box.height};
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlap = a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
      expect(overlap, `${a.id} and ${b.id} overlap`).toBe(false);
    }
  }
}

describe('every arrangement', () => {
  it.each<Arrangement>(['control', 'around', 'kind', 'clusters'])('%s places every party with no two boxes overlapping', arrangement => {
    const placed = arrange(arrangement, parties, links, {focus: 'mer'});
    expect(Object.keys(placed.positions).sort()).toEqual(parties.map(p => p.id).sort());
    noOverlaps(placed.positions);
    for (const p of Object.values(placed.positions)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(placed.width);
      expect(p.y).toBeLessThanOrEqual(placed.height);
    }
  });

  it('gives the same places for the same records', () => {
    for (const arrangement of ['control', 'around', 'kind', 'clusters'] as Arrangement[]) {
      expect(arrange(arrangement, parties, links, {focus: 'mer'})).toEqual(arrange(arrangement, parties, links, {focus: 'mer'}));
    }
  });
});

describe('who controls whom', () => {
  it('puts every owner or director above what it owns or directs, in labelled levels', () => {
    const placed = arrangeControl(parties, links);
    for (const l of links.filter(x => x.control)) expect(placed.positions[l.from].y, `${l.from} above ${l.to}`).toBeLessThan(placed.positions[l.to].y);
    const labels = placed.guides.map(g => g.label);
    expect(labels[0]).toBe('Top of the chain');
    expect(labels).toContain('1 step down');
  });

  it('puts parties in no ownership or directorship in a band of their own', () => {
    const placed = arrangeControl([...parties, P('x', 'Unlinked Co')], [...links, L('16', 'x', 'mer')]);
    const band = placed.guides.find(g => g.label === 'In no ownership or directorship');
    expect(band).toBeDefined();
    if (band?.type === 'band') {
      expect(placed.positions.x.y).toBeGreaterThan(band.y0);
      expect(placed.positions.x.y).toBeLessThan(band.y1);
    }
  });
});

describe('around a party', () => {
  it('centres the party and puts each one ring further for each link further away', () => {
    const placed = arrangeAround(parties, links, 'mer');
    const centre = placed.positions.mer;
    const distance = (id: string) => Math.hypot(placed.positions[id].x - centre.x, placed.positions[id].y - centre.y);
    // One link from Meridian: Bellcastle, Orrin, Harborline, Jane. Two: Limassol, Alaric, Cobalt, Priya, Northgate, MV Fair Tern.
    const one = ['bel', 'orr', 'har', 'jan'].map(distance), two = ['lim', 'ala', 'cob', 'pri', 'nor', 'ves'].map(distance);
    expect(Math.max(...one)).toBeLessThan(Math.min(...two));
    expect(new Set(one.map(Math.round)).size).toBe(1);                 // one ring
    expect(placed.guides.map(g => g.label)).toEqual(['1 link away', '2 links away']);
  });

  it('puts parties no link reaches in a band under the rings', () => {
    const placed = arrangeAround([...parties, P('x', 'Unlinked Co')], links, 'mer');
    expect(placed.guides.some(g => g.label === 'Not linked to Meridian Holdings Ltd')).toBe(true);
  });
});

describe('by kind', () => {
  it('gives each kind a column, most-linked at the top', () => {
    const placed = arrangeByKind(parties, links);
    expect(placed.guides.map(g => g.label)).toEqual(['People', 'Companies', 'Organisations', 'Vessels and vehicles']);
    const companies = parties.filter(p => p.kind === 'company').map(p => placed.positions[p.id]);
    expect(new Set(companies.map(p => p.x)).size).toBe(1);
    // Meridian (5 links) above Northgate (2 links).
    expect(placed.positions.mer.y).toBeLessThan(placed.positions.nor.y);
  });
});

describe('the rules', () => {
  it('chooses the arrangement the links call for, and says why', () => {
    expect(chooseArrangement(parties, links)).toEqual({arrangement: 'control', why: 'Chosen because 10 of the 15 links here say who owns or directs whom.'});
    expect(chooseArrangement(parties, links.map(l => ({...l, control: false}))).arrangement).toBe('kind');
    expect(chooseArrangement([P('a', 'A'), P('b', 'B')], [L('1', 'a', 'b')]).arrangement).toBe('clusters');
    expect(chooseArrangement(parties, links, 'jan').arrangement).toBe('around');
    expect(ruleOf('around', 'Jane Doe').label).toBe('Arranged around Jane Doe:');
    expect(mostLinked(parties, links)).toBe('mer');
  });

  it('wraps a name onto two lines between words, and ends a longer one with an ellipsis', () => {
    expect(nameLines('Jane Doe')).toEqual(['Jane Doe']);
    expect(nameLines('Bellcastle Trading Group')).toEqual(['Bellcastle Trading', 'Group']);
    const long = nameLines('The Very Long Name Of A Holding Company Registered Abroad');
    expect(long).toHaveLength(2);
    expect(long[0]).toBe('The Very Long Name');
    expect(long[1].endsWith('…')).toBe(true);
    expect(long[1].length).toBeLessThanOrEqual(20);
  });

  it('grows a dot\'s area with its links, up to a cap', () => {
    expect(dotRadius(1)).toBe(11);
    expect(dotRadius(5)).toBeGreaterThan(dotRadius(2));
    expect(dotRadius(500)).toBe(MAX_RADIUS);
  });
});
