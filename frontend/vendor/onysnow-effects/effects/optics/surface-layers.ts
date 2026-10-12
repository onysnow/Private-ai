/**
 * Loading a surface layer (smudge or scratch photograph) into a WebGL context.
 *
 * Shared by the light on the glass and the light through it, which live in
 * separate contexts, so both show the same marks from the same files.
 *
 * WebGL1 can only repeat a power-of-two texture, so an uploaded image of any
 * other size is drawn onto the nearest power-of-two canvas first -- an admin
 * upload must never be able to turn the layer black. No mipmaps: the map is
 * shown at one texel per CSS pixel, so it is never minified, and a hex-tile's
 * offset jumps between cells would pick the wrong mip level along every cell
 * border.
 */
export function loadSurfaceLayer(
  gl: WebGLRenderingContext,
  unit: number,
  src: string,
  onReady: (texture: WebGLTexture, side: number) => void,
) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // Up to 4096 (an uploaded high-resolution scan keeps its detail), and never past what the GPU takes.
    const maxSide = Math.min(4096, (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 2048);
    const side = Math.min(maxSide, 2 ** Math.round(Math.log2(Math.max(img.width, img.height, 1))));
    let source: TexImageSource = img;
    if (img.width !== side || img.height !== side) {
      const c = document.createElement("canvas");
      c.width = side;
      c.height = side;
      c.getContext("2d")?.drawImage(img, 0, 0, side, side);
      source = c;
    }
    const tex = gl.createTexture();
    if (!tex) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    onReady(tex, side);
  };
  img.src = src;
}

/**
 * What the marks do to light passing THROUGH the glass. Model constants, set
 * once and locked -- not controls; how dirty the pane is comes from the layer
 * images and "Grime clarity".
 *
 *   SMUDGE_EXTINCTION  An oil film with dust in it takes about half the light
 *                      out of the direct beam where it is thick: the sharp
 *                      band and edge under a smudge go dim.
 *   SMUDGE_SCATTER     ...and scatters a part of that back in as a soft glow
 *                      rather than losing it, so under a smudge the light is
 *                      dimmer AND softer -- the halo a greasy window throws.
 *   SCRATCH_SHADOW     A scratch, and the dust and grit that sit in it, turn
 *                      the light crossing them aside -- scattered out of the
 *                      beam -- so on what is behind they throw a thin shadow.
 *                      They make no light of their own: this used to add a
 *                      "focused" line at 1.8 x the beam, which put a bright
 *                      copy of every speck on the photograph, as bright as the
 *                      speck itself (Ony, 2026-09-30, 2b: "not just shadow is
 *                      being cast ... I can see a light dot"). A real groove
 *                      only redistributes what crosses it, and seen at this
 *                      distance, through the frost, that is a darkening.
 */
export const SMUDGE_EXTINCTION = 0.55;
export const SMUDGE_SCATTER = 0.25;
export const SCRATCH_SHADOW = 0.6;
