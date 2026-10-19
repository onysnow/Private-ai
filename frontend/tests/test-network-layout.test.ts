// Where a network's parties sit and what rule 18 asks of the drawing
// (lib/network-layout.ts): the same records give the same picture, groups
// are packed and spaced so names do not meet, crossing links are counted, and
// the connection grid keeps each link's direction.
import {describe, expect, it} from 'vitest';

import {GAP_PX, connectionGrid, countCrossings, layoutNetwork, networkGraph, noverlapGrid, packRows, segmentsCross, turnLevel} from '../lib/network-layout';
import type {NetworkLink, NetworkNode} from '../lib/network-layout';

const node = (id: string, label = id): NetworkNode => ({id, label});
const link = (id: string, from: string, to: string): NetworkLink => ({id, from, to, label: 'owns'});

describe('layoutNetwork', () => {
  it('gives the same places for the same records, in any order', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
    const links = [link('1', 'a', 'b'), link('2', 'b', 'c'), link('3', 'c', 'a'), link('4', 'd', 'e')];
    const first = layoutNetwork(networkGraph(nodes, links));
    const again = layoutNetwork(networkGraph([...nodes].reverse(), [...links].reverse()));
    expect(again).toEqual(first);
    expect(Object.keys(first).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(Object.values(first).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('packs unlinked groups side by side, turns each level, and keeps every footprint clear of the others', () => {
    // A chain of five running top to bottom, and a pair on its own.
    const nodes = ['a', 'b', 'c', 'd', 'e', 'p', 'q'].map(id => node(id));
    const links = [link('1', 'a', 'b'), link('2', 'b', 'c'), link('3', 'c', 'd'), link('4', 'd', 'e'), link('5', 'p', 'q')];
    const footprint = 30;
    const places = layoutNetwork(networkGraph(nodes, links), {aspect: 3, footprint: () => footprint});
    const ids = Object.keys(places);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [a, b] = [places[ids[i]], places[ids[j]]];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * footprint);
      }
    }
    // The chain is turned so it runs left to right: wider than it is tall.
    const chain = ['a', 'b', 'c', 'd', 'e'].map(id => places[id]);
    const spread = (axis: 'x' | 'y') => Math.max(...chain.map(p => p[axis])) - Math.min(...chain.map(p => p[axis]));
    expect(spread('x')).toBeGreaterThan(spread('y'));
    // The pair is packed one gap from the chain, not left far off as a
    // single ForceAtlas2 run leaves an unlinked group, and the whole drawing
    // keeps near the shape of its box (3:1).
    const all = Object.values(places);
    const width = Math.max(...all.map(p => p.x)) - Math.min(...all.map(p => p.x)) + 2 * footprint;
    const height = Math.max(...all.map(p => p.y)) - Math.min(...all.map(p => p.y)) + 2 * footprint;
    expect(width / height).toBeGreaterThan(1.5);
    expect(width / height).toBeLessThan(6);
    const chainBottom = Math.max(...chain.map(p => p.y)) + footprint;
    expect(Math.min(places.p.y, places.q.y) - footprint - chainBottom).toBeCloseTo(GAP_PX, 0);
  });

  it('turns a set of places so their longest spread is level', () => {
    const turned = turnLevel({a: {x: 0, y: 0}, b: {x: 1, y: 1}, c: {x: 2, y: 2}});
    expect(Math.abs(turned.a.y - turned.c.y)).toBeLessThan(1e-9);
    expect(Math.abs(turned.a.x - turned.c.x)).toBeCloseTo(2 * Math.SQRT2);
  });

  it('packs boxes in rows as wide as the shape asks', () => {
    const boxes = [{width: 100, height: 50}, {width: 100, height: 50}, {width: 100, height: 50}, {width: 100, height: 50}];
    const wide = packRows(boxes, 10);
    expect(new Set(wide.map(p => p.y)).size).toBe(1);               // one row
    const tall = packRows(boxes, 0.25);
    expect(new Set(tall.map(p => p.x)).size).toBe(1);               // one column
  });

  it('leaves out links to parties it does not hold, and links from a party to itself', () => {
    const graph = networkGraph([node('a'), node('b')], [link('1', 'a', 'b'), link('2', 'a', 'z'), link('3', 'a', 'a'), link('4', 'b', 'a')]);
    expect(graph.edges().sort()).toEqual(['1', '4']);
  });
});

describe('countCrossings', () => {
  it('counts links whose lines cross, never links that meet at a party', () => {
    expect(segmentsCross({x: 0, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}, {x: 2, y: 0})).toBe(true);
    expect(segmentsCross({x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}, {x: 3, y: 0})).toBe(false);
    const square = {a: {x: 0, y: 0}, b: {x: 2, y: 0}, c: {x: 2, y: 2}, d: {x: 0, y: 2}};
    // The two diagonals cross; the sides meet only at the corners.
    expect(countCrossings([link('1', 'a', 'c'), link('2', 'b', 'd'), link('3', 'a', 'b'), link('4', 'b', 'c')], square)).toBe(1);
  });
});

describe('connectionGrid', () => {
  it('puts the most-linked parties first, each link in the row it runs from and the column it runs to', () => {
    const nodes = [node('x', 'Orrin'), node('m', 'Meridian'), node('b', 'Bellcastle'), node('j', 'Jane')];
    const links = [link('1', 'm', 'b'), link('2', 'b', 'm'), link('3', 'm', 'x'), link('4', 'j', 'm'), link('5', 'm', 'b')];
    const grid = connectionGrid(nodes, links);
    expect(grid.parties.map(p => p.label)).toEqual(['Meridian', 'Bellcastle', 'Jane', 'Orrin']);
    const cell = (row: number, column: number) => grid.cells.find(c => c.row === row && c.column === column);
    expect(cell(0, 1)?.links.map(l => l.id)).toEqual(['1', '5']);   // Meridian -> Bellcastle, twice
    expect(cell(1, 0)?.links.map(l => l.id)).toEqual(['2']);        // Bellcastle -> Meridian
    expect(cell(2, 0)?.links.map(l => l.id)).toEqual(['4']);        // Jane -> Meridian ...
    expect(cell(0, 2)).toBeUndefined();                             // ... and not the other way
    expect(grid.cells).toHaveLength(4);
  });
});

describe('layoutNetwork for a big linked group', () => {
  it('compares pairs through a grid once a group is big, so a large case is laid out in bounded time', () => {
    expect(noverlapGrid(12)).toBe(1);                  // a small group: every pair compared, as before
    expect(noverlapGrid(150)).toBeGreaterThan(1);
    expect(noverlapGrid(5000)).toBe(24);               // bounded
    // A hub-heavy group of 120 parties, as a large case gives.
    const nodes = Array.from({length: 120}, (_, i) => node(`n${String(i).padStart(3, '0')}`));
    const links = nodes.slice(1).map((n, i) => link(`l${i}`, nodes[i % 7].id, n.id));
    const started = performance.now();
    const places = layoutNetwork(networkGraph(nodes, links), {footprint: () => 30});
    expect(performance.now() - started).toBeLessThan(5000);
    expect(Object.values(places).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(layoutNetwork(networkGraph(nodes, links), {footprint: () => 30})).toEqual(places);   // still the same picture each time
  });
});

describe('layoutNetwork in a tall box', () => {
  it('turns a chain to run down a box taller than it is wide', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
    const links = [link('1', 'a', 'b'), link('2', 'b', 'c'), link('3', 'c', 'd'), link('4', 'd', 'e')];
    const places = Object.values(layoutNetwork(networkGraph(nodes, links), {aspect: 0.6, footprint: () => 30}));
    const spread = (axis: 'x' | 'y') => Math.max(...places.map(p => p[axis])) - Math.min(...places.map(p => p[axis]));
    expect(spread('y')).toBeGreaterThan(spread('x'));
  });
});
