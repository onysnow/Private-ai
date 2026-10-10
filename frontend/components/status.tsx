// The status grammar (Workbench-redesign-2026.pdf, "Rules every screen follows"): every status shows a shape and a
// word as well as a colour, the same in every theme. About 1 in 12 men see colour differently, and the supported
// and disputed colours sit close in lightness in every theme, so colour alone would fail them (WCAG 1.4.1).
import type {ReactElement} from 'react';

export type ClaimStatus = 'supported' | 'disputed' | 'unshown' | 'ruled_out';
export type FlagLevel = 'faint' | 'strong' | 'textbook';

const STATUS: Record<ClaimStatus, {mark: string; word: string}> = {
  supported: {mark: '✓', word: 'Supported'},
  disputed: {mark: '✕', word: 'Disputed'},
  unshown: {mark: '○', word: 'Not yet shown'},
  ruled_out: {mark: '–', word: 'Ruled out'},
};

const LEVEL: Record<FlagLevel, {bars: string; word: string; meaning: string}> = {
  faint: {bars: '▮▯▯', word: 'Faint', meaning: 'the pattern appears'},
  strong: {bars: '▮▮▯', word: 'Strong', meaning: 'it looks serious'},
  textbook: {bars: '▮▮▮', word: 'Textbook', meaning: 'it meets the published definition or threshold'},
};

export function StatusChip({status, label}: {status: ClaimStatus; label?: string}): ReactElement {
  const s = STATUS[status];
  return <span className={`st st-${status}`}><span aria-hidden="true">{s.mark}</span>{label ?? s.word}</span>;
}

export function LevelChip({level, showMeaning = false}: {level: FlagLevel; showMeaning?: boolean}): ReactElement {
  const l = LEVEL[level];
  return <span className={`lv lv-${level}`} title={l.meaning}><span aria-hidden="true" className="lv-bars">{l.bars}</span>{l.word}
    {showMeaning && <span className="lv-meaning"> · {l.meaning}</span>}</span>;
}

/** Marks material an AI wrote until a person keeps it. */
export function AiTag({date}: {date?: string}): ReactElement {
  return <span className="ai-tag">AI draft{date ? ` · ${date}` : ''}</span>;
}

export const LEVEL_WORDS = LEVEL;
export const STATUS_WORDS = STATUS;
