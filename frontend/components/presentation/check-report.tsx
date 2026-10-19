// A chart's check report in words (backend/app/visuals/checker.py): every
// failed rule and every warning by its number, its name from the visuals
// design doc ("How every chart gets checked"; the numbers never change) and
// the checker's own message. Shared by the chart builder and the style
// panel, so a reporter reads a failure the same way wherever it shows.
import type {ReactElement} from 'react';

import {Badge} from '@/components/ui/badge';

export type CheckItem = {rule: number, message: string};
export type CheckSummary = {ok: boolean, errors: CheckItem[], warnings: CheckItem[], checked_rules: number[]};

export const RULE_NAMES: Record<number, string> = {
  0: 'The numbers drawn match the data',
  1: 'Bars and areas start at zero',
  2: 'No log scale on bars or areas, or on data with zero or negative values',
  3: 'Never show a negative value as a size',
  4: 'Stack only bars and areas; never total the same field twice',
  5: 'A donut has four slices at most, adding to 100%',
  6: 'No second value axis',
  7: 'No 3D, no upside-down axes, evenly spaced ticks',
  8: 'Never join unrelated categories with a line',
  9: 'Show amounts by position or length first; never an order in random colours',
  10: 'Eight colours at most; fold the rest into "Other"',
  11: 'Text and neighbouring colours have enough contrast',
  12: 'Never rely on colour alone',
  13: 'A title that states the finding, alt text, a description and a data table',
  14: 'Chart text at least 12 px',
  15: 'A source line; every value links to a record',
  16: 'Show how many records sit behind each value',
  17: 'Shaded maps show rates, in 3 to 7 steps',
  18: 'Large networks offer a grid view',
  19: 'Never add up different currencies',
  20: 'A value that rests on one record is flagged',
};

export function RuleList({items, warning}: {items: CheckItem[], warning?: boolean}): ReactElement | null {
  if (!items.length) return null;
  return <ul className="grid gap-1" aria-label={warning ? 'Warnings' : 'Failed rules'}>
    {items.map((item, index) => <li key={`${item.rule}-${index}`}>
      <b>Rule {item.rule}{warning ? ' (warning)' : ''}</b> · {RULE_NAMES[item.rule] ?? 'Design rule'}: {item.message}
    </li>)}
  </ul>;
}

/** Passes or fails, then the failed rules and the warnings. */
export function CheckReportView({report, kindName}: {report: CheckSummary, kindName: string}): ReactElement {
  return <section aria-label="Check report" className="grid gap-1">
    {report.ok
      ? <p><Badge variant="outline">Passes the design checks</Badge> {report.checked_rules.length} rules were checked for this {kindName.toLowerCase()}.</p>
      : <p><Badge variant="destructive">Fails {report.errors.length} design {report.errors.length === 1 ? 'rule' : 'rules'}</Badge> A chart that fails is not put in a draft or a deck until it is fixed.</p>}
    <RuleList items={report.errors}/>
    <RuleList items={report.warnings} warning/>
  </section>;
}
