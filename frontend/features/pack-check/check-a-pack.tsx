'use client';

// Check a pack (mockup CHECK_4; backend app/services/pack_check.py): an evidence pack someone sends back is read on this
// computer, every file's SHA-256 recomputed and compared with the list kept when the pack was made. Status is shape and
// word: ✓ as made, ✕ changed, ? missing, + not in the list.
import {useState} from 'react';
import type {DragEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import type {PackCheckOut, PackExhibitOut, PackFileOut} from '../../lib/generated/types.gen';
import {zPackCheckOut} from '../../lib/generated/zod.gen';

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

function Exhibit({e}: {e: PackExhibitOut}): ReactElement {
  return <section className="pk-panel" aria-label={`Exhibit ${e.number} ${e.state}`}>
    <p className="pk-cap">Exhibit {e.number} {e.state === 'missing' ? 'missing' : 'changed'} <span>{e.file}</span></p>
    {e.ours && e.theirs ? <div className="pk-cmp">
      <figure><figcaption>As made · drawn again from the case’s file</figcaption><span className="pk-pic">{/* eslint-disable-next-line @next/next/no-img-element -- a small picture made here, as a data URL */}
        <img src={e.ours} alt={`Exhibit ${e.number} as made`}/></span></figure>
      <figure><figcaption>In the pack</figcaption><span className="pk-pic">{/* eslint-disable-next-line @next/next/no-img-element -- a small picture made here, as a data URL */}
        <img src={e.theirs} alt={`Exhibit ${e.number} in the pack`}/>
        {e.differs && <i className="pk-band" style={{left: `${e.differs.left * 100}%`, top: `${e.differs.top * 100}%`, width: `${e.differs.width * 100}%`, height: `${e.differs.height * 100}%`}}/>}</span></figure>
    </div> : null}
    <p className="pk-note">{e.differs ? 'The pictures differ inside the marked band. ' : e.redrawn && e.state === 'changed' ? 'The pictures differ only in how they were saved. ' : ''}
      The app keeps no copy of the pack; {e.redrawn ? 'it drew the picture again from the case’s own file, exactly as listed' : 'it cannot show the file as made'}. It cannot say who changed it.</p>
    <ul className="pk-list">
      {e.claims.map(c => <li key={c}><b aria-hidden="true">!</b>Rests on it: “{c}”</li>)}
      {e.document && <li><b aria-hidden="true">{e.case_file === 'matches' ? '✓' : '✕'}</b>The case’s own file, {e.document}: {e.case_file === 'matches' ? 'SHA-256 checked now, matches' : 'does not match its fingerprint'}.</li>}
    </ul>
  </section>;
}

export function CheckAPack({investigationId}: {investigationId: string}): ReactElement {
  const [result, setResult] = useState<PackCheckOut | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [over, setOver] = useState(false);
  const run = async (file: File | undefined) => {
    if (!file) return;
    setBusy(`Reading ${file.name} on this computer…`); setError(''); setFilter('all');
    try { setResult(await checkPack(investigationId, file)); } catch (err) { setResult(null); setError(errorMessage(err, 'The pack could not be checked')); }
    setBusy('');
  };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); void run(event.dataTransfer.files[0]); };
  const exportCheck = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([checkTable(result)], {type: 'text/tab-separated-values'}));
    const a = document.createElement('a');
    a.href = url; a.download = `pack-check-${(result.pack_id ?? 'pack').slice(0, 8)}.tsv`; a.click();
    URL.revokeObjectURL(url);
  };
  const rows = (result?.rows ?? []).filter(r => filter === 'all' || r.state === filter).sort((a, b) => Number(a.state === 'as_made') - Number(b.state === 'as_made'));
  const c = result?.counts ?? {};
  return <div className="pk" aria-label="Check a pack">
    <p className="pk-lede">An evidence pack someone sends back: the app recomputes every file’s fingerprint here and says what is as it was made, what changed and what is missing. Nothing is sent anywhere, and nothing of the pack is kept.</p>
    <label className={`pk-drop${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <span className="pk-ico" aria-hidden="true">↓</span>
      <span><b>{result ? result.file : 'Drop an evidence pack (.zip) here, or choose one'}</b>
        <small>{busy || (result ? `${result.files} files · read on this computer, nothing sent` : 'A pack made by this app, or by another Workbench')}</small></span>
      <input type="file" accept=".zip,application/zip" onChange={e => void run(e.target.files?.[0])} aria-label="Choose an evidence pack"/>
    </label>
    {error && <p className="pk-error" role="alert">{error}</p>}
    {result && <div className="pk-grid">
      <section className="pk-panel pk-files" aria-label="Every file against the list">
        <p className="pk-cap">Every file against {result.made_here ? 'the list kept here' : 'the pack’s own list'} <span>{result.rows.length} entries</span></p>
        <div className="pk-seg" role="group" aria-label="Show">
          {(['all', 'changed', 'missing', 'extra'] as Filter[]).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? `All ${result.rows.length}` : `${f === 'extra' ? 'Not in the list' : f[0].toUpperCase() + f.slice(1)} ${c[f] ?? 0}`}</button>)}
        </div>
        <ul className="pk-rows">{rows.map(r => <li key={r.name} className={`pk-row ${r.state}`}>
          <b className="pk-mark" aria-hidden="true">{MARK[r.state]}</b><span className="pk-name" title={r.name}>{r.name}{r.about && <small>{r.about}</small>}</span>
          <code>{r.state === 'changed' ? `listed ${short(r.listed)} · now ${short(r.now)}` : short(r.listed ?? r.now)}</code><span className="pk-word">{WORD[r.state]}</span>
        </li>)}</ul>
      </section>
      <div className="pk-side">
        <section className={`pk-panel pk-seal ${result.whole ? 'ok' : 'bad'}`} aria-label="Result">
          <p className="pk-cap">Result</p>
          <h2><span aria-hidden="true">{result.whole ? '✓ ' : '✕ '}</span>{result.whole ? 'As it was made' : 'Not as it was made'}</h2>
          <dl className="pk-counts">
            <div><dt>as made</dt><dd>{c.as_made ?? 0}</dd></div><div><dt>changed</dt><dd>{c.changed ?? 0}</dd></div>
            <div><dt>missing</dt><dd>{c.missing ?? 0}</dd></div><div><dt>not in the list</dt><dd>{c.extra ?? 0}</dd></div>
          </dl>
          <p className="pk-note">{result.made_here
            ? `Made by ${by(result.made_by)} for this case on ${result.made_at?.slice(0, 16).replace('T', ' ')} UTC${result.draft ? ', as a draft' : ''}: compared with the list kept here when it was made.`
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
        <div className="pk-acts"><button type="button" onClick={exportCheck}>Export this check (for an editor or lawyer)</button></div>
      </div>
    </div>}
  </div>;
}
