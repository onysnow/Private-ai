'use client';
// The frame every chart in the workbench sits in. Each kind of chart fills
// it with its own parts -- the network its arrangement switch and link
// filters, the timeline its date range, the map its attribution -- but the
// anatomy is the same, so a reporter learns where to look once:
//
//   header   the chart's title, the question it answers, and its RULE: the
//            one sentence that says why each mark sits where it sits ("each
//            owner sits above what it owns"), with why that arrangement was
//            chosen when the chart chose it;
//   tools    the controls that change this chart, top right, beside what
//            they change;
//   canvas   the drawing, on a ground of its own;
//   key      what each colour, line and size means -- only the codes the
//            drawing uses -- beside the drawing on a wide screen, under it
//            on a narrow one;
//   footer   counts and caveats: how many records, what was left out and why.
//
// Grouping a chart with its own key and controls inside one bounded region
// follows the Gestalt principle of common region (Palmer, "Common region: a
// new principle of perceptual grouping", Cognitive Psychology 24, 1992):
// elements inside one enclosed area are seen as belonging together, so the
// key reads as this chart's key and not the page's. The frame is a <figure>
// whose label is the title, and the key an <aside> named "Key", so a screen
// reader can find both.
import {useId} from 'react';
import type {ReactElement, ReactNode} from 'react';

export type FrameRule = {
  /** The arrangement's name, e.g. "Arranged by control:". */
  label: string;
  /** Why each mark sits where it sits, in one sentence. */
  text: string;
  /** Why this arrangement was chosen, when the chart chose it. */
  why?: string;
};

type Props = {
  /** Which kind of chart, for its own styling (data-kind). */
  kind: string;
  title: string;
  /** The question the chart answers, in the reporter's words. */
  question?: string;
  rule?: FrameRule;
  tools?: ReactNode;
  legend?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
};

export function ChartFrame({kind, title, question, rule, tools, legend, footer, children, testId}: Props): ReactElement {
  const titleId = useId();
  return <figure className="chart-frame" data-kind={kind} aria-labelledby={titleId} data-testid={testId ?? `chart-frame-${kind}`}>
    <header className="cf-head">
      <div className="cf-titles">
        <h3 id={titleId} className="cf-title">{title}</h3>
        {question && <p className="cf-question">{question}</p>}
        {rule && <p className="cf-rule" data-testid="chart-rule"><b>{rule.label}</b> {rule.text}
          {rule.why && <span className="cf-why"> {rule.why}</span>}</p>}
      </div>
      {tools && <div className="cf-tools">{tools}</div>}
    </header>
    <div className={legend ? 'cf-body cf-with-key' : 'cf-body'}>
      <div className="cf-canvas">{children}</div>
      {legend && <aside className="cf-key" aria-label="Key">{legend}</aside>}
    </div>
    {footer && <footer className="cf-foot">{footer}</footer>}
  </figure>;
}

/** One group of the key: a heading, what channel it is, and its rows. */
export function KeySection({title, channel, children}: {title: string; channel?: string; children: ReactNode}): ReactElement {
  return <section className="cf-key-section">
    <h4>{title}{channel && <small>{channel}</small>}</h4>
    <ul>{children}</ul>
  </section>;
}

/** One row of the key: a swatch drawn as the chart draws it, and its meaning. */
export function KeyRow({swatch, children}: {swatch: ReactNode; children: ReactNode}): ReactElement {
  return <li className="cf-key-row"><span className="cf-swatch" aria-hidden>{swatch}</span><span>{children}</span></li>;
}

/** A line as the chart draws it, for the key. */
export function LineSwatch({colour, dash, width = 2.5, arrow = false}: {colour: string; dash?: string; width?: number; arrow?: boolean}): ReactElement {
  return <svg width="36" height="14" viewBox="0 0 36 14">
    <line x1="2" y1="7" x2={arrow ? 27 : 34} y2="7" stroke={colour} strokeWidth={width} strokeDasharray={dash}/>
    {arrow && <path d="M27,3 L34,7 L27,11 z" fill={colour}/>}
  </svg>;
}

/** A filled block as the chart draws it, for the key. */
export function BlockSwatch({colour, dashed = false}: {colour: string; dashed?: boolean}): ReactElement {
  return <svg width="20" height="20" viewBox="0 0 20 20">
    <rect x="1" y="1" width="18" height="18" rx="3" fill={colour}/>
    {dashed && <rect x="4" y="4" width="12" height="12" fill="none" stroke="#1a2328" strokeWidth="1.5" strokeDasharray="3 2"/>}
  </svg>;
}

/** The red "!" a chart puts on a contested record. */
export function ContestedMark({size = 16}: {size?: number}): ReactElement {
  return <svg width={size} height={size} viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#9f3632"/>
    <text x="8" y="11.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#f3e9d7">!</text></svg>;
}

/** A choice of one among a few, shown as joined buttons (a radio group). */
export function Segmented<T extends string>({label, options, value, onChange}: {
  label: string; options: {value: T; label: string; title?: string}[]; value: T; onChange: (value: T) => void;
}): ReactElement {
  // The ARIA radio group pattern: one tab stop, the arrow keys move the choice.
  const move = (step: number) => {
    const index = options.findIndex(o => o.value === value);
    onChange(options[(index + step + options.length) % options.length].value);
  };
  return <div className="cf-segmented" role="radiogroup" aria-label={label}
    onKeyDown={event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    }}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} title={option.title}
      tabIndex={option.value === value ? 0 : -1}
      className={option.value === value ? 'on' : undefined} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

/** A count in the footer: the number, then what it counts. */
export function FootStat({value, children}: {value: number | string; children: ReactNode}): ReactElement {
  return <span className="cf-stat"><b>{value}</b> {children}</span>;
}
