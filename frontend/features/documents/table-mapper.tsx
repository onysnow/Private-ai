'use client';
// Spreadsheets to entities (ADR-0006, Wave C; backend app/services/table_mappings.py).
// The reporter says which columns make which entities (a person, a company…)
// and which links join them (a payment from one to the other), previews what
// the first rows make, and runs it. Every entity and link becomes a proposal
// to review; a link is accepted only after both its ends. The screen writes a
// FollowTheMoney mapping (https://followthemoney.tech/docs/mappings/), the
// format OpenAleph's own mappings use. A payment may also name the column that
// says what kind of payment each row is (a fine, a loan…; DECISIONS_LOG 40).
import {useMutation, useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {errorMessage} from '../../lib/api-client';
import {
  getDocumentTableOptions, getMappingSchemasOptions, previewTableMappingMutation, runTableMappingMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {
  MappedPropertyIn, MappingEntitySchemaOut, MappingLinkSchemaOut, TableMappingIn, TableMappingPreviewOut, TableMappingRunOut,
} from '../../lib/generated/types.gen';

export type PropertyDraft = {prop: string; column: string; format?: string};
// `keys` null: chosen for the reporter (an entity's name column; every column a link reads).
export type EntityDraft = {name: string; schema: string; nameColumn: string; keys: string[] | null; properties: PropertyDraft[]};
export type LinkDraft = {name: string; schema: string; source: string; target: string; keys: string[] | null; properties: PropertyDraft[];
  /** A payment only: the column that says what kind of payment it is. */
  kindColumn?: string};

const TABLE_EXTENSIONS = ['.csv', '.tsv', '.xlsx'];

/** Whether a document can be mapped: what the backend reads as a table. */
export function isTable(filename: string): boolean {
  const lower = filename.toLowerCase();
  return TABLE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** A readable name for the mapping, unique among `taken`: "company 1", "payment 2". */
export function nextName(schema: string, taken: string[]): string {
  const base = schema.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  let n = 1;
  while (taken.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function properties(drafts: PropertyDraft[]): Record<string, MappedPropertyIn> {
  const out: Record<string, MappedPropertyIn> = {};
  for (const draft of drafts) {
    if (!draft.prop || !draft.column) continue;
    out[draft.prop] = draft.format?.trim() ? {column: draft.column, format: draft.format.trim()} : {column: draft.column};
  }
  return out;
}

/** The request the backend runs: the `entities` of a FollowTheMoney mapping. */
export function buildMapping(entities: EntityDraft[], links: LinkDraft[], linkSchemas: MappingLinkSchemaOut[], sheet: string | null): TableMappingIn {
  const mapped: TableMappingIn['entities'] = {};
  for (const entity of entities) {
    mapped[entity.name] = {schema: entity.schema, keys: entityKeys(entity),
      properties: {name: {column: entity.nameColumn}, ...properties(entity.properties)}};
  }
  for (const link of links) {
    const kind = linkSchemas.find(s => s.name === link.schema);
    if (!kind) continue;
    mapped[link.name] = {schema: link.schema, keys: linkKeys(link, entities),
      properties: {...properties(link.properties), [kind.source_prop]: {entity: link.source}, [kind.target_prop]: {entity: link.target}},
      ...(link.schema === 'Payment' && link.kindColumn ? {payment_kind_column: link.kindColumn} : {})};
  }
  return sheet ? {sheet, entities: mapped} : {entities: mapped};
}

/** An entity's key columns: the reporter's, or its name column. */
export function entityKeys(entity: EntityDraft): string[] {
  return entity.keys ?? (entity.nameColumn ? [entity.nameColumn] : []);
}

/** A link's key columns: the reporter's, or every column its ends and its own values are read from. */
export function linkKeys(link: LinkDraft, entities: EntityDraft[]): string[] {
  if (link.keys) return link.keys;
  const ends = entities.filter(e => e.name === link.source || e.name === link.target).map(e => e.nameColumn);
  return [...new Set([...ends, ...link.properties.map(p => p.column)].filter(Boolean))];
}

function PropertyRows({drafts, choices, columns, onChange, label}: {drafts: PropertyDraft[];
  choices: {name: string; label: string; type: string}[]; columns: string[]; onChange: (next: PropertyDraft[]) => void; label: string}): ReactElement {
  const set = (index: number, patch: Partial<PropertyDraft>) => onChange(drafts.map((d, i) => (i === index ? {...d, ...patch} : d)));
  return <div>
    {drafts.map((draft, index) => {
      const type = choices.find(c => c.name === draft.prop)?.type;
      return <div className="actions" key={index}>
        <select aria-label={`${label}: property ${index + 1}`} value={draft.prop} onChange={(e: ChangeEvent<HTMLSelectElement>) => set(index, {prop: e.target.value})}>
          <option value="">Property…</option>
          {choices.filter(c => c.name !== 'name').map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
        </select>
        <select aria-label={`${label}: column for property ${index + 1}`} value={draft.column} onChange={(e: ChangeEvent<HTMLSelectElement>) => set(index, {column: e.target.value})}>
          <option value="">Column…</option>
          {columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {type === 'date' && <Input aria-label={`${label}: date format for property ${index + 1}`} placeholder="Date format, e.g. %d/%m/%Y"
          value={draft.format ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => set(index, {format: e.target.value})}/>}
        <Button size="sm" variant="ghost" onClick={() => onChange(drafts.filter((_, i) => i !== index))}>Remove</Button>
      </div>;
    })}
    <Button size="sm" variant="outline" onClick={() => onChange([...drafts, {prop: '', column: ''}])}>Add a property</Button>
  </div>;
}

function KeyColumns({columns, keys, onChange, label}: {columns: string[]; keys: string[]; onChange: (next: string[]) => void; label: string}): ReactElement {
  return <fieldset>
    <legend><small>Rows with the same values in these columns are one {label}</small></legend>
    {columns.map(column => <label key={column} style={{marginRight: '0.75rem'}}>
      <input type="checkbox" checked={keys.includes(column)}
        onChange={() => onChange(keys.includes(column) ? keys.filter(k => k !== column) : [...keys, column])}/> {column}
    </label>)}
  </fieldset>;
}

export function TableMapper({documentId, onProposed}: {documentId: string; onProposed?: () => void}): ReactElement {
  const [sheet, setSheet] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntityDraft[]>([]);
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [preview, setPreview] = useState<TableMappingPreviewOut | null>(null);
  const [result, setResult] = useState<TableMappingRunOut | null>(null);
  const [status, setStatus] = useState('');
  const table = useQuery({...getDocumentTableOptions({path: {document_id: documentId}, query: sheet ? {sheet} : undefined})});
  const schemas = useQuery({...getMappingSchemasOptions()});
  const previewing = useMutation({...previewTableMappingMutation()});
  const running = useMutation({...runTableMappingMutation()});

  const columns = table.data?.columns ?? [];
  const entityKinds: MappingEntitySchemaOut[] = schemas.data?.entities ?? [];
  const linkKinds: MappingLinkSchemaOut[] = schemas.data?.links ?? [];
  const names = [...entities.map(e => e.name), ...links.map(l => l.name)];
  const ready = entities.length > 0 && entities.every(e => e.nameColumn)
    && entities.every(e => entityKeys(e).length > 0)
    && links.every(l => l.source && l.target && l.source !== l.target && linkKeys(l, entities).length > 0);

  const changed = () => { setPreview(null); setResult(null); setStatus(''); };
  const setEntity = (index: number, patch: Partial<EntityDraft>) => {
    changed();
    setEntities(cur => cur.map((e, i) => (i === index ? {...e, ...patch} : e)));
  };
  const setLink = (index: number, patch: Partial<LinkDraft>) => {
    changed();
    setLinks(cur => cur.map((l, i) => (i === index ? {...l, ...patch} : l)));
  };
  const body = () => buildMapping(entities, links, linkKinds, sheet ?? table.data?.sheet ?? null);

  const showPreview = async () => {
    try {
      setPreview(await previewing.mutateAsync({path: {document_id: documentId}, body: body()}));
      setStatus('');
    } catch (error) {
      setStatus(errorMessage(error, 'Could not preview the mapping'));
    }
  };
  const run = async () => {
    try {
      const reply = await running.mutateAsync({path: {document_id: documentId}, body: body()});
      setResult(reply);
      setStatus(`Proposed ${reply.entities_proposed} entit${reply.entities_proposed === 1 ? 'y' : 'ies'} and ${reply.links_proposed} link(s) to review`
        + (reply.already_proposed ? `; ${reply.already_proposed} were already proposed.` : '.'));
      onProposed?.();
    } catch (error) {
      setStatus(errorMessage(error, 'Could not run the mapping'));
    }
  };

  if (table.isError) return <p className="muted">{errorMessage(table.error, 'Could not read the table')}</p>;
  if (!table.data || !schemas.data) return <p className="muted">Reading the table…</p>;
  return <div className="candidate" aria-label="Map columns to entities">
    <b>Map columns to entities</b>
    <p className="muted">Say which columns make which entities and which links join them. Everything the mapping makes is a proposal to review; a link is accepted after both its ends.</p>
    {table.data.sheets.length > 1 && <label>Sheet{' '}
      <select aria-label="Sheet" value={table.data.sheet ?? ''} onChange={(e: ChangeEvent<HTMLSelectElement>) => { changed(); setSheet(e.target.value); }}>
        {table.data.sheets.map(s => <option key={s} value={s}>{s}</option>)}
      </select></label>}
    <div style={{overflowX: 'auto'}}>
      <table aria-label="First rows">
        <thead><tr><th>Row</th>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{table.data.rows.slice(0, 5).map(row => <tr key={row.number}><td>{row.number}</td>{columns.map(c => <td key={c}>{row.cells[c]}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="muted"><small>{table.data.row_count} row(s){table.data.truncated ? ', more than a mapping reads at once' : ''}.</small></p>

    <h5>Entities</h5>
    {entities.map((entity, index) => {
      const kind = entityKinds.find(k => k.name === entity.schema);
      return <div className="statement" key={entity.name} aria-label={`Entity ${entity.name}`}>
        <b>{entity.name}</b>
        <div className="actions">
          <select aria-label={`${entity.name}: kind`} value={entity.schema} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEntity(index, {schema: e.target.value, properties: []})}>
            {entityKinds.map(k => <option key={k.name} value={k.name}>{k.label}</option>)}
          </select>
          <select aria-label={`${entity.name}: name column`} value={entity.nameColumn} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEntity(index, {nameColumn: e.target.value})}>
            <option value="">Name column…</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => { changed(); setEntities(cur => cur.filter((_, i) => i !== index));
            setLinks(cur => cur.filter(l => l.source !== entity.name && l.target !== entity.name)); }}>Remove</Button>
        </div>
        <KeyColumns columns={columns} keys={entityKeys(entity)} label={entity.name} onChange={keys => setEntity(index, {keys})}/>
        <PropertyRows drafts={entity.properties} choices={kind?.properties ?? []} columns={columns} label={entity.name}
          onChange={next => setEntity(index, {properties: next})}/>
      </div>;
    })}
    <Button variant="outline" onClick={() => { changed(); setEntities(cur => [...cur, {name: nextName('Company', names), schema: 'Company', nameColumn: '', keys: null, properties: []}]); }}>Add an entity</Button>

    <h5>Links</h5>
    {entities.length < 2 && <p className="muted">Add two entities to link them.</p>}
    {links.map((link, index) => {
      const kind = linkKinds.find(k => k.name === link.schema);
      return <div className="statement" key={link.name} aria-label={`Link ${link.name}`}>
        <b>{link.name}</b>
        <div className="actions">
          <select aria-label={`${link.name}: kind`} value={link.schema} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLink(index, {schema: e.target.value, properties: [], kindColumn: ''})}>
            {linkKinds.map(k => <option key={k.name} value={k.name}>{k.label}</option>)}
          </select>
          <select aria-label={`${link.name}: ${kind?.source_label ?? 'from'}`} value={link.source} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLink(index, {source: e.target.value})}>
            <option value="">{kind?.source_label ?? 'From'}…</option>
            {entities.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
          </select>
          <span>→</span>
          <select aria-label={`${link.name}: ${kind?.target_label ?? 'to'}`} value={link.target} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLink(index, {target: e.target.value})}>
            <option value="">{kind?.target_label ?? 'To'}…</option>
            {entities.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => { changed(); setLinks(cur => cur.filter((_, i) => i !== index)); }}>Remove</Button>
        </div>
        <PropertyRows drafts={link.properties} choices={kind?.properties ?? []} columns={columns} label={link.name}
          onChange={next => setLink(index, {properties: next})}/>
        {link.schema === 'Payment' && <div className="actions">
          <select aria-label={`${link.name}: kind of payment column`} title="A cell that names no kind (a fine, a loan, a purchase price…) leaves it unset, and is reported"
            value={link.kindColumn ?? ''} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLink(index, {kindColumn: e.target.value})}>
            <option value="">Kind of payment: not said</option>
            {columns.map(c => <option key={c} value={c}>Kind of payment from “{c}”</option>)}
          </select>
        </div>}
        <KeyColumns columns={columns} keys={linkKeys(link, entities)} label={link.name} onChange={keys => setLink(index, {keys})}/>
      </div>;
    })}
    {entities.length >= 2 && <Button variant="outline" onClick={() => { changed();
      setLinks(cur => [...cur, {name: nextName('Payment', names), schema: 'Payment', source: '', target: '', keys: null, properties: []}]); }}>Add a link</Button>}

    <div className="actions">
      <Button onClick={() => void showPreview()} disabled={!ready || previewing.isPending}>{previewing.isPending ? 'Previewing…' : 'Preview the first rows'}</Button>
      <Button onClick={() => void run()} disabled={!ready || running.isPending}>{running.isPending ? 'Proposing…' : 'Propose for review'}</Button>
    </div>
    {preview && <ul aria-label="Preview">
      {preview.rows.map(row => <li key={row.number}>
        <small>Row {row.number}:</small> {row.entities.map(e => `${e.caption ?? '(no name)'} (${e.schema})`).join(' · ') || 'nothing'}
        {row.problems.map(p => <div key={p}><small>{p}</small></div>)}
      </li>)}
    </ul>}
    {result && result.skipped.length > 0 && <details>
      <summary>{result.skipped.length} value(s) or row(s) left out</summary>
      <ul>{result.skipped.map((s, i) => <li key={i}><small>Row {s.row}: {s.reason}</small></li>)}</ul>
    </details>}
    {status && <p className="muted" role="status">{status}</p>}
  </div>;
}
