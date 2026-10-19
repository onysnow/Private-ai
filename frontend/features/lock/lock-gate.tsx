'use client';
// The app lock around every screen (ADR-0016). The server enforces it (423 Locked on every case call); this shows the
// lock screen, tells the server when you are working (the idle lock measures from that, not from polling), and locks
// on time away, on Hide screen and after the computer slept, as Settings › Your safety › Locking says. While locked the
// screens stay mounted but hidden and inert, so writing in progress is kept. When the server cannot be reached or has
// no app lock, the app works as before.
import {useCallback, useEffect, useRef} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useIdleTimer} from 'react-idle-timer';

import {HIDE_SCREEN_EVENT} from '../../components/frame/app-frame';
import {LOCKED_EVENT} from '../../lib/api-client';
import {ensureSession, lockNow, useLockStore} from '../../lib/app-lock';
import {active} from '../../lib/generated/sdk.gen';
import {FirstOpen} from './first-open';
import {LockScreen} from './lock-screen';

const HEARTBEAT_MS = 30_000;   // at most one "you are working" a half minute
const SLEEP_TICK_MS = 15_000;
const SLEEP_GAP_MS = 90_000;   // a tick this late means the computer slept (or the tab was frozen)

export function LockGate({children}: {children: ReactNode}): ReactElement {
  const state = useLockStore(s => s.state);
  const markLocked = useLockStore(s => s.markLocked);
  const queryClient = useQueryClient();
  const reason = useLockStore(s => s.reason);
  const protectedApp = state?.protection === 'passphrase';
  const locked = Boolean(protectedApp && state?.locked);
  const wasLocked = useRef(locked);

  useEffect(() => { void ensureSession(); }, []);
  useEffect(() => {
    const onLocked = () => markLocked();
    window.addEventListener(LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(LOCKED_EVENT, onLocked);
  }, [markLocked]);
  // Back from the lock: everything that failed while locked is asked again.
  useEffect(() => {
    if (wasLocked.current && !locked) void queryClient.invalidateQueries();
    wasLocked.current = locked;
  }, [locked, queryClient]);

  const lockFor = useCallback((why: 'idle' | 'hide' | 'sleep' | 'button') => { void lockNow(why); }, []);

  const idleMinutes = state?.idle_minutes ?? 0;
  useIdleTimer({
    timeout: Math.max(1, idleMinutes) * 60_000,
    onIdle: () => lockFor('idle'),
    onAction: () => { void active().catch(() => undefined); },
    throttle: HEARTBEAT_MS,
    crossTab: true,
    disabled: !protectedApp || locked || !idleMinutes,
  });

  useEffect(() => {
    if (!protectedApp || locked || !state?.lock_on_hide) return;
    const onHide = () => lockFor('hide');
    window.addEventListener(HIDE_SCREEN_EVENT, onHide);
    return () => window.removeEventListener(HIDE_SCREEN_EVENT, onHide);
  }, [protectedApp, locked, state?.lock_on_hide, lockFor]);

  useEffect(() => {
    if (!protectedApp || locked || !state?.lock_on_sleep) return;
    let last = Date.now();
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (now - last > SLEEP_GAP_MS) lockFor('sleep');
      last = now;
    }, SLEEP_TICK_MS);
    return () => window.clearInterval(tick);
  }, [protectedApp, locked, state?.lock_on_sleep, lockFor]);

  const firstOpen = Boolean(state && !locked && !state.name);
  return <>
    <div inert={locked || firstOpen} aria-hidden={locked || firstOpen || undefined} style={{display: locked ? 'none' : 'contents'}}>{children}</div>
    {locked && <LockScreen reason={reason}/>}
    {firstOpen && state && <FirstOpen state={state}/>}
  </>;
}
