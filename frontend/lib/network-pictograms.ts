// What a party is, drawn as a pictogram in its dot on the network
// (components/entity-graph.tsx). The shapes are Lucide icons (lucide.dev,
// ISC licence; the same set the app's buttons use, lucide-react 1.47.0):
// "user", "building", "ship", "plane" and "house", copied as SVG paths so
// the drawing can load them as images (Sigma's @sigma/node-image tints each
// image's pixels with the node's colour). Only the FollowTheMoney schemas
// named here get one; any other party is a plain dot, so no pictogram ever
// claims more than the record says.

export type Pictogram = 'person' | 'organisation' | 'vessel' | 'aircraft' | 'property';

// FollowTheMoney schema -> pictogram. In the FtM model Company and
// PublicBody extend Organization; a bare LegalEntity, which Person extends
// too, could be either, so it stays a plain dot.
const BY_SCHEMA: Record<string, Pictogram> = {
  Person: 'person',
  Company: 'organisation', Organization: 'organisation', PublicBody: 'organisation',
  Vessel: 'vessel',
  Airplane: 'aircraft',
  RealEstate: 'property',
};

export function pictogramFor(schema: string | undefined | null): Pictogram | null {
  return (schema && BY_SCHEMA[schema]) || null;
}

const SHAPES: Record<Pictogram, string> = {
  person: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  organisation: '<path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/>'
    + '<path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/><path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>'
    + '<rect x="4" y="2" width="16" height="20" rx="2"/>',
  vessel: '<path d="M12 2v2"/><path d="M12 9.189V13"/><path d="M19 12V6a2 2 0 00-2-2H7a2 2 0 00-2 2v6"/>'
    + '<path d="M19.38 19A11.6 11.6 0 0021 13l-8.188-3.639a2 2 0 00-1.624 0L3 13.001a11.6 11.6 0 002.81 7.76"/>'
    + '<path d="M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  aircraft: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  property: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>'
    + '<path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};

function asImage(shape: string): string {
  // White strokes on a clear ground: Sigma tints the white with the node's colour.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#ffffff" `
    + `stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Each pictogram as an image URL the drawing loads. */
export const PICTOGRAMS: Record<Pictogram, string> = Object.fromEntries(
  Object.entries(SHAPES).map(([name, shape]) => [name, asImage(shape)])) as Record<Pictogram, string>;

/** Each pictogram's name for the key under the drawing. */
export const PICTOGRAM_NAMES: Record<Pictogram, string> = {
  person: 'Person', organisation: 'Company or organisation', vessel: 'Vessel', aircraft: 'Aircraft', property: 'Property',
};
