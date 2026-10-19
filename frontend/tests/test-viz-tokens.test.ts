// The chart colour table (lib/viz-tokens.ts): every line and ring colour
// stands out from the card (3:1, WCAG 1.4.11), every text colour reads on
// it (4.5:1, WCAG 1.4.3), and each record type and link type gets the
// meaning the table gives it.
import {describe, expect, it} from 'vitest';

import {LINK, PARTY, SWATCH, TEXT, certaintyOf, isControl, isDirected, linkFamily, partyKind} from '../lib/viz-tokens';

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('the chart colour table', () => {
  it('draws every ring and line at 3:1 or more against the card', () => {
    for (const look of Object.values(PARTY)) expect(contrast(look.ring, SWATCH.card)).toBeGreaterThanOrEqual(3);
    for (const look of Object.values(LINK)) expect(contrast(look.colour, SWATCH.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(SWATCH.ink, SWATCH.brick)).toBeGreaterThanOrEqual(4.5);   // the "!" on its badge
  });

  it('writes text at 4.5:1 or more against the card', () => {
    for (const colour of Object.values(TEXT).filter(c => c !== SWATCH.ink)) expect(contrast(colour, SWATCH.card)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives each kind a fill its ring stands out from', () => {
    for (const look of Object.values(PARTY)) expect(contrast(look.ring, look.fill)).toBeGreaterThanOrEqual(1.8);
  });

  it('sorts FollowTheMoney schemas into kinds and link families', () => {
    expect([partyKind('Person'), partyKind('Company'), partyKind('PublicBody'), partyKind('Vessel'), partyKind('RealEstate'), partyKind('LegalEntity')])
      .toEqual(['person', 'company', 'organisation', 'vehicle', 'property', 'other']);
    expect([linkFamily('Ownership'), linkFamily('Employment'), linkFamily('Debt'), linkFamily('Associate'), linkFamily('UnknownLink')])
      .toEqual(['owns', 'runs', 'money', 'family', 'other']);
    expect([isDirected('Payment'), isDirected('Family'), isDirected('UnknownLink')]).toEqual([true, false, false]);
    expect([isControl('Ownership'), isControl('Directorship'), isControl('Employment')]).toEqual([true, true, false]);
  });

  it('reads how sure a link is from the review advisory alone', () => {
    expect(certaintyOf({needs_review: true, has_independent_support: true})).toBe('contested');
    expect(certaintyOf({has_independent_support: true})).toBe('supported');
    expect(certaintyOf({relationship_evidence_review_counts: {supports: 1, contradicts: 0}})).toBe('supported');
    expect(certaintyOf({relationship_evidence_review_counts: {supports: 1, contradicts: 1}})).toBe('contested');
    expect(certaintyOf({})).toBe('unsupported');
    expect(certaintyOf(null)).toBe('unsupported');
  });
});
