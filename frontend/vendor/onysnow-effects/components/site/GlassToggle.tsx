import { useGlassMode, toggleGlassMode } from "@fx/lib/glass-mode";

/**
 * A disc of the glass itself, used as the switch between the two glasses.
 *
 * It is not an icon of glass. It is a small pane carrying the same treatment
 * the page is currently using, so pressing it changes what the button is made
 * of as well as what the site is made of. In CSS mode it is backdrop-filter
 * and a bevel drawn with an inset shadow; in raster mode the shader takes it
 * over like any other pane, because it carries `.glass` and the rasteriser
 * picks up every pane on the page.
 *
 * That is the whole reason it is a circle with no label. Two words would tell
 * you which mode you are in; a sample of the material shows you, and the
 * difference between the two systems is exactly the kind of thing you cannot
 * describe but can see side by side.
 */
export function GlassToggle() {
  const mode = useGlassMode();
  const raster = mode === "raster";

  return (
    <button
      type="button"
      onClick={() => toggleGlassMode()}
      className="glass glass-toggle"
      aria-pressed={raster}
      /*
       * The label says what pressing it DOES, not what is showing. A toggle
       * whose name changes with its state is read out mid-change by a screen
       * reader and is ambiguous in either reading; aria-pressed carries the
       * state, so the name can stay still.
       */
      aria-label={`Switch to ${raster ? "CSS" : "liquid"} glass`}
      title={raster ? "Liquid glass — click for CSS" : "CSS glass — click for liquid"}
    >
      {/*
        The tell, for when the two are close enough that the disc alone does
        not say. A filled core in raster mode, a ring in CSS.
      */}
      <span aria-hidden="true" className="glass-toggle__pip" data-raster={raster || undefined} />
    </button>
  );
}
