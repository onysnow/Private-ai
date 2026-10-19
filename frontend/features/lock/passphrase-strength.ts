'use client';
// How strong a passphrase is, by zxcvbn-ts (ADR-0016): its dictionaries are large, so they load only when a passphrase
// is being typed. The server still refuses anything under 12 characters.
import {useEffect, useState} from 'react';
import type {ZxcvbnFactory} from '@zxcvbn-ts/core';

export type Strength = {score: 0 | 1 | 2 | 3 | 4; bits: number; words: number; warning: string};

let checker: Promise<ZxcvbnFactory> | null = null;

function load(): Promise<ZxcvbnFactory> {
  checker ??= Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')])
    .then(([core, common, en]) => new core.ZxcvbnFactory({
      dictionary: {...common.dictionary, ...en.dictionary}, graphs: common.adjacencyGraphs, translations: en.translations,
    }));
  return checker;
}

export function useStrength(passphrase: string): Strength | null {
  const [strength, setStrength] = useState<Strength | null>(null);
  useEffect(() => {
    if (!passphrase) { setStrength(null); return; }
    let live = true;
    void load().then(z => {
      if (!live) return;
      const r = z.check(passphrase);
      setStrength({score: r.score, bits: Math.round(r.guessesLog10 * Math.log2(10)), words: passphrase.trim().split(/\s+/).length,
        warning: r.feedback.warning ?? ''});
    }).catch(() => undefined);
    return () => { live = false; };
  }, [passphrase]);
  return strength;
}

export const STRENGTH_WORD = ['Very weak', 'Weak', 'Fair', 'Strong', 'Strong'] as const;
