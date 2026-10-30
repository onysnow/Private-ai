// The Library (Bring in › Library): every document of the case as one dense list, with what kind of file each is, where
// it is in its reading (The Drop's lane for it, backend app/services/drop.py) and the numbers a reporter scans for: pages,
// passages, proposals waiting. Files found inside an archive or an email stay under it (document-tree.ts). Pure helpers,
// so the panel (documents-panel.tsx) only draws.
import type {DocumentOut, DropLaneOut} from '../../lib/generated/types.gen';
import {nestDocuments} from './document-tree';

export type FileKind = 'pdf' | 'email' | 'web' | 'picture' | 'table' | 'text' | 'media' | 'archive' | 'other';

/** Each kind's name, for the reveal on its mark and the filter's label. In the order the filters show them. */
export const KINDS: Record<FileKind, {name: string; plural: string}> = {
  pdf: {name: 'PDF', plural: 'PDFs'},
  email: {name: 'Email', plural: 'Emails'},
  web: {name: 'Web page', plural: 'Web pages'},
  picture: {name: 'Picture', plural: 'Pictures'},
  table: {name: 'Spreadsheet', plural: 'Spreadsheets'},
  text: {name: 'Text document', plural: 'Text documents'},
  media: {name: 'Audio or video', plural: 'Audio and video'},
  archive: {name: 'Archive or mailbox', plural: 'Archives and mailboxes'},
  other: {name: 'Other file', plural: 'Other files'},
};

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  eml: 'email', msg: 'email', emlx: 'email',
  html: 'web', htm: 'web', mhtml: 'web', warc: 'web',
  jpg: 'picture', jpeg: 'picture', png: 'picture', gif: 'picture', tif: 'picture', tiff: 'picture', webp: 'picture', heic: 'picture',
  heif: 'picture', bmp: 'picture', dng: 'picture', cr2: 'picture', nef: 'picture', arw: 'picture',
  csv: 'table', tsv: 'table', xls: 'table', xlsx: 'table', ods: 'table',
  txt: 'text', md: 'text', doc: 'text', docx: 'text', odt: 'text', rtf: 'text', pptx: 'text', ppt: 'text', odp: 'text',
  mp3: 'media', wav: 'media', m4a: 'media', ogg: 'media', flac: 'media', mp4: 'media', mov: 'media', m4v: 'media', webm: 'media', avi: 'media',
  zip: 'archive', mbox: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', '7z': 'archive', rar: 'archive', pst: 'archive',
};

/** What kind of file a document is: by its extension, else by what OpenAleph read it as, else by its declared type. */
export function fileKind(d: Pick<DocumentOut, 'filename' | 'mime_type' | 'openaleph_schema'>): FileKind {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(d.filename)?.[1]?.toLowerCase();
  if (ext && BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  if (d.openaleph_schema === 'Email') return 'email';
  if (d.openaleph_schema === 'Package') return 'archive';
  const mime = d.mime_type ?? '';
  if (mime === 'message/rfc822') return 'email';
  if (mime.startsWith('image/')) return 'picture';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/** Where a file is, worst first: it could not be read; its read has not moved; it is being read; proposals wait for
 *  you; nothing waits. A colour each (Ony, 29 Oct: a status is its colour, its word on reveal). */
export type FileState = 'problem' | 'stuck' | 'reading' | 'waiting' | 'clean';
export const STATES: Record<FileState, {word: string; meaning: string}> = {
  problem: {word: 'Could not be read', meaning: 'reading stopped; the reason is under its name'},
  stuck: {word: 'Stuck', meaning: 'its read has not moved for a while'},
  reading: {word: 'Being read', meaning: 'still in the queue or being read'},
  waiting: {word: 'Waiting for you', meaning: 'proposals from it wait for your decision'},
  clean: {word: 'Done', meaning: 'read, and nothing waits'},
};
export const STATE_ORDER: FileState[] = ['problem', 'stuck', 'reading', 'waiting', 'clean'];

const sum = (counts: Record<string, number> | undefined): number => Object.values(counts ?? {}).reduce((a, b) => a + b, 0);

/** Proposals from this file (not the files inside it) that wait for a decision, when the line knows. */
export const waitingIn = (lane: DropLaneOut | undefined): number | null => (lane ? sum(lane.receipt.waiting) : null);

export function fileState(d: Pick<DocumentOut, 'extraction_status'>, lane?: DropLaneOut): FileState {
  if (d.extraction_status === 'failed' || lane?.problem) return 'problem';
  if (lane && lane.stalled_minutes !== null && lane.stalled_minutes !== undefined) return 'stuck';
  if (d.extraction_status === 'queued' || d.extraction_status === 'extracting' || d.extraction_status === 'pending' || lane?.in_progress) return 'reading';
  if ((waitingIn(lane) ?? 0) > 0) return 'waiting';
  return 'clean';
}

/** Every lane of the line by its document, the files inside each included. */
export function lanesById(lanes: readonly DropLaneOut[] | undefined): Map<string, DropLaneOut> {
  const byId = new Map<string, DropLaneOut>();
  const visit = (lane: DropLaneOut) => { byId.set(lane.document_id, lane); (lane.children ?? []).forEach(visit); };
  (lanes ?? []).forEach(visit);
  return byId;
}

export const titleOf = (d: Pick<DocumentOut, 'title' | 'filename'>): string => d.title || d.filename;

export type SortKey = 'added' | 'name' | 'pages' | 'passages' | 'waiting';
export type Sort = {key: SortKey; descending: boolean};

export type LibraryRow = {
  document: DocumentOut; depth: number; parent: DocumentOut | null; lane: DropLaneOut | undefined;
  kind: FileKind; state: FileState; children: number;
  /** Shown only to place a file that matches under it: it does not match itself. */
  context: boolean;
};

export type LibraryFilter = {query: string; kinds: ReadonlySet<FileKind>; states: ReadonlySet<FileState>};

const pagesOf = (r: LibraryRow) => r.lane?.receipt.pages ?? -1;
const passagesOf = (r: LibraryRow) => r.lane?.receipt.passages ?? r.document.chunk_count;
const waitingOf = (r: LibraryRow) => waitingIn(r.lane) ?? -1;

function compare(sort: Sort): (a: LibraryRow, b: LibraryRow) => number {
  const by: Record<SortKey, (a: LibraryRow, b: LibraryRow) => number> = {
    added: (a, b) => a.document.created_at.localeCompare(b.document.created_at),
    name: (a, b) => titleOf(a.document).localeCompare(titleOf(b.document), undefined, {sensitivity: 'base', numeric: true}),
    pages: (a, b) => pagesOf(a) - pagesOf(b),
    passages: (a, b) => passagesOf(a) - passagesOf(b),
    waiting: (a, b) => waitingOf(a) - waitingOf(b),
  };
  const f = by[sort.key];
  // Files added at the same moment keep the order the case lists them in (the sort is stable); other ties go by name.
  return (a, b) => (sort.descending ? -f(a, b) : f(a, b)) || (sort.key === 'added' ? 0 : by.name(a, b));
}

export const isFiltered = (f: LibraryFilter): boolean => Boolean(f.query.trim()) || f.kinds.size > 0 || f.states.size > 0;

/** The rows the list draws: each file followed by the files inside it (unless its container is folded), sorted at each
 *  level. While a filter is on, a file that matches shows with the containers above it, which are marked as context;
 *  folding is set aside so nothing that matches is hidden. */
export function libraryRows(documents: readonly DocumentOut[], lanes: Map<string, DropLaneOut>, filter: LibraryFilter,
  sort: Sort, folded: ReadonlySet<string> = new Set()): LibraryRow[] {
  const nested = nestDocuments(documents);
  const childrenOf = new Map<string | null, LibraryRow[]>();
  const rowOf = new Map<string, LibraryRow>();
  for (const {document, depth, parent} of nested) {
    const lane = lanes.get(document.id);
    const row: LibraryRow = {document, depth, parent, lane, kind: fileKind(document), state: fileState(document, lane), children: 0, context: false};
    rowOf.set(document.id, row);
    const key = parent?.id ?? null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), row]);
    if (parent) { const p = rowOf.get(parent.id); if (p) p.children += 1; }
  }
  const q = filter.query.trim().toLowerCase();
  const matches = (r: LibraryRow) => (!q || titleOf(r.document).toLowerCase().includes(q) || r.document.filename.toLowerCase().includes(q))
    && (filter.kinds.size === 0 || filter.kinds.has(r.kind)) && (filter.states.size === 0 || filter.states.has(r.state));
  const filtering = isFiltered(filter);
  const order = compare(sort);
  const out: LibraryRow[] = [];
  // Returns whether the row or anything under it matches; pushes the rows to draw in order.
  const visit = (row: LibraryRow): boolean => {
    const at = out.length;
    out.push(row);
    const kids = [...(childrenOf.get(row.document.id) ?? [])].sort(order);
    let below = false;
    if (filtering || !folded.has(row.document.id)) for (const kid of kids) below = visit(kid) || below;
    const self = matches(row);
    if (!self && !below) { out.length = at; return false; }
    row.context = filtering && !self;
    return true;
  };
  for (const root of [...(childrenOf.get(null) ?? [])].sort(order)) visit(root);
  return out;
}

/** How many files of each kind and in each state, over the whole case, for the filters. */
export function tally(documents: readonly DocumentOut[], lanes: Map<string, DropLaneOut>): {kinds: Map<FileKind, number>; states: Map<FileState, number>} {
  const kinds = new Map<FileKind, number>();
  const states = new Map<FileState, number>();
  for (const d of documents) {
    const k = fileKind(d);
    const s = fileState(d, lanes.get(d.id));
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    states.set(s, (states.get(s) ?? 0) + 1);
  }
  return {kinds, states};
}

const BREAK = /[\s,;:—–\-(/]/;

/** How many characters at the start of `a` it shares with `b`, cut back to the end of a word. */
export function sharedPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  if (n === a.length || n === b.length) return 0;  // one title is the other's start: nothing left to tell them apart by
  while (n > 0 && !BREAK.test(a[n - 1])) n -= 1;
  return n;
}

/** Titles that open with the same long run of words as the file above or below them ("Email rebuilt from United States
 *  v. Real Property Located in New York…") are told apart by their end. For each row, how many characters of its title
 *  are that shared opening, which the list draws faint and lets shrink first, so the words that differ stay in sight;
 *  0 when it shares less than `least`. */
export function sharedOpenings(titles: readonly string[], least = 24): number[] {
  return titles.map((t, i) => {
    const n = Math.max(i > 0 ? sharedPrefix(t, titles[i - 1]) : 0, i < titles.length - 1 ? sharedPrefix(t, titles[i + 1]) : 0);
    return n >= least ? n : 0;
  });
}
