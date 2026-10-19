'use client';
// Learn's tabs (Catalogue · Glossary · Practise; research Knowledge §6), carried by each tab's own header beside its
// tools. Practise lives on the catalogue's page (/learn?tab=practise): there it is a button that switches in place,
// from the glossary a link.
import Link from 'next/link';
import type {ReactElement} from 'react';

export type LearnTab = 'catalogue' | 'glossary' | 'practise';

export function LearnTabs({tab, inv, onTab}: {tab: LearnTab; inv: string; onTab?: (tab: 'catalogue' | 'practise') => void}): ReactElement {
  const withCase = (href: string, extra = '') => {
    const params = [extra, inv ? `inv=${encodeURIComponent(inv)}` : ''].filter(Boolean).join('&');
    return params ? `${href}?${params}` : href;
  };
  const current = (t: LearnTab) => (tab === t ? 'page' as const : undefined);
  return <nav className="kc-tabs" aria-label="Learn">
    {onTab ? <a href={withCase('/learn')} aria-current={current('catalogue')} onClick={e => { e.preventDefault(); onTab('catalogue'); }}>Catalogue</a>
      : <Link href={withCase('/learn')} aria-current={current('catalogue')}>Catalogue</Link>}
    <Link href={withCase('/glossary')} aria-current={current('glossary')}>Glossary</Link>
    {onTab ? <a href={withCase('/learn', 'tab=practise')} aria-current={current('practise')} onClick={e => { e.preventDefault(); onTab('practise'); }}>Practise</a>
      : <Link href={withCase('/learn', 'tab=practise')} aria-current={current('practise')}>Practise</Link>}
  </nav>;
}
