// The status grammar. Ony, 29 Oct: a status or flag level is its colour by default, its word revealed on hover, focus
// or click; Settings › Appearance › "Status marks" adds the shape, or the shape and the word, for anyone who cannot rely
// on colour (about 1 in 12 men see colour differently, and the supported and disputed colours sit close in lightness:
// WCAG 1.4.1). The word is always in the page for screen readers. html[data-status] sets which show (lib/theme.ts).
import type {ReactElement} from 'react';

import {Reveal} from './ui/reveal';

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

/** A claim's status. `focusable` when it is not inside a button or link of its own (then a click pins the word). */
export function StatusChip({status, label, focusable = false, showWord = false}: {status: ClaimStatus; label?: string; focusable?: boolean;
  showWord?: boolean}): ReactElement {
  const s = STATUS[status];
  const word = label ?? s.word;
  return <Reveal tabbable={focusable} describe={false} detail={<b>{word}</b>}>
    <span className={`st st-${status}${showWord ? ' st-always' : ''}`}><span aria-hidden="true" className="st-mark">{s.mark}</span>
      <span className="st-word">{word}</span></span>
  </Reveal>;
}

/** A Red Flag's level; its meaning is in the reveal. */
export function LevelChip({level, showMeaning = false, focusable = false, showWord = false}: {level: FlagLevel; showMeaning?: boolean;
  focusable?: boolean; showWord?: boolean}): ReactElement {
  const l = LEVEL[level];
  // The meaning is in the page too, for screen readers; on screen only with showMeaning, or in the reveal.
  return <Reveal tabbable={focusable} describe={false} detail={<><b>{l.word}</b> · {l.meaning}</>}>
    <span className={`lv lv-${level}${showWord ? ' st-always' : ''}`}><span aria-hidden="true" className="lv-bars">{l.bars}</span>
      <span className="st-word">{l.word}</span><span className={showMeaning ? 'lv-meaning st-word' : 'lv-meaning st-sr'}> · {l.meaning}</span></span>
  </Reveal>;
}

/** The AI's notice as a mark (Ony, 29 Oct): the plum AI mark, its sentence ("AI can be wrong…") on hover, focus or click. */
export function AiNotice({children}: {children: string}): ReactElement {
  return <Reveal label="About AI results" detail={children}><span className="ai-notice" aria-hidden="true">AI</span></Reveal>;
}

/** Marks material an AI wrote until a person keeps it. */
export function AiTag({date}: {date?: string}): ReactElement {
  return <span className="ai-tag">AI draft{date ? ` · ${date}` : ''}</span>;
}

export const LEVEL_WORDS = LEVEL;
export const STATUS_WORDS = STATUS;
