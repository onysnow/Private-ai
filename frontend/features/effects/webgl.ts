// Whether this computer can draw the WebGL effects (Rain Noir's rain pane). Kept apart from the
// rain pane so Settings can ask without loading the effect engine.

export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try { return Boolean(document.createElement('canvas').getContext('webgl')); } catch { return false; }
}
