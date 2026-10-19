'use client';
// A panel that slides in from the right over Safety & data (research Keep §8: "panel slides from the right",
// §9: "the panel slides in 240 ms"). Esc or ✕ closes it and focus goes back to the button that opened it.
import {useEffect, useRef} from 'react';
import type {ReactElement, ReactNode} from 'react';

export function Sheet({title, onClose, children, label}: {title: string; onClose: () => void; children: ReactNode; label?: string}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('[data-autofocus], input, button, [href]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
  }, [onClose]);
  return <div className="sd-sheet-wrap">
    <button type="button" className="sd-sheet-back" aria-label="Close" tabIndex={-1} onClick={onClose}/>
    <div ref={box} className="sd-sheet" role="dialog" aria-modal="true" aria-label={label ?? title}>
      <header className="sd-sheet-head"><h2>{title}</h2><button type="button" className="sd-x" onClick={onClose} aria-label="Close">×</button></header>
      <div className="sd-sheet-body">{children}</div>
    </div>
  </div>;
}
