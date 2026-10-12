import { useEffect } from "react";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";
import { beginPass, buildProgram, endPass, sharedGl } from "@fx/effects/engine/gl";
import { pointLights } from "@fx/effects/light/lights";
import { sceneEnvironment, SCENE_ENV_GLSL } from "@fx/effects/light/scene-env";
import { camera } from "@fx/effects/camera/camera";

/**
 * The plastic buttons' rounded edges (Ony, 2026-10-01: "Give the edges/sides
 * of the buttons more bevel so the specular highlights can be seen and move
 * around appropriately with the lights").
 *
 * A moulded plastic button is not a flat tile: its edge rounds over, here a
 * quarter-round of BEVEL_PX. Every light is mirrored in that curve where its
 * normal bisects the light and the eye, so each lamp lays a thin bright line
 * along the stretch of edge that faces it, sliding round the corners as the
 * lamp moves (Blinn-Phong on the curved normal; glossy moulded plastic, F0
 * 0.045 for n 1.5). The rounded edge also mirrors the scene round it by
 * Fresnel -- strongest where it turns away, at the grazing outer edge -- and
 * the side facing down, away from the room's light above, is a little darker.
 *
 * Every `.plastic` element in view, on the glass or off it, from every point
 * light in the list. The flat face's highlight from the cursor lamp stays
 * the CSS one (styles.css .plastic); this draws the face's highlight only
 * for the other lights. The 1 px CSS rim is retired where this runs
 * (html[data-plastic-bevel]).
 */

const BEVEL_PX = 5;
const MAX_LIGHTS = 6;
const MAX_BUTTONS = 64;

const VERTEX = /* glsl */ `
attribute vec2 aPos;    // viewport CSS px
attribute vec4 aRect;   // the button: x, y, w, h
attribute vec2 aInfo;   // corner radius px, 1 for dark plastic
uniform vec2 uViewport;
varying vec2 vPos;
varying vec4 vRect;
varying vec2 vInfo;
void main() {
  vPos = aPos;
  vRect = aRect;
  vInfo = aInfo;
  vec2 clip = aPos / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
${SCENE_ENV_GLSL}
varying vec2 vPos;
varying vec4 vRect;
varying vec2 vInfo;
uniform float uPixel;
uniform vec2 uViewCentre;
uniform float uCameraDistance;
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColour[${MAX_LIGHTS}];
uniform float uLightRadius[${MAX_LIGHTS}];
uniform float uLightFace[${MAX_LIGHTS}];  // 0: its face highlight is the CSS one
const float BEVEL = ${BEVEL_PX.toFixed(1)};
const float F0 = 0.045;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 b = vRect.zw * 0.5;
  vec2 p = vPos - (vRect.xy + b);
  float r = min(vInfo.x, min(b.x, b.y));
  float sd = sdRoundRect(p, b, r);
  float cover = clamp(0.5 - sd * uPixel, 0.0, 1.0);
  if (cover <= 0.0) discard;
  float bevel = min(BEVEL, min(b.x, b.y));
  float inset = max(-sd, 0.0);

  // The edge's outward direction, from the distance field's gradient.
  float e = 0.5;
  vec2 g = vec2(sdRoundRect(p + vec2(e, 0.0), b, r) - sdRoundRect(p - vec2(e, 0.0), b, r),
                sdRoundRect(p + vec2(0.0, e), b, r) - sdRoundRect(p - vec2(0.0, e), b, r));
  vec2 out2 = length(g) > 1e-4 ? normalize(g) : vec2(0.0);
  // The quarter-round: horizontal at the outer edge, level where the face begins.
  float t = clamp((bevel - inset) / bevel, 0.0, 1.0);
  vec3 N = normalize(vec3(out2 * t, sqrt(max(1.0 - t * t, 0.0))));
  float onBevel = step(1e-3, t);

  vec3 P = vec3(vPos, 0.0);
  vec3 eye = vec3(uViewCentre, uCameraDistance);
  vec3 V = normalize(eye - P);
  float cosV = max(dot(N, V), 0.0);

  vec3 spec = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i] - P;
    float dist = length(toL);
    vec3 L = toL / max(dist, 1.0);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float fl = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    // A bigger lamp is a broader, dimmer highlight: its angular size widens the lobe.
    float size = clamp(uLightRadius[i] / max(dist, 1.0), 0.01, 0.3);
    float shin = clamp(2.0 / (size * size), 60.0, 900.0);
    float fall = clamp(300.0 * 300.0 / max(dist * dist, 1.0), 0.0, 4.0);
    float lobe = pow(nh, shin) * shin / 40.0 + pow(nh, 30.0) * 0.4;
    float face = mix(uLightFace[i], 1.0, onBevel);
    spec += uLightColour[i] * lobe * fl * fall * face * max(dot(N, L), 0.0);
  }

  // The scene in the curve, by Fresnel: rough a little (moulded, not polished glass).
  float F = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);
  vec3 refl = sceneSeen(P + vec3(0.0, 0.0, 20.0), reflect(-V, N), 0.12) * F * onBevel;
  // The underside of the curve, turned from the room's light above: darker.
  float shade = onBevel * t * (0.25 + 0.35 * clamp(out2.y, 0.0, 1.0)) * (vInfo.y > 0.5 ? 0.6 : 1.0);

  vec3 h = spec + refl;
  float pk = max(h.r, max(h.g, h.b));
  if (pk > 1.0) h = mix(h / pk, vec3(1.0), clamp((pk - 1.0) / pk, 0.0, 1.0));
  float a = clamp(max(shade, max(h.r, max(h.g, h.b))), 0.0, 1.0);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(h / max(a, 1e-4), a * cover);
}
`;

export function PlasticBevel() {
  useEffect(() => {
    const s = sharedGl();
    if (!s) return;
    const { gl, canvas: buffer } = s;
    const program = buildProgram(gl, VERTEX, FRAGMENT, "plastic bevel");
    if (!program) return;
    const A = (n: string) => gl.getAttribLocation(program, n);
    const U = (n: string) => gl.getUniformLocation(program, n);
    const aPos = A("aPos");
    const aRect = A("aRect");
    const aInfo = A("aInfo");
    const u = {
      viewport: U("uViewport"),
      pixel: U("uPixel"),
      viewCentre: U("uViewCentre"),
      cameraDistance: U("uCameraDistance"),
      lightCount: U("uLightCount"),
      lightPos: U("uLightPos"),
      lightColour: U("uLightColour"),
      lightRadius: U("uLightRadius"),
      lightFace: U("uLightFace"),
      scene: U("uScene"),
      hasScene: U("uHasScene"),
      sceneView: U("uSceneView"),
      sceneAverage: U("uSceneAverage"),
    };
    const vbo = gl.createBuffer();
    const layer = document.createElement("canvas");
    layer.className = "plastic-bevel-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    document.documentElement.setAttribute("data-plastic-bevel", "");
    const scene = sceneEnvironment(gl, () => task.wake());
    const lightPos = new Float32Array(MAX_LIGHTS * 3);
    const lightColour = new Float32Array(MAX_LIGHTS * 3);
    const lightRadius = new Float32Array(MAX_LIGHTS);
    const lightFace = new Float32Array(MAX_LIGHTS);
    let last = "";

    const task = addTask("plastic bevel", ORDER.overlay, () => {
      const W = document.documentElement.clientWidth || window.innerWidth;
      const H = document.documentElement.clientHeight || window.innerHeight;
      const k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const verts: number[] = [];
      const keyParts: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".plastic")) {
        if (verts.length / 48 >= MAX_BUTTONS) break;
        const rc = el.getBoundingClientRect();
        if (
          rc.width < 4 ||
          rc.height < 4 ||
          rc.bottom < 0 ||
          rc.top > H ||
          rc.right < 0 ||
          rc.left > W
        )
          continue;
        // Not under something else (an open menu, a dialog): the button's own centre must be it.
        const top = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
        const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        const dark = el.classList.contains("plastic--dark") ? 1 : 0;
        const x0 = rc.left - 1;
        const y0 = rc.top - 1;
        const x1 = rc.right + 1;
        const y1 = rc.bottom + 1;
        for (const [x, y] of [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ] as const)
          verts.push(x, y, rc.left, rc.top, rc.width, rc.height, radius, dark);
        keyParts.push(`${rc.left | 0},${rc.top | 0},${rc.width | 0}`);
      }
      let n = 0;
      for (const l of pointLights()) {
        if (n >= MAX_LIGHTS || l.below || l.charge <= 0.002) continue;
        lightPos.set([l.x, l.y, Math.max(l.height, 40)], n * 3);
        const g = l.charge * Math.min(l.gain / 8, 2);
        lightColour.set([l.colour[0] * g, l.colour[1] * g, l.colour[2] * g], n * 3);
        lightRadius[n] = l.radius;
        lightFace[n] = l.id === "cursor" ? 0 : 1;
        keyParts.push(`${l.id}${Math.round(l.x)},${Math.round(l.y)},${l.charge.toFixed(2)}`);
        n++;
      }
      const key = `${W},${H},${keyParts.join(";")}`;
      if (key === last) return false;
      last = key;
      const ctx = layer.getContext("2d");
      if (!ctx) return false;
      if (layer.width !== Math.round(W * k) || layer.height !== Math.round(H * k)) {
        layer.width = Math.round(W * k);
        layer.height = Math.round(H * k);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layer.width, layer.height);
      if ((process.env.NODE_ENV !== "production"))
        Object.assign(window as unknown as Record<string, unknown>, {
          __plasticBevel: { buttons: verts.length / 48, lights: n },
        });
      if (verts.length === 0) {
        return false;
      }
      if (!beginPass(Math.round(W * k), Math.round(H * k), "plastic bevel")) return false;
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u.viewport, W, H);
      gl.uniform1f(u.pixel, k);
      gl.uniform2f(u.viewCentre, W / 2, H / 2);
      gl.uniform1f(u.cameraDistance, camera.distance(W));
      gl.uniform1i(u.lightCount, n);
      gl.uniform3fv(u.lightPos, lightPos);
      gl.uniform3fv(u.lightColour, lightColour);
      gl.uniform1fv(u.lightRadius, lightRadius);
      gl.uniform1fv(u.lightFace, lightFace);
      const sceneTex = scene.update();
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(u.scene, 4);
      gl.uniform1f(u.hasScene, sceneTex ? 1 : 0);
      gl.uniform2f(u.sceneView, W, H);
      gl.uniform3f(u.sceneAverage, ...scene.average);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aRect);
      gl.vertexAttribPointer(aRect, 4, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(aInfo);
      gl.vertexAttribPointer(aInfo, 2, gl.FLOAT, false, stride, 24);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 8);
      for (const a of [aPos, aRect, aInfo]) gl.disableVertexAttribArray(a);
      gl.disable(gl.BLEND);
      ctx.drawImage(buffer, 0, 0);
      endPass();
      return false;
    });
    const wake = () => task.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    // The other lights (a flash, the torch, fireworks) move without the pointer: look again a few times a second.
    const poll = window.setInterval(wake, 120);
    task.wake();
    return () => {
      task.stop();
      window.clearInterval(poll);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      layer.remove();
      scene.dispose();
      gl.deleteBuffer(vbo);
      document.documentElement.removeAttribute("data-plastic-bevel");
    };
  }, []);
  return null;
}
