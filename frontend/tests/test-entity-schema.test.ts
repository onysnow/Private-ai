// entityPropertyAdditions: the diff behind the entity-edit form's additive
// PATCH semantics (backend/app/services/entities.py::update_entity never
// overwrites or deletes a property value, only adds new ones as Statements).
import {describe, expect, it} from 'vitest';

import {entityPropertyAdditions} from '../lib/entity-schema';

describe('entityPropertyAdditions', () => {
  it('keeps only values not already present for a prop', () => {
    const additions = entityPropertyAdditions({country: ['us']}, {country: ['us', 'gb']});
    expect(additions).toEqual({country: ['gb']});
  });

  it('omits a prop entirely when nothing about it is new', () => {
    const additions = entityPropertyAdditions({country: ['us']}, {country: ['us']});
    expect(additions).toEqual({});
  });

  it('treats a brand-new prop as all-new', () => {
    const additions = entityPropertyAdditions({}, {aliases: ['Acme LLC']});
    expect(additions).toEqual({aliases: ['Acme LLC']});
  });

  it('treats missing/null existing properties as an empty entity', () => {
    expect(entityPropertyAdditions(null, {country: ['us']})).toEqual({country: ['us']});
    expect(entityPropertyAdditions(undefined, {country: ['us']})).toEqual({country: ['us']});
  });

  it('ignores surrounding whitespace when comparing values', () => {
    const additions = entityPropertyAdditions({country: [' us ']}, {country: ['us']});
    expect(additions).toEqual({});
  });

  it('returns an empty object when nothing submitted differs from the entity at all', () => {
    expect(entityPropertyAdditions({country: ['us'], name: ['Acme']}, {country: ['us'], name: ['Acme']})).toEqual({});
  });
});
