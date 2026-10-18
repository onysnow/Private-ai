import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registerLitSurface } from "@fx/effects/scene/scene";

/** How far type and a button stand off the photograph they are over (as on glass: components/site/Glass). */
const TYPE_STANDOFF = 0.42;
const PLASTIC_STANDOFF = 0.5;

/** What casts over a photograph: headings, paragraphs, rich text, links, buttons. */
const FREE_TYPE = "[data-photo] :is(h1, h2, h3, h4, p, li, blockquote, .rich-text, .plastic, a)";

/**
 * The copy and buttons that stand over a photograph rather than on a pane --
 * the hero's -- lit like those on the panes (item 52; Ony,
 * 2026-10-01: "None of these elements have dynamic shadows nor plastic
 * sheen"): the buttons catch the lamp, and everything throws its shadow onto
 * the photograph (effects/optics/casters).
 */
export function FreeSurfaces() {
  const location = { pathname: usePathname() };
  useEffect(() => {
    const registered = new Map<HTMLElement, () => void>();
    /*
     * Every block of type over a photograph, found whenever the page changes
     * -- not once, 400 ms after arriving. Copy that loads from the database
     * after that, or rich text (a .rich-text div, "Nothing forced. /
     * Everything felt."), was never found and cast nothing (Ony, 2026-10-01:
     * "no shadow").
     */
    const scan = () => {
      for (const [node, stop] of registered) {
        if (!node.isConnected) {
          stop();
          registered.delete(node);
        }
      }
      for (const node of document.querySelectorAll<HTMLElement>(FREE_TYPE)) {
        if (registered.has(node)) continue;
        if (node.closest(".glass")) continue;
        // A link inside a heading or a button is that heading's or button's.
        if (node.parentElement?.closest(".plastic, h1, h2, h3, h4, p, li, blockquote, .rich-text"))
          continue;
        // Rich text made of paragraphs casts by its paragraphs; bare rich text casts itself.
        if (
          node.classList.contains("rich-text") &&
          node.querySelector("p, h1, h2, h3, h4, li, blockquote")
        ) {
          continue;
        }
        const plastic = node.classList.contains("plastic");
        const dark = node.classList.contains("plastic--dark");
        registered.set(
          node,
          registerLitSurface(node, {
            occludes: false,
            standoff: plastic ? PLASTIC_STANDOFF : TYPE_STANDOFF,
            material: plastic && !dark ? "dayglo-orange" : "ink",
          }),
        );
      }
    };
    let pending = 0;
    const soon = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(scan, 250);
    };
    // Watched only after the first scan: before then React may still be
    // hydrating the page, and writing the light onto its elements then is a
    // hydration mismatch.
    const changes = new MutationObserver(soon);
    const timer = window.setTimeout(() => {
      scan();
      changes.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(pending);
      changes.disconnect();
      for (const stop of registered.values()) stop();
      registered.clear();
    };
  }, [location.pathname]);
  return null;
}
