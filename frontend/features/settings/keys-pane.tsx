'use client';
// Settings › Connector keys (Settings panes mockup, board 4): one card per outside source:
// whether its key works (from its last lookup: accepted, or refused with a 401/403), where
// the key goes, what it unlocks, when it was last used and by how many cases; paste a key
// (checked as you type: one line, no spaces), replace it or remove it. A saved key is never
// shown again. Changing a key is allowed from this computer only (the server checks). Check the
// key asks the source whether it accepts it, through an endpoint that takes no search.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';
import {Reveal} from '../../components/ui/reveal';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError} from '../../components/ui/form';
import {errorMessage} from '../../lib/api-client';
import {apiTime} from '../../lib/timestamps';
import {submitWith, useZodForm} from '../../lib/forms';
import {
  checkConnectorKeyMutation, deleteConnectorCredentialMutation, getLookupSettingsOptions, getLookupSettingsQueryKey, saveConnectorCredentialMutation, settingsStatusQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {LookupSourceOut} from '../../lib/generated/types.gen';

const when = (iso: string): string => apiTime(iso).toLocaleString(undefined, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

export const keySchema = z.object({
  credential: z.string()
    .refine(v => v.trim().length > 0, 'Paste the key first.')
    .refine(v => !/\s/.test(v.trim()), 'There is a space or a line break inside it. Keys have none: check you copied only the key.')
    .refine(v => v.trim().length >= 8, 'Too short to be a key. Check you copied all of it.')
    .refine(v => v.trim().length <= 4096, 'Too long to be a key.'),
});
type KeyIn = z.infer<typeof keySchema>;

/** Works, refused, not tried yet, or no key: from the newer of the source's last lookup and its last key check. */
function state(s: LookupSourceOut): {cls: string; words: string; line: string} {
  if (!s.key_saved) return {cls: 'none', words: 'no key', line: 'Without one: only what the source gives without a key, if anything.'};
  const check = s.key_check;
  if (check && check.state !== 'not_supported' && check.state !== 'no_key' && (!s.last || apiTime(check.at) >= apiTime(s.last.at))) {
    const credits = check.credits != null ? ` ${check.credits.toLocaleString()} credits left.` : '';
    if (check.state === 'works') return {cls: 'ok', words: '✓ works', line: `Checked ${when(check.at)}: the source accepts it.${credits}`};
    if (check.state === 'refused') return {cls: 'bad', words: '! refused', line: `Checked ${when(check.at)}: the source refused this key. Lookups to it fail until the key is replaced.`};
    return {cls: 'saved', words: 'unknown', line: `Checked ${when(check.at)}: ${check.detail}`};
  }
  if (s.last?.status === 'refused') return {cls: 'bad', words: '! refused', line: `The source refused this key on ${when(s.last.at)}. Lookups to it fail until the key is replaced.`};
  if (s.last?.status === 'completed') return {cls: 'ok', words: '✓ works', line: `Last accepted ${when(s.last.at)}.`};
  return {cls: 'saved', words: 'saved', line: 'Not used yet: the first lookup shows whether the source accepts it.'};
}

function KeyCard({s, onChanged}: {s: LookupSourceOut; onChanged: () => void}): ReactElement {
  const [open, setOpen] = useState(!s.key_saved);
  const [removing, setRemoving] = useState(false);
  const save = useMutation(saveConnectorCredentialMutation());
  const check = useMutation({...checkConnectorKeyMutation(), onSuccess: onChanged});
  const remove = useMutation({...deleteConnectorCredentialMutation(), onSuccess: () => { setRemoving(false); setOpen(true); onChanged(); }});
  const form = useZodForm<KeyIn>(keySchema, {defaultValues: {credential: ''}, mode: 'onChange'});
  const onSubmit = submitWith(form, async v => {
    await save.mutateAsync({path: {provider: s.key}, body: {credential: v.credential.trim()}});
    form.reset();
    setOpen(false);
    onChanged();
  }, 'Could not save the key.', {credential: 'credential'});
  const st = state(s);
  return <section className="ap-pane st-key" aria-labelledby={`key-${s.key}`}>
    <div className="st-key-top"><b id={`key-${s.key}`}>{s.label}</b>{st.cls === 'bad' ? <span className={`st-state st-state-${st.cls}`}>{st.words}</span>
      : <Reveal detail={st.line}><span className={`st-state st-state-${st.cls}`}>{st.words}</span></Reveal>}</div>
    {s.key_saved && <p className="st-slot"><Reveal label="Key saved" detail="Key saved · never shown again"><span aria-hidden="true">✓ ⚿</span></Reveal></p>}
    <dl className="st-dl">
      <dt>Goes to</dt><dd>{s.host || s.label}, with each lookup</dd>
      <dt>Unlocks</dt><dd>{s.kind}</dd>
      <dt>Last used</dt><dd>{s.last ? `${when(s.last.at)} · ${s.last.case}` : 'never'}</dd>
      <dt>Used by</dt><dd>{s.cases_this_month} case{s.cases_this_month === 1 ? '' : 's'} this month</dd>
    </dl>
    {/* The key's state line stays when something is wrong; otherwise it is revealed on the state. */}
    {st.cls === 'bad' ? <p className="st-hint st-warn">{st.line}</p> : null}
    {open ? <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="st-form">
        <FormField control={form.control} name="credential" render={({field}) => <FormItem>
          <FormLabel>{s.key_saved ? 'Paste the new key' : 'Paste the key'}</FormLabel>
          <FormControl><input type="password" autoComplete="off" spellCheck={false} className="st-input st-mono" {...field}/></FormControl>
          <FormMessage className="field-msg"/>
        </FormItem>}/>
        <FormRootError/>
        <div className="st-acts">
          <button type="submit" className="ap-btn p" disabled={form.formState.isSubmitting}>Save the key</button>
          {s.key_saved && <button type="button" className="ap-btn" onClick={() => { setOpen(false); form.reset(); }}>Cancel</button>}
        </div>
      </form>
    </Form> : <div className="st-acts">
      <button type="button" className={`ap-btn${st.cls === 'bad' ? ' p' : ''}`} onClick={() => setOpen(true)}>Replace</button>
      <Reveal tabbable={false} detail="Asks the source whether it accepts the key. No search is sent, and no name.">
        <button type="button" className="ap-btn" disabled={check.isPending}
        onClick={() => check.mutate({path: {provider: s.key}})}>{check.isPending ? 'Checking…' : 'Check the key'}</button></Reveal>
      {removing ? <>
        <span className="st-hint">Remove the {s.label} key?</span>
        <button type="button" className="ap-btn" disabled={remove.isPending} onClick={() => remove.mutate({path: {provider: s.key}})}>Remove it</button>
        <button type="button" className="ap-btn" onClick={() => setRemoving(false)}>Keep it</button>
      </> : <button type="button" className="ap-btn" onClick={() => setRemoving(true)}>Remove</button>}
    </div>}
    {check.isError && <p className="st-problem" role="alert">{errorMessage(check.error, 'Could not check the key.')}</p>}
    {remove.isError && <p className="st-problem" role="alert">{errorMessage(remove.error, 'Could not remove the key.')}</p>}
  </section>;
}

export function KeysPane(): ReactElement {
  const queryClient = useQueryClient();
  const settings = useQuery(getLookupSettingsOptions({query: {}}));
  if (settings.isPending) return <p className="st-wait">Reading the keys…</p>;
  if (settings.isError) return <p className="st-problem" role="alert">{errorMessage(settings.error, 'Could not read the keys.')}</p>;
  const changed = () => {
    void queryClient.invalidateQueries({queryKey: getLookupSettingsQueryKey({query: {}})});
    void queryClient.invalidateQueries({queryKey: settingsStatusQueryKey()});
  };
  return <div className="st-keys">{settings.data.sources.map(s => <KeyCard key={s.key} s={s} onChanged={changed}/>)}</div>;
}
