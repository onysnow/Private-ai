'use client';
// Settings › People and access (ADR-0016, mockup ACCOUNT_2): who can reach this case, by role shown with a shape and a
// word, how each gets in (this computer, or a key that expires), who decided what, and adding a person with a one-time
// key. Keys work from other computers only once network access is on in Access and token.
import {useState} from 'react';
import type {FormEvent, ReactElement} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {useLockStore} from '../../lib/app-lock';
import {investigationDecidersOptions, listAppUsersOptions, listAppUsersQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {AppUserOut} from '../../lib/generated/types.gen';
import {apiTime, timeDayWords} from '../../lib/timestamps';
import {
  createAppUser, deleteInvestigationMembership, putInvestigationMembership, revokeAppUserToken, rotateAppUserToken,
} from '../../lib/generated/sdk.gen';
import {initials} from './first-open';

type Role = 'admin' | 'reporter' | 'viewer';
export const ROLES: Record<Role | 'owner', {shape: string; word: string; does: string}> = {
  owner: {shape: '◆', word: 'Owner', does: 'every case, every setting'},
  admin: {shape: '■', word: 'Admin', does: 'everything a reporter can, plus deleting and restoring this case'},
  reporter: {shape: '●', word: 'Reporter', does: 'reads, decides, writes'},
  viewer: {shape: '○', word: 'Viewer', does: 'reads only, decides nothing'},
};

/** A role as its shape; the word and what it may do are revealed on it. */
function RoleMark({role, extra}: {role: Role | 'owner'; extra?: string}): ReactElement {
  const r = ROLES[role];
  return <Reveal label={r.word} detail={<><b>{r.word}</b> · {extra ?? r.does}</>}><span className="lk-role" aria-hidden="true">{r.shape}</span></Reveal>;
}

function day(at: string | null | undefined): string {
  return at ? timeDayWords(at) : '';
}

function ago(at: string | null | undefined): string {
  if (!at) return 'not yet';
  const mins = Math.round((Date.now() - apiTime(at).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function roleHere(user: AppUserOut, investigationId: string): Role | null {
  if (user.global_role === 'admin') return 'admin';
  const role = user.memberships.find(m => m.investigation_id === investigationId)?.role;
  return role === 'admin' || role === 'reporter' || role === 'viewer' ? role : null;
}

function KeyShown({name, token, expires}: {name: string; token: string; expires: string | null | undefined}): ReactElement {
  return <div className="lk-keybox" role="status">
    <p className="lk-eyebrow">Shown once · copy it to {name} yourself</p>
    <p style={{margin: '8px 0'}}><code>{token}</code>
      <button type="button" className="ap-btn" style={{marginLeft: 10}} onClick={() => void navigator.clipboard?.writeText(token)}>Copy</button></p>
    <p className="lk-muted">Works until {day(expires)}. The app keeps only a fingerprint of it. Send it the way you’d send a source’s number, not by email.</p>
  </div>;
}

export function PeoplePane({investigationId, caseName, networkOn, onAccess}: {
  investigationId: string; caseName: string; networkOn: boolean; onAccess: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const myName = useLockStore(s => s.state?.name) ?? '';
  const protectedApp = useLockStore(s => s.state?.protection === 'passphrase');
  const users = useQuery(listAppUsersOptions());
  const deciders = useQuery({...investigationDecidersOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('reporter');
  const [days, setDays] = useState<30 | 90>(30);
  const [shown, setShown] = useState<{name: string; token: string; expires?: string | null} | null>(null);
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({queryKey: listAppUsersQueryKey()});
  const act = async (work: () => Promise<unknown>) => {
    setError('');
    try { await work(); await refresh(); } catch (err) { setError(errorMessage(err, 'That did not work.')); }
  };
  const here = (users.data ?? []).filter(u => !u.disabled && roleHere(u, investigationId));

  const add = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const made = (await createAppUser({body: {display_name: name, global_role: 'member', key_days: days}, throwOnError: true})).data;
      await putInvestigationMembership({path: {user_id: made.id, investigation_id: investigationId}, body: {role}, throwOnError: true});
      setShown({name: made.display_name, token: made.token, expires: made.token_expires_at});
      setName('');
    });
  };

  const people = deciders.data?.people ?? [];
  const most = Math.max(1, ...people.map(p => p.decisions));
  return <div className="lk-settings">
    <div style={{display: 'grid', gap: 14}}>
      <div className="lk-panel">
        {/* A role is its shape (◆ owner · ■ admin · ● reporter · ○ viewer); its word and what it may do are revealed on it. */}
        <p className="lk-eyebrow">Who can reach {caseName || 'this case'}</p>
        <table className="lk-table">
          <thead><tr><th>Person</th><th>Role here</th><th>How they get in</th><th>Last seen</th></tr></thead>
          <tbody>
            <tr>
              <td><div className="lk-who"><span className="lk-av me">{initials(myName)}</span><span><Reveal detail={myName ? `Signs as “${myName}”` : 'No name yet: decisions read “a person”'}><b>{myName || 'You'}</b></Reveal> <span className="lk-muted">you</span></span></div></td>
              <td><RoleMark role="owner"/></td>
              <td><Reveal detail={protectedApp ? 'Opens with the passphrase' : 'Nothing to unlock'}><span>This computer</span></Reveal></td>
              <td><Reveal detail="The owner can’t be removed."><span>now</span></Reveal></td>
            </tr>
            {here.map(u => {
              const r = roleHere(u, investigationId)!;
              const expired = u.token_status === 'expired';
              return <tr key={u.id}>
                <td><div className="lk-who"><span className="lk-av">{initials(u.display_name)}</span><span><Reveal detail={`Signs as “${u.display_name}”`}><b>{u.display_name}</b></Reveal></span></div></td>
                <td>
                  {u.global_role === 'admin' ? <RoleMark role="admin" extra="every case"/>
                    : <Reveal tabbable={false} detail={ROLES[r].does}><select className="lk-input" style={{padding: '6px 8px', width: 'auto'}} aria-label={`Role of ${u.display_name}`} value={r}
                      onChange={e => void act(() => putInvestigationMembership({path: {user_id: u.id, investigation_id: investigationId},
                        body: {role: e.target.value}, throwOnError: true}))}>
                      {(['reporter', 'viewer', 'admin'] as Role[]).map(k => <option key={k} value={k}>{ROLES[k].shape} {ROLES[k].word}</option>)}
                    </select></Reveal>}
                </td>
                {/* An expired key says so; otherwise when it expires is revealed on it. */}
                <td>{u.token_status === 'active' || expired ? <><Reveal detail={expired ? `Expired ${day(u.token_expires_at)}` : u.token_expires_at ? `Expires ${day(u.token_expires_at)}` : 'Does not expire'}>
                  <span>Key <span className="lk-mono">••••{u.token_hint ?? ''}</span></span></Reveal>
                  {expired && <small className="lk-err">expired {day(u.token_expires_at)}</small>}</>
                  : <Reveal detail="Turned off"><span>No key</span></Reveal>}</td>
                <td>{ago(u.token_last_used_at)}
                  <div className="lk-acts" style={{marginTop: 6}}>
                    <button type="button" className="ap-btn" onClick={() => void act(async () => {
                      const r2 = (await rotateAppUserToken({path: {user_id: u.id}, query: {key_days: 30}, throwOnError: true})).data;
                      setShown({name: u.display_name, token: r2.token, expires: r2.token_expires_at});
                    })}>New key</button>
                    {u.token_status === 'active' && <button type="button" className="ap-btn" onClick={() => void act(() =>
                      revokeAppUserToken({path: {user_id: u.id}, throwOnError: true}))}>Turn the key off</button>}
                    {u.global_role !== 'admin' && <button type="button" className="ap-btn" onClick={() => void act(() =>
                      deleteInvestigationMembership({path: {user_id: u.id, investigation_id: investigationId}, throwOnError: true}))}>Remove from this case</button>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {shown && <KeyShown name={shown.name} token={shown.token} expires={shown.expires}/>}
        {error && <p className="lk-err" role="alert">{error}</p>}
      </div>

      <div className="lk-panel">
        <p className="lk-eyebrow">Who decided what · this case, last {deciders.data?.days ?? 30} days</p>
        {people.length === 0 ? <p className="lk-muted" style={{marginTop: 8}}>No decisions in this case in that time.</p> : <div className="lk-bars">
          {people.map(p => <div key={p.name ?? ''} className="lk-bar">
            <span>{p.name ?? 'a person'}</span>
            <span className="lk-track"><i className={p.name && p.name === myName ? 'me' : ''} style={{width: `${(p.decisions / most) * 100}%`}}/></span>
            <span className="lk-mono" style={{textAlign: 'right'}}>{p.decisions}</span>
          </div>)}
        </div>}
        {people.some(p => !p.name) && <p className="lk-muted" style={{marginTop: 8}}>“a person”: decided before names were kept. They stay that way.</p>}
      </div>
    </div>

    <form className="lk-panel" onSubmit={add} aria-label="Add a person">
      <p className="lk-eyebrow"><Reveal detail="Their name goes on their work, as yours does."><span>Add a person</span></Reveal></p>
      {/* The name the person signs with; that it goes on their work is revealed on the heading. */}
      <input className="lk-input" style={{marginTop: 10, font: '400 18px var(--font-display)'}} value={name} onChange={e => setName(e.target.value)}
        placeholder="Their name" aria-label="Their name"/>
      <div className="lk-roles" role="radiogroup" aria-label="Role in this case">
        {/* What each role may do is revealed on it. */}
        {(['reporter', 'viewer', 'admin'] as Role[]).map(k => <Reveal key={k} tabbable={false} detail={k === 'viewer' ? 'Reads only. Good for an editor or a lawyer.'
          : k === 'reporter' ? 'Reads, accepts and rejects, writes the story.' : 'Everything a reporter can, plus deleting and restoring this case.'}>
          <button type="button" role="radio" aria-checked={role === k}
          className={`lk-opt${role === k ? ' on' : ''}`} style={{marginTop: 0}} onClick={() => setRole(k)}>
          <span aria-hidden="true">{ROLES[k].shape}</span><span><b>{ROLES[k].word}</b></span>
        </button></Reveal>)}
      </div>
      <div className="lk-row" style={{borderTop: 0}}>
        <span><Reveal detail="Renew from their row."><span>Key lasts</span></Reveal></span>
        <span className="ap-seg" role="radiogroup" aria-label="Key lasts">
          {([30, 90] as const).map(d => <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'on' : ''}
            onClick={() => setDays(d)}>{d} days</button>)}
        </span>
      </div>
      <button type="submit" className="ap-btn p" disabled={!name.trim() || !investigationId} style={{width: '100%', justifyContent: 'center'}}>
        Make a one-time key{name.trim() ? ` for ${name.trim().split(/\s+/)[0]}` : ''}</button>
      {!networkOn && <div className="lk-banner"><span aria-hidden="true">○</span>
        <span><b>Network access is off</b>: keys work only after you turn it on in Access and token. Until then only this computer reaches the app.{' '}
          <button type="button" className="lk-link" onClick={onAccess}>Access and token ›</button></span></div>}
    </form>
  </div>;
}
