'use client';
// Learn › Glossary (research Knowledge §1; features/glossary/glossary-screen.tsx): every term of the catalogue.
// ?q= searches (and opens the term of that name), ?term= opens one, ?area=BO,ML chooses areas. The old
// ?indicator= links (Red Flag cards before Learn) open that indicator in the Red Flags catalogue.
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {LearnScreen} from '../../features/knowledge/learn-screen';
import {QueryProvider} from '../../lib/query-client';

export default function GlossaryPage(): ReactElement {
  const [tab, setTab] = useState<'glossary' | 'catalogue' | null>(null);
  useEffect(() => { setTab(new URLSearchParams(window.location.search).get('indicator') ? 'catalogue' : 'glossary'); }, []);
  return <QueryProvider>{tab && <LearnScreen tab={tab}/>}</QueryProvider>;
}
