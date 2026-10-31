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

// Esc goes to the topmost layer only (DECISIONS_LOG 40). A layer is an open dialog, or anything marked data-layer that
// sits over the screens (the inspector slot). The layer that takes Esc calls preventDefault; a screen below acts on
// Esc only when the key was not taken and no layer is open above it, whatever order the window listeners were added in.
const LAYERS = '[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), [data-layer]:not([hidden])';
const DIALOG = '[role="dialog"], [role="alertdialog"]';

/** Whether a layer is open above `self`: any open dialog, or a data-layer other than `self` and not inside it. A
 *  layer inside a hidden screen (a drawer left open on a stage that is still mounted) is not open. */
export function layerAbove(self?: Element | null): boolean {
  return [...document.querySelectorAll(LAYERS)].some(el => el !== self && !el.closest('[hidden]') && (el.matches(DIALOG) || !self?.contains(el)));
}

/** Whether any dialog is showing (not one inside a hidden screen). */
export function dialogOpen(): boolean {
  return [...document.querySelectorAll(DIALOG)].some(el => !el.closest('[hidden]'));
}

/** Whether an Esc belongs to something above the element `self`: already taken, or a layer is open over it. */
export function escapeTaken(e: KeyboardEvent, self?: Element | null): boolean {
  return e.defaultPrevented || layerAbove(self);
}
