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
 * LiquidGlass — main orchestrator for the liquid glass effect library.
 *
 * Coordinates between:
 *   - HtmlCapture  (captures individual DOM elements into reusable canvases)
 *   - GlassRenderer (WebGL pipeline for the glass effect)
 *
 * Handles child ordering, layered compositing, floating (drag)
 * behaviour, resize, and the render loop.
 *
 * Usage:
 *   import { LiquidGlass } from '@ybouane/liquidglass';
 *   LiquidGlass.init({ root, glassElements });
 */

import { DEFAULTS, SHADOW_PAD } from './defaults.js';
import type { GlassConfig } from './defaults.js';
import { HtmlCapture } from './HtmlCapture.js';
import { GlassRenderer } from './GlassRenderer.js';

/** Options accepted by {@link LiquidGlass.init}. */
export interface LiquidGlassOptions {
	/** Root container element. */
	root: HTMLElement;
	/** Elements to apply the glass effect to. */
	glassElements?: NodeListOf<HTMLElement> | HTMLElement[];
	/** Override the default configuration values. */
	defaults?: Partial<GlassConfig>;
}

interface DragState {
	active: boolean;
	element: HTMLElement | null;
	startX: number;
	startY: number;
	origTx: number;
	origTy: number;
}

interface GlassCacheEntry {
	centerX: number;
	centerY: number;
}

interface ConfigCachedElement extends HTMLElement {
	configCache?: Partial<GlassConfig>;
	configCacheKey?: string;
}

interface SizeEntry {
	w: number;
	h: number;
}

interface ObjectFitRect {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

interface SampleRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const BUTTON_CLASS = 'liquid-glass-button';
const STYLE_ID = 'liquid-glass-button-styles';
const BUTTON_CSS = `
.${BUTTON_CLASS} {
	cursor: pointer;
}
`;

interface ButtonState {
	hover: boolean;
	pressed: boolean;
}

export class LiquidGlass {
	// ────────────────────────────────────────────
	// Static entry point
	// ────────────────────────────────────────────

	static async init(options: LiquidGlassOptions): Promise<LiquidGlass> {
		const instance = new LiquidGlass(options);
		await instance._start();
		return instance;
	}

	// ────────────────────────────────────────────
	// Instance fields
	// ────────────────────────────────────────────

	readonly root: HTMLElement;
	readonly defaults: GlassConfig;
	readonly glassSet: Set<HTMLElement>;
	readonly glassCanvases: Map<HTMLElement, HTMLCanvasElement>;
	readonly capture: HtmlCapture;
	readonly renderer: GlassRenderer;

	/** Current frames-per-second (updated every frame). */
	fps = 0;

	private _running = false;
	private _rafId = 0;
	private _hasDynamic = false;
	// LOCAL: an external frame driver (the site's one scheduler). When set,
	// the library runs a frame only when woken, and says after each whether
	// it needs another -- see tick(). Unset, it loops every frame as upstream.
	private _driver: { wake(): void } | null = null;
	/**
	 * Genuinely-global dirty flag — set by events that legitimately
	 * affect every glass at once (resize, WebGL context restored,
	 * structural mutation of root, end of _start). On the next frame
	 * the entry guard promotes it into per-element dirty marks for
	 * every glass in glassSet, then clears itself.
	 */
	private _globalDirty = true;
	/**
	 * Per-element shader-render dirty set. Each entry is a glass
	 * element that needs its WebGL pipeline to re-run on the next
	 * frame. Drained at the end of _renderFrame.
	 *
	 * Mirrors _glassContentDirty (which tracks html-to-image content
	 * captures) but for the WebGL shader pass instead of the DOM
	 * raster pass — they have different triggers.
	 */
	private readonly _glassDirty = new Set<HTMLElement>();
	/**
	 * Elements (typically wrappers, glasses themselves, or descendants
	 * of root) explicitly marked changed via the public markChanged()
	 * API. The next frame fans each one out into _glassDirty by
	 * intersecting against every glass's sample rect, then clears
	 * the set.
	 */
	private readonly _userMarkedChanged = new Set<HTMLElement>();
	private _capturingGlassContent = false;
	/**
	 * Glass elements whose content image is stale and needs to be
	 * re-captured. Per-element rather than a single global flag so a
	 * mutation inside one glass subtree only re-captures that one
	 * element instead of every glass on the page.
	 */
	private readonly _glassContentDirty = new Set<HTMLElement>();
	private _fpsFrames = 0;
	private _fpsTime = 0;

	private _observer: MutationObserver | null = null;
	private _glassSubtreeObserver: MutationObserver | null = null;

	private _sortedChildren: HTMLElement[] = [];
	private readonly _glassCache = new Map<HTMLElement, GlassCacheEntry>();
	private readonly _glassContentImages = new Map<HTMLElement, HTMLCanvasElement>();
	private readonly _glassLastSize = new Map<HTMLElement, SizeEntry>();
	private readonly _buttonStates = new Map<HTMLElement, ButtonState>();
	private readonly _buttonListeners = new Map<HTMLElement, Array<() => void>>();
	private readonly _sceneCanvas: HTMLCanvasElement;
	private readonly _sceneCtx: CanvasRenderingContext2D;

	private readonly _drag: DragState = {
		active: false,
		element: null,
		startX: 0,
		startY: 0,
		origTx: 0,
		origTy: 0,
	};

	private readonly _onResize: () => void;
	private readonly _onPointerDown: (e: PointerEvent) => void;
	private readonly _onPointerMove: (e: PointerEvent) => void;
	private readonly _onPointerUp: (e: PointerEvent) => void;

	// ────────────────────────────────────────────
	// Constructor (prefer LiquidGlass.init)
	// ────────────────────────────────────────────

	constructor({ root, glassElements, defaults = {} }: LiquidGlassOptions) {
		if (!root) throw new Error('LiquidGlass: `root` element is required.');

		this.root = root;
		this.defaults = { ...DEFAULTS, ...defaults };
		this.glassSet = new Set(Array.from(glassElements || []));
		this.glassCanvases = new Map();
		this.capture = new HtmlCapture(root);
		// When an async html-to-image re-capture finishes, mark only
		// the glasses whose sample rect intersects that element's
		// bounds — they're the only ones whose composed scene
		// actually changed. Other glasses on the page can keep
		// their existing shader output unchanged.
		this.capture.onCacheUpdate = (element) => {
			this._markGlassesIntersecting(element);
		};
		this.renderer = new GlassRenderer();
		this._sceneCanvas = document.createElement('canvas');
		this._sceneCtx = this._sceneCanvas.getContext('2d')!;

		// When the WebGL context is restored, invalidate all caches so
		// the render loop rebuilds everything on the next frame. This
		// is genuinely global — every shader output canvas was lost.
		this.renderer.canvas.addEventListener('webglcontextrestored', () => {
			this._glassCache.clear();
			this._globalDirty = true;
			this._wake(); // LOCAL
		});

		this._onResize = this._handleResize.bind(this);
		this._onPointerDown = this._handlePointerDown.bind(this);
		this._onPointerMove = this._handlePointerMove.bind(this);
		this._onPointerUp = this._handlePointerUp.bind(this);
	}

	// ────────────────────────────────────────────
	// Lifecycle
	// ────────────────────────────────────────────

	private async _start(): Promise<void> {
		this.root.style.userSelect = 'none';
		(this.root.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
		this._setupGlassElements();
		this._hasDynamic = this._detectDynamic();
		this._sortedChildren = this._getSortedChildren();
		this._handleResize();

		// Resolve the page's @font-face rules to base64 data URLs once
		// up front, so every subsequent html-to-image capture renders
		// text with the page's actual webfont (matching glyph metrics
		// with the live DOM under the glass).
		await this.capture.prefetchFontEmbedCSS();

		await this._captureGlassContent();
		// Pre-warm the static-content cache so the first rendered frame
		// has real DOM behind every glass panel — without this, the
		// shader briefly samples an empty (white) local scene while
		// async html-to-image captures resolve.
		await this._prewarmStaticCaptures();

		window.addEventListener('resize', this._onResize);
		this.root.addEventListener('pointerdown', this._onPointerDown);
		window.addEventListener('pointermove', this._onPointerMove);
		window.addEventListener('pointerup', this._onPointerUp);

		this._observer = new MutationObserver(() => {
			// Structural mutation: painting order may have shifted,
			// every glass needs to re-render.
			this._sortedChildren = this._getSortedChildren();
			this._globalDirty = true;
			this._wake(); // LOCAL
		});
		this._observer.observe(this.root, { childList: true });

		this._glassSubtreeObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const owner = this._closestGlassAncestor(mutation.target);
				if (mutation.type === 'attributes' && mutation.attributeName === 'data-config') {
					// Config change → just re-shade this glass + any
					// glass that depends on its rendered output.
					if (owner) this._markGlassAndDependents(owner);
					continue;
				}
				// Subtree mutation → the glass's content image needs
				// to be re-captured AND its shader re-run (since the
				// content image is what we composite on top of the
				// shader output).
				if (owner) {
					this._glassContentDirty.add(owner);
					this._markGlassAndDependents(owner);
				}
			}
			this._wake(); // LOCAL
		});
		for (const el of this.glassSet) {
			this._glassSubtreeObserver.observe(el, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ['data-config'],
			});
		}
		this._glassContentDirty.clear();

		this._running = true;
		this._globalDirty = true;
		// LOCAL: a driver runs the frames; otherwise loop as upstream.
		if (this._driver) this._wake();
		else this._rafId = requestAnimationFrame(() => this._renderLoop());
	}

	/**
	 * LOCAL: hand the frames to an external scheduler. Every change the
	 * library notices wakes it; tick() runs one frame.
	 */
	setFrameDriver(driver: { wake(): void } | null): void {
		this._driver = driver;
		if (driver) {
			cancelAnimationFrame(this._rafId);
			if (this._running) this._wake();
		}
	}

	/** LOCAL: ask the driver for a frame, if there is one. */
	private _wake(): void {
		this._driver?.wake();
	}

	/**
	 * LOCAL: run one frame. Returns whether there is still work: something
	 * dirty, a capture in flight, a drag, a dynamic contributor that is moving
	 * (data-dynamic other than "idle", or a video), or a glass that re-rendered
	 * this frame (its position may still be settling). Otherwise the driver
	 * can let the page sleep.
	 */
	tick(): boolean {
		if (!this._running) return false;
		const rendered = this._frame();
		return (
			rendered > 0
			|| this._drag.active
			|| this._globalDirty
			|| this._glassDirty.size > 0
			|| this._glassContentDirty.size > 0
			|| this._capturingGlassContent
			|| this._userMarkedChanged.size > 0
			|| this.root.querySelector('[data-dynamic]:not([data-dynamic="idle"]), video') !== null
		);
	}

	destroy(): void {
		this._running = false;
		cancelAnimationFrame(this._rafId);

		this.root.style.removeProperty('user-select');
		this.root.style.removeProperty('-webkit-user-select');

		window.removeEventListener('resize', this._onResize);
		this.root.removeEventListener('pointerdown', this._onPointerDown);
		window.removeEventListener('pointermove', this._onPointerMove);
		window.removeEventListener('pointerup', this._onPointerUp);

		this._observer?.disconnect();
		this._observer = null;
		this._glassSubtreeObserver?.disconnect();
		this._glassSubtreeObserver = null;

		for (const [el, canvas] of this.glassCanvases) {
			canvas.remove();
			el.style.removeProperty('position');
			el.style.removeProperty('overflow');
			el.style.removeProperty('touch-action');
			el.classList.remove(BUTTON_CLASS);
		}
		this.glassCanvases.clear();
		this._glassCache.clear();
		this._glassContentImages.clear();
		this._glassLastSize.clear();

		for (const removers of this._buttonListeners.values()) {
			for (const r of removers) r();
		}
		this._buttonListeners.clear();
		this._buttonStates.clear();

		document.getElementById(STYLE_ID)?.remove();

		this.capture.destroy();
		this.renderer.destroy();
	}

	// ────────────────────────────────────────────
	// Glass element setup
	// ────────────────────────────────────────────

	private _setupGlassElements(): void {
		let needsButtonStyles = false;

		for (const el of this.glassSet) {
			// LOCAL: a glass element may sit at any depth under root.
			//
			// Upstream required a direct child and dropped anything else with
			// a warning. We allow nesting -- the scene walk maps a pane to the
			// root-level child it lives under and prunes panes out of that
			// child's capture, so the ordering and the self-reference are both
			// handled. See _topLevelChildFor and _composeSceneForGlass.
			//
			// It has to be UNDER root, though. A pane outside the subtree has
			// no defined place in the scene's paint order, and silently
			// compositing it somewhere plausible would be worse than refusing.
			if (el !== this.root && !this.root.contains(el)) {
				console.warn('LiquidGlass: glass element must be inside root, skipping.', el);
				this.glassSet.delete(el);
				continue;
			}

			const currentPosition = window.getComputedStyle(el).position;
			if (currentPosition === 'static') {
				el.style.position = 'relative';
			}
			el.style.overflow = 'visible';

			const config = this._getConfig(el);

			// Prevent browser from hijacking pointer events for
			// scroll/pan on floating (draggable) glass elements.
			if (config.floating) {
				el.style.touchAction = 'none';
			}

			// Button mode — cursor + hover/press shader-state listeners
			if (config.button) {
				el.classList.add(BUTTON_CLASS);
				needsButtonStyles = true;
				this._setupButtonListeners(el);
			}

			const canvas = document.createElement('canvas');
			canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;';
			el.insertBefore(canvas, el.firstChild);

			this.glassCanvases.set(el, canvas);
		}

		// Inject button styles once if any glass element uses button mode
		if (needsButtonStyles && !document.getElementById(STYLE_ID)) {
			const style = document.createElement('style');
			style.id = STYLE_ID;
			style.textContent = BUTTON_CSS;
			document.head.appendChild(style);
		}

	}

	/**
	 * Walk up from a mutation target until we hit a glass element
	 * registered on this instance. Returns null if the node isn't
	 * inside any glass subtree (shouldn't normally happen since the
	 * observers are scoped to glass elements, but the mutation target
	 * may be a Text node or detached during a removal).
	 */
	private _closestGlassAncestor(node: Node): HTMLElement | null {
		let cur: Node | null = node;
		while (cur) {
			if (cur.nodeType === 1 && this.glassSet.has(cur as HTMLElement)) {
				return cur as HTMLElement;
			}
			cur = cur.parentNode;
		}
		return null;
	}

	/**
	 * Mark a glass element (and any glass that visually depends on it
	 * via z-order overlap) as needing a shader re-render on the next
	 * frame.
	 *
	 * `rectOverride` lets callers pass a rect that differs from the
	 * element's current bounding box — useful for drag, where we
	 * want to invalidate both the *old* and *new* footprints in the
	 * same call so glasses behind the dragged panel can clear its
	 * trail and glasses ahead can pick up its new shadow.
	 */
	private _markGlassAndDependents(
		element: HTMLElement,
		rectOverride?: DOMRect,
	): void {
		// 1. The element itself, if it's a glass.
		if (this.glassSet.has(element)) {
			this._glassDirty.add(element);
		}

		// 2. Glass elements rendered AFTER `element` in the painting
		//    order whose sample rect intersects element's bounds.
		//    They read element via _composeSceneForGlass (either as a
		//    non-glass contributor or via _drawPriorGlassToScene).
		const rootRect = this.root.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const elementDOMRect = rectOverride ?? element.getBoundingClientRect();
		// Pad by SHADOW_PAD when the element itself is a glass — its
		// rendered output extends that far past its CSS box. For non-
		// glass contributors the bounds are exact (their paint overflow
		// is handled by `_getPaintOverflowPad` at draw time, which is
		// fine for visual fidelity but not relevant to dirty marking).
		const elementBox = this._getPixelRect(
			elementDOMRect,
			rootRect,
			dpr,
			this.glassSet.has(element) ? SHADOW_PAD : 0,
		);

		let seenElement = false;
		for (const child of this._sortedChildren) {
			if (child === element) { seenElement = true; continue; }
			if (!seenElement) continue;
			if (!this.glassSet.has(child)) continue;
			const sampleRect = this._getPixelRect(
				child.getBoundingClientRect(), rootRect, dpr, SHADOW_PAD,
			);
			if (LiquidGlass._rectsIntersect(elementBox, sampleRect)) {
				this._glassDirty.add(child);
			}
		}
		this._wake(); // LOCAL
	}

	/**
	 * Mark every glass element whose sample rect intersects the given
	 * element's bounding rect, regardless of stacking order. Used by
	 * the async cache-update callback (a wrapper's pixels just got
	 * fresh, so any glass that samples them needs to re-render) and
	 * by the public markChanged() API for elements outside the glass
	 * set.
	 */
	private _markGlassesIntersecting(element: HTMLElement): void {
		const rootRect = this.root.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const elementBox = this._getPixelRect(
			element.getBoundingClientRect(), rootRect, dpr,
			this.glassSet.has(element) ? SHADOW_PAD : 0,
		);
		for (const glass of this.glassSet) {
			const sampleRect = this._getPixelRect(
				glass.getBoundingClientRect(), rootRect, dpr, SHADOW_PAD,
			);
			if (LiquidGlass._rectsIntersect(elementBox, sampleRect)) {
				this._glassDirty.add(glass);
			}
		}
		this._wake(); // LOCAL
	}

	/**
	 * Public API: mark an element (or all glass elements when called
	 * with no arguments) as needing a shader re-render on the next
	 * frame. Useful for content the library can't observe on its own —
	 * a `<canvas>` whose pixels you just updated, an `<img>` you just
	 * swapped via JS, a wrapper whose CSS background-image you just
	 * changed, etc.
	 *
	 * For elements registered via `data-dynamic`, the library already
	 * treats them as always-dirty and re-renders affected glasses
	 * every frame; calling markChanged() on them is a no-op but is
	 * harmless.
	 *
	 * @param element The element that changed visually. Pass nothing
	 * (or `undefined`) to mark every glass on this instance dirty.
	 */
	markChanged(element?: HTMLElement): void {
		this._wake(); // LOCAL
		if (!element) {
			this._globalDirty = true;
			return;
		}
		this._userMarkedChanged.add(element);
	}

	private _setupButtonListeners(el: HTMLElement): void {
		const state: ButtonState = { hover: false, pressed: false };
		this._buttonStates.set(el, state);

		// Button state change just affects this button's shader uniforms
		// (brightness on hover, zRadius/shadowSpread on press) — only
		// this glass and any glass that overlays it need to re-render.
		const mark = () => this._markGlassAndDependents(el);
		const onOver = () => { state.hover = true; mark(); };
		const onOut = () => { state.hover = false; state.pressed = false; mark(); };
		const onDown = () => { state.pressed = true; mark(); };
		const onUp = () => { state.pressed = false; mark(); };

		el.addEventListener('pointerover', onOver);
		el.addEventListener('pointerout', onOut);
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('pointercancel', onUp);

		this._buttonListeners.set(el, [
			() => el.removeEventListener('pointerover', onOver),
			() => el.removeEventListener('pointerout', onOut),
			() => el.removeEventListener('pointerdown', onDown),
			() => el.removeEventListener('pointerup', onUp),
			() => el.removeEventListener('pointercancel', onUp),
		]);
	}

	// ────────────────────────────────────────────
	// Glass content pre-capture
	// ────────────────────────────────────────────

	/**
	 * Re-capture the DOM content (text, icons, etc.) of glass elements
	 * whose subtrees have been mutated since the last capture, hiding
	 * the injected shader canvas so it isn't included.
	 *
	 * Pass `targets = null` to capture every glass element (used at
	 * init and on resize); pass a Set to capture only specific ones.
	 *
	 * Guarded against concurrent execution: if a capture is already
	 * running, the affected elements stay in `_glassContentDirty` and
	 * the next render-loop tick picks them up.
	 */
	private async _captureGlassContent(
		targets: Set<HTMLElement> | null = null,
	): Promise<void> {
		if (this._capturingGlassContent) return;
		this._capturingGlassContent = true;
		try {
			for (const [el, glassCanvas] of this.glassCanvases) {
				if (targets && !targets.has(el)) continue;
				const rect = el.getBoundingClientRect();
				const img = await this.capture.captureToCanvas(
					el,
					rect.width,
					rect.height,
					[glassCanvas],
				);
				if (img) {
					this._glassContentImages.set(el, img);
				}
			}
		} finally {
			this._capturingGlassContent = false;
			// LOCAL: the fresh content image has to be drawn, and with a driver
			// nothing else would ask for the frame that draws it.
			if (this._driver) {
				for (const el of this.glassCanvases.keys()) {
					if (!targets || targets.has(el)) this._glassDirty.add(el);
				}
				this._wake();
			}
		}
	}

	/**
	 * Synchronously walk every non-glass direct child of root and
	 * await its html-to-image capture so the cache is fully populated
	 * by the time the render loop starts. Without this, the first
	 * frame's glass shader sees an empty (white) local scene for
	 * ~one or two frames while the async captures resolve.
	 */
	private async _prewarmStaticCaptures(): Promise<void> {
		for (const child of this._sortedChildren) {
			if (this.glassSet.has(child)) continue;
			const tag = child.tagName;
			if (tag === 'CANVAS' || tag === 'IMG' || tag === 'VIDEO') continue;
			if (child.hasAttribute('data-dynamic')) continue;
			try {
				// LOCAL: prune any nested panes out of this contributor.
				await this.capture.captureElement(child, false, this._glassWithin(child));
			} catch (err) {
				console.warn('LiquidGlass: prewarm capture failed:', child, err);
			}
		}
	}

	// ────────────────────────────────────────────
	// Child ordering & stacking context
	// ────────────────────────────────────────────

	private _getSortedChildren(): HTMLElement[] {
		const children = Array.from(this.root.children) as HTMLElement[];
		const rootDisplay = window.getComputedStyle(this.root).display;
		const isFlexOrGridParent =
			rootDisplay === 'flex' || rootDisplay === 'inline-flex' ||
			rootDisplay === 'grid' || rootDisplay === 'inline-grid';

		const tagged = children.map((el, domIndex) => {
			const style = window.getComputedStyle(el);
			const hasStackingContext =
				LiquidGlass._formsStackingContext(style, isFlexOrGridParent);
			const rawZ = parseInt(style.zIndex, 10);
			const zIndex = isNaN(rawZ) ? LiquidGlass._liftedZ(el) : rawZ; // LOCAL
			return { el, domIndex, hasStackingContext, zIndex };
		});

		tagged.sort((a, b) => {
			if (!a.hasStackingContext && b.hasStackingContext) return -1;
			if (a.hasStackingContext && !b.hasStackingContext) return 1;
			if (a.hasStackingContext && b.hasStackingContext) {
				if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
			}
			return a.domIndex - b.domIndex;
		});

		return tagged.map(t => t.el);
	}

	/**
	 * LOCAL. Where a z-auto child actually paints, when its own children
	 * carry a z-index.
	 *
	 * A z-auto element is not a stacking context, so a z-indexed child of
	 * it paints in the ROOT's stacking context: a seam band (z auto) whose
	 * layers are z 1 paints above the photograph after it, though the band
	 * comes first in the document. Upstream took z auto as 0 and put the
	 * band before that photograph, so the band's scene stopped short of it
	 * and the lower half of the glass refracted nothing.
	 *
	 * The band used to be given a z-index itself to fix the order -- and that
	 * made it a stacking context, an isolated group, in which the lit edge's
	 * bloom (plus-lighter, alpha 0) had nothing to add to past the band's
	 * edge: the bloom was cut off at every pane but the header. Reading the
	 * order off the children keeps the band out of a group of its own.
	 */
	private static _liftedZ(el: HTMLElement): number {
		let z = 0;
		for (const child of Array.from(el.children)) {
			const cs = window.getComputedStyle(child);
			if (cs.position === 'static') continue;
			const cz = parseInt(cs.zIndex, 10);
			if (!isNaN(cz) && cz > z) z = cz;
		}
		return z;
	}

	/**
	 * Returns true when the element forms a CSS stacking context — i.e.
	 * when its z-index participates in painting order. Mirrors the spec:
	 * https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context
	 *
	 * Used by `_getSortedChildren` to decide painting order for the
	 * local scene assembly. The set of triggers needs to match the
	 * browser's actual stacking model — otherwise overlays end up
	 * painted before the background image and get erased.
	 */
	private static _formsStackingContext(
		style: CSSStyleDeclaration,
		isFlexOrGridParent: boolean,
	): boolean {
		if (style.position !== 'static') return true;
		if (isFlexOrGridParent && style.zIndex !== 'auto') return true;
		if (parseFloat(style.opacity) < 1) return true;
		if (style.transform !== 'none' && style.transform !== '') return true;
		if (style.filter !== 'none' && style.filter !== '') return true;
		if (style.perspective !== 'none' && style.perspective !== '') return true;
		if (style.clipPath !== 'none' && style.clipPath !== '') return true;
		if (style.mixBlendMode !== 'normal' && style.mixBlendMode !== '') return true;
		if (style.isolation === 'isolate') return true;

		const bf = style.backdropFilter
			|| (style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter;
		if (bf && bf !== 'none') return true;

		const mask = style.maskImage
			|| (style as unknown as { webkitMaskImage?: string }).webkitMaskImage;
		if (mask && mask !== 'none') return true;

		const contain = style.contain;
		if (contain && /\b(layout|paint|strict|content)\b/.test(contain)) return true;

		if (style.willChange) {
			const triggers = new Set([
				'transform', 'opacity', 'filter', 'backdrop-filter',
				'perspective', 'clip-path', 'mask', 'mask-image',
				'isolation', 'mix-blend-mode',
			]);
			const tokens = style.willChange.split(',').map(t => t.trim());
			for (const t of tokens) {
				if (triggers.has(t)) return true;
			}
		}

		return false;
	}

	private _detectDynamic(): boolean {
		// Check the entire subtree for data-dynamic elements
		// (video with data-dynamic, etc.).
		const dynEls = this.root.querySelectorAll('[data-dynamic]');
		for (const el of dynEls) {
			if (!this.glassSet.has(el as HTMLElement)) {
				return true;
			}
		}
		// Also: any video element is implicitly dynamic (live frames).
		const videos = this.root.querySelectorAll('video');
		for (const vid of videos) {
			if (!this.glassSet.has(vid as unknown as HTMLElement)) {
				return true;
			}
		}
		return false;
	}

	// ────────────────────────────────────────────
	// Configuration
	// ────────────────────────────────────────────

	private _getConfig(el: HTMLElement): GlassConfig {
		const cachedEl = el as ConfigCachedElement;
		const configKey = el.dataset.config ?? '';

		if (cachedEl.configCacheKey !== configKey) {
			let perElement: Partial<GlassConfig> = {};
			if (configKey) {
				try {
					const parsed = JSON.parse(configKey);
					if (parsed && typeof parsed === 'object') {
						perElement = parsed as Partial<GlassConfig>;
					} else {
						console.warn('LiquidGlass: data-config must decode to an object for element:', el);
					}
				} catch (_e) {
					console.warn('LiquidGlass: invalid JSON in data-config for element:', el);
				}
			}
			cachedEl.configCache = perElement;
			cachedEl.configCacheKey = configKey;
		}

		const config = { ...this.defaults, ...(cachedEl.configCache || {}) };

		if (config.button) {
			const state = this._buttonStates.get(el);
			if (state) {
				if (state.pressed) {
					config.zRadius = config.zRadius * 0.8;
					config.shadowSpread = config.shadowSpread * 1.2;
					// brightness reset to original (no hover boost)
				} else if (state.hover) {
					config.brightness = config.brightness + 0.2;
				}
			}
		}

		return config;
	}

	// ────────────────────────────────────────────
	// Resize
	// ────────────────────────────────────────────

	private _handleResize(): void {
		const dpr = window.devicePixelRatio || 1;
		const rect = this.root.getBoundingClientRect();

		this.capture.resize(dpr);
		this.renderer.resize(Math.round(rect.width * dpr), Math.round(rect.height * dpr));

		for (const el of this.glassSet) {
			this._updateGlassCanvasSize(el);
		}

		this._glassCache.clear();
		// Resize affects every glass canvas — mark all of them dirty
		// (both content image and shader output).
		for (const el of this.glassSet) this._glassContentDirty.add(el);
		this._globalDirty = true;
		this._wake(); // LOCAL
	}

	private _updateGlassCanvasSize(el: HTMLElement): void {
		const canvas = this.glassCanvases.get(el);
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		// Use offsetWidth/Height — the CSS box size before transforms.
		// This prevents button hover scale from inflating the canvas.
		const elW = Math.round(el.offsetWidth);
		const elH = Math.round(el.offsetHeight);
		const padW = SHADOW_PAD * 2;
		const padH = SHADOW_PAD * 2;
		canvas.width = Math.round((elW + padW) * dpr);
		canvas.height = Math.round((elH + padH) * dpr);
		canvas.style.cssText = [
			'position:absolute',
			`left:${-SHADOW_PAD}px`,
			`top:${-SHADOW_PAD}px`,
			`width:${elW + padW}px`,
			`height:${elH + padH}px`,
			'pointer-events:none',
			'z-index:-1'
		].join(';') + ';';
		this._glassLastSize.set(el, { w: elW, h: elH });
	}

	private _checkGlassSizeChanges(): boolean {
		let changed = false;
		for (const el of this.glassSet) {
			// Use offsetWidth/Height instead of getBoundingClientRect so
			// CSS transforms (e.g. button hover scale) don't trigger
			// false size-change detections and render loops.
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			const last = this._glassLastSize.get(el);
			if (!last
				|| Math.abs(last.w - w) > 0.5
				|| Math.abs(last.h - h) > 0.5
			) {
				this._updateGlassCanvasSize(el);
				this._glassCache.delete(el);
				this.capture.invalidateCache(el);
				// Only this element's content image needs to be
				// re-captured, not every glass on the page.
				this._glassContentDirty.add(el);
				changed = true;
			}
		}
		return changed;
	}

	// ────────────────────────────────────────────
	// Floating (drag) behaviour — Pointer Events
	// ────────────────────────────────────────────

	/** Parse the current translate(x, y) values from an element's transform. */
	private static _getTranslateXY(el: HTMLElement): [number, number] {
		const style = getComputedStyle(el);
		const matrix = style.transform;
		if (!matrix || matrix === 'none') return [0, 0];
		// matrix(a, b, c, d, tx, ty)
		const m = matrix.match(/matrix\(([^)]+)\)/);
		if (m) {
			const parts = m[1].split(',').map(Number);
			return [parts[4] || 0, parts[5] || 0];
		}
		return [0, 0];
	}

	private _handlePointerDown(e: PointerEvent): void {
		// Iterate all glass elements in reverse stacking order (topmost first).
		for (let i = this._sortedChildren.length - 1; i >= 0; i--) {
			const el = this._sortedChildren[i];
			if (!this.glassSet.has(el)) continue;

			const config = this._getConfig(el);
			if (!config.floating) continue;

			const rect = el.getBoundingClientRect();
			// Use the CSS box size (offsetWidth/Height) for hit testing,
			// but use the bounding rect position (which is correct for
			// elements positioned via CSS, grid, etc.).
			const elW = el.offsetWidth;
			const elH = el.offsetHeight;
			// The visual position includes the shadow canvas overflow.
			// Compute the element's true visual origin by centering the
			// offset size within the bounding rect.
			const visualLeft = rect.left + (rect.width - elW) / 2;
			const visualTop = rect.top + (rect.height - elH) / 2;

			if (
				e.clientX >= visualLeft && e.clientX <= visualLeft + elW &&
				e.clientY >= visualTop && e.clientY <= visualTop + elH
			) {
				const [tx, ty] = LiquidGlass._getTranslateXY(el);
				this._drag.active = true;
				this._drag.element = el;
				this._drag.startX = e.clientX;
				this._drag.startY = e.clientY;
				this._drag.origTx = tx;
				this._drag.origTy = ty;
				el.style.cursor = 'grabbing';
				el.setPointerCapture(e.pointerId);
				e.preventDefault();
				break;
			}
		}
	}

	private _handlePointerMove(e: PointerEvent): void {
		if (!this._drag.active) {
			for (const el of this.glassSet) {
				const config = this._getConfig(el);
				if (!config.floating) continue;
				const rect = el.getBoundingClientRect();
				const elW = el.offsetWidth;
				const elH = el.offsetHeight;
				const visualLeft = rect.left + (rect.width - elW) / 2;
				const visualTop = rect.top + (rect.height - elH) / 2;
				if (
					e.clientX >= visualLeft && e.clientX <= visualLeft + elW &&
					e.clientY >= visualTop && e.clientY <= visualTop + elH
				) {
					el.style.cursor = 'grab';
				} else {
					el.style.cursor = '';
				}
			}
			return;
		}

		const el = this._drag.element!;
		const dx = e.clientX - this._drag.startX;
		const dy = e.clientY - this._drag.startY;
		let newTx = this._drag.origTx + dx;
		let newTy = this._drag.origTy + dy;

		// Constrain within root bounds with margin.
		// For nested elements, offsetLeft/Top is relative to offsetParent
		// (which may not be root). Use getBoundingClientRect to compute
		// the element's position relative to root, then subtract the
		// current translate to get the base (CSS layout) position.
		const rootRect = this.root.getBoundingClientRect();
		const elW = el.offsetWidth;
		const elH = el.offsetHeight;
		const elRect = el.getBoundingClientRect();
		const [curTx, curTy] = LiquidGlass._getTranslateXY(el);
		const baseLeft = (elRect.left + (elRect.width - elW) / 2) - rootRect.left - curTx;
		const baseTop = (elRect.top + (elRect.height - elH) / 2) - rootRect.top - curTy;
		const margin = 10;
		const posLeft = baseLeft + newTx;
		const posTop = baseTop + newTy;
		const maxLeft = rootRect.width - elW - margin;
		const maxTop = rootRect.height - elH - margin;
		if (posLeft < margin) newTx += margin - posLeft;
		if (posTop < margin) newTy += margin - posTop;
		if (posLeft > maxLeft) newTx -= posLeft - maxLeft;
		if (posTop > maxTop) newTy -= posTop - maxTop;

		// Mark glasses overlapping the OLD position so they re-render
		// to clear the dragged element's previous footprint, THEN move
		// the element, THEN mark glasses overlapping the NEW position
		// so they pick up its new footprint.
		const oldRect = el.getBoundingClientRect();
		this._markGlassAndDependents(el, oldRect);
		el.style.transform = `translate(${newTx}px, ${newTy}px)`;
		this._markGlassAndDependents(el);
	}

	private _handlePointerUp(_e: PointerEvent): void {
		if (!this._drag.active) return;
		const dragged = this._drag.element!;
		dragged.style.cursor = '';
		this._drag.active = false;
		this._drag.element = null;
		// `isDragging` flips off, so the per-glass gate stops forcing
		// every-frame re-renders for this glass and its overlapping
		// neighbours. Mark them once so they get a final clean render.
		this._markGlassAndDependents(dragged);
	}

	// ────────────────────────────────────────────
	// Render loop
	// ────────────────────────────────────────────

	private _renderLoop(): void {
		if (!this._running) return;
		this._frame();
		this._rafId = requestAnimationFrame(() => this._renderLoop());
	}

	/** LOCAL: one frame of the loop; returns how many glasses re-rendered. */
	private _frame(): number {

		// FPS tracking
		const now = performance.now();
		this._fpsFrames++;
		if (now - this._fpsTime >= 1000) {
			this.fps = this._fpsFrames;
			this._fpsFrames = 0;
			this._fpsTime = now;
		}

		if (this._checkGlassSizeChanges()) {
			// _checkGlassSizeChanges already added the resized
			// elements to _glassDirty per-element; nothing more to do.
		}

		if (this._glassContentDirty.size > 0 && !this._capturingGlassContent) {
			// Snapshot the dirty set before draining: any mutations
			// that arrive while the async capture is in flight stay
			// in the live set and are picked up on the next tick.
			const targets = new Set(this._glassContentDirty);
			this._glassContentDirty.clear();
			this._captureGlassContent(targets);
		}

		try {
			return this._renderFrame();
		} catch (err) {
			console.error('LiquidGlass: render error:', err);
			return 0;
		}
	}

	private _renderFrame(): number {
		const dpr = window.devicePixelRatio || 1;
		const rootRect = this.root.getBoundingClientRect();
		const isDragging = this._drag.active;

		// 1. Fan out user markChanged() calls into per-glass dirty marks.
		if (this._userMarkedChanged.size > 0) {
			for (const el of this._userMarkedChanged) {
				this._markGlassesIntersecting(el);
			}
			this._userMarkedChanged.clear();
		}

		// 2. Promote any global dirty into per-element dirties so the
		//    rest of the loop only ever consults `_glassDirty`.
		if (this._globalDirty) {
			for (const el of this.glassSet) this._glassDirty.add(el);
			this._globalDirty = false;
		}

		const needsRender = this._glassDirty.size > 0
			|| this._hasDynamic
			|| isDragging;
		if (!needsRender) return 0;

		// 3. Snapshot + drain the dirty set so anything added during
		//    this frame's work (e.g. async cache landings) is picked
		//    up on the next frame instead of getting clobbered.
		const dirtyTargets = new Set(this._glassDirty);
		this._glassDirty.clear();

		// 4. Track which glass elements actually re-rendered this
		//    frame, with their sample rect, so later glasses in the
		//    z-order can detect "a prior glass that I overlap just
		//    re-rendered → I need to refresh too."
		const renderedThisFrame: Array<{ rect: SampleRect }> = [];

		// LOCAL: every pane, nested or not, in the paint order of the
		// root-level child it lives under.
		//
		// Upstream walked root's direct children and rendered the ones that
		// were glass -- correct when glass HAD to be a direct child. With
		// nesting allowed (see _setupGlassElements) a nested pane is never a
		// direct child, so this loop skipped it every frame: the scene was
		// never composed (the canvas sat at its 300x150 default, all zero),
		// the shader never ran, and the pane was a transparent hole showing
		// the real page through it. That is why liquid mode "didn't seem to
		// refract or distort" -- it was not rendering at all.
		for (const child of this._glassInPaintOrder()) {
			this._renderGlassElement(
				child,
				rootRect,
				dpr,
				isDragging,
				dirtyTargets,
				renderedThisFrame,
			);
		}
		return renderedThisFrame.length; // LOCAL
	}

	/**
	 * Render a single glass element by composing just the scene region
	 * that can affect it, then running the shader over that local input.
	 *
	 * Whether the shader actually re-runs depends on:
	 *   - explicit dirty mark for this element (in `dirtyTargets`),
	 *   - any earlier glass in z-order that re-rendered this frame
	 *     and whose rect intersects this glass's sample rect,
	 *   - this glass having moved since last frame (position cache),
	 *   - this glass having dynamic contributors in its sample (video,
	 *     data-dynamic),
	 *   - or active drag involving this element.
	 *
	 * On render, an entry is pushed to `renderedThisFrame` so later
	 * glasses can check whether they need to refresh too.
	 */
	private _renderGlassElement(
		child: HTMLElement,
		rootRect: DOMRect,
		dpr: number,
		isDragging: boolean,
		dirtyTargets: Set<HTMLElement>,
		renderedThisFrame: Array<{ rect: SampleRect }>,
	): void {
		const elRect = child.getBoundingClientRect();
		// LOCAL: a pane as wide as its root is a band with no sides.
		const config = {
			...this._getConfig(child),
			straight: elRect.width >= this.root.getBoundingClientRect().width - 1 ? 1 : 0,
		};
		const elW = child.offsetWidth;
		const elH = child.offsetHeight;
		const centerX = (elRect.left - rootRect.left) + elRect.width / 2;
		const centerY = (elRect.top - rootRect.top) + elRect.height / 2;
		const glassCanvas = this.glassCanvases.get(child);
		const isBeingDragged = isDragging && this._drag.element === child;
		const sampleRect = this._getPixelRect(elRect, rootRect, dpr, SHADOW_PAD);

		const cached = this._glassCache.get(child);
		const posChanged = !cached
			|| Math.abs(cached.centerX - centerX) > 0.5
			|| Math.abs(cached.centerY - centerY) > 0.5;
		const hasDynamicContributors = this._hasDynamic
			&& this._glassHasDynamicContributors(child, sampleRect, rootRect, dpr);

		// Did any earlier-rendered glass actually overlap this glass's
		// sample rect? Replaces the old monotonic `bgChanged` boolean
		// with a per-element intersection check.
		let priorGlassChanged = false;
		for (const r of renderedThisFrame) {
			if (LiquidGlass._rectsIntersect(r.rect, sampleRect)) {
				priorGlassChanged = true;
				break;
			}
		}

		const isExplicitlyDirty = dirtyTargets.has(child);

		const needsShaderRender = isDragging
			? (isBeingDragged || isExplicitlyDirty || priorGlassChanged || hasDynamicContributors)
			: (!cached || posChanged || isExplicitlyDirty || priorGlassChanged || hasDynamicContributors);

		if (needsShaderRender && glassCanvas) {
			// Use glassCanvas dimensions as the authoritative size for
			// the renderer pass. sampleRect.w/h (from getBoundingClientRect)
			// can differ from glassCanvas.width/height (from offsetWidth)
			// by ±1 device pixel due to sub-pixel rounding differences.
			// If the renderer clears fewer pixels than drawImage copies,
			// the rightmost/bottom columns contain stale pixels → a thin
			// visible line. Using the same source of truth for both avoids
			// the mismatch.
			const renderW = glassCanvas.width;
			const renderH = glassCanvas.height;
			this._composeSceneForGlass(child, sampleRect, rootRect, dpr);
			this.renderer.uploadAndBlur(
				this._sceneCanvas,
				0,
				0,
				renderW,
				renderH,
				config.blurAmount,
				config.blurPasses,   // LOCAL
			);
			this.renderer.clear();
			this.renderer.renderGlassPanel(
				config,
				elW,
				elH,
				dpr,
			);

			const ctx = glassCanvas.getContext('2d')!;
			ctx.clearRect(0, 0, glassCanvas.width, glassCanvas.height);
			ctx.drawImage(
				this.renderer.canvas,
				0, 0, glassCanvas.width, glassCanvas.height,
				0, 0, glassCanvas.width, glassCanvas.height,
			);

			this._glassCache.set(child, { centerX, centerY });
			renderedThisFrame.push({ rect: sampleRect });
		}
	}

	/**
	 * LOCAL: the root-level child a glass element sits under.
	 *
	 * Upstream requires every glass element to be a direct child of root, so
	 * this would always be the element itself. We allow a pane to live at any
	 * depth -- on this site the photograph it is glass OVER is a sibling of
	 * the pane's PARENT, and forcing the markup to match the library would
	 * mean restructuring the page to suit its implementation.
	 *
	 * Returns null if the element is not under root at all.
	 */
	private _glassInPaintOrder(): HTMLElement[] {
		const rank = new Map(this._sortedChildren.map((el, i) => [el, i]));
		const at = (g: HTMLElement) => rank.get(this._topLevelChildFor(g) ?? g) ?? Number.MAX_SAFE_INTEGER;
		return [...this.glassSet].sort((a, b) => at(a) - at(b));
	}

		private _topLevelChildFor(glass: HTMLElement): HTMLElement | null {
		let node: HTMLElement | null = glass;
		while (node && node.parentElement !== this.root) {
			node = node.parentElement;
			if (!node || node === document.body) return null;
		}
		return node;
	}

	/**
	 * LOCAL: every glass element inside a subtree, itself included.
	 *
	 * Used to prune panes out of a contributor's capture. Without it a child
	 * that contains a pane draws that pane into the scene the pane samples,
	 * and you get the panel refracting a picture of itself.
	 */
	private _glassWithin(child: HTMLElement): HTMLElement[] {
		const found: HTMLElement[] = [];
		for (const el of this.glassSet) {
			if (el === child || child.contains(el)) found.push(el);
		}
		return found;
	}

	/**
	 * Build the local input scene for a glass panel by walking only the
	 * contributors that paint before it in the stacking order.
	 */
	private _composeSceneForGlass(
		currentGlass: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): void {
		this._prepareSceneCanvas(sampleRect.w, sampleRect.h);

		// LOCAL: stop at the root-level child the pane LIVES UNDER, which is
		// the pane itself when it is a direct child (upstream's only case) and
		// an ancestor when it is nested. Comparing against the pane directly
		// never matched for a nested pane, so the loop ran to the end and
		// composited the very subtree the pane sits in.
		const stopAt = this._topLevelChildFor(currentGlass) ?? currentGlass;

		for (const child of this._sortedChildren) {
			if (child === stopAt) break;
			if (this.glassSet.has(child)) {
				this._drawPriorGlassToScene(child, sampleRect, rootRect, dpr);
			} else {
				this._drawNonGlassChildToScene(child, sampleRect, rootRect, dpr);
			}
		}

		/*
		 * LOCAL: the pane's own subtree, with every pane in it pruned.
		 *
		 * When the pane is nested, the child it lives under is a scene
		 * contributor too -- on this site that subtree is where the photograph
		 * is. Skipping it entirely was why a band refracted nothing but bokeh
		 * on black. It is drawn with the panes hidden, so what lands in the
		 * scene is the picture and not the glass.
		 */
		if (stopAt !== currentGlass && !this.glassSet.has(stopAt)) {
			this._drawNonGlassChildToScene(stopAt, sampleRect, rootRect, dpr);
		}
	}

	private _prepareSceneCanvas(width: number, height: number): void {
		if (this._sceneCanvas.width !== width || this._sceneCanvas.height !== height) {
			this._sceneCanvas.width = width;
			this._sceneCanvas.height = height;
		} else {
			this._sceneCtx.clearRect(0, 0, width, height);
		}
		// LOCAL: the scene's floor is the ROOT's own background, not white.
		//
		// Upstream hardcodes '#ffffff' here, which is a fair assumption for the
		// light UI this was built against and completely wrong on a dark page.
		// The scene canvas is what every glass element samples, and the flat
		// face of a pane is nothing BUT that sample -- the shader's refraction,
		// fresnel and specular all live on the bevel, where the normal tilts,
		// and contribute exactly zero across the face where N = (0,0,1). So a
		// white floor is not a subtle tint, it is the entire pane rendering
		// white with a thin glass edge drawn around it.
		//
		// It cannot come from the capture either: the library composites root's
		// CHILDREN into the scene, and the page's background is painted by the
		// root itself (and above it, by body), so it is never a child and never
		// gets captured. Reading it off the root is the only place it can come
		// from.
		this._sceneCtx.fillStyle = this._sceneFloorColour();
		this._sceneCtx.fillRect(0, 0, width, height);
	}

	// LOCAL: see _prepareSceneCanvas.
	//
	// Walks up from the root for the first element that actually paints a
	// background, because the root of a glass section is usually transparent
	// and the colour lives further up on body or html. Falls back to upstream's
	// white so a page that genuinely has no background behaves as before.
	private _sceneFloorColour(): string {
		let node: HTMLElement | null = this.root;
		while (node) {
			const colour = window.getComputedStyle(node).backgroundColor;
			if (colour && colour !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(colour)) {
				return colour;
			}
			node = node.parentElement;
		}
		return '#ffffff';
	}

	private _glassHasDynamicContributors(
		currentGlass: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): boolean {
		// A glass element marked data-dynamic on its own root counts
		// as always-dirty: forces every-frame shader re-runs.
		if (this._childHasDynamicContent(currentGlass)) return true;

		for (const child of this._sortedChildren) {
			if (child === currentGlass) break;
			if (this.glassSet.has(child)) continue;
			if (!this._childHasDynamicContent(child)) continue;
			if (this._childTouchesSample(child, sampleRect, rootRect, dpr)) {
				return true;
			}
		}
		return false;
	}

	private _childHasDynamicContent(child: HTMLElement): boolean {
		// LOCAL: data-dynamic="idle" is a dynamic contributor that is not moving right now.
		if (child.hasAttribute('data-dynamic')) return child.getAttribute('data-dynamic') !== 'idle';
		if (child.tagName === 'VIDEO') return true;
		// LOCAL: ...and the same for its descendants. This counted an idle
		// descendant as moving, so a section holding the light-under-glass
		// canvas or a parallax photo (both marked idle while still) made every
		// pane over it re-render every frame, forever.
		return child.querySelector('[data-dynamic]:not([data-dynamic="idle"]), video') !== null;
	}

	private _drawNonGlassChildToScene(
		child: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): void {
		const tag = child.tagName;

		if (child.hasAttribute('data-glass-ignore')) return;
		if (tag === 'CANVAS' || tag === 'IMG' || tag === 'VIDEO') {
			this._drawMediaElement(child, this._sceneCtx, sampleRect, rootRect, dpr);
			return;
		}

		// Wrapper-level early-out: if the wrapper's own (paint-padded)
		// bounds don't intersect the sample rect, neither it nor its
		// descendants can affect this glass panel — skip the entire
		// querySelectorAll + html-to-image work.
		//
		// Caveat: a descendant absolutely-positioned outside the
		// wrapper's box won't be drawn here. Such descendants are
		// vanishingly rare in practice; if you hit it, give the escaped
		// element its own wrapper or a `data-dynamic` annotation.
		if (!this._elementTouchesSample(child, sampleRect, rootRect, dpr)) {
			return;
		}

		// Draw any live media descendants (img/video/canvas) directly
		// from their source elements via the fast `drawImage` path,
		// since html-to-image can't rasterise videos.
		this._captureMediaDescendants(child, this._sceneCtx, sampleRect, rootRect, dpr);

		// Then composite the wrapper's HTML content via the cached
		// html-to-image snapshot. captureElement is async; concurrent
		// calls for the same element from multiple glass panels in the
		// same frame are deduped via HtmlCapture's `_capturing` set,
		// so the html-to-image pipeline runs at most once per frame
		// per element regardless of how many glasses overlap it.
		const isDynamic = child.hasAttribute('data-dynamic');
		// LOCAL: prune any nested panes out of this contributor.
		this.capture.captureElement(child, isDynamic, this._glassWithin(child));
		const rect = this._getPixelRect(child.getBoundingClientRect(), rootRect, dpr);
		this.capture.drawCachedElement(
			child,
			this._sceneCtx,
			rect.x - sampleRect.x,
			rect.y - sampleRect.y,
			rect.w,
			rect.h,
		);
		// On the very first frame nothing is in the cache yet — the
		// async capture will fire onCacheUpdate when it lands, which
		// adds the affected glasses back to _glassDirty for the next
		// frame. No need to set a dirty flag synchronously.
	}

	/**
	 * Recursively find and draw all img/video/canvas elements inside
	 * a wrapper, skipping any glass elements and their injected canvases.
	 */
	private _captureMediaDescendants(
		parent: HTMLElement,
		targetCtx: CanvasRenderingContext2D,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): void {
		const mediaEls = parent.querySelectorAll('img, video, canvas');
		for (const el of mediaEls) {
			const htmlEl = el as HTMLElement;
			// Skip the injected glass shader canvases
			let isGlassCanvas = false;
			for (const [, gc] of this.glassCanvases) {
				if (gc === el) { isGlassCanvas = true; break; }
			}
			if (isGlassCanvas) continue;
			// LOCAL: a layer that asks to be left out of what the glass sees
			// (data-glass-ignore). The floor light is one: the part of it under
			// a pane is that pane's own layer to draw (FloorLight, pane:under),
			// and the page-wide canvas is cleared there -- so in the capture its
			// light stopped dead at the rim, and the bevel's bend drew that
			// step again inside the pane as a second line.
			if (htmlEl.closest('[data-glass-ignore]')) continue;

			// LOCAL: nothing that sits ON a pane. The pane's own html is
			// pruned from the scene, but this media walk went round that and
			// drew every photograph inside it too -- the portfolio cards on the
			// "Ways to work together" band came out refracted behind
			// themselves, a smeared second copy along the bevel.
			let onGlass = false;
			for (const g of this.glassSet) {
				if (g !== parent && g.contains(htmlEl)) { onGlass = true; break; }
			}
			if (onGlass) continue;

			this._drawMediaElement(htmlEl, targetCtx, sampleRect, rootRect, dpr);
		}
	}

	/** Draw a single img/video/canvas into a local scene canvas. */
	private _drawMediaElement(
		el: HTMLElement,
		targetCtx: CanvasRenderingContext2D,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): boolean {
		const tag = el.tagName;
		const r = el.getBoundingClientRect();
		if (!this._elementTouchesSample(el, sampleRect, rootRect, dpr)) return false;
		const rect = this._getPixelRect(r, rootRect, dpr);
		const dx = rect.x - sampleRect.x;
		const dy = rect.y - sampleRect.y;
		const dw = rect.w;
		const dh = rect.h;

		// Hidden / collapsed media element — nothing to draw, but
		// drawImage with zero dimensions throws InvalidStateError, so
		// short-circuit.
		if (dw <= 0 || dh <= 0) return false;

		// LOCAL: respect the overflow clips the page puts on this element.
		//
		// drawImage paints the element's whole box, but on the page the box
		// is often cut by an ancestor -- a parallax photograph is 128% of its
		// frame and slides inside an overflow:hidden wrapper. Drawn unclipped,
		// the part of the image that is hidden on screen turned up in the
		// scene: behind a band sitting over the join between two photographs,
		// the upper photograph ran on through the lower half of the glass
		// where the next photograph should have been.
		const clip = this._visibleClipFor(el, rootRect, dpr);
		if (clip && (clip.w <= 0 || clip.h <= 0)) return false;
		targetCtx.save();
		if (clip) {
			targetCtx.beginPath();
			targetCtx.rect(clip.x - sampleRect.x, clip.y - sampleRect.y, clip.w, clip.h);
			targetCtx.clip();
		}
		try {
			return this._drawMediaUnclipped(el, tag, targetCtx, r, dx, dy, dw, dh);
		} finally {
			targetCtx.restore();
		}
	}

	/** LOCAL: the intersection of every overflow clip between el and root, in root pixels. */
	private _visibleClipFor(el: HTMLElement, rootRect: DOMRect, dpr: number): SampleRect | null {
		let clip: DOMRect | null = null;
		for (let node = el.parentElement; node && node !== this.root; node = node.parentElement) {
			const st = getComputedStyle(node);
			if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
			const r = node.getBoundingClientRect();
			if (!clip) {
				clip = new DOMRect(r.left, r.top, r.width, r.height);
			} else {
				const left = Math.max(clip.left, r.left);
				const top = Math.max(clip.top, r.top);
				const right = Math.min(clip.right, r.right);
				const bottom = Math.min(clip.bottom, r.bottom);
				clip = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
			}
		}
		return clip ? this._getPixelRect(clip, rootRect, dpr) : null;
	}

	private _drawMediaUnclipped(
		el: HTMLElement,
		tag: string,
		targetCtx: CanvasRenderingContext2D,
		r: DOMRect,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
	): boolean {
		if (tag === 'CANVAS') {
			const liveCanvas = el as HTMLCanvasElement;
			if (liveCanvas.width <= 0 || liveCanvas.height <= 0) return false;
			targetCtx.drawImage(liveCanvas, dx, dy, dw, dh);
			return true;
		} else if (tag === 'IMG') {
			const img = el as HTMLImageElement;
			if (!img.complete || img.naturalWidth === 0) return false;
			this._drawMediaFitted(
				targetCtx,
				img,
				img.naturalWidth,
				img.naturalHeight,
				el,
				r,
				dx,
				dy,
				dw,
				dh,
			);
			return true;
		} else if (tag === 'VIDEO') {
			const vid = el as HTMLVideoElement;
			// readyState 0 = HAVE_NOTHING (no data at all — skip).
			// readyState >= 1 = HAVE_METADATA (dimensions known; during
			// seeking the readyState may drop to 1, but drawImage still
			// draws the last decoded frame, which is far better than a
			// white hole in the glass effect).
			if (vid.readyState < 1) return false;
			try {
				this._drawMediaFitted(
					targetCtx,
					vid,
					vid.videoWidth,
					vid.videoHeight,
					el,
					r,
					dx,
					dy,
					dw,
					dh,
				);
			} catch {
				// Broken source, revoked blob URL, or decoder error —
				// skip gracefully rather than crashing the render loop.
				return false;
			}
			return true;
		}
		return false;
	}

	/** Draw an img or video onto a local scene canvas, respecting object-fit. */
	private _drawMediaFitted(
		targetCtx: CanvasRenderingContext2D,
		mediaEl: HTMLImageElement | HTMLVideoElement,
		natW: number,
		natH: number,
		child: HTMLElement,
		r: DOMRect,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
	): void {
		if (natW && natH) {
			const computed = getComputedStyle(child);
			const fit = computed.objectFit || 'fill';
			const pos = computed.objectPosition || '50% 50%';
			const src = LiquidGlass._objectFitRect(natW, natH, r.width, r.height, fit, pos);
			targetCtx.drawImage(mediaEl, src.sx, src.sy, src.sw, src.sh, dx, dy, dw, dh);
		} else {
			targetCtx.drawImage(mediaEl, dx, dy, dw, dh);
		}
	}

	private _drawPriorGlassToScene(
		child: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): void {
		const glassCanvas = this.glassCanvases.get(child);
		const elRect = child.getBoundingClientRect();
		if (glassCanvas) {
			const shaderRect = this._getPixelRect(elRect, rootRect, dpr, SHADOW_PAD);
			if (LiquidGlass._rectsIntersect(shaderRect, sampleRect)) {
				this._sceneCtx.drawImage(
					glassCanvas,
					0,
					0,
					glassCanvas.width,
					glassCanvas.height,
					shaderRect.x - sampleRect.x,
					shaderRect.y - sampleRect.y,
					shaderRect.w,
					shaderRect.h,
				);
			}
		}

		const contentImg = this._glassContentImages.get(child);
		if (!contentImg) return;
		const contentRect = this._getPixelRect(elRect, rootRect, dpr);
		if (!LiquidGlass._rectsIntersect(contentRect, sampleRect)) return;
		this._sceneCtx.drawImage(
			contentImg,
			contentRect.x - sampleRect.x,
			contentRect.y - sampleRect.y,
			contentRect.w,
			contentRect.h,
		);
	}

	private _getPixelRect(
		rect: DOMRect,
		rootRect: DOMRect,
		dpr: number,
		pad = 0,
	): SampleRect {
		return {
			x: Math.round((rect.left - rootRect.left - pad) * dpr),
			y: Math.round((rect.top - rootRect.top - pad) * dpr),
			w: Math.round((rect.width + pad * 2) * dpr),
			h: Math.round((rect.height + pad * 2) * dpr),
		};
	}

	private _childTouchesSample(
		child: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): boolean {
		if (this._elementTouchesSample(child, sampleRect, rootRect, dpr)) return true;

		for (const el of child.querySelectorAll('[data-dynamic], video')) {
			if (this._elementTouchesSample(el as HTMLElement, sampleRect, rootRect, dpr)) {
				return true;
			}
		}
		return false;
	}

	private _elementTouchesSample(
		element: HTMLElement,
		sampleRect: SampleRect,
		rootRect: DOMRect,
		dpr: number,
	): boolean {
		const pad = this._getPaintOverflowPad(element);
		const bounds = this._getPixelRect(element.getBoundingClientRect(), rootRect, dpr, pad);
		return LiquidGlass._rectsIntersect(bounds, sampleRect);
	}

	private _getPaintOverflowPad(element: HTMLElement): number {
		if (this.glassSet.has(element)) return SHADOW_PAD;

		const style = getComputedStyle(element);
		const backdropFilter = style.backdropFilter
			|| (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
		const maskImage = style.maskImage
			|| (style as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage;

		const paintsOutsideBounds =
			(style.boxShadow && style.boxShadow !== 'none')
			|| (style.textShadow && style.textShadow !== 'none')
			|| (style.filter && style.filter !== 'none')
			|| (backdropFilter && backdropFilter !== 'none')
			|| (maskImage && maskImage !== 'none')
			|| (style.mixBlendMode && style.mixBlendMode !== 'normal');

		return paintsOutsideBounds ? SHADOW_PAD : 0;
	}

	private static _rectsIntersect(a: SampleRect, b: SampleRect): boolean {
		return a.x < b.x + b.w
			&& a.x + a.w > b.x
			&& a.y < b.y + b.h
			&& a.y + a.h > b.y;
	}

	/** Compute the source rectangle for drawImage that replicates CSS object-fit / object-position. */
	static _objectFitRect(
		natW: number,
		natH: number,
		boxW: number,
		boxH: number,
		fit: string,
		pos: string,
	): ObjectFitRect {
		let sx = 0, sy = 0, sw = natW, sh = natH;

		if (fit === 'fill' || (fit === 'scale-down' && natW <= boxW && natH <= boxH)) {
			return { sx, sy, sw, sh };
		}

		const parts = pos.split(/\s+/);
		const parseFrac = (v: string, total: number): number => {
			if (v.endsWith('%')) return parseFloat(v) / 100;
			return parseFloat(v) / total;
		};
		const fx = parseFrac(parts[0] || '50%', boxW);
		const fy = parseFrac(parts[1] || '50%', boxH);

		if (fit === 'cover') {
			const scale = Math.max(boxW / natW, boxH / natH);
			sw = boxW / scale;
			sh = boxH / scale;
			sx = (natW - sw) * fx;
			sy = (natH - sh) * fy;
		} else if (fit === 'contain' || fit === 'scale-down') {
			return { sx: 0, sy: 0, sw: natW, sh: natH };
		} else if (fit === 'none') {
			sw = boxW;
			sh = boxH;
			sx = (natW - sw) * fx;
			sy = (natH - sh) * fy;
		}

		sx = Math.max(0, Math.min(sx, natW - 1));
		sy = Math.max(0, Math.min(sy, natH - 1));
		sw = Math.min(sw, natW - sx);
		sh = Math.min(sh, natH - sy);

		return { sx, sy, sw, sh };
	}
}
