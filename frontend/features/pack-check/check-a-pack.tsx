'use client';

// Check a pack (mockup CHECK_4; backend app/services/pack_check.py): an evidence pack someone sends back is read on this
// computer, every file's SHA-256 recomputed and compared with the list kept when the pack was made. Status is shape and
// word: ✓ as made, ✕ changed, ? missing, + not in the list. With no pack yet, the screen is a large drop target, what the
// check does as three marks, the floor (read here, nothing sent) and a way to try it with a pack made from this case.
import {useState} from 'react';
import type {DragEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import type {PackCheckOut, PackExhibitOut, PackFileOut} from '../../lib/generated/types.gen';
import {zPackCheckOut} from '../../lib/generated/zod.gen';
import {utcStamp} from '../../lib/timestamps';

import {alterForTry} from './try-pack';

type Filter = 'all' | 'changed' | 'missing' | 'extra';
const MARK: Record<PackFileOut['state'], string> = {as_made: '✓', changed: '✕', missing: '?', extra: '+'};
const WORD: Record<PackFileOut['state'], string> = {as_made: 'as made', changed: 'changed', missing: 'missing', extra: 'not in the list'};
const short = (sha?: string | null) => (sha ? `${sha.slice(0, 4)} ${sha.slice(4, 8)} …` : '');
const by = (who?: string | null) => (!who || who === 'local-owner' ? 'this computer' : who);

export const checkPack = (investigationId: string, file: File): Promise<PackCheckOut> => {
  const form = new FormData();
  form.append('file', file);
  return api.parsed(`/api/investigations/${investigationId}/evidence-pack/check`, checkedReply(zPackCheckOut), {method: 'POST', rawBody: form});
};

/** The check as a tab-separated table, for an editor or a lawyer. */
export function checkTable(r: PackCheckOut): string {
  const head = [`Pack\t${r.file}`, `Compared with\t${r.compared_with}`, `Result\t${r.whole ? 'as it was made' : 'not as it was made'}`,
    ...(r.list_changed ? ['Note\tthe pack\'s own list was changed after it was made'] : []), '', 'File\tState\tListed SHA-256\tNow SHA-256'];
  return [...head, ...r.rows.map(x => `${x.name}\t${WORD[x.state]}\t${x.listed ?? ''}\t${x.now ?? ''}`)].join('\n') + '\n';
}

/** An exhibit not as made: the two pictures side by side when the app can draw them again, and what that means. */
function Exhibit({e}: {e: PackExhibitOut}): ReactElement {
  return <section className="pk-panel" aria-label={`Exhibit ${e.number} ${e.state}`}>
    <p className="pk-cap">Exhibit {e.number} {e.state === 'missing' ? 'missing' : 'changed'} <span>{e.file}</span></p>
    {e.ours && e.theirs ? <div className="pk-cmp">
      <figure><figcaption><Reveal detail="Drawn again from the case’s file."><span>As made</span></Reveal></figcaption><span className="pk-pic">{/* eslint-disable-next-line @next/next/no-img-element -- a small picture made here, as a data URL */}
        <img src={e.ours} alt={`Exhibit ${e.number} as made`}/></span></figure>
      <figure><figcaption>In the pack</figcaption><span className="pk-pic">{/* eslint-disable-next-line @next/next/no-img-element -- a small picture made here, as a data URL */}
        <img src={e.theirs} alt={`Exhibit ${e.number} in the pack`}/>
        {e.differs && <i className="pk-band" style={{left: `${e.differs.left * 100}%`, top: `${e.differs.top * 100}%`, width: `${e.differs.width * 100}%`, height: `${e.differs.height * 100}%`}}/>}</span></figure>
    </div> : null}
    <p className="pk-note">{e.differs ? 'The pictures differ inside the marked band. ' : e.redrawn && e.state === 'changed' ? 'The pictures differ only in how they were saved. ' : ''}
      The app keeps no copy of the pack; {e.redrawn ? 'it drew the picture again from the case’s own file, exactly as listed' : 'it cannot show the file as made'}. It cannot say who changed it.</p>
  </section>;
}

/** What rests on the files not as made: the claims an exhibit backs, the claim whose custody page changed or went, and
 *  whether the case's own file still matches its fingerprint. */
function RestsOnIt({r}: {r: PackCheckOut}): ReactElement | null {
  const items: {mark: string; tone: string; text: string}[] = [];
  for (const e of r.exhibits) {
    for (const c of e.claims) items.push({mark: '!', tone: 'warn', text: `Exhibit ${e.number}: “${c}”`});
    if (e.document) items.push({mark: e.case_file === 'matches' ? '✓' : '✕', tone: e.case_file === 'matches' ? 'ok' : 'bad',
      text: `The case’s own file, ${e.document}: ${e.case_file === 'matches' ? 'SHA-256 checked now, matches' : 'does not match its fingerprint'}.`});
  }
  for (const row of r.rows) if (row.about && row.state !== 'as_made') items.push({mark: '!', tone: 'warn', text: `${row.state === 'missing' ? 'Missing' : 'Changed'}: ${row.about}`});
  if (!items.length) return null;
  const seen = new Set<string>();
  const shown = items.filter(x => !seen.has(x.text) && Boolean(seen.add(x.text)));
  return <section className="pk-panel" aria-label="What rests on it">
    <p className="pk-cap">What rests on it <span>in this case</span></p>
    <ul className="pk-list">{shown.map(x => <li key={x.text} className={x.tone}><b aria-hidden="true">{x.mark}</b><span>{x.text}</span></li>)}</ul>
  </section>;
}

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

/** As-made rows shown before the rest fold into one line. */
const SHOWN = 8;

export function CheckAPack({investigationId}: {investigationId: string}): ReactElement {
  const [result, setResult] = useState<PackCheckOut | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [over, setOver] = useState(false);
  const [all, setAll] = useState(false);
  const run = async (file: File | undefined) => {
    if (!file) return;
    setBusy(`Reading ${file.name} on this computer…`); setError(''); setFilter('all'); setAll(false);
    try { setResult(await checkPack(investigationId, file)); } catch (err) { setResult(null); setError(errorMessage(err, 'The pack could not be checked')); }
    setBusy('');
  };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); void run(event.dataTransfer.files[0]); };
  const makePack = () => api.blob(`/api/investigations/${investigationId}/evidence-pack.zip`);
  const packName = `evidence-pack-${investigationId.slice(0, 8)}`;
  // Try it: a pack made from this case now, checked as it is or with one file changed, one taken out and one added.
  const tryIt = async (altered: boolean) => {
    setBusy('Making a pack from this case on this computer…'); setError('');
    try {
      const made = await makePack();
      const bytes = altered ? (await alterForTry(new Uint8Array(await made.arrayBuffer()))).zip : made;
      await run(new File([bytes as BlobPart], `${packName}${altered ? '-one-file-changed' : ''}.zip`, {type: 'application/zip'}));
    } catch (err) { setBusy(''); setError(errorMessage(err, 'A pack could not be made from this case')); }
  };
  const freshPack = async () => {
    setBusy('Making a fresh pack on this computer…'); setError('');
    try { download(await makePack(), `${packName}.zip`); } catch (err) { setError(errorMessage(err, 'A fresh pack could not be made')); }
    setBusy('');
  };
  const exportCheck = () => {
    if (!result) return;
    download(new Blob([checkTable(result)], {type: 'text/tab-separated-values'}), `pack-check-${(result.pack_id ?? 'pack').slice(0, 8)}.tsv`);
  };
  const sorted = (result?.rows ?? []).filter(r => filter === 'all' || r.state === filter).sort((a, b) => Number(a.state === 'as_made') - Number(b.state === 'as_made'));
  const notMade = sorted.filter(r => r.state !== 'as_made').length;
  const folded = filter === 'all' && !all ? Math.max(0, sorted.length - notMade - SHOWN) : 0;
  const rows = folded ? sorted.slice(0, sorted.length - folded) : sorted;
  const c = result?.counts ?? {};
  const input = <input type="file" accept=".zip,application/zip" onChange={e => { void run(e.target.files?.[0]); e.target.value = ''; }} aria-label="Choose an evidence pack"/>;
  const dragProps = {onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(true); }, onDragLeave: () => setOver(false), onDrop};

  if (!result) return <div className="pk pk-start" aria-label="Check a pack">
    <label className={`pk-drop big${over ? ' over' : ''}${busy ? ' busy' : ''}`} {...dragProps}>
      <span className="pk-ico" aria-hidden="true">↓</span>
      <b className="pk-drop-title">{busy || 'Drop an evidence pack here'}</b>
      {!busy && <span className="pk-choose">or choose a .zip</span>}
      {/* The floor: what leaves the computer stays in sight (Ony, 29 Oct). */}
      <span className="pk-floor"><span aria-hidden="true">⌂</span> Read on this computer. Nothing is sent anywhere, and nothing of the pack is kept.</span>
      {input}
    </label>
    <div className="pk-aside">
      <section className="pk-panel" aria-label="What the check does">
        <p className="pk-cap">What the check does</p>
        <ol className="pk-how">
          <li><span className="pk-how-mark" aria-hidden="true">#</span><Reveal detail="Its SHA-256, worked out again from the bytes in the pack, here on this computer.">
            <span>Recomputes each file’s fingerprint</span></Reveal></li>
          <li><span className="pk-how-mark" aria-hidden="true">≡</span><Reveal detail="The list kept here when the pack was made, for a pack made in this case; otherwise the MANIFEST.sha256 inside the pack, and its signature.">
            <span>Compares it with the pack’s own list</span></Reveal></li>
          <li><span className="pk-how-mark states" aria-hidden="true"><i className="ok">✓</i><i className="bad">✕</i><i className="bad">?</i><i className="add">+</i></span>
            <Reveal detail="✓ as made · ✕ changed · ? missing · + not in the list. For a changed exhibit it shows the picture as made beside the one in the pack, and what in the case rests on it.">
              <span>Says what changed, is missing or was added</span></Reveal></li>
        </ol>
      </section>
      <section className="pk-panel pk-try" aria-label="Try it">
        <p className="pk-cap">No pack to hand?</p>
        <div className="pk-acts">
          <button type="button" disabled={Boolean(busy)} onClick={() => void tryIt(false)}>Make a pack from this case and check it</button>
          <Reveal tabbable={false} detail="The same pack with, here in the browser, one exhibit changed, one custody page taken out and a copy added: to see what the check says when a pack is not as it was made.">
            <button type="button" disabled={Boolean(busy)} onClick={() => void tryIt(true)}>…with one file changed</button></Reveal>
        </div>
      </section>
    </div>
    {error && <p className="pk-error" role="alert">{error}</p>}
  </div>;

  return <div className="pk" aria-label="Check a pack">
    <label className={`pk-drop${over ? ' over' : ''}`} {...dragProps}>
      <span className="pk-ico" aria-hidden="true">↓</span>
      <span className="pk-drop-text"><b>{result.file}</b>
        <small>{busy || `${result.files} files · read on this computer, nothing sent`}</small></span>
      <span className="pk-another">Check another</span>
      {input}
    </label>
    {error && <p className="pk-error" role="alert">{error}</p>}
    <div className="pk-grid">
      <section className="pk-panel pk-files" aria-label="Every file against the list">
        <p className="pk-cap">Every file against {result.made_here ? 'the list kept here' : 'the pack’s own list'} <span>{result.rows.length} entries</span></p>
        <div className="pk-seg" role="group" aria-label="Show">
          {(['all', 'changed', 'missing', 'extra'] as Filter[]).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? `All ${result.rows.length}` : `${f === 'extra' ? 'Not in the list' : f[0].toUpperCase() + f.slice(1)} ${c[f] ?? 0}`}</button>)}
        </div>
        <ul className="pk-rows">{rows.map(r => <li key={r.name} className={`pk-row ${r.state}`}>
          {/* The fingerprints and what the file is are on reveal; a file not as made keeps its word in sight. */}
          <Reveal label={WORD[r.state]} detail={WORD[r.state]}><b className="pk-mark" aria-hidden="true">{MARK[r.state]}</b></Reveal>
          <Reveal detail={<>{r.about && <span className="rv-row">{r.about}</span>}<span className="rv-row rv-mono">{r.state === 'changed' ? `listed ${short(r.listed)} · now ${short(r.now)}` : short(r.listed ?? r.now)}</span></>}>
            <span className="pk-name">{r.name}</span></Reveal>
          <span className="pk-word">{r.state === 'as_made' ? '' : WORD[r.state]}</span>
        </li>)}</ul>
        {folded > 0 && <button type="button" className="pk-more" onClick={() => setAll(true)}>… {folded} more, all as made</button>}
      </section>
      <div className="pk-side">
        <section className={`pk-panel pk-seal ${result.whole ? 'ok' : 'bad'}`} aria-label="Result">
          <p className="pk-cap">Result</p>
          <h2><span aria-hidden="true">{result.whole ? '✓ ' : '✕ '}</span>{result.whole ? 'As it was made' : 'Not as it was made'}</h2>
          <dl className="pk-counts">
            <div className="as_made"><dt>as made</dt><dd>{c.as_made ?? 0}</dd></div><div className={c.changed ? 'bad' : ''}><dt>changed</dt><dd>{c.changed ?? 0}</dd></div>
            <div className={c.missing ? 'bad' : ''}><dt>missing</dt><dd>{c.missing ?? 0}</dd></div><div className={c.extra ? 'add' : ''}><dt>not in the list</dt><dd>{c.extra ?? 0}</dd></div>
          </dl>
          <p className="pk-note">{result.made_here
            ? `Made by ${by(result.made_by)} for this case on ${result.made_at ? utcStamp(result.made_at) : ''}${result.draft ? ', as a draft' : ''}: compared with the list kept here when it was made.`
            : result.made_in_other_case ? `Made on this computer for another case (${result.made_in_other_case}): compared with its own list only. Open that case to check it against the list kept there.`
            : 'Not made in this case: compared with its own list, which shows it is whole but not that nobody made a new list after changing it.'}
            {result.list_changed ? ' The pack’s own list was changed after it was made.' : ''}</p>
          <p className={`pk-sig ${result.signature.state}`}><b aria-hidden="true">{result.signature.state === 'valid' ? '✓' : result.signature.state === 'invalid' ? '✕' : '○'}</b>
            {result.signature.state === 'none' ? 'Not signed.'
              : result.signature.state === 'invalid' ? `The signature does not match the list${result.signature.fingerprint ? ` (key ${result.signature.fingerprint})` : ''}: the list was changed after signing, or the signature is not for it.`
              : result.signature.ours ? `Signed with this computer’s key (${result.signature.fingerprint}).`
              : `Signed with another key, ${result.signature.fingerprint}: ask its owner to read you its fingerprint.`}
            {result.signature.state === 'valid' && !result.signature.as_made ? ' Not the key this pack was made with.' : ''}</p>
        </section>
        {result.exhibits.map(e => <Exhibit key={`${e.number}-${e.file}`} e={e}/>)}
        <RestsOnIt r={result}/>
        <div className="pk-acts">
          <button type="button" onClick={exportCheck}>Export this check (for an editor or lawyer)</button>
          <button type="button" className="teal" disabled={Boolean(busy)} onClick={() => void freshPack()}>Make a fresh pack</button>
        </div>
      </div>
    </div>
  </div>;
}
