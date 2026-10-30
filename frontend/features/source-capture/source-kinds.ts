// Where a source came from, read from what the app stored when it was made (Bring in › Sources & evidence).
// The kind is a mark in the list (an icon), named on hover or focus (CLAUDE.md, 29 Oct: types are marks).
//   hand       typed in by the reporter (Source capture form: metadata.capture = 'reporter'; Add by hand: added_by_hand)
//   openaleph  a document OpenAleph holds, or one found inside such a document (openaleph_children.py)
//   followed   came in from a followed feed or mailbox, or a connector (following.py, mailbox.py)
//   capture    a web page the app fetched and kept (web_capture.py, media_links.py: metadata.capture_id)
//   document   a file brought in (documents.py: filename + sha256)
//   link       an address only: read, not downloaded (demo "link_only")
import {Archive, Camera, FileText, Link2, PenLine, Rss} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

export type SourceOrigin = 'document' | 'capture' | 'link' | 'hand' | 'followed' | 'openaleph';

export const ORIGINS: {key: SourceOrigin; label: string; Icon: LucideIcon}[] = [
  {key: 'document', label: 'Document brought in', Icon: FileText},
  {key: 'capture', label: 'Web capture', Icon: Camera},
  {key: 'link', label: 'Web link, not downloaded', Icon: Link2},
  {key: 'hand', label: 'Typed by hand', Icon: PenLine},
  {key: 'followed', label: 'From a feed, mailbox or connector', Icon: Rss},
  {key: 'openaleph', label: 'OpenAleph', Icon: Archive},
];

export const ORIGIN = Object.fromEntries(ORIGINS.map(o => [o.key, o])) as unknown as Record<SourceOrigin, {label: string; Icon: LucideIcon}>;

type SourceLike = {source_type: string; url?: string | null; metadata_json?: Record<string, unknown> | null};
type DocumentLike = {openaleph_document_id?: string | null; parent_document_id?: string | null} | undefined;

/** The kind of a source, from its stored metadata and the document it holds (if any). */
export function originOf(source: SourceLike, document?: DocumentLike): SourceOrigin {
  const m = source.metadata_json ?? {};
  if (m.capture === 'reporter' || m.added_by_hand) return 'hand';
  if (document?.openaleph_document_id || m.found_in_document_id || source.source_type === 'openaleph') return 'openaleph';
  if (m.followed_from || m.provider || m.connector) return 'followed';
  if (m.capture_id) return 'capture';
  if (document || m.filename || m.sha256 || source.source_type === 'document') return 'document';
  if (m.link_only || source.url) return 'link';
  return 'document';
}
