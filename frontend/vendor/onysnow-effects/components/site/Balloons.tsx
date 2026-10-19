import { useEffect } from "react";
import { previewing } from "@fx/effects/engine/preview";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";
import { beginPass, buildProgram, endPass, sharedGl } from "@fx/effects/engine/gl";
import { pointLights, pointer, roomLight, type Light } from "@fx/effects/light/lights";
import { sceneEnvironment } from "@fx/effects/light/scene-env";
import { imageLights, R0 } from "@fx/effects/light/image-sources";
import { glassGeometry } from "@fx/effects/scene/scene";
import { camera } from "@fx/effects/camera/camera";
import { t } from "@fx/lib/tuning";
import { balloonPhysics, drag, type BalloonPhysics } from "@fx/effects/balloons/air";
import {
  BALLOON_FRAGMENT,
  BALLOON_VERTEX,
  MAX_BALLOON_LIGHTS,
} from "@fx/effects/balloons/balloon.glsl";
import { addShapeCaster, type ShapeCaster } from "@fx/effects/optics/shape-casters";
import { BUOYANCY_Y, CROWN_Y, TIE_Y, inside, outlinePath } from "@fx/effects/balloons/shape";

/** CSS px per metre of the room (balloons.md 6: 500-700, estimate): an 11" balloon is 167 px. */
const PX_PER_M = 600;
/** How far in front of the photographs the balloons float, px (estimate: under the lamp's 300). */
const FLOAT_HEIGHT = 150;
/** The ribbon: 0.7 m in 12 rope links, 0.76 g/m (balloons.md 3.3). */
const STRING_M = 0.7;
const LINKS = 12;
const RIBBON_KG_PER_M = 0.00076;

/* Sizes, inches, weighted toward 11" (balloons.md 6). */
const SIZES = [9, 11, 11, 11, 12, 12, 16];
/*
 * Latex colours by family, as catalogue colours at full inflation; the hue
 * varies within a family, not over the wheel (balloons.md 6, Qualatex).
 */
const FAMILIES: readonly (readonly [number, number, number])[] = [
  [0.78, 0.05, 0.08], // red
  [0.95, 0.42, 0.06], // orange
  [0.97, 0.82, 0.1], // yellow
  [0.1, 0.55, 0.22], // green
  [0.08, 0.3, 0.8], // blue
  [0.45, 0.16, 0.62], // purple
  [0.95, 0.45, 0.65], // pink
  [0.93, 0.93, 0.9], // white
];

type Balloon = {
  body: import("@dimforge/rapier2d-compat").RigidBody;
  links: import("@dimforge/rapier2d-compat").RigidBody[];
  phys: BalloonPhysics;
  colour: readonly [number, number, number];
  finish: number;
  seed: number;
  shadow: ShapeCaster;
  removeShadow: () => void;
};

type Shred = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  w: number;
  h: number;
  colour: string;
  age: number;
};

/**
 * Party balloons in the room in front of the page (task 74, ?try=balloons):
 * helium latex balloons rise to the top of the window and wander along it
 * on the room's draughts, their ribbons hanging; the pointer's wake pushes
 * them; click one to pop it. Physics is Rapier 2D (Apache-2.0, lazy-loaded:
 * a ball per balloon, the ribbon a chain of rope joints) with the air model
 * of effects/balloons/air; the latex is effects/balloons/balloon.glsl, lit
 * by every light, and each balloon throws a shadow on the photographs as a
 * caster (crystal latex a coloured one).
 */
export function Balloons() {
  useEffect(() => {
    if (!previewing("balloons")) return;
    const s = sharedGl();
    if (!s) return;
    const { gl, canvas: buffer } = s;
    let disposed = false;
    let stop = () => {};

    const layer = document.createElement("canvas");
    layer.className = "balloons-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    void import("@dimforge/rapier2d-compat").then(async (mod) => {
      const R = mod.default;
      await R.init();
      if (disposed) return;
      const program = buildProgram(gl, BALLOON_VERTEX, BALLOON_FRAGMENT, "balloons");
      if (!program) return;
      const A = (n: string) => gl.getAttribLocation(program, n);
      const U = (n: string) => gl.getUniformLocation(program, n);
      const aPos = A("aPos");
      const aLocal = A("aLocal");
      const aColour = A("aColour");
      const aInfo = A("aInfo");
      const aRot = A("aRot");
      const u = {
        viewport: U("uViewport"),
        pixel: U("uPixel"),
        lightCount: U("uLightCount"),
        lightPos: U("uLightPos"),
        lightColour: U("uLightColour"),
        lightUv: U("uLightUv"),
        lightVia: U("uLightVia"),
        lightViaZ: U("uLightViaZ"),
        r0: U("uR0"),
        roomTex: U("uRoomTex"),
        hasRoom: U("uHasRoom"),
        roomExposure: U("uRoomExposure"),
        scene: U("uScene"),
        hasScene: U("uHasScene"),
        sceneView: U("uSceneView"),
        sceneAverage: U("uSceneAverage"),
        viewCentre: U("uViewCentre"),
        cameraDistance: U("uCameraDistance"),
        ambient: U("uAmbient"),
      };
      const vbo = gl.createBuffer();

      // The room behind the viewer, which the latex mirrors on its face (as WaterDrops loads it): balanced to the scene's light in the shader.
      let room: WebGLTexture | null = null;
      const roomSrc = document.documentElement.getAttribute("data-room-hdr");
      if (roomSrc) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 1024;
          c.height = 256;
          /*
           * Latex is satin: what it reflects is the room blurred over a
           * cone about 0.25 rad wide (estimate, from the soft reflections in
           * the reference photographs) -- 40 px of this 1024 px panorama.
           * Blurred once here, in the image's own (log) encoding, which is
           * close enough at this width (estimate); sampled once per pixel.
           */
          const cx = c.getContext("2d");
          if (cx) {
            cx.filter = "blur(14px)";
            cx.drawImage(img, -32, -32, c.width + 64, c.height + 64);
            cx.filter = "none";
          }
          room = gl.createTexture();
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, room);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        };
        img.src = roomSrc;
      }

      // The scene the latex reflects and is lit by: the page's own photographs (effects/light/scene-env).
      const scene = sceneEnvironment(gl, () => task.wake());

      // The room: the window's edges are its ceiling, floor and walls.
      const world = new R.World({ x: 0, y: 9.81 });
      const vw = () => (document.documentElement.clientWidth || window.innerWidth) / PX_PER_M;
      const vh = () => (document.documentElement.clientHeight || window.innerHeight) / PX_PER_M;
      const WALLS = (0x0001 << 16) | 0xffff;
      const BALLOON = (0x0004 << 16) | 0x0005;
      const LINK = (0x0002 << 16) | 0x0001;
      const walls = world.createRigidBody(R.RigidBodyDesc.fixed());
      const wallColliders: import("@dimforge/rapier2d-compat").Collider[] = [];
      const buildWalls = () => {
        for (const c of wallColliders) world.removeCollider(c, false);
        wallColliders.length = 0;
        const w = vw();
        const h = vh();
        // Under the header bar: the ceiling is the bar's bottom edge.
        const top = 72 / PX_PER_M;
        const t = 1;
        for (const [x, y, hx, hy] of [
          [w / 2, top - t, w, t],
          [w / 2, h + t, w, t],
          [-t, h / 2, t, h],
          [w + t, h / 2, t, h],
        ] as const) {
          wallColliders.push(
            world.createCollider(
              R.ColliderDesc.cuboid(hx, hy)
                .setTranslation(x, y)
                .setCollisionGroups(WALLS)
                .setFriction(0.8),
              walls,
            ),
          );
        }
      };
      buildWalls();

      let rng = 0x9e3779b9;
      const random = () => {
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        return (rng >>> 0) / 4294967296;
      };
      const balloons: Balloon[] = [];
      // Its outline for the shadow it throws: the measured profile (effects/balloons/shape).
      const shapePath = new Path2D(outlinePath());
      const make = (n: number) => {
        const inches = SIZES[Math.floor(random() * SIZES.length)]!;
        const fill = Math.round(t("balloonFill")) === 1 ? "air" : "helium";
        const phys = balloonPhysics(inches * 0.0254, fill);
        const r = phys.diameter / 2;
        const fam = FAMILIES[Math.floor(random() * FAMILIES.length)]!;
        const jitter = 0.9 + 0.2 * random();
        const colour = [
          Math.min(1, fam[0] * jitter),
          Math.min(1, fam[1] * (0.9 + 0.2 * random())),
          Math.min(1, fam[2] * jitter),
        ] as const;
        const chosen = Math.round(t("balloonFinish"));
        // 0 mixed: mostly fashion, some crystal; 1 fashion; 2 crystal; 3 neon.
        const finish =
          chosen === 0 ? (random() < 0.3 ? 1 : 0) : chosen === 1 ? 0 : chosen === 2 ? 1 : 2;
        const x = (0.1 + 0.8 * random()) * vw();
        const y = (0.5 + 0.4 * random()) * vh();
        const body = world.createRigidBody(
          R.RigidBodyDesc.dynamic()
            .setTranslation(x, y)
            .setGravityScale(0)
            .setAngularDamping(1.5)
            .setAdditionalMass(phys.addedMass),
        );
        world.createCollider(
          R.ColliderDesc.ball(r)
            /*
             * The knot and the thick neck are the heavy end, so a balloon
             * rights itself knot-down (balloons.md 3.4): its centre of mass a
             * quarter of a radius toward the knot (estimate); a thin shell's
             * inertia, 2/3 m r^2.
             */
            // (In the collider's frame, which sits 0.08 r up: 0.25 r below the widest point.)
            .setMassProperties(phys.mass, { x: 0, y: 0.33 * r }, (2 / 3) * phys.mass * r * r)
            .setRestitution(0.6)
            .setFriction(0.8)
            .setCollisionGroups(BALLOON)
            // Its crown is 1.08 radii above the widest point (effects/balloons/shape).
            .setTranslation(0, -0.08 * r),
          body,
        );
        // The cone below, down to the neck: a second, massless ball (it touches walls; the mass is set above).
        world.createCollider(
          R.ColliderDesc.ball(0.55 * r)
            .setTranslation(0, 0.9 * r)
            .setDensity(0)
            .setRestitution(0.6)
            .setFriction(0.8)
            .setCollisionGroups(BALLOON),
          body,
        );
        const links: Balloon["links"] = [];
        const seg = STRING_M / LINKS;
        let prev = body;
        let anchor = { x: 0, y: r * TIE_Y };
        for (let k = 0; k < LINKS; k++) {
          const link = world.createRigidBody(
            R.RigidBodyDesc.dynamic()
              .setTranslation(x, y + r * TIE_Y + (k + 1) * seg)
              .setLinearDamping(0.8),
          );
          world.createCollider(
            R.ColliderDesc.ball(0.004)
              .setMass(RIBBON_KG_PER_M * seg)
              .setCollisionGroups(LINK),
            link,
          );
          world.createImpulseJoint(R.JointData.rope(seg, anchor, { x: 0, y: 0 }), prev, link, true);
          links.push(link);
          prev = link;
          anchor = { x: 0, y: 0 };
        }
        const crystal = finish === 1;
        const shadow: ShapeCaster = {
          id: `balloon-${n}`,
          path: shapePath,
          x: -9999,
          y: -9999,
          size: 2.5 * r * PX_PER_M,
          angle: 0,
          height: FLOAT_HEIGHT,
          // Crystal latex passes its colour twice over (in and out); opaque latex nothing.
          tint: crystal ? [colour[0] ** 2, colour[1] ** 2, colour[2] ** 2] : [0, 0, 0],
        };
        balloons.push({
          body,
          links,
          phys,
          colour,
          finish,
          seed: n,
          shadow,
          removeShadow: addShapeCaster(shadow),
        });
      };
      // For the verification rigs (dev only).
      if ((process.env.NODE_ENV !== "production"))
        (window as unknown as { __balloons?: unknown }).__balloons = balloons;
      const count = Math.round(t("balloonCount"));
      for (let n = 0; n < count; n++) make(n);

      // The pointer's wake: the air it drags along, near it (estimate).
      let lastPointer = { x: pointer.x, y: pointer.y, t: performance.now() };
      let wake = { x: 0, y: 0 };

      const shreds: Shred[] = [];
      const loose: Balloon["links"][] = [];
      const pop = (b: Balloon) => {
        const p = b.body.translation();
        const r = b.phys.diameter / 2;
        // The skin tears from the hole outward in strips that fling and fall (balloons.md 4).
        const strips = 10 + Math.floor(random() * 6);
        for (let k = 0; k < strips; k++) {
          const a = (k / strips) * Math.PI * 2 + random() * 0.4;
          shreds.push({
            x: p.x * PX_PER_M + Math.cos(a) * r * PX_PER_M * 0.8,
            y: p.y * PX_PER_M + Math.sin(a) * r * PX_PER_M * 0.8,
            vx: Math.cos(a) * (2 + 2 * random()),
            vy: Math.sin(a) * (2 + 2 * random()) - 1,
            a: a,
            va: (random() - 0.5) * 30,
            w: 6 + random() * 10,
            h: 18 + random() * 22,
            colour: `rgb(${Math.round(b.colour[0] * 200)} ${Math.round(b.colour[1] * 200)} ${Math.round(b.colour[2] * 200)})`,
            age: 0,
          });
        }
        b.removeShadow();
        // Its ribbon falls free.
        loose.push(b.links);
        world.removeRigidBody(b.body);
        balloons.splice(balloons.indexOf(b), 1);
      };
      const onDown = (e: PointerEvent) => {
        const x = e.clientX / PX_PER_M;
        const y = e.clientY / PX_PER_M;
        for (const b of [...balloons].reverse()) {
          const p = b.body.translation();
          const r = b.phys.diameter / 2;
          // Into the balloon's own frame, in radii.
          const rot = b.body.rotation();
          const dx = (x - p.x) / r;
          const dy = (y - p.y) / r;
          const lx = dx * Math.cos(rot) + dy * Math.sin(rot);
          const ly = -dx * Math.sin(rot) + dy * Math.cos(rot);
          if (inside(lx, ly)) {
            pop(b);
            task.wake();
            return;
          }
        }
      };
      window.addEventListener("pointerdown", onDown);
      const onResize = () => buildWalls();
      window.addEventListener("resize", onResize);

      let acc = 0;
      let simTime = 0;
      const verts: number[] = [];
      const lightPos = new Float32Array(MAX_BALLOON_LIGHTS * 3);
      const lightColour = new Float32Array(MAX_BALLOON_LIGHTS * 3);
      const lightUv = new Float32Array(MAX_BALLOON_LIGHTS);
      // A mirrored light shines only through its pane: the pane, page px, and its face's height (-1: a direct light).
      const lightVia = new Float32Array(MAX_BALLOON_LIGHTS * 4);
      const lightViaZ = new Float32Array(MAX_BALLOON_LIGHTS);
      const DT = 1 / 60;

      const task = addTask("balloons", ORDER.scene, (now, dtMs) => {
        const dt = Math.min(dtMs / 1000, 0.1);
        // The pointer's wake.
        const pdt = Math.max((now - lastPointer.t) / 1000, 1e-3);
        if (pointer.x > -9999 && lastPointer.x > -9999) {
          // A hand moves the air at most a few metres a second (estimate): a jump of the pointer is not a gust.
          const cap = (v: number) => Math.max(-3, Math.min(3, v));
          const vx = cap((pointer.x - lastPointer.x) / PX_PER_M / pdt);
          const vy = cap((pointer.y - lastPointer.y) / PX_PER_M / pdt);
          wake = { x: wake.x * 0.8 + vx * 0.2, y: wake.y * 0.8 + vy * 0.2 };
        } else {
          wake = { x: 0, y: 0 };
        }
        lastPointer = { x: pointer.x, y: pointer.y, t: now };
        acc += dt;
        while (acc >= DT) {
          acc -= DT;
          simTime += DT;
          for (const b of balloons) {
            const p = b.body.translation();
            const v = b.body.linvel();
            // A room's draughts: smooth, 0.05-0.15 m/s, mostly sideways (balloons.md 3.2).
            const wx =
              0.08 * Math.sin(simTime * 0.23 + b.seed * 1.7) +
              0.04 * Math.sin(simTime * 0.61 + b.seed);
            const wy = 0.02 * Math.sin(simTime * 0.37 + b.seed * 2.3);
            let gx = 0;
            let gy = 0;
            if (pointer.x > -9999) {
              const dx = p.x - pointer.x / PX_PER_M;
              const dy = p.y - pointer.y / PX_PER_M;
              const fall = Math.exp(-(dx * dx + dy * dy) / (2 * 0.15 * 0.15));
              gx = wake.x * 0.6 * fall;
              gy = wake.y * 0.6 * fall;
            }
            const [fx, fy] = drag(v.x, v.y, wx + gx, wy + gy, b.phys.area);
            b.body.resetForces(true);
            b.body.resetTorques(true);
            /*
             * Buoyancy acts at the middle of the air it displaces; the
             * balloon's own weight at its centre of mass, toward the knot.
             * The pair is what turns a balloon knot-down (balloons.md 3.4).
             */
            const weight = b.phys.mass * 9.81;
            b.body.addForce({ x: fx, y: fy + weight }, true);
            // The middle of the air it displaces: 0.079 radii below its widest point (the measured shape's volume centroid).
            const rot = b.body.rotation();
            const rr = (b.phys.diameter / 2) * BUOYANCY_Y;
            b.body.addForceAtPoint(
              { x: 0, y: -(b.phys.netLift + weight) },
              { x: p.x - Math.sin(rot) * rr, y: p.y + Math.cos(rot) * rr },
              true,
            );
          }
          world.timestep = DT;
          world.step();
        }

        // Shreds.
        for (const sh of shreds) {
          sh.age += dt;
          sh.vy += 9.81 * dt * 0.6;
          sh.vx *= Math.exp(-3 * dt);
          sh.vy *= Math.exp(-1.5 * dt);
          sh.x += sh.vx * PX_PER_M * dt;
          sh.y += sh.vy * PX_PER_M * dt;
          sh.a += sh.va * dt;
          sh.va *= Math.exp(-2 * dt);
        }
        for (let i = shreds.length - 1; i >= 0; i--) if (shreds[i]!.age > 2.5) shreds.splice(i, 1);

        draw();
        return true;
      });

      const draw = () => {
        const W = document.documentElement.clientWidth || window.innerWidth;
        const H = document.documentElement.clientHeight || window.innerHeight;
        verts.length = 0;
        for (const b of balloons) {
          const p = b.body.translation();
          const rot = b.body.rotation();
          const r = (b.phys.diameter / 2) * PX_PER_M;
          const cx = p.x * PX_PER_M;
          const cy = p.y * PX_PER_M;
          b.shadow.x = cx;
          b.shadow.y = cy;
          b.shadow.angle = rot;
          const c = Math.cos(rot);
          const sn = Math.sin(rot);
          // The quad round the measured outline: crown to the bottom of the knot, a pixel or two spare.
          const top = CROWN_Y - 0.06;
          const bottom = TIE_Y + 0.06;
          const corners = [
            [-1.08, top],
            [1.08, top],
            [1.08, bottom],
            [-1.08, top],
            [1.08, bottom],
            [-1.08, bottom],
          ] as const;
          for (const [lx, ly] of corners) {
            const ox = lx * r;
            const oy = ly * r;
            verts.push(
              cx + ox * c - oy * sn,
              cy + ox * sn + oy * c,
              lx,
              ly,
              ...b.colour,
              r,
              b.finish,
              FLOAT_HEIGHT,
              c,
              sn,
            );
          }
        }
        // At the screen's own pixels (capped at 2x): a balloon's edge is as sharp as the display.
        const k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const ctx = layer.getContext("2d");
        if (layer.width !== Math.round(W * k) || layer.height !== Math.round(H * k)) {
          layer.width = Math.round(W * k);
          layer.height = Math.round(H * k);
        }
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, layer.width, layer.height);
        ctx.setTransform(k, 0, 0, k, 0, 0);
        // The ribbons, under the balloons: a curling ribbon, satin grey.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const b of balloons) {
          const p = b.body.translation();
          const rot = b.body.rotation();
          const r = (b.phys.diameter / 2) * PX_PER_M;
          ctx.beginPath();
          ctx.moveTo(
            p.x * PX_PER_M - Math.sin(rot) * r * TIE_Y,
            p.y * PX_PER_M + Math.cos(rot) * r * TIE_Y,
          );
          for (const l of b.links) {
            const q = l.translation();
            ctx.lineTo(q.x * PX_PER_M, q.y * PX_PER_M);
          }
          ctx.strokeStyle = "rgba(225, 220, 210, 0.85)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        for (const links of loose) {
          ctx.beginPath();
          links.forEach((l, k) => {
            const q = l.translation();
            if (k === 0) ctx.moveTo(q.x * PX_PER_M, q.y * PX_PER_M);
            else ctx.lineTo(q.x * PX_PER_M, q.y * PX_PER_M);
          });
          ctx.strokeStyle = "rgba(225, 220, 210, 0.85)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (verts.length > 0 && beginPass(Math.round(W * k), Math.round(H * k), "balloons")) {
          gl.useProgram(program);
          gl.enable(gl.BLEND);
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
          gl.uniform2f(u.viewport, W, H);
          gl.uniform1f(u.pixel, k);
          let n = 0;
          const direct: Light[] = [];
          for (const l of pointLights()) {
            if (n >= MAX_BALLOON_LIGHTS || l.below || l.charge <= 0.002) continue;
            direct.push(l);
            lightPos.set([l.x, l.y, Math.max(l.height, FLOAT_HEIGHT + 60)], n * 3);
            const k = l.charge * Math.min(l.gain / 8, 2);
            lightColour.set([l.colour[0] * k, l.colour[1] * k, l.colour[2] * k], n * 3);
            lightUv[n] = l.uv;
            lightVia.set([0, 0, 0, 0], n * 4);
            lightViaZ[n] = -1;
            n++;
          }
          /*
           * And their reflections in the glass behind (effects/light/image-sources,
           * the light catalogue's specular bounce): each pane's face mirrors the
           * lamp onto the balloons in front of it, from below and behind -- the
           * faint second highlight and the lift on the underside a balloon gets
           * in front of a window. Strongest first, while there are slots.
           */
          const mirrors = glassGeometry()
            .filter((g) => g.w > 40 && g.h > 40 && g.y < H && g.y + g.h > 0)
            .map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h, z: g.causes.gap + g.causes.thickness }));
          const images = imageLights(direct, mirrors).sort(
            (a, b) => b.via.w * b.via.h - a.via.w * a.via.h,
          );
          for (const im of images) {
            if (n >= MAX_BALLOON_LIGHTS) break;
            const l = im.source;
            lightPos.set([im.x, im.y, im.z], n * 3);
            const k = l.charge * Math.min(l.gain / 8, 2);
            lightColour.set([l.colour[0] * k, l.colour[1] * k, l.colour[2] * k], n * 3);
            lightUv[n] = l.uv;
            lightVia.set([im.via.x, im.via.y, im.via.w, im.via.h], n * 4);
            lightViaZ[n] = im.via.z;
            n++;
          }
          gl.uniform1i(u.lightCount, n);
          gl.uniform3fv(u.lightPos, lightPos);
          gl.uniform3fv(u.lightColour, lightColour);
          gl.uniform1fv(u.lightUv, lightUv);
          gl.uniform4fv(u.lightVia, lightVia);
          gl.uniform1fv(u.lightViaZ, lightViaZ);
          gl.uniform1f(u.r0, R0);
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, room);
          gl.uniform1i(u.roomTex, 3);
          gl.uniform1f(u.hasRoom, room ? 1 : 0);
          gl.uniform1f(u.roomExposure, roomLight.gain);
          const sceneTex = scene.update();
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, sceneTex);
          gl.uniform1i(u.scene, 4);
          gl.uniform1f(u.hasScene, sceneTex ? 1 : 0);
          gl.uniform2f(u.sceneView, W, H);
          gl.uniform3f(u.sceneAverage, ...scene.average);
          gl.uniform2f(u.viewCentre, W / 2, H / 2);
          gl.uniform1f(u.cameraDistance, camera.distance(W));
          // The room's own light on the latex (estimate), dimmer under the black light's dark room.
          gl.uniform1f(u.ambient, document.documentElement.hasAttribute("data-uv") ? 0.05 : 0.45);
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
          const stride = 12 * 4;
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
          gl.enableVertexAttribArray(aLocal);
          gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, stride, 8);
          gl.enableVertexAttribArray(aColour);
          gl.vertexAttribPointer(aColour, 3, gl.FLOAT, false, stride, 16);
          gl.enableVertexAttribArray(aInfo);
          gl.vertexAttribPointer(aInfo, 3, gl.FLOAT, false, stride, 28);
          gl.enableVertexAttribArray(aRot);
          gl.vertexAttribPointer(aRot, 2, gl.FLOAT, false, stride, 40);
          gl.drawArrays(gl.TRIANGLES, 0, verts.length / 12);
          for (const a of [aPos, aLocal, aColour, aInfo, aRot]) gl.disableVertexAttribArray(a);
          gl.disable(gl.BLEND);
          ctx.drawImage(buffer, 0, 0, W, H);
          endPass();
        }
        // The shreds of a popped balloon.
        for (const sh of shreds) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - sh.age / 2.5);
          ctx.translate(sh.x, sh.y);
          ctx.rotate(sh.a);
          ctx.fillStyle = sh.colour;
          ctx.beginPath();
          ctx.ellipse(0, 0, sh.w / 2, sh.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };

      task.wake();
      stop = () => {
        task.stop();
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("resize", onResize);
        for (const b of balloons) b.removeShadow();
        world.free();
        if (room) gl.deleteTexture(room);
        scene.dispose();
        gl.deleteBuffer(vbo);
      };
    });

    return () => {
      disposed = true;
      stop();
      layer.remove();
    };
  }, []);
  return null;
}
