// The six area families of the catalogue map (mockup KNOWLEDGE_KEEP_1, research Knowledge §3). The grouping is the
// mockup's own and is still a proposal: research Part 6, question 2 asks Ony to approve it or name his own, so it
// lives here, in one place, and not in catalogue/. "Your safety" is set apart: SA is about danger to the reporter,
// not wrongdoing (docs/discovery/indicators.md).

export type Family = {key: string; name: string; areas: string[]; safety?: boolean};

export const FAMILIES: Family[] = [
  {key: 'money', name: 'Money & companies', areas: ['PP', 'SF', 'CT', 'ML', 'FR', 'OC', 'BO', 'TH', 'CO', 'AF', 'MA']},
  {key: 'people', name: 'People & violence', areas: ['CG', 'AN', 'DA', 'LE', 'EF', 'HO', 'HT', 'CA', 'KX', 'CP', 'SV', 'VA']},
  {key: 'state', name: 'State & power', areas: ['AG', 'TR', 'HR', 'DT', 'ES', 'VE', 'PM']},
  {key: 'health', name: 'Health & environment', areas: ['PD', 'WS', 'HC', 'EN', 'PS', 'PL', 'SP']},
  {key: 'information', name: 'Information', areas: ['CY', 'CF', 'IN', 'OH']},
  {key: 'safety', name: 'Your safety', areas: ['SA'], safety: true},
];

/** The family an area sits in; an area the grouping does not name yet falls into "Other". */
export function familyOf(area: string): Family {
  return FAMILIES.find(f => f.areas.includes(area)) ?? {key: 'other', name: 'Other', areas: [area]};
}

/** Every area in reading order: family by family, as the map's wheel and arrow keys step through them. */
export function readingOrder(known: string[]): string[] {
  const listed = FAMILIES.flatMap(f => f.areas).filter(a => known.includes(a));
  return [...listed, ...known.filter(a => !listed.includes(a)).sort()];
}

/** An area's name up to its first comma or "and", for places with room for a few words (the breadcrumb, an eyebrow):
 * "Hidden ownership and shell companies" → "Hidden ownership". The full name is always shown beside it. */
export function shortAreaName(name: string): string {
  return name.split(/,| and /)[0].trim() || name;
}

/** How an indicator can be checked, as a shape and a word (never colour alone). */
export const HOW_CHECKED: Record<'records' | 'lookups' | 'person', {glyph: string; word: string; long: string}> = {
  records: {glyph: '◫', word: 'Records', long: 'from your records'},
  lookups: {glyph: '⇄', word: 'Lookups', long: 'after outside lookups'},
  person: {glyph: '◉', word: 'Person', long: 'only a person'},
};

/** A catalogue level with no published number yet ("To be set by Ony" in the YAML). Shown as "not set", never guessed. */
export const UNSET_LEVEL = /to be set/i;
