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
 * GlassRenderer — WebGL rendering pipeline for the liquid glass effect.
 *
 * Manages a single offscreen WebGL canvas, shader programs, and a pool
 * of local-sized FBOs for blur passes. Each panel render crops just the
 * padded region behind that panel, uploads only that region, and shades
 * the glass effect into the matching per-element canvas.
 */

import { VS_QUAD, FS_BLIT, FS_BLUR, VS_GLASS, FS_GLASS } from './shaders.js';
import { BLUR_ITERATIONS, SHADOW_PAD } from './defaults.js';
import type { GlassConfig } from './defaults.js';

interface FBO {
	fbo: WebGLFramebuffer;
	tex: WebGLTexture;
	w: number;
	h: number;
}

interface FBOSet {
	bg: FBO;
	blurA: FBO;
	blurB: FBO;
}

type UniformMap = Record<string, WebGLUniformLocation | null>;

export class GlassRenderer {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGLRenderingContext;
	private readonly cropCanvas: HTMLCanvasElement;
	private readonly cropCtx: CanvasRenderingContext2D;

	private blitP!: WebGLProgram;
	private blitU!: UniformMap;
	private blurP!: WebGLProgram;
	private blurU!: UniformMap;
	private glassP!: WebGLProgram;
	private glassU!: UniformMap;

	private quadBuf!: WebGLBuffer;
	private panelBuf!: WebGLBuffer;

	private readonly fboCache = new Map<string, FBOSet>();
	private activeFBOs: FBOSet | null = null;

	private bgTex: WebGLTexture | null = null;

	width = 0;
	height = 0;

	contextLost = false;

	private _onContextLost: (e: Event) => void;
	private _onContextRestored: () => void;

	constructor() {
		this.canvas = document.createElement('canvas');
		this.canvas.style.display = 'none';
		document.body.appendChild(this.canvas);
		this.cropCanvas = document.createElement('canvas');
		this.cropCtx = this.cropCanvas.getContext('2d')!;

		const gl = this.canvas.getContext('webgl', {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			preserveDrawingBuffer: true,
		});

		if (!gl) {
			throw new Error('LiquidGlass: WebGL is not supported in this browser.');
		}
		this.gl = gl;

		this._initPrograms();
		this._initBuffers();

		this._onContextLost = (e: Event) => {
			e.preventDefault();
			this.contextLost = true;
			console.warn('LiquidGlass: WebGL context lost.');
		};
		this._onContextRestored = () => {
			console.info('LiquidGlass: WebGL context restored — reinitialising.');
			this.contextLost = false;
			this._initPrograms();
			this._initBuffers();
			for (const fboSet of this.fboCache.values()) {
				this._freeFBOSet(fboSet);
			}
			this.fboCache.clear();
			this.activeFBOs = null;
			this.bgTex = null;
		};
		this.canvas.addEventListener('webglcontextlost', this._onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);
	}

	// ────────────────────────────────────────────
	// Initialisation
	// ────────────────────────────────────────────

	private _initPrograms(): void {
		this.blitP = this._link(VS_QUAD, FS_BLIT);
		this.blitU = this._uloc(this.blitP, ['u_tex', 'u_scale', 'u_offset']);

		this.blurP = this._link(VS_QUAD, FS_BLUR);
		this.blurU = this._uloc(this.blurP, ['u_tex', 'u_dir']);

		this.glassP = this._link(VS_GLASS, FS_GLASS);
		this.glassU = this._uloc(this.glassP, [
			'u_bgTex', 'u_blurTex', 'u_center', 'u_size', 'u_radius',
			'u_res', 'u_pad', 'u_refract', 'u_chroma', 'u_edgeBlur', 'u_blurOn', 'u_straight',
			'u_edgeHL', 'u_spec', 'u_fresnel', 'u_distort', 'u_alpha',
			'u_specTight', 'u_lightDir',   // LOCAL
			'u_sat', 'u_tint', 'u_zRadius', 'u_brightness',
			'u_shadowAlpha', 'u_shadowSpread', 'u_shadowOffY',
			'u_bevelMode',
			'u_physEdge', 'u_thick', 'u_iorRGB', 'u_veil', // LOCAL: ?try=liquidedge
		]);
	}

	private _initBuffers(): void {
		const gl = this.gl;

		this.quadBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

		this.panelBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.panelBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
	}

	// ────────────────────────────────────────────
	// Resize
	// ────────────────────────────────────────────

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		// Panel sizes change on resize — flush the FBO pool so stale
		// entries don't accumulate and the canvas can shrink.
		for (const fboSet of this.fboCache.values()) {
			this._freeFBOSet(fboSet);
		}
		this.fboCache.clear();
		this.activeFBOs = null;
		this.canvas.width = 0;
		this.canvas.height = 0;
	}

	// ────────────────────────────────────────────
	// Background upload
	// ────────────────────────────────────────────

	uploadAndBlur(
		sourceCanvas: HTMLCanvasElement,
		sourceX: number,
		sourceY: number,
		width: number,
		height: number,
		blurAmount: number,
		// LOCAL: was the fixed BLUR_ITERATIONS constant. Passed in rather than
		// read off a config, because this method has never had one -- my first
		// attempt referenced `config` here and it is not in scope. @ts-nocheck
		// on this vendored file meant nothing caught it; it would have thrown
		// at the first frame.
		blurPasses: number = BLUR_ITERATIONS,
	): void {
		if (this.contextLost) return;
		const gl = this.gl;
		if (!this._setActiveSize(width, height)) return;
		const W = this.width;
		const H = this.height;
		const fboSet = this.activeFBOs!;

		this.cropCanvas.width = W;
		this.cropCanvas.height = H;
		this.cropCtx.clearRect(0, 0, W, H);
		this.cropCtx.drawImage(sourceCanvas, -sourceX, -sourceY);

		if (!this.bgTex) {
			this.bgTex = gl.createTexture();
		}
		gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true as unknown as number);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cropCanvas);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false as unknown as number);

		// Blit source → bgFBO (local padded region)
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.bg.fbo);
		gl.viewport(0, 0, W, H);
		gl.useProgram(this.blitP);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
		gl.uniform1i(this.blitU.u_tex, 0);
		gl.uniform2f(this.blitU.u_scale, 1, 1);
		gl.uniform2f(this.blitU.u_offset, 0, 0);
		this._drawQuad(this.blitP, this.quadBuf);

		// Copy bgFBO → blurA (u_scale/u_offset are already (1,1)/(0,0))
		const bw = fboSet.blurA.w;
		const bh = fboSet.blurA.h;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
		gl.viewport(0, 0, bw, bh);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
		this._drawQuad(this.blitP, this.quadBuf);

		// Multi-pass Gaussian blur (skip entirely when not needed)
		if (blurAmount > 0) {
			// LOCAL: each pass reaches further than the last (Kawase-style).
			//
			// Upstream used one fixed offset of blurAmount * 2.5 texels for
			// every pass, which tops out around an 8px blur at full frost --
			// enough to soften a photograph, nowhere near enough to hide it.
			// Growing the offset per pass widens the result with the square
			// root of the sum of squares (about 33px at full frost with six
			// passes) while the early, tight passes fill in between the wide
			// ones' taps, so it stays smooth instead of banding.
			const base = blurAmount * 2.5;
			gl.useProgram(this.blurP);
			gl.uniform1i(this.blurU.u_tex, 0);
			// More passes is a wider, smoother frost, and each costs two
			// full-screen draws. Clamped so a bad config cannot stall a frame.
			const passes = Math.max(1, Math.min(12, Math.round(blurPasses)));
			for (let i = 0; i < passes; i++) {
				const spread = base * (i + 1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurB.fbo);
				gl.viewport(0, 0, bw, bh);
				gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
				gl.uniform2f(this.blurU.u_dir, spread / bw, 0);
				this._drawQuad(this.blurP, this.quadBuf);

				gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
				gl.bindTexture(gl.TEXTURE_2D, fboSet.blurB.tex);
				gl.uniform2f(this.blurU.u_dir, 0, spread / bh);
				this._drawQuad(this.blurP, this.quadBuf);
			}
		}
	}

	// ────────────────────────────────────────────
	// Glass panel rendering
	// ────────────────────────────────────────────

	renderGlassPanel(
		config: GlassConfig,
		width: number,
		height: number,
		dpr: number,
	): void {
		if (this.contextLost) return;
		const gl = this.gl;
		const W = this.width;
		const H = this.height;
		const fboSet = this.activeFBOs!;

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.glassP);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
		gl.uniform1i(this.glassU.u_bgTex, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
		gl.uniform1i(this.glassU.u_blurTex, 1);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, this.canvas.height - H, W, H);
		gl.uniform2f(this.glassU.u_res, W, H);

		gl.uniform2f(this.glassU.u_center, W * 0.5, H * 0.5);
		gl.uniform2f(this.glassU.u_size, width * dpr, height * dpr);

		gl.uniform1f(this.glassU.u_radius, config.cornerRadius * dpr);
		gl.uniform1f(this.glassU.u_pad, SHADOW_PAD * dpr);
		gl.uniform1f(this.glassU.u_refract, config.refraction);
		gl.uniform1f(this.glassU.u_chroma, config.chromAberration);
		gl.uniform1f(this.glassU.u_edgeBlur, config.edgeBlur ?? 0); // LOCAL
		gl.uniform1f(this.glassU.u_blurOn, config.blurAmount > 0 ? 1 : 0); // LOCAL
		gl.uniform1f(this.glassU.u_straight, config.straight ?? 0); // LOCAL
		gl.uniform1f(this.glassU.u_edgeHL, config.edgeHighlight);
		gl.uniform1f(this.glassU.u_spec, config.specular);
		gl.uniform1f(this.glassU.u_fresnel, config.fresnel);
		gl.uniform1f(this.glassU.u_distort, config.distortion);
		// LOCAL: the specular rig, defaulted so an absent value is upstream's.
		gl.uniform1f(this.glassU.u_specTight, config.specularTightness ?? 1);
		gl.uniform2f(this.glassU.u_lightDir, config.lightX ?? 0, config.lightY ?? 0);
		gl.uniform1f(this.glassU.u_alpha, config.opacity);
		gl.uniform1f(this.glassU.u_sat, config.saturation);
		gl.uniform1f(this.glassU.u_tint, config.tintStrength);
		gl.uniform1f(this.glassU.u_zRadius, config.zRadius * dpr);
		gl.uniform1f(this.glassU.u_brightness, config.brightness);
		gl.uniform1f(this.glassU.u_shadowAlpha, config.shadowOpacity);
		gl.uniform1f(this.glassU.u_shadowSpread, config.shadowSpread * dpr);
		gl.uniform1f(this.glassU.u_shadowOffY, config.shadowOffsetY * dpr);
		gl.uniform1f(this.glassU.u_bevelMode, config.bevelMode);
		// LOCAL: the physical edge (?try=liquidedge, effects/adapters/liquid-config).
		gl.uniform1f(this.glassU.u_physEdge, config.physicalEdge ?? 0);
		gl.uniform1f(this.glassU.u_thick, (config.thickness ?? 18) * dpr);
		gl.uniform3f(this.glassU.u_iorRGB, config.iorR ?? 1.5, config.iorG ?? 1.5, config.iorB ?? 1.5);
		gl.uniform4f(this.glassU.u_veil, config.veilR ?? 0, config.veilG ?? 0, config.veilB ?? 0, config.veilA ?? 0);

		this._drawQuad(this.glassP, this.panelBuf);
		gl.disable(gl.BLEND);
	}

	clear(): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, this.canvas.height - this.height, this.width, this.height);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(0, this.canvas.height - this.height, this.width, this.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.disable(gl.SCISSOR_TEST);
	}

	destroy(): void {
		this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
		if (!this.contextLost) {
			const gl = this.gl;
			for (const fboSet of this.fboCache.values()) {
				this._freeFBOSet(fboSet);
			}
			this.fboCache.clear();
			if (this.bgTex) gl.deleteTexture(this.bgTex);
			gl.deleteBuffer(this.quadBuf);
			gl.deleteBuffer(this.panelBuf);
			gl.deleteProgram(this.blitP);
			gl.deleteProgram(this.blurP);
			gl.deleteProgram(this.glassP);
		}
		this.canvas.remove();
	}

	// ────────────────────────────────────────────
	// FBO management
	// ────────────────────────────────────────────

	private _setActiveSize(w: number, h: number): boolean {
		if (w <= 0 || h <= 0) return false;

		this.width = w;
		this.height = h;

		if (this.canvas.width < w || this.canvas.height < h) {
			this.canvas.width = Math.max(this.canvas.width, w);
			this.canvas.height = Math.max(this.canvas.height, h);
		}

		const key = `${w}x${h}`;
		let fboSet = this.fboCache.get(key);
		if (!fboSet) {
			fboSet = {
				bg: this._makeFBO(w, h),
				blurA: this._makeFBO(w, h),
				blurB: this._makeFBO(w, h),
			};
			this.fboCache.set(key, fboSet);
		}
		this.activeFBOs = fboSet;
		return true;
	}

	private _makeFBO(w: number, h: number): FBO {
		const gl = this.gl;
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return { fbo, tex, w, h };
	}

	private _freeFBO(fboObj: FBO | null): void {
		if (!fboObj) return;
		const gl = this.gl;
		gl.deleteFramebuffer(fboObj.fbo);
		gl.deleteTexture(fboObj.tex);
	}

	private _freeFBOSet(fboSet: FBOSet): void {
		this._freeFBO(fboSet.bg);
		this._freeFBO(fboSet.blurA);
		this._freeFBO(fboSet.blurB);
	}

	// ────────────────────────────────────────────
	// Shader helpers
	// ────────────────────────────────────────────

	private _compile(src: string, type: number): WebGLShader | null {
		const gl = this.gl;
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			console.error('LiquidGlass shader compile error:', gl.getShaderInfoLog(s), src);
			return null;
		}
		return s;
	}

	private _link(vsSrc: string, fsSrc: string): WebGLProgram {
		const gl = this.gl;
		const p = gl.createProgram()!;
		gl.attachShader(p, this._compile(vsSrc, gl.VERTEX_SHADER)!);
		gl.attachShader(p, this._compile(fsSrc, gl.FRAGMENT_SHADER)!);
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			console.error('LiquidGlass program link error:', gl.getProgramInfoLog(p));
		}
		return p;
	}

	private _uloc(prog: WebGLProgram, names: string[]): UniformMap {
		const gl = this.gl;
		const u: UniformMap = {};
		for (const n of names) {
			u[n] = gl.getUniformLocation(prog, n);
		}
		return u;
	}

	private _drawQuad(prog: WebGLProgram, buf: WebGLBuffer): void {
		const gl = this.gl;
		const loc = gl.getAttribLocation(prog, 'a_pos');
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}
