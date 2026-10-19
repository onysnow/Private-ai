// @vitest-environment jsdom
// The frame every chart sits in (components/charts/chart-frame.tsx): a
// figure named by its title, the rule in its header, a key a screen reader
// can find, and a one-of-a-few choice that moves with the arrow keys (the
// ARIA radio group pattern).
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {afterEach, describe, expect, it} from 'vitest';

import {ChartFrame, KeyRow, KeySection, Segmented} from '../components/charts/chart-frame';

afterEach(cleanup);

function Choice(): React.ReactElement {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return <Segmented label="View" value={value} onChange={setValue} options={[{value: 'a', label: 'A'}, {value: 'b', label: 'B'}, {value: 'c', label: 'C'}]}/>;
}

describe('ChartFrame', () => {
  it('is a figure named by its title, with its rule, its key and its footer', () => {
    render(<ChartFrame kind="test" title="Who is linked to whom" rule={{label: 'Arranged by control:', text: 'owners above.', why: 'Chosen because 2 links say so.'}}
      legend={<KeySection title="Parties" channel="colour"><KeyRow swatch={<span/>}>Person</KeyRow></KeySection>} footer={<span>2 parties</span>}>
      <div>drawing</div>
    </ChartFrame>);
    const figure = screen.getByRole('figure', {name: 'Who is linked to whom'});
    expect(figure).toHaveAttribute('data-kind', 'test');
    expect(screen.getByTestId('chart-rule')).toHaveTextContent('Arranged by control: owners above. Chosen because 2 links say so.');
    expect(screen.getByRole('complementary', {name: 'Key'})).toHaveTextContent('PartiescolourPerson');
    expect(screen.getByText('2 parties')).toBeInTheDocument();
  });

  it('moves a one-of-a-few choice with the arrow keys, from one tab stop', async () => {
    render(<Choice/>);
    const user = userEvent.setup();
    const [a, b, c] = screen.getAllByRole('radio');
    expect([a.tabIndex, b.tabIndex, c.tabIndex]).toEqual([0, -1, -1]);
    a.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', {name: 'B'})).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', {name: 'C'})).toHaveAttribute('aria-checked', 'true');
  });
});
