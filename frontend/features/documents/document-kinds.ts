// What a document is (a court filing, a judgment, an article…) and its language, as the API keeps them
// (backend app/services/document_facts.py): each with how it was set. A kind is a mark, named on hover (Ony, 29 Oct).
import {AudioLines, File as FileIcon, Gavel, Globe, Image as ImageIcon, Landmark, Mail, Megaphone, MessageCircle, Newspaper, Scale, Sheet} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

import type {DocumentOut} from '../../lib/generated/types.gen';
import type {FileKind} from './library-model';

export type DocKind = NonNullable<DocumentOut['kind']>;
export type SetBy = NonNullable<DocumentOut['kind_set_by']>;

/** Each kind's name, plural and mark, in the order the Library's filters and the chooser show them. */
export const DOC_KINDS: Record<DocKind, {name: string; plural: string; icon: LucideIcon}> = {
  court_filing: {name: 'Court filing', plural: 'Court filings', icon: Gavel},
  judgment: {name: 'Judgment or order', plural: 'Judgments and orders', icon: Scale},
  official_record: {name: 'Official record or notice', plural: 'Official records and notices', icon: Landmark},
  article: {name: 'Article', plural: 'Articles', icon: Newspaper},
  press_release: {name: 'Press release', plural: 'Press releases', icon: Megaphone},
  email: {name: 'Email', plural: 'Emails', icon: Mail},
  social_post: {name: 'Social media post', plural: 'Social media posts', icon: MessageCircle},
  spreadsheet: {name: 'Spreadsheet', plural: 'Spreadsheets', icon: Sheet},
  recording: {name: 'Recording', plural: 'Recordings', icon: AudioLines},
  photo: {name: 'Photo', plural: 'Photos', icon: ImageIcon},
  web_capture: {name: 'Web page', plural: 'Web pages', icon: Globe},
  other: {name: 'Other', plural: 'Other documents', icon: FileIcon},
};
export const DOC_KIND_ORDER = Object.keys(DOC_KINDS) as DocKind[];

/** The kind a file's type gives, for a document listed before the API kept kinds (the API fills the same ones). */
const FROM_FILE: Partial<Record<FileKind, DocKind>> = {email: 'email', table: 'spreadsheet', picture: 'photo', media: 'recording', web: 'web_capture'};

/** What the document is: as kept, else what its file type says. A kind a person cleared stays cleared. */
export function docKind(d: Pick<DocumentOut, 'kind' | 'kind_set_by'>, file: FileKind): DocKind | null {
  if (d.kind) return d.kind;
  if (d.kind_set_by === 'person') return null;
  return FROM_FILE[file] ?? null;
}

/** How a value was set, in words: "Set by Ony", "From its source's record", "Detected by py3langid · 98% sure". */
export function setByWords(by: SetBy | null | undefined, who: string | null | undefined, confidence?: number | null): string {
  switch (by) {
    case 'person': return who ? `Set by ${who}` : 'Set by a person';
    case 'source': return 'As its source’s record states it';
    case 'reader': return who ? `From the file, as ${who} read it` : 'From the file’s type';
    case 'detected': return `Detected by ${who || 'a tool'}${confidence != null ? ` · ${Math.round(confidence * 100)}% sure` : ''}`;
    default: return 'Not known yet';
  }
}

/** A language code's English name, from the browser's own list when the API sent none. */
export function languageName(code: string, given?: string | null): string {
  if (given) return given;
  try {
    return new Intl.DisplayNames(['en'], {type: 'language'}).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The languages offered first when a person sets one: the ones a case's documents are most often in, then the rest of
 *  the ISO 639-1 list the browser knows. Typing any code or name works. */
export const COMMON_LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'it', 'nl', 'ru', 'uk', 'ar', 'zh', 'ja', 'ko', 'ms', 'id', 'hi', 'tr', 'pl',
  'sv', 'el', 'he', 'fa', 'vi', 'th', 'sw'];
