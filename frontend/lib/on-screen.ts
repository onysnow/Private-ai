// Stages and their tabs stay mounted once opened and are only hidden (components/case/case-workbench.tsx,
// section-screen.tsx), so a window-level key handler must check that its own screen is the one showing before it
// acts. Without this, Ctrl+Enter in the write-up started a hidden AI run, and L on Money changed The Wire (code review,
// 18 Oct).

/** Whether this element is on screen: still in the page and not inside anything marked hidden. */
export function onScreen(el: Element | null | undefined): boolean {
  return Boolean(el && el.isConnected && !el.closest('[hidden]'));
}

/** Whether a key went to something being typed into (a field, a list box or rich text). */
export function typingInto(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}
