'use client';
// Learn's two tabs (Catalogue · Glossary), carried by each tab's own header beside its tools.
import Link from 'next/link';
import type {ReactElement} from 'react';

export type LearnTab = 'catalogue' | 'glossary';

export function LearnTabs({tab, inv}: {tab: LearnTab; inv: string}): ReactElement {
  const withCase = (href: string) => (inv ? `${href}?inv=${encodeURIComponent(inv)}` : href);
  return <nav className="kc-tabs" aria-label="Learn">
    <Link href={withCase('/learn')} aria-current={tab === 'catalogue' ? 'page' : undefined}>Catalogue</Link>
    <Link href={withCase('/glossary')} aria-current={tab === 'glossary' ? 'page' : undefined}>Glossary</Link>
  </nav>;
}
