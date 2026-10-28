// The write-up's sentences, as the server counts them (backend app/services/stories.py sentences_without_source): a
// sentence ends at . ! or ? followed by a space; a citation belongs to the sentence it follows, including one placed
// just after the full stop ("… Nominees ③."), and punctuation after a citation ends that sentence, not a new one.
// Worked on a ProseMirror paragraph so each sentence keeps its place in the document (for its underline and mark).

export type Piece = {kind: 'text'; text: string; pos: number} | {kind: 'cite'; recordId: string; pos: number};
export type Sentence = {from: number; to: number; cited: boolean; claims: string[]};

const WORD = /\w/;
const END = /[.!?](?=\s|$)/g;
// Not an end: a full stop after a short title or abbreviation ("Dr.", "e.g.") or an initial ("M. Ross"), as the
// server reads it (app/services/stories.py _END and _ends_with_initial). A capital letter is an initial only at the
// start of a sentence, after another initial or after a word that is not capitalised ("paid M. Ross"); after a
// capitalised word it is a label that can end a sentence ("Schedule A."), so a missing source is never hidden.
const TITLE = /(?:^|[^\w])(?:Mr|Mrs|Ms|Dr|St|No|e\.g|i\.e)$/;
const LETTER = /(?:^|\s)(\S*)\s+[A-Z]$|^[A-Z]$/;
const notAnEnd = (before: string) => {
  if (TITLE.test(before.slice(-4))) return true;
  const m = LETTER.exec(before.slice(-40));
  if (!m) return false;
  const word = m[1] ?? '';
  return !word || !/^[A-Z]/.test(word) || /^[A-Z]\.$/.test(word);
};

/** The sentences in a run of text and citation pieces, each with its document range. */
export function sentencesOf(pieces: Piece[]): Sentence[] {
  const out: Sentence[] = [];
  let open: Sentence | null = null;
  let openHasWords = false;
  // The open sentence's text so far, across pieces: a title or initial split by formatting ("**Dr**. Reed") is read whole.
  let openText = '';
  const close = () => {
    if (open && openHasWords) out.push(open);
    open = null;
    openHasWords = false;
    openText = '';
  };
  for (const piece of pieces) {
    if (piece.kind === 'cite') {
      if (open && openHasWords) { open.cited = true; open.claims.push(piece.recordId); }
      else if (out.length) { const last = out[out.length - 1]; last.cited = true; last.claims.push(piece.recordId); }
      continue;
    }
    const text = piece.text;
    let start = 0;
    // A sentence starts at its first character, not at the space before it.
    if (!open) while (start < text.length && /\s/.test(text[start])) start++;
    END.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = END.exec(text))) {
      if (text[m.index] === '.' && notAnEnd(openText + text.slice(start, m.index))) continue;
      const end = m.index + 1;
      const chunk = text.slice(start, end);
      if (!open) open = {from: piece.pos + start, to: piece.pos + end, cited: false, claims: []};
      if (WORD.test(chunk)) openHasWords = true;
      if (!openHasWords && out.length) out[out.length - 1].to = piece.pos + end; // "③." ends the cited sentence
      else open.to = piece.pos + end;
      close();
      start = end;
      while (start < text.length && /\s/.test(text[start])) start++;
    }
    if (start < text.length) {
      const rest = text.slice(start);
      openText += rest;
      if (!open) open = {from: piece.pos + start, to: piece.pos + text.length, cited: false, claims: []};
      open.to = piece.pos + text.length;
      if (WORD.test(rest)) openHasWords = true;
    }
  }
  close();
  return out;
}
