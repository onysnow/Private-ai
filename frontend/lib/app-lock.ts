'use client';
// The app lock as the screen sees it (ADR-0016): this browser's session key, kept in this browser so a reload stays
// in the same session (the server forgets every session when it restarts, and locks idle ones), and the lock state
// every screen reads. The server enforces the lock; this only shows it and asks for the secret.
import {create} from 'zustand';

import {api} from './api-instance';
import type {LockStateOut} from './generated/types.gen';
import {
  lock as lockCall, recover as recoverCall, sessionState, startSession, unlock as unlockCall, unlockPin as unlockPinCall,
} from './generated/sdk.gen';

const SESSION_KEY = 'pai:session';

type LockStore = {
  /** null until the server has answered; stays null when it cannot be reached (the app then works as before). */
  state: LockStateOut | null;
  /** Why this screen locked it (idle, hide, sleep, button); null when the server said so. */
  reason: string | null;
  set: (state: LockStateOut) => void;
  markLocked: () => void;
};

export const useLockStore = create<LockStore>(set => ({
  state: null,
  reason: null,
  set: state => set(s => ({state, reason: state.locked ? s.reason : null})),
  markLocked: () => set(s => ({state: s.state ? {...s.state, locked: true} : {protection: 'passphrase', locked: true, pin: false}})),
}));

function readKey(): string {
  try { return window.localStorage.getItem(SESSION_KEY) ?? ''; } catch { return ''; }
}

function keepKey(key: string): void {
  try { window.localStorage.setItem(SESSION_KEY, key); } catch { /* private window: this tab only */ }
  api.setSessionKey(key);
}

/** The session this browser already has, or a new one. Returns null when the server cannot be reached or has no app
 * lock (an older server): the app then works as before. */
export async function ensureSession(): Promise<LockStateOut | null> {
  const known = readKey();
  if (known) {
    api.setSessionKey(known);
    try {
      const state = (await sessionState({throwOnError: true})).data;
      if (state.known) {
        useLockStore.getState().set(state);
        return state;
      }
    } catch { /* fall through to a new session */ }
  }
  try {
    const started = (await startSession({throwOnError: true})).data;
    if (started.session) keepKey(started.session);
    useLockStore.getState().set(started);
    return started;
  } catch {
    return null;
  }
}

export async function lockNow(reason: 'idle' | 'hide' | 'sleep' | 'button'): Promise<void> {
  useLockStore.setState({reason});
  try {
    const state = (await lockCall({body: {reason}, throwOnError: true})).data;
    useLockStore.getState().set(state);
  } catch {
    useLockStore.getState().markLocked();
  }
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  useLockStore.getState().set((await unlockCall({body: {passphrase}, throwOnError: true})).data);
}

export async function unlockWithPin(pin: string): Promise<void> {
  useLockStore.getState().set((await unlockPinCall({body: {pin}, throwOnError: true})).data);
}

export async function recoverWithWords(words: string, newPassphrase: string): Promise<void> {
  useLockStore.getState().set((await recoverCall({body: {words, new_passphrase: newPassphrase}, throwOnError: true})).data);
}

export async function refreshLockState(): Promise<void> {
  try { useLockStore.getState().set((await sessionState({throwOnError: true})).data); } catch { /* keep what we have */ }
}
