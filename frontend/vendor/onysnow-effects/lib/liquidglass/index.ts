// LOCAL: @ts-nocheck, and the reason, because a silent one would be worse.
//
// This file is vendored verbatim from ybouane/liquidglass (MIT) and compiles
// clean under ITS tsconfig. This project sets noUncheckedIndexedAccess,
// noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes, which
// upstream does not, and that disagreement alone produces 79 errors across
// this directory -- every one of them mechanical (`u.u_tex` wanting
// `u['u_tex']`, a `| undefined` from an index read) and none of them a bug.
//
// Fixing all 79 now would bury the upstream source under our own churn and
// destroy the thing NOTICE.md exists to protect: the ability to diff this
// directory against upstream and see only what WE changed.
//
// So it is suppressed per file, and the suppression comes OFF the moment we
// take real ownership of a file and start editing it -- at which point our
// own code in it gets checked properly, which is the whole point.
// @ts-nocheck

/**
 * liquidglass — A liquid glass effect library for the web.
 *
 * Apply realistic glass refraction, blur, chromatic aberration, and
 * lighting to any HTML element using WebGL shaders.
 *
 * @example
 *   import { LiquidGlass } from '@ybouane/liquidglass';
 *
 *   const instance = await LiquidGlass.init({
 *       root: document.querySelector('#my-root'),
 *       glassElements: document.querySelectorAll('.glass'),
 *   });
 *
 *   // Later:
 *   instance.destroy();
 *
 * @module @ybouane/liquidglass
 */

export { LiquidGlass } from './LiquidGlass.js';
export type { LiquidGlassOptions } from './LiquidGlass.js';
export { DEFAULTS } from './defaults.js';
export type { GlassConfig } from './defaults.js';
export { invalidateFontEmbedCache } from './HtmlCapture.js';
