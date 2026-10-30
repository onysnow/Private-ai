'use client';
// The dossier's small parts, in the converted app's grammar (DECISIONS_LOG 38): an icon action named on hover and to
// screen readers, a section that is drawn only when it holds something and shows a few rows then "Show all", and the
// status of a lead, task, dated event or outside finding as a shape with its word on hover.
import {useState} from 'react';
import type {ComponentType, MouseEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';

type IconProps = {size?: number; 'aria-hidden'?: boolean | 'true' | 'false'; strokeWidth?: number};

/** A row or header action as a small icon button; its name is its accessible name and its hover card. */
export function IconAct({icon: Icon, label, onClick, disabled = false, pressed, tone}: {
  icon: ComponentType<IconProps>; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; tone?: 'pri' | 'yes' | 'no';
}): ReactElement {
  return <Reveal tabbable={false} describe={false} detail={label}>
    <button type="button" className={`dsr-act${tone ? ` ${tone}` : ''}`} aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}>
      <Icon size={15} aria-hidden="true" strokeWidth={2}/></button></Reveal>;
}

/** The same, as a link (to another screen or an outside page). */
export function IconLink({icon: Icon, label, href, external = false, onClick}: {
  icon: ComponentType<IconProps>; label: string; href: string; external?: boolean; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}): ReactElement {
  return <Reveal tabbable={false} describe={false} detail={label}>
    <a className="dsr-act" href={href} aria-label={label} onClick={onClick} {...(external ? {target: '_blank', rel: 'noreferrer'} : {})}>
      <Icon size={15} aria-hidden="true" strokeWidth={2}/></a></Reveal>;
}

/** How many rows a section shows before "Show all". */
export const AT_REST = 5;

/** A section of the dossier: an icon, a title, a count, and its rows; not drawn at all when it has none. `id` is what a
 *  figure jumps to; `tools` sit at the right of the title (a link to the full screen). */
export function Section<T>({id, icon: Icon, title, count, about, items, row, tools, alert, children}: {
  id: string; icon: ComponentType<IconProps>; title: string; count?: number; about?: ReactNode; items: T[];
  row?: (item: T, index: number) => ReactNode; tools?: ReactNode; alert?: ReactNode; children?: ReactNode;
}): ReactElement | null {
  const [all, setAll] = useState(false);
  if (items.length === 0 && !children) return null;
  const shown = all ? items : items.slice(0, AT_REST);
  const heading = <h3 className="dsr-sec-title" id={`${id}-h`} tabIndex={-1}><Icon size={15} aria-hidden="true"/> {title}
    {count !== undefined && <span className="dsr-sec-n">{count}</span>}</h3>;
  return <section className="dsr-sec" id={id} aria-labelledby={`${id}-h`}>
    <div className="dsr-sec-head">
      {about ? <Reveal detail={about}>{heading}</Reveal> : heading}
      {alert}
      {tools && <span className="dsr-sec-tools">{tools}</span>}
    </div>
    {children}
    {items.length > 0 && row && <ul className="dsr-rows">{shown.map((item, i) => row(item, i))}</ul>}
    {items.length > AT_REST && <button type="button" className="dsr-more-rows" aria-expanded={all} onClick={() => setAll(v => !v)}>
      {all ? 'Show fewer' : `Show all ${items.length}`}</button>}
  </section>;
}

/** The status of a lead, task, dated event or outside finding as a shape; its word on hover (Ony, 29 Oct). The shapes
 *  follow Leads (features/leads/leads-horizons.tsx) and The Drop: ✓ done, ◐ under way, ○ not started, ✕ blocked. */
const STATE_MARK: Record<string, string> = {
  unreviewed: '◌', active: '●', blocked: '✕', resolved: '✓', rejected: '⊘', todo: '○', in_progress: '◐', done: '✓', cancelled: '–',
  verified: '✓', confirmed: '✓', unverified: '○', disputed: '✕', accepted: '✓', needs_followup: '!', dismissed: '–',
};
export function StateMark({state}: {state: string}): ReactElement {
  return <Reveal label={state} detail={state.replace(/_/g, ' ')}><span className="ds-state" aria-hidden="true">{STATE_MARK[state] ?? '·'}</span></Reveal>;
}

/** A property name in words: registrationNumber → registration number. */
export function propWords(prop: string): string {
  return prop.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

/** A country code as its name ("gb" → United Kingdom), or the value as it is. */
export function countryName(code: string): string {
  if (!/^[a-z]{2}$/i.test(code)) return code;
  try { return new Intl.DisplayNames(['en'], {type: 'region'}).of(code.toUpperCase()) ?? code; } catch { return code; }
}
