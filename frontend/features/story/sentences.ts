// The write-up's sentences, as the server counts them (backend app/services/stories.py sentences_without_source): a
// sentence ends at . ! or ? followed by a space; a citation belongs to the sentence it follows, including one placed
// just after the full stop ("… Nominees ③."), and punctuation after a citation ends that sentence, not a new one.
// Worked on a ProseMirror paragraph so each sentence keeps its place in the document (for its underline and mark).

export type Piece = {kind: 'text'; text: string; pos: number} | {kind: 'cite'; recordId: string; pos: number};
export type Sentence = {from: number; to: number; cited: boolean; claims: string[]};

const WORD = /\w/;
const END = /[.!?](?=\s|$)/g;
// Not an end: a full stop after an initial ("M. Ross") or a short title or abbreviation ("Dr.", "e.g."), as the
// server reads it (app/services/stories.py _END).
const NOT_END = /(?:^|[^\w])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|No|e\.g|i\.e)$/;
const notAnEnd = (text: string, at: number) => text[at] === '.' && NOT_END.test(text.slice(Math.max(0, at - 4), at));

/** The sentences in a run of text and citation pieces, each with its document range. */
export function sentencesOf(pieces: Piece[]): Sentence[] {
  const out: Sentence[] = [];
  let open: Sentence | null = null;
  let openHasWords = false;
  const close = () => {
    if (open && openHasWords) out.push(open);
    open = null;
    openHasWords = false;
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
      if (notAnEnd(text, m.index)) continue;
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
      if (!open) open = {from: piece.pos + start, to: piece.pos + text.length, cited: false, claims: []};
      open.to = piece.pos + text.length;
      if (WORD.test(rest)) openHasWords = true;
    }
  }
  close();
  return out;
}
