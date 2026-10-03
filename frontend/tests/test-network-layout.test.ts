// Where a network's parties sit and what rule 18 asks of the drawing
// (lib/network-layout.ts): the same records give the same picture, crossing
// links are counted, and the connection grid holds every link once per pair.
import {describe, expect, it} from 'vitest';

import {connectionGrid, countCrossings, layoutNetwork, networkGraph, segmentsCross} from '../lib/network-layout';
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
  it('puts the most-linked parties first and every pair\'s links in both of its cells', () => {
    const nodes = [node('x', 'Orrin'), node('m', 'Meridian'), node('b', 'Bellcastle'), node('j', 'Jane')];
    const links = [link('1', 'm', 'b'), link('2', 'b', 'm'), link('3', 'm', 'x'), link('4', 'j', 'm')];
    const grid = connectionGrid(nodes, links);
    expect(grid.parties.map(p => p.label)).toEqual(['Meridian', 'Bellcastle', 'Jane', 'Orrin']);
    const cell = (row: number, column: number) => grid.cells.find(c => c.row === row && c.column === column);
    expect(cell(0, 1)?.links.map(l => l.id)).toEqual(['1', '2']);
    expect(cell(1, 0)?.links).toBe(cell(0, 1)?.links);
    expect(cell(2, 3)).toBeUndefined();
    expect(grid.cells).toHaveLength(6);
  });
});
