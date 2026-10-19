/**
 * The shutter's sound.
 *
 * Three cues, cut from recordings of a real film camera:
 *
 *   flash-charge   the capacitor winding. Flattened and then looped, so the
 *                  only thing that moves its level is the charge — the
 *                  recording is of a capacitor actually winding up and swells
 *                  and dies across its own length, which looped straight made
 *                  the whine pulse every 1.87 seconds. See `steady`.
 *                  Played backwards and faster while the charge is draining,
 *                  since a rise reversed IS a fall: the same recording read
 *                  the other way is a capacitor dumping what it had.
 *   shutter-click  the mechanism alone, for a click that takes no photograph.
 *   shutter-flash  the mechanism and the flash together, for one that does.
 *
 * The charge recording is a near-pure 18 kHz tone — what a real flash
 * capacitor actually whines at — and it is kept at that pitch. Everything that
 * shapes it therefore works in the top octave: a filter sweeping the range a
 * 4 kHz tone would want silences this one outright.
 */

const CLICK = "/sfx/shutter-click.mp3";
const FLASH = "/sfx/shutter-flash.mp3";
const CHARGE = "/sfx/flash-charge.mp3";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let ready = false;

const buffers = new Map<string, AudioBuffer>();
const pending = new Set<string>();

/**
 * The charge bed: the same recording running forwards and backwards at once,
 * crossfaded by which way the charge is going. Two sources rather than one
 * reversed on demand, because swapping a buffer means restarting the source,
 * and a restart in the middle of a sustained tone is an audible click.
 */
let whine: AudioBufferSourceNode | null = null;
let whineGain: GainNode | null = null;
let dump: AudioBufferSourceNode | null = null;
let dumpGain: GainNode | null = null;
let whineFilter: BiquadFilterNode | null = null;

let charge = 0;
/** 0 while winding, 1 while draining. Smoothed; see noteDirection. */
let draining = 0;
/** How hard it is draining, in charge per second. */
let drainRate = 0;
/** The same, eased — this is what the pitch follows. */
let smoothedDrain = 0;
let lastCharge = 0;
let lastAt = 0;
/**
 * Spending the charge drops it to zero in one step. That is not a drain, it is
 * a photograph, and letting it read as one would put a dying whine underneath
 * every shutter fire.
 */
let spent = false;

/**
 * Flatten a recording's own loudness so it can be looped without pumping.
 *
 * The charge recording is a capacitor actually winding up, which means it
 * SWELLS: measured, its RMS runs 0.28 at the start, up to 1.00 two thirds
 * through, and back down to 0.25 by the end of its 1.87 seconds. Looping that
 * replays the swell every 1.87 seconds, so the whine picks up and drops away
 * over and over instead of holding -- which is what you hear, and which the
 * old comment about the loop being seamless missed entirely. The loop is
 * seamless in PHASE; the fault is in the envelope.
 *
 * Dividing the signal by a smoothed version of its own envelope leaves the
 * timbre alone and takes the swell out: the same measurement afterwards runs
 * 0.93 to 1.00, and the dominant partial stays at 18 kHz. The level is then
 * free to follow the charge, which is the only thing that should be moving it.
 *
 * The floor stops near-silent passages being multiplied up into noise, and the
 * final trim ends the loop on a sample that matches the first in both value
 * and slope, so the join has no step in it.
 */
export function steady(buffer: AudioBuffer, ctx: AudioContext) {
  const window = Math.max(1, Math.round(buffer.sampleRate * 0.06));
  const half = window >> 1;

  const channels: Float32Array[] = [];
  let peakOut = 0;
  let peakIn = 0;

  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const from = buffer.getChannelData(c);
    const n = from.length;

    // Running sum of squares, so the envelope costs one pass rather than one
    // convolution per sample.
    const cumulative = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) {
      const v = from[i] ?? 0;
      cumulative[i + 1] = (cumulative[i] ?? 0) + v * v;
      if (Math.abs(v) > peakIn) peakIn = Math.abs(v);
    }

    const envelope = new Float64Array(n);
    let loudest = 0;
    for (let i = 0; i < n; i += 1) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(n, i + half);
      const rms = Math.sqrt(((cumulative[hi] ?? 0) - (cumulative[lo] ?? 0)) / (hi - lo));
      envelope[i] = rms;
      if (rms > loudest) loudest = rms;
    }

    const floor = loudest * 0.08;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const level = Math.max(envelope[i] ?? 0, floor);
      const v = (from[i] ?? 0) / (level || 1);
      out[i] = v;
      if (Math.abs(v) > peakOut) peakOut = Math.abs(v);
    }
    channels.push(out);
  }

  // Back to the level it arrived at, so nothing downstream has to be retuned.
  const gain = peakOut > 0 ? peakIn / peakOut : 1;

  // End on a sample that matches the first in value and slope.
  const first = channels[0];
  let length = buffer.length;
  if (first && first.length > 600) {
    const v0 = first[0] ?? 0;
    const slope0 = (first[1] ?? 0) - v0;
    const scale = peakOut || 1;
    let best = Infinity;
    for (let j = first.length - 400; j < first.length; j += 1) {
      const v = first[j] ?? 0;
      const cost = Math.abs(v - v0) / scale + Math.abs(v - (first[j - 1] ?? 0) - slope0) / scale;
      if (cost < best) {
        best = cost;
        length = j;
      }
    }
  }

  const copy = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < channels.length; c += 1) {
    const to = copy.getChannelData(c);
    const from = channels[c];
    for (let i = 0; i < length; i += 1) to[i] = (from?.[i] ?? 0) * gain;
  }
  return copy;
}

function reversed(buffer: AudioBuffer, ctx: AudioContext) {
  const copy = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const from = buffer.getChannelData(c);
    const to = copy.getChannelData(c);
    for (let i = 0, n = from.length; i < n; i += 1) to[i] = from[n - 1 - i] ?? 0;
  }
  return copy;
}

function silent() {
  // The cursor light, the aperture and the winding are all switched off under
  // this setting; a whine with nothing to look at would be stranger than
  // silence.
  return (
    typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

async function load(url: string) {
  if (buffers.has(url) || pending.has(url) || !context) return;
  pending.add(url);
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    buffers.set(url, await context.decodeAudioData(bytes));
  } catch {
    // A cue that will not load simply does not sound. Nothing here is load
    // bearing, and a broken fetch should not take the shutter with it.
  } finally {
    pending.delete(url);
  }
}

/**
 * Bring the audio up on a real gesture.
 *
 * Browsers will not let a page make noise until someone has clicked or typed,
 * and winding the shutter is neither — it is pointer movement, which does not
 * count. That restriction is doing something useful here, so it is left alone
 * rather than worked around: nobody hears anything until they have chosen to
 * interact with the page at least once.
 */
export function primeShutterAudio() {
  if (ready || silent()) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ready = true;

  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);

  void Promise.all([load(CLICK), load(FLASH), load(CHARGE)]).then(startWhine);
}

function startWhine() {
  const buffer = buffers.get(CHARGE);
  if (!context || !master || !buffer || whine) return;

  /*
   * Started once and left running for the life of the page, silent until the
   * charge lifts it. Starting a source per wind would mean a click at the
   * attack every time and no way to cross a decay smoothly.
   */
  whineGain = context.createGain();
  whineGain.gain.value = 0;
  dumpGain = context.createGain();
  dumpGain.gain.value = 0;

  // Opens as the charge builds, so the bed gains brightness and not merely
  // volume — a capacitor winding gets shriller, not just louder.
  whineFilter = context.createBiquadFilter();
  whineFilter.type = "lowpass";
  /*
   * Parked above the recording, not sweeping through it.
   *
   * This filter used to open from 9 kHz to 21 kHz, which is a sensible sweep
   * for almost any sound and silence for this one: the whole recording is a
   * 17.8 kHz tone, so at anything under full charge the filter was simply
   * deleting it. What reached the speakers was the filter, not the flash.
   */
  whineFilter.frequency.value = 22000;
  whineFilter.Q.value = 0.7;

  // Flattened first: the raw recording swells and dies across its 1.87
  // seconds, and looping that is what made the whine pulse.
  const bed = steady(buffer, context);

  whine = context.createBufferSource();
  whine.buffer = bed;
  whine.loop = true;
  whine.connect(whineGain);
  whineGain.connect(whineFilter);

  // A rise reversed is a fall, and a flat bed reversed is still flat.
  dump = context.createBufferSource();
  dump.buffer = reversed(bed, context);
  dump.loop = true;
  dump.connect(dumpGain);
  dumpGain.connect(whineFilter);

  whineFilter.connect(master);
  whine.start();
  dump.start();
  applyCharge();
}

function applyCharge() {
  if (!context || !whine || !whineGain || !dump || !dumpGain || !whineFilter) return;
  const now = context.currentTime;

  /*
   * Eased in, so the noise floor of a drifting pointer stays silent.
   *
   * Halved from 0.16. A capacitor winding is a background noise you notice
   * rather than a sound that asks for attention, and at full charge this sat
   * on top of everything on a page whose subject is photographs. The curve is
   * unchanged -- this is level, not shape, so the rise still tracks the wind.
   */
  const level = Math.pow(charge, 1.6) * 0.08;

  /*
   * Winding and draining are the same recording read in opposite directions,
   * so they crossfade rather than one stopping and the other starting. The
   * drain is given a little more level: losing a charge you worked for should
   * be more conspicuous than gaining it.
   */
  whineGain.gain.setTargetAtTime(level * (1 - draining), now, 0.04);
  dumpGain.gain.setTargetAtTime(level * draining * 1.2, now, 0.04);

  /*
   * Played at the speed it was recorded at.
   *
   * It used to rise from 0.78 to 1.24 with the charge, which is what a
   * capacitor winding does and which works for any sound with headroom above
   * it. This one has none: 17.8 kHz at 1.24 is 22 kHz, past the Nyquist
   * frequency of the file and well past anybody's hearing, so the harder you
   * wound it the more inaudible it became. Exactly backwards. The build now
   * comes from level alone, which is the only axis this recording leaves.
   */
  whine.playbackRate.setTargetAtTime(1.0, now, 0.08);

  /*
   * The drain runs DOWN, and further down the harder it is draining.
   *
   * Speeding it up would have the same problem as the wind — there is no room
   * above 17.8 kHz — but slowing it is both audible and right: a capacitor
   * dumping its charge falls in pitch. Played backwards and falling, which is
   * what the reversed bed is for.
   */
  /*
   * Set slowly, and from a heavily smoothed rate.
   *
   * A playback rate IS a pitch, so anything that jitters the rate warbles the
   * tone — and this one is close to a pure tone, which is the worst case for
   * it: there is no other content to hide the wobble in. The drain rate is
   * measured from frame-to-frame charge deltas reported in hundredths, so it
   * is inherently steppy, and feeding that straight into the rate produced an
   * audible vibrato rather than a fall. Smoothed hard on the way in, and given
   * a long time constant on the way out.
   */
  const urgency = Math.min(1, smoothedDrain / 0.55);
  dump.playbackRate.setTargetAtTime(0.85 - urgency * 0.4, now, 0.45);
}

/**
 * Which way the charge is moving, smoothed.
 *
 * The raw per-frame delta is far too noisy to switch on — the charge is
 * reported in hundredths, so a steady wind still produces frames where it
 * does not change at all, and flipping direction on those would chatter
 * between the two beds. This eases toward the current direction instead.
 */
function noteDirection(value: number) {
  const now = performance.now();
  const dt = lastAt ? Math.min(0.25, (now - lastAt) / 1000) : 0;
  lastAt = now;

  if (spent) {
    // Consumed, not lost. Reset the baseline so the drop is never measured.
    spent = false;
    draining = 0;
    drainRate = 0;
    lastCharge = value;
    return;
  }

  if (dt > 0) {
    const velocity = (value - lastCharge) / dt;
    const falling = velocity < -0.02 ? 1 : 0;
    if (falling) drainRate = Math.max(drainRate * 0.7, -velocity);
    else drainRate *= 0.85;
    // A long average. The pitch should describe how the charge is going, not
    // react to every frame of it.
    smoothedDrain += (drainRate - smoothedDrain) * Math.min(1, dt / 0.5);
    // Roughly a tenth of a second to swing fully from one bed to the other.
    const ease = Math.min(1, dt / 0.1);
    draining += (falling - draining) * ease;
  }
  lastCharge = value;
}

/** Called every frame the charge changes. */
export function setShutterCharge(value: number) {
  noteDirection(value);
  charge = value;
  applyCharge();
}

function fire(url: string, gain: number, delay = 0) {
  const buffer = buffers.get(url);
  if (!context || !master || !buffer) return;
  if (context.state === "suspended") void context.resume();
  const source = context.createBufferSource();
  source.buffer = buffer;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(level);
  level.connect(master);
  source.start(delay > 0 ? context.currentTime + delay : 0);
}

/** A click that takes no photograph: the mechanism alone. */
export function playShutterClick() {
  fire(CLICK, 0.5);
}

/**
 * A click that does. The charge is spent, so the bed has to go with it —
 * silenced here rather than waiting for the next charge report, so the whine
 * stops on the same frame as the shutter rather than a beat after it.
 */
export function playShutterFlash() {
  /*
   * BOTH sounds, not just the flash.
   *
   * The blades fire whether or not there is a flash behind them -- the flash
   * is additional, not a replacement. This played the flash alone, so a
   * successful capture was the one case where you never heard the mechanism,
   * which is backwards: the uncharged click had the mechanism and the charged
   * one did not.
   *
   * The click leads by 18ms. A flash fires once the shutter is fully open, so
   * the mechanism is audibly first; simultaneous reads as one indistinct
   * noise, and the small gap is what makes it a camera rather than a sample.
   */
  fire(CLICK, 0.45);
  fire(FLASH, 0.9, 0.018);
  spent = true;
  if (!context) return;
  const now = context.currentTime;
  whineGain?.gain.setTargetAtTime(0, now, 0.015);
  dumpGain?.gain.setTargetAtTime(0, now, 0.015);
}
