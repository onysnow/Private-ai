'use client';
// Following's marks (Ony, 29 Oct: a thing's type is a mark, named on hover or click): a source's kind is its icon, its
// health a shape and colour. Shared by Following, the style guide and any screen that names a followed source.
import type {ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {MonitorOut} from '../../lib/generated/types.gen';

export type SourceKind = MonitorOut['kind'];
export type SourceHealth = MonitorOut['health'];

export const KIND_NAME: Record<SourceKind, [string, string]> = {
  feed: ['News feed', 'An RSS or Atom feed (a YouTube channel’s too): each new entry waits here.'],
  sitemap: ['Sitemap', 'The site’s list of its pages: each new address waits here.'],
  page: ['Watched page', 'One page whose text is compared at each look; every version is kept.'],
  podcast: ['Podcast', 'A podcast’s feed: each new episode waits here, with its transcript when the publisher offers one.'],
  account: ['Public account', 'An open-protocol account (Bluesky, Mastodon) or a public Telegram channel, read logged out.'],
  closed: ['Closed platform', 'No monitor: a pasted link is captured logged out, or you supply the files.'],
  mailbox: ['Newsletter mailbox', 'A mailbox the case reads for newsletters; remote images are never loaded.'],
};

export const HEALTH: Record<SourceHealth, {word: string; glyph: string; tone: string}> = {
  works: {word: 'Works', glyph: '●', tone: 'ok'},
  unchecked: {word: 'Not looked at yet', glyph: '○', tone: 'quiet'},
  moved: {word: 'Moved', glyph: '↪', tone: 'amber'},
  broken: {word: 'Not working', glyph: '✕', tone: 'bad'},
  paused: {word: 'Paused', glyph: '‖', tone: 'quiet'},
  closed: {word: 'Link capture only', glyph: '◌', tone: 'quiet'},
};

const PATHS: Record<SourceKind, ReactNode> = {
  feed: <><circle cx="4" cy="12" r="1.6"/><path d="M3 7a6 6 0 0 1 6 6M3 3a10 10 0 0 1 10 10" fill="none"/></>,
  sitemap: <><rect x="6" y="2" width="4" height="3"/><rect x="1.5" y="11" width="4" height="3"/><rect x="10.5" y="11" width="4" height="3"/><path d="M8 5v3M3.5 11V8h9v3" fill="none"/></>,
  page: <><path d="M3.5 1.5h6l3 3v10h-9z" fill="none"/><path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3" fill="none"/></>,
  podcast: <><rect x="6" y="1.5" width="4" height="8" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none"/></>,
  account: <><circle cx="8" cy="5.5" r="3" fill="none"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0" fill="none"/></>,
  closed: <><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="none"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/></>,
  mailbox: <><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none"/><path d="M2 4.5l6 4.5 6-4.5" fill="none"/></>,
};

export function KindIcon({kind}: {kind: SourceKind}): ReactElement {
  return <svg className="fl-kind" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="1.2">{PATHS[kind]}</svg>;
}

/** A source's kind as its icon, named on hover, focus or click. */
export function KindMark({kind, tabbable = false}: {kind: SourceKind; tabbable?: boolean}): ReactElement {
  const [name, meaning] = KIND_NAME[kind];
  return <Reveal tabbable={tabbable} label={name} detail={<><b>{name}</b><span className="rv-row">{meaning}</span></>}><KindIcon kind={kind}/></Reveal>;
}

/** A source's health as a shape and colour, named (with its detail) on hover, focus or click. */
export function HealthMark({health, detail, tabbable = false}: {health: SourceHealth; detail?: ReactNode; tabbable?: boolean}): ReactElement {
  const h = HEALTH[health];
  return <Reveal tabbable={tabbable} label={h.word} detail={<><b>{h.word}</b>{detail}</>}>
    <span className={`fl-health ${h.tone}`} aria-hidden="true">{h.glyph}</span></Reveal>;
}
