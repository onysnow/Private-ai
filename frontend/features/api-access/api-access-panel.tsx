'use client';
// Asks for a bearer token when the API needs one (remote access). Moved out
// of app/page.tsx (Foundation Fixes fix 3); the page still owns the session
// check it reports on.
import {useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';

type Props = {
  message: string;
  /** Uses the token for this session and rechecks access. */
  onConnect: (token: string) => Promise<void> | void;
};

export function ApiAccessPanel({message, onConnect}: Props): ReactElement {
  const [token, setToken] = useState('');
  const connect = async () => {
    const value = token.trim();
    if (!value) return;
    setToken('');
    await onConnect(value);
  };
  return <Card className="card">
    <CardHeader className="pb-3"><CardTitle>API access</CardTitle></CardHeader>
    <CardContent>
      <p className="muted">{message}</p>
      <div className="searchrow">
        <Input type="password" autoComplete="off" value={token} onChange={(e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void connect(); }} placeholder="Bearer token for this session"/>
        <Button onClick={connect} disabled={!token.trim()}>Connect</Button>
      </div>
    </CardContent>
  </Card>;
}
