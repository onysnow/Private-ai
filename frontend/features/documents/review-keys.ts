// Keys for the review queue (app/review/page.tsx).
import type {KeyboardEvent} from 'react';

/** Keyboard review (design doc "Keyboard-driven review"): on a focused
 * proposal, the arrows (or J and K) move to the next or previous one, and A
 * or R press its own Accept or Reject -- so a key does exactly what the
 * button would, and nothing while the button is held back. Typing in a
 * field is left alone. */
export function reviewKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const card = event.currentTarget;
  const key = event.key.toLowerCase();
  if (key === 'arrowdown' || key === 'j' || key === 'arrowup' || key === 'k') {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-candidate]'));
    const next = cards[cards.indexOf(card) + (key === 'arrowdown' || key === 'j' ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
    return;
  }
  if (key === 'a' || key === 'r') {
    const button = card.querySelector<HTMLButtonElement>(`button[data-action="${key === 'a' ? 'accept' : 'reject'}"]`);
    if (button && !button.disabled) { event.preventDefault(); button.click(); }
  }
}
