import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@fx/lib/utils";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";

/**
 * Substitutes drawn from living writing systems, so the settling text reads as
 * *languages* rather than as random symbols.
 *
 * Glyphs render at their natural width and the line's letter spacing shifts
 * while the sequence runs, which is intended. That removes the need to match
 * advance widths, which is what previously kept Chinese, Japanese and the Indic
 * scripts out — every script can take part now.
 */
const GLYPHS = [
  // Greek
  "Γ",
  "Δ",
  "Θ",
  "Λ",
  "Ξ",
  "Π",
  "Σ",
  "Φ",
  "Ψ",
  "Ω",
  "α",
  "β",
  "γ",
  "δ",
  "ε",
  "ζ",
  "η",
  "θ",
  "λ",
  "μ",
  "ν",
  "ξ",
  "π",
  "ρ",
  "σ",
  "τ",
  "φ",
  "χ",
  "ψ",
  "ω",
  // Cyrillic
  "Б",
  "Г",
  "Д",
  "Ж",
  "З",
  "И",
  "Й",
  "Л",
  "П",
  "Ф",
  "Ц",
  "Ч",
  "Ш",
  "Щ",
  "Э",
  "Ю",
  "Я",
  "б",
  "в",
  "г",
  "д",
  "ж",
  "з",
  "и",
  "й",
  "к",
  "л",
  "н",
  "п",
  "т",
  "ф",
  "ц",
  "ч",
  "ш",
  "э",
  "я",
  // Armenian
  "Թ",
  "Ի",
  "Ղ",
  "Շ",
  "Ճ",
  "Ձ",
  "Ծ",
  "ա",
  "բ",
  "գ",
  "դ",
  "ե",
  "զ",
  "ը",
  "ի",
  "լ",
  // Georgian
  "გ",
  "ზ",
  "ო",
  "შ",
  "წ",
  "ჭ",
  "ჰ",
  "ე",
  "ვ",
  "ლ",
  "მ",
  "ნ",
  // Hebrew
  "א",
  "ב",
  "ג",
  "ד",
  "ה",
  "ז",
  "ח",
  "ט",
  "כ",
  "ל",
  "מ",
  "נ",
  "ס",
  "ע",
  "צ",
  "ק",
  "ר",
  "ש",
  "ת",
  // Arabic
  "ش",
  "ط",
  "غ",
  "ف",
  "ل",
  "ن",
  "ه",
  "ي",
  "ج",
  "ح",
  "خ",
  "ص",
  "ض",
  "ع",
  // Devanagari
  "क",
  "ग",
  "घ",
  "झ",
  "ण",
  "ध",
  "भ",
  "ष",
  "स",
  "ह",
  "म",
  "य",
  "र",
  "ल",
  // Thai
  "ก",
  "ง",
  "ฎ",
  "ธ",
  "ภ",
  "ม",
  "ย",
  "ร",
  "ล",
  "ว",
  "ส",
  "ห",
  // Japanese hiragana
  "あ",
  "え",
  "き",
  "さ",
  "た",
  "な",
  "は",
  "ま",
  "よ",
  "ら",
  "を",
  "ん",
  "ゆ",
  "め",
  // Japanese katakana
  "ア",
  "カ",
  "サ",
  "タ",
  "ナ",
  "ハ",
  "マ",
  "ヤ",
  "ラ",
  "ワ",
  "ヲ",
  "ン",
  "ミ",
  "ホ",
  // Chinese / kanji
  "光",
  "心",
  "水",
  "火",
  "山",
  "日",
  "月",
  "人",
  "見",
  "花",
  "空",
  "生",
  "色",
  "音",
  "時",
  "風",
  "雨",
  "門",
  "文",
  "本",
  "海",
  "夢",
  "愛",
  "記",
  // Korean jamo
  "ㄱ",
  "ㄴ",
  "ㄷ",
  "ㅁ",
  "ㅅ",
  "ㅋ",
  "ㅎ",
  "ㅍ",
];

const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "Δ";

/**
 * Chinese, Japanese and Korean characters are full-width — about twice a Latin
 * letter's advance. Rendered at 0.62em they sit close to a Latin letter, so a
 * substitute doesn't tower over the cell it's borrowing.
 */
const FULL_WIDTH = /[\u3040-\u30ff\u3100-\u312f\u3130-\u318f\u4e00-\u9fff]/;

type CharState = {
  /** The English character this cell resolves to. */
  final: string;
  /** Whether this cell animates at all (spaces and punctuation don't). */
  animates: boolean;
  /** ms before this cell starts cycling. */
  start: number;
  /** ms this cell keeps cycling before it settles. */
  duration: number;
  /** ms between glyph changes — each cell cycles at its own speed. */
  interval: number;
};

/** Punctuation and whitespace stay put, so the sentence keeps its shape throughout. */
function animatable(ch: string) {
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Starts the sequence the first time the element comes into view, once.
 *
 * A headline three screens down has finished settling long before anyone reaches
 * it otherwise — the effect only reads as an effect if it runs while being
 * watched. `rootMargin` starts it slightly early so it isn't still resolving
 * when it reaches comfortable reading position.
 */
function useStartOnView(enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    if (!enabled) {
      setStarted(true);
      return;
    }
    const el = ref.current;
    // No element or no observer support: run rather than never run.
    if (!el || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, started]);

  return { ref, started };
}

/**
 * The whole sentence is present from the first frame; each letter cycles through
 * other writing systems on its own clock and lands in English at its own moment.
 *
 * Hand-rolled rather than using `use-scramble`, which advances a single scramble
 * head left to right at one global speed — per-character start, speed and settle
 * time need per-character state.
 *
 * Every letter sits in a cell the width of the character it will become, and each
 * word is a nowrap box. The line therefore measures and breaks identically on
 * every frame, whatever is being substituted in. The earlier version overlaid the
 * scrambling text on the finished text absolutely, so a run of wide glyphs
 * outgrew the box and wrapped onto a second row mid-sequence before snapping
 * back. A substitute wider than its cell now overhangs it instead, which costs a
 * little letter spacing and buys a line that never moves.
 */
export function ScrambleText({
  text,
  className,
  /** Roughly how long until the last letter settles, in ms. */
  totalMs = 1500,
  /** Wait until the text scrolls into view. Off for anything above the fold. */
  startOnView = true,
}: {
  text: string;
  className?: string;
  totalMs?: number;
  startOnView?: boolean;
}) {
  const [frame, setFrame] = useState(0);
  const [animate, setAnimate] = useState(false);
  const glyphs = useRef<string[]>([]);
  const settled = useRef<boolean[]>([]);
  const { ref, started } = useStartOnView(startOnView);

  const chars = useMemo<CharState[]>(() => {
    return Array.from(text).map((final) => {
      const animates = animatable(final);
      return {
        final,
        animates,
        // Starts spread across the first third, settles across the rest, so
        // letters neither move in unison nor finish together.
        start: animates ? Math.random() * totalMs * 0.3 : 0,
        duration: animates ? totalMs * (0.4 + Math.random() * 0.6) : 0,
        // 80–240ms per change: each substitute still registers as a letter.
        interval: 80 + Math.random() * 160,
      };
    });
  }, [text, totalMs]);

  /**
   * Grouped into words so the browser breaks between words and nowhere else.
   * Each cell is an inline-block, and without this the line could break between
   * any two letters.
   */
  const words = useMemo(() => {
    const out: number[][] = [];
    let current: number[] = [];
    chars.forEach((c, i) => {
      if (/\s/.test(c.final)) {
        if (current.length) out.push(current);
        current = [];
        return;
      }
      current.push(i);
    });
    if (current.length) out.push(current);
    return out;
  }, [chars]);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);

    glyphs.current = chars.map((c) => (c.animates ? pick() : c.final));
    settled.current = chars.map((c) => !c.animates);

    const t0 = performance.now();
    const nextAt = chars.map((c) => t0 + c.start);

    const tick = (now: number): boolean => {
      let changed = false;
      let remaining = false;

      for (let i = 0; i < chars.length; i += 1) {
        const c = chars[i]!;
        if (settled.current[i]) continue;
        remaining = true;

        if (now - t0 >= c.start + c.duration) {
          glyphs.current[i] = c.final;
          settled.current[i] = true;
          changed = true;
          continue;
        }
        if (now >= (nextAt[i] ?? 0)) {
          glyphs.current[i] = pick();
          nextAt[i] = now + c.interval;
          changed = true;
        }
      }

      if (changed) setFrame((f) => f + 1);
      return remaining;
    };

    // A task in the page's one loop (effects/engine/scheduler); it sleeps when every glyph has settled.
    const task = addTask("scramble", ORDER.ui, (now) => tick(now));
    task.wake();
    return () => task.stop();
  }, [chars, started]);

  // Before it starts, and for anyone who asked for reduced motion, this is just
  // the sentence — same markup the animation resolves to.
  if (!animate) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {/* The real sentence, for screen readers and search engines. */}
      <span className="sr-only">{text}</span>

      <span aria-hidden="true" data-frame={frame}>
        {words.map((indices, wordIndex) => (
          <span key={wordIndex}>
            {wordIndex > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              {indices.map((i) => {
                const state = chars[i]!;
                const g = glyphs.current[i] ?? state.final;
                return (
                  <span key={i} className="relative inline-block">
                    {/* Holds the cell open at the finished character's width. */}
                    <span className="invisible">{state.final}</span>
                    <span
                      className={cn(
                        "absolute inset-0 whitespace-nowrap text-center",
                        FULL_WIDTH.test(g) && "text-[0.62em]",
                      )}
                    >
                      {g}
                    </span>
                  </span>
                );
              })}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
