'use client';

// Does it work today? (mockup WORKS_1; backend app/services/platform_checks.py): each platform the app saves from,
// tried on one public test item with the tool a real save uses. Status is shape and word: ✓ works, ◐ partly, ✕ broken,
// a dashed square for a day not checked.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getPlatformChecksOptions, getPlatformChecksQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {changePlatformChecks, runPlatformChecks} from '../../lib/generated/sdk.gen';
import type {PlatformOut} from '../../lib/generated/types.gen';

const WORD = {works: '✓ works', partly: '◐ partly', broken: '✕ broken'} as const;
const short = (iso?: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');
const daysSince = (iso: string) => Math.max(1, Math.round((Date.now() - Date.parse(`${iso}Z`)) / 86_400_000));

export function WorksToday(): ReactElement {
  const queryClient = useQueryClient();
  const [polling, setPolling] = useState(0);
  const query = useQuery({...getPlatformChecksOptions(), refetchInterval: polling > Date.now() ? 3000 : false});
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState('');
  const data = query.data;
  const refresh = () => queryClient.invalidateQueries({queryKey: getPlatformChecksQueryKey()});
  const run = async (platform?: string) => {
    try {
      await runPlatformChecks({query: platform ? {platform} : {}, throwOnError: true});
      setStatus(platform ? 'Trying it now…' : 'Trying every platform now, one request each, logged.');
      setPolling(Date.now() + 120_000);
      void refresh();
    } catch (error) { setStatus(errorMessage(error, 'The check could not start')); }
  };
  const change = async (body: {daily?: boolean; warn?: boolean; items?: Record<string, string | null>}) => {
    try { await changePlatformChecks({body, throwOnError: true}); void refresh(); setEditing(''); }
    catch (error) { setStatus(errorMessage(error, 'Not changed')); }
  };
  if (!data) return <p className="fl-note">{query.isError ? errorMessage(query.error, 'Could not load the checks') : 'Loading…'}</p>;
  const platforms = data.platforms;
  const selected: PlatformOut | undefined = platforms.find(p => p.key === picked) ?? platforms.find(p => p.state === 'broken') ?? platforms[0];
  return <div className="wt">
    <header className="wt-title"><h1>Does it work today?</h1>
      <p>Platforms change their pages without notice, and the tools that save from them break. The app saves one public test item per platform, so you know before you need it.</p>
      <button type="button" className="fl-btn" onClick={() => void run()}>Check all now</button></header>
    <section className="fl-panel wt-list" aria-label="Platforms">
      <p className="fl-cap">{platforms.length} platforms · {data.working} work today<span className="r">{data.last_checked_at ? `last checked ${short(data.last_checked_at)} UTC` : 'not checked yet'}{data.daily ? ' · next within a day' : ' · the daily check is off'}</span></p>
      <div className="wt-row wt-head" aria-hidden="true"><span>Platform</span><span>Today</span><span>Last 14 days</span><span>What is saved from it</span><span/></div>
      <ul>{platforms.map(p => <li key={p.key}><button type="button" className={`wt-row${selected?.key === p.key ? ' sel' : ''}`} onClick={() => setPicked(p.key)} aria-label={`${p.name}: ${p.state ? WORD[p.state] : 'not checked'}`}>
        <span className="wt-name"><b>{p.name}</b><small>{p.route}</small></span>
        <span className={`wt-state ${p.state ?? 'none'}`}>{p.state ? WORD[p.state] : '○ not checked'}</span>
        <span className="wt-days" aria-label="Last 14 days">{p.days.map(d => <i key={d.day} className={d.state ?? 'none'} title={`${d.day}: ${d.state ?? 'not checked'}`}/>)}</span>
        <span className="wt-saves">{p.state && p.state !== 'works' && p.detail ? p.detail : p.saves}</span>
        <span className="wt-secs">{p.seconds != null ? `${p.seconds} s` : ''}</span>
      </button></li>)}</ul>
      <p className="wt-key"><span><i className="works"/>saved as expected</span><span><i className="partly"/>saved, with something missing</span><span><i className="broken"/>not saved</span><span><i className="none"/>not checked</span></p>
    </section>
    <aside className="wt-side">
      {selected && <section className={`fl-panel${selected.state === 'broken' ? ' wt-hot' : ''}`} aria-label={`${selected.name} in detail`}>
        <p className="fl-cap">{selected.name}{selected.state === 'broken' && selected.broken_since ? ` · broken since ${short(selected.broken_since).slice(0, 10)}` : ''}
          <span className="r">{selected.state === 'broken' && selected.broken_since ? `${daysSince(selected.broken_since)} day${daysSince(selected.broken_since) === 1 ? '' : 's'}` : ''}</span></p>
        <h3 className="fl-h3">{selected.state ? selected.detail : 'Not tried yet.'}</h3>
        <dl className="wt-kv">
          <dt>Test item</dt><dd><code>{selected.test_url}</code>{selected.test_url !== selected.shipped_url && <small> (yours)</small>}</dd>
          <dt>Expected</dt><dd>{selected.saves}</dd>
          {(selected.missing ?? []).length > 0 && <><dt>Missing</dt><dd>{(selected.missing ?? []).join(', ')}</dd></>}
          <dt>Tool</dt><dd>{selected.route}, logged out</dd>
        </dl>
        {selected.state === 'broken' && <p className="fl-note">What still works: paste the link and the app keeps a screenshot of what a logged-out visitor sees. Or save the post yourself and drop the file: it is kept as a file you supplied.</p>}
        <div className="wt-acts">
          <button type="button" className="fl-btn sm" onClick={() => void run(selected.key)}>Try it now</button>
          {editing === selected.key ? <form onSubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get('url'); void change({items: {[selected.key]: String(v ?? '') || null}}); }}>
            <input name="url" defaultValue={selected.test_url} aria-label={`Test item for ${selected.name}`}/><button type="submit" className="fl-btn sm">Keep</button>
            <button type="button" className="fl-btn sm quiet" onClick={() => void change({items: {[selected.key]: null}})}>Back to the app’s item</button></form>
            : <button type="button" className="fl-btn sm quiet" onClick={() => setEditing(selected.key)}>Change the test item</button>}
        </div>
      </section>}
      <section className="fl-panel" aria-label="Before a capture">
        <p className="fl-cap">Before a capture</p>
        <label className="wt-switch"><input type="checkbox" checked={data.warn} onChange={e => void change({warn: e.target.checked})}/>Say so when a platform is broken, before saving from it</label>
      </section>
      <section className="fl-panel" aria-label="What leaves this computer">
        <p className="fl-cap">What leaves this computer<span className="r">one request per platform a day</span></p>
        <p className="fl-note">Each check asks the platform for its one public test item, from this computer’s address, logged out. Nothing about your cases is sent. {platforms.length} requests a day while it is on, each in the outbound log.</p>
        <label className="wt-switch"><input type="checkbox" checked={data.daily} onChange={e => void change({daily: e.target.checked})}/>Check once a day</label>
      </section>
      {status && <p role="status" className="fl-note">{status}</p>}
    </aside>
  </div>;
}
