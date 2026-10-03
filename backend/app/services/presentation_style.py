"""Themes, font pairings, and per-visual presets/options for decks.

Three layers, nearest wins (see the "Visual Editor & Chart Styles" design):
  1. theme   -- colours and fonts for the whole deck (Deck.style_json)
  2. preset  -- a named layout for one visual type (visual["style"]["preset"])
  3. options -- per-visual tweaks (visual["style"]["options"])

Everything here is presentation only. Nothing in a style can change a
value, a date, a label or a citation, and the catalogue deliberately has no
control for the misleading options the design refuses: a bar axis that
starts above zero, 3D, a second value axis, a pulled-out slice, a gap
between histogram bins. The deck renderer (app/services/decks.py) and the
in-app preview (frontend/components/presentation/slide-canvas.tsx) both
read the catalogue served by GET /api/presentation-styles, so they cannot
drift apart. Checked charts (a "chart" visual) have presets and options of
their own, per chart family (CHART_PRESETS, CHART_OPTIONS below), applied by
app/visuals/style.py; a styled chart is drawn and checked again before it
is shown or exported.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

DEFAULT_THEME = "dark_academia"
DEFAULT_FONTS = "theme"  # use the theme's own pairing

# The colours of a chart that gives each part its own colour (a donut, a
# treemap, a 100% bar): the Okabe-Ito palette (Okabe & Ito 2008, "Color
# Universal Design", https://jfly.uni-koeln.de/color/), which the design
# doc's rule 10 cites and which stays distinguishable for the common forms
# of colour blindness. Seven colours, because rule 10 allows eight and the
# eighth is the theme's grey for "Other". Black is left out (it reads as
# text); the order puts the colours with the most contrast against a light
# page first (4.65:1 down to 1.19:1 on Dark Academia's paper), since a
# chart with few parts uses only the first ones (WCAG 1.4.11 asks 3:1 of a
# graphic against what is next to it; the kinds that use this palette
# label every part directly, which rule 11 accepts instead).
CATEGORICAL_PALETTE: tuple[str, ...] = ("0072B2", "D55E00", "009E73", "CC79A7", "56B4E9", "E69F00", "F0E442")
# Text written inside a coloured mark is black or white, whichever has more
# contrast with the fill: one of the two reaches WCAG 1.4.3's 4.5:1 on
# every colour above (5.19:1 at the least, white on blue), where the
# themes' own near-black and paper do not on vermillion (4.43:1 at best).
INK_DARK, INK_LIGHT = "000000", "FFFFFF"

# The serif faces among the themes' and pairings' fonts below; every other
# family there is a sans-serif face.
SERIF_FONTS = frozenset({"Georgia", "Source Serif 4", "IBM Plex Serif", "Newsreader", "Libre Caslon Text", "Fraunces",
                         "Literata", "Noto Serif", "Spectral"})


def font_stack(family: str) -> str:
    """A chart's font as a CSS font-family list: the theme's face, then the
    generic family it belongs to, then sans-serif.

    A chart drawn away from the browser (the render service's SVG, made a
    PNG by vl-convert for the exports) can use only the fonts installed
    where it is drawn, and resvg, under vl-convert, drops text whose
    families all fail to match: a Dark Academia chart named only Calibri
    came out of a server without Calibri with no words at all. The CSS
    Fonts spec asks for a generic family at the end of every list for this
    reason (https://www.w3.org/TR/css-fonts-4/#font-family-prop). vl-convert
    1.9 carries Liberation Sans inside it (checked in the installed build),
    so the closing sans-serif always finds a face, even on a host with no
    fonts and no serif. The face is in single quotes because some names are
    not CSS identifiers ("Source Serif 4"), and because ECharts copies the
    list into a double-quoted SVG style attribute without escaping it: a
    double quote ended the attribute and broke the SVG (checked with ECharts
    6.1). The families come from the fixed tables in this module, never
    from a request."""
    generic = "serif, sans-serif" if family in SERIF_FONTS else "sans-serif"
    return f"'{family}', {generic}"


@dataclass(frozen=True)
class Theme:
    id: str
    label: str
    description: str
    # Title and takeaway slides
    cover_bg: str
    cover_line: str
    cover_text: str
    cover_muted: str
    cover_accent: str  # accent used for text on `cover_bg` (passes 4.5:1)
    # Accents
    accent: str        # rules, bars, markers
    accent_text: str   # accent used for text on `page` (passes 4.5:1)
    alert: str         # open questions, figure values, quote kicker
    # Reading surfaces
    page: str
    panel: str
    rule: str
    text: str
    muted: str
    bar_muted: str     # bars that are not highlighted
    heading_font: str
    body_font: str
    # One colour per part, for the kinds that colour each part (see CATEGORICAL_PALETTE).
    palette: tuple[str, ...] = CATEGORICAL_PALETTE


THEMES: dict[str, Theme] = {t.id: t for t in (
    Theme(
        id="dark_academia", label="Dark Academia", description="Warm, archival: night title slides, paper pages, brass accents.",
        cover_bg="141B1F", cover_line="2B3439", cover_text="ECE3D2", cover_muted="B5A88F", cover_accent="B98D34",
        accent="B98D34", accent_text="8A6420", alert="672C1A",
        page="F7F2E8", panel="EDE4D3", rule="D9CDB6", text="1F1B16", muted="6B5B44", bar_muted="CDBFA6",
        heading_font="Georgia", body_font="Calibri",
    ),
    Theme(
        id="newsprint", label="Newsprint", description="Classic newspaper: white pages, black type, a red accent.",
        cover_bg="111111", cover_line="333333", cover_text="FFFFFF", cover_muted="BDBDBD", cover_accent="FF5A6E",
        accent="C8102E", accent_text="A30D25", alert="8B0A1E",
        page="FFFFFF", panel="F2F2F2", rule="D6D6D6", text="111111", muted="5E5E5E", bar_muted="C9C9C9",
        heading_font="Source Serif 4", body_font="Source Sans 3",
    ),
    Theme(
        id="ledger", label="Ledger", description="Calm and financial: navy title slides, teal accents.",
        cover_bg="0F2A44", cover_line="254566", cover_text="F4F7FA", cover_muted="A9BBCD", cover_accent="4FC3B8",
        accent="13837A", accent_text="0E6A63", alert="0F2A44",
        page="FBFCFD", panel="EAF0F5", rule="D3DEE8", text="14212E", muted="56667A", bar_muted="C3CFDA",
        heading_font="IBM Plex Serif", body_font="IBM Plex Sans",
    ),
    Theme(
        id="high_contrast", label="High contrast", description="Maximum legibility: black on white, one dark-blue accent.",
        cover_bg="000000", cover_line="4D4D4D", cover_text="FFFFFF", cover_muted="E0E0E0", cover_accent="9CC7FF",
        accent="0B4F9C", accent_text="0B4F9C", alert="000000",
        page="FFFFFF", panel="F0F0F0", rule="767676", text="000000", muted="3D3D3D", bar_muted="9E9E9E",
        heading_font="Noto Sans", body_font="Noto Sans",
    ),
)}

# All SIL Open Font License families (see the design doc's font table); the
# app serves them itself via Fontsource. "theme" means: keep the theme's own.
FONT_PAIRS: dict[str, dict[str, str]] = {
    "theme": {"label": "Theme default", "heading": "", "body": ""},
    "classic": {"label": "Classic · Source Serif 4 + Source Sans 3", "heading": "Source Serif 4", "body": "Source Sans 3"},
    "modern": {"label": "Modern newsroom · Newsreader + Inter", "heading": "Newsreader", "body": "Inter"},
    "technical": {"label": "Technical · IBM Plex Serif + IBM Plex Sans", "heading": "IBM Plex Serif", "body": "IBM Plex Sans"},
    "traditional": {"label": "Traditional · Libre Caslon Text + Libre Franklin", "heading": "Libre Caslon Text", "body": "Libre Franklin"},
    "expressive": {"label": "Expressive · Fraunces + Public Sans", "heading": "Fraunces", "body": "Public Sans"},
    "bookish": {"label": "Bookish · Literata + Work Sans", "heading": "Literata", "body": "Work Sans"},
    "multilingual": {"label": "Many languages · Noto Serif + Noto Sans", "heading": "Noto Serif", "body": "Noto Sans"},
    "editorial": {"label": "Editorial · Spectral + Inter", "heading": "Spectral", "body": "Inter"},
}

# Option schemas. "choice" values are the only ones accepted; "bool" is a
# switch; "labels" is a subset of the visual's own item labels.
_SORT = {"type": "choice", "label": "Sort", "values": ["as_given", "desc", "asc"]}
VISUAL_OPTIONS: dict[str, dict[str, dict]] = {
    "bar": {
        "sort": _SORT,
        "value_labels": {"type": "bool", "label": "Value labels"},
        "gridlines": {"type": "bool", "label": "Gridlines and value axis"},
        "thickness": {"type": "choice", "label": "Bar thickness", "values": ["thin", "regular", "thick"]},
        "highlight": {"type": "labels", "label": "Highlight bars (others turn grey)"},
    },
    "timeline": {
        "marker": {"type": "choice", "label": "Marker", "values": ["ring", "dot"]},
        "show_line": {"type": "bool", "label": "Connecting line"},
    },
    "figures": {
        "card_fill": {"type": "bool", "label": "Card background"},
        "accent_edge": {"type": "bool", "label": "Accent edge"},
        "value_color": {"type": "choice", "label": "Number colour", "values": ["alert", "accent", "text"]},
    },
}

# Each preset is a layout plus option defaults. The first preset of each
# type is the default and reproduces the v2 look.
VISUAL_PRESETS: dict[str, list[dict]] = {
    "bar": [
        {"id": "horizontal", "label": "Horizontal", "description": "Horizontal bars in the order drafted, values on the bars.",
         "layout": {"orientation": "horizontal", "axis_line": True},
         "options": {"sort": "as_given", "value_labels": True, "gridlines": False, "thickness": "regular", "highlight": []}},
        {"id": "ranked", "label": "Ranked", "description": "Largest first, so the ranking reads top-down.",
         "layout": {"orientation": "horizontal", "axis_line": True},
         "options": {"sort": "desc", "value_labels": True, "gridlines": False, "thickness": "regular", "highlight": []}},
        {"id": "column", "label": "Column", "description": "Vertical columns in the order drafted.",
         "layout": {"orientation": "vertical", "axis_line": True},
         "options": {"sort": "as_given", "value_labels": True, "gridlines": False, "thickness": "regular", "highlight": []}},
        {"id": "minimal", "label": "Labels without axis", "description": "Thin bars and values only: no axis line or gridlines.",
         "layout": {"orientation": "horizontal", "axis_line": False},
         "options": {"sort": "as_given", "value_labels": True, "gridlines": False, "thickness": "thin", "highlight": []}},
    ],
    "timeline": [
        {"id": "track", "label": "Horizontal track", "description": "Events spaced along a line, dates above.",
         "layout": {"direction": "horizontal", "compact": False}, "options": {"marker": "ring", "show_line": True}},
        {"id": "list", "label": "Vertical list", "description": "One row per event: date, then what happened.",
         "layout": {"direction": "vertical", "compact": False}, "options": {"marker": "dot", "show_line": True}},
        {"id": "compact", "label": "Compact", "description": "A short strip under the bullets with small markers.",
         "layout": {"direction": "horizontal", "compact": True}, "options": {"marker": "dot", "show_line": True}},
    ],
    "figures": [
        {"id": "cards", "label": "Cards", "description": "Stacked cards beside the bullets.",
         "layout": {"arrangement": "stack"}, "options": {"card_fill": True, "accent_edge": True, "value_color": "alert"}},
        {"id": "big_numbers", "label": "Big numbers", "description": "Large numbers with thin rules, no cards.",
         "layout": {"arrangement": "stack"}, "options": {"card_fill": False, "accent_edge": False, "value_color": "accent"}},
        {"id": "row", "label": "Row of stats", "description": "Side-by-side figures in a band under the bullets.",
         "layout": {"arrangement": "row"}, "options": {"card_fill": True, "accent_edge": False, "value_color": "alert"}},
    ],
}


# --- chart visuals (visuals pass 3) -------------------------------------------------------
# The presets and options of a checked chart (a "chart" visual, drawn by
# app/visuals/echarts.py), per family, after "Presets and options per chart
# type" in the Visual Editor design. app/visuals/style.py applies them; a
# styled chart is drawn and checked again before it is shown or exported.
#
# What the design refuses has no control here, so it cannot be picked: an
# axis that starts above zero (Datawrapper), 3D (Infogram), a second value
# axis (Datawrapper), a pulled-out slice, a gap between histogram bins. What
# it allows with a warning carries the warning beside its control: a
# smoothed curve, a log scale; a donut past four slices is warned about by
# the restyle reply and refused by the checker (rule 5). The presets the
# design lists that need more than one series or a hierarchy (small
# multiples, stacked areas, several donuts, two-level treemaps, bubbles,
# box plots) wait for queries that hold them.
#
# An option may name the `kinds` it is for (a donut's centre total) and the
# query `series` it is for (sorting means nothing for periods, whose order
# is time; folding into "Other" cannot cut a time series).
CHART_FAMILIES: dict[str, str] = {
    "bar": "bars", "column": "bars", "line": "lines", "area": "lines",
    "stacked_bar_100": "parts", "donut": "parts", "treemap": "parts", "histogram": "histogram", "scatter": "scatter",
    "sankey": "flows", "timeline": "timeline", "map": "map", "heatmap": "grid", "before_after": "pictures",
}
# Rows a sort applies to: groups, records, and flows ranked as bars.
_RANKED_SERIES = ["category", "distribution", "flows"]
_CHART_SORT = {"type": "choice", "label": "Sort", "values": ["as_ordered", "value_desc", "value_asc", "label"], "series": _RANKED_SERIES}
_CHART_HIGHLIGHT = {"type": "labels", "label": "Highlight (the others turn grey)"}
_GRIDLINES = {"type": "bool", "label": "Gridlines"}
_LOG_WARNING = "A log scale has no zero and is easy to misread; the check refuses it for data with a zero or a negative value (rule 2)."
CHART_OPTIONS: dict[str, dict[str, dict]] = {
    "bars": {
        "sort": _CHART_SORT,
        "thickness": {"type": "choice", "label": "Bar thickness", "values": ["thin", "regular", "thick"]},
        "axis_line": {"type": "bool", "label": "Zero line"},
        # Only horizontal gridlines (house style): a horizontal bar chart has none.
        "gridlines": {**_GRIDLINES, "kinds": ["column"]},
        "highlight": _CHART_HIGHLIGHT,
    },
    "lines": {
        "line_width": {"type": "choice", "label": "Line width", "values": ["thin", "regular", "thick"]},
        "markers": {"type": "bool", "label": "A marker on every point"},
        "value_labels": {"type": "bool", "label": "Write every value"},
        "smooth": {"type": "bool", "label": "Smooth curve",
                   "warning": "A smoothed curve passes through values no record holds between the points; the check notes it (check 0)."},
        "log_scale": {"type": "bool", "label": "Log scale", "kinds": ["line"], "warning": _LOG_WARNING},
        "gridlines": _GRIDLINES,
        "highlight": _CHART_HIGHLIGHT,
    },
    "parts": {
        "sort": _CHART_SORT,
        "other_after": {"type": "choice", "label": "Fold into Other after", "values": ["all", "1", "2", "3", "4", "5", "6", "7"],
                        "series": _RANKED_SERIES},
        "thickness": {"type": "choice", "label": "Bar thickness", "values": ["thin", "regular", "thick"], "kinds": ["stacked_bar_100"]},
        "centre_total": {"type": "bool", "label": "Total in the centre", "kinds": ["donut"]},
        "highlight": _CHART_HIGHLIGHT,
    },
    "histogram": {
        "binning": {"type": "choice", "label": "Number of bins", "values": ["doane", "sturges"]},
        "gridlines": _GRIDLINES,
        "highlight": _CHART_HIGHLIGHT,
    },
    "scatter": {
        "label_points": {"type": "choice", "label": "Name", "values": ["auto", "outliers"]},
        "log_scale": {"type": "bool", "label": "Log scales", "warning": _LOG_WARNING},
        "gridlines": _GRIDLINES,
        "highlight": _CHART_HIGHLIGHT,
    },
    # A flow diagram's bands sit between their two parties, as wide as their
    # money, and the columns follow the payments; what can be set is which
    # flows stand out, and whether the parties of each column are grouped
    # into one stage (for a slide or print; refused when the money runs in a
    # circle, since the parties then have no order).
    "flows": {
        "stages": {"type": "bool", "label": "Group the parties into stages (for a slide or print)", "kinds": ["sankey"]},
        "highlight": {"type": "labels", "label": "Highlight a party or a flow (the others turn grey)"},
    },
    # A timeline's rows run in date order and every mark sits at its own
    # dates; what can be chosen is which events stand out.
    "timeline": {
        "highlight": {"type": "labels", "label": "Highlight events (the others turn grey)"},
    },
    # A map's places sit where their records put them; a picked place is
    # drawn larger, its name bold (the others keep their colour: a grey dot
    # would vanish into the grayscale base map).
    "map": {
        "highlight": {"type": "labels", "label": "Highlight places (drawn larger)"},
        "with_timeline": {"type": "bool", "label": "Put the timeline of the events at the places beside the map", "kinds": ["map"]},
    },
    # Two dated pictures (the design doc's presets for before-and-after
    # images: slider, side by side, stacked; options: the divider's position
    # and the date captions). Nothing here changes a picture or its date.
    "pictures": {
        "picture_layout": {"type": "choice", "label": "Layout", "values": ["slider", "side_by_side", "stacked"]},
        "divider": {"type": "choice", "label": "Where the slider's divider starts (% across)", "values": ["25", "33", "50", "67", "75"]},
        "date_captions": {"type": "bool", "label": "Each picture's date under it (the subtitle states both dates either way)"},
    },
    # A grid's cells sit where their grades meet and are shaded by their
    # counts; a picked cell is outlined and its count written bold.
    "grid": {
        "highlight": {"type": "labels", "label": "Highlight cells (outlined)"},
    },
}
# Each preset is a kind of its family plus option defaults; the first preset
# with the chart's own kind is how the chart looks as it was ordered.
CHART_PRESETS: dict[str, list[dict]] = {
    "bars": [
        {"id": "horizontal", "label": "Horizontal", "description": "Bars across, in the order the chart was made.", "kind": "bar", "options": {}},
        {"id": "ranked", "label": "Ranked", "description": "Largest first, so the ranking reads top-down.", "kind": "bar", "options": {"sort": "value_desc"}},
        {"id": "column", "label": "Column", "description": "Columns up from a zero line.", "kind": "column", "options": {}},
        {"id": "minimal", "label": "Labels without axis", "description": "Thin bars and their values; no zero line.", "kind": "bar",
         "options": {"thickness": "thin", "axis_line": False}},
    ],
    "lines": [
        {"id": "line", "label": "Line", "description": "The last value written at the end of the line.", "kind": "line", "options": {}},
        {"id": "line_values", "label": "Line with values", "description": "Every value written above its point.", "kind": "line",
         "options": {"value_labels": True}},
        {"id": "area", "label": "Area", "description": "The line filled down to zero, for a total built up over time.", "kind": "area", "options": {}},
    ],
    "parts": [
        {"id": "bar_100", "label": "100% bar", "description": "One bar that adds up to the whole, every part named.", "kind": "stacked_bar_100",
         "options": {}},
        {"id": "donut", "label": "Donut with centre total", "description": "Four slices at most: the three largest and Other, the total in the centre.",
         "kind": "donut", "options": {"other_after": "3", "centre_total": True}},
        {"id": "treemap", "label": "Treemap", "description": "Rectangles sized by value, for many parts of similar size.", "kind": "treemap",
         "options": {}},
    ],
    "histogram": [
        {"id": "histogram", "label": "Histogram", "description": "Touching bins, the number of records in each.", "kind": "histogram", "options": {}},
    ],
    "scatter": [
        {"id": "basic", "label": "Basic", "description": "Every point named when there are few, the outliers when there are many.", "kind": "scatter",
         "options": {"label_points": "auto"}},
        {"id": "labelled_outliers", "label": "Labelled outliers", "description": "Only the points outside Tukey's fences are named.", "kind": "scatter",
         "options": {"label_points": "outliers"}},
    ],
    "flows": [
        {"id": "flow", "label": "Flow diagram", "description": "Payers on the left, recipients to the right, each band as wide as the money.",
         "kind": "sankey", "options": {}},
        {"id": "staged", "label": "Flow in stages", "description": "For a slide or print: the parties at each place in the chain of payments "
         "grouped into one stage, and the money between the stages.", "kind": "sankey", "options": {"stages": True}},
    ],
    "timeline": [
        {"id": "timeline", "label": "Timeline", "description": "One row per event, earliest first: a dot for a day, a line from start to end.",
         "kind": "timeline", "options": {}},
    ],
    "grid": [
        {"id": "grid", "label": "Grid", "description": "One cell per pair of grades, shaded by how many sit there, each count written in its cell.",
         "kind": "heatmap", "options": {}},
    ],
    # The design doc's presets for before-and-after images. No source the
    # research found covers presets for them, so these are its own design; a
    # slider is the app's (react-compare-slider); exports place the pictures
    # side by side, as the design's export column says.
    "pictures": [
        {"id": "slider", "label": "Slider", "description": "One picture over the other, a divider to drag between them (side by side in exports).",
         "kind": "before_after", "options": {"picture_layout": "slider"}},
        {"id": "side_by_side", "label": "Side by side", "description": "The earlier picture on the left, the later on the right.",
         "kind": "before_after", "options": {"picture_layout": "side_by_side"}},
        {"id": "stacked", "label": "Stacked", "description": "The earlier picture above, the later below, for wide pictures.",
         "kind": "before_after", "options": {"picture_layout": "stacked"}},
    ],
    "map": [
        {"id": "map", "label": "Map", "description": "Each place where its record puts it, named beside its dot, on the self-hosted base map.",
         "kind": "map", "options": {}},
        # The design doc's "map linked to a timeline": Bellingcat's map of
        # civilian harm in Ukraine and Forensic Architecture's TimeMap show
        # where and when together; on a page the two are pictures side by side.
        {"id": "map_timeline", "label": "Map with its timeline", "description": "The map, and beside it the dated events at its places, "
         "each event naming its place.", "kind": "map", "options": {"with_timeline": True}},
    ],
}


def theme(theme_id: str | None) -> Theme:
    return THEMES.get(theme_id or "", THEMES[DEFAULT_THEME])


def normalize_deck_style(style: Any) -> dict:
    """{"theme", "fonts"} with unknown values replaced by defaults."""
    style = style if isinstance(style, dict) else {}
    theme_id = style.get("theme") if style.get("theme") in THEMES else DEFAULT_THEME
    fonts = style.get("fonts") if style.get("fonts") in FONT_PAIRS else DEFAULT_FONTS
    return {"theme": theme_id, "fonts": fonts}


def resolved_theme(style: Any) -> Theme:
    """The deck's theme with its font pairing applied."""
    style = normalize_deck_style(style)
    base = theme(style["theme"])
    pair = FONT_PAIRS[style["fonts"]]
    if not pair["heading"]:
        return base
    data = asdict(base)
    data.update(heading_font=pair["heading"], body_font=pair["body"], palette=base.palette)
    return Theme(**data)


def preset(kind: str, preset_id: str | None) -> dict:
    presets = VISUAL_PRESETS[kind]
    return next((p for p in presets if p["id"] == preset_id), presets[0])


def normalize_visual_style(kind: str, style: Any, item_labels: list[str]) -> dict | None:
    """Validate a visual's {"preset", "options"}; None when it adds nothing.

    Unknown presets fall back to the type's default; unknown options and
    out-of-range values are dropped (never raised on -- a deck must always
    export). `highlight` keeps only labels the visual actually has."""
    if kind not in VISUAL_PRESETS or not isinstance(style, dict):
        return None
    chosen = preset(kind, style.get("preset"))
    raw_options = style.get("options")
    options_in: dict = raw_options if isinstance(raw_options, dict) else {}
    options: dict = {}
    for key, spec in VISUAL_OPTIONS[kind].items():
        if key not in options_in:
            continue
        value = options_in[key]
        if spec["type"] == "bool" and isinstance(value, bool):
            options[key] = value
        elif spec["type"] == "choice" and value in spec["values"]:
            options[key] = value
        elif spec["type"] == "labels" and isinstance(value, list):
            options[key] = [label for label in item_labels if label in value][:8]
    return {"preset": chosen["id"], "options": options}


def resolved_visual_style(visual: dict) -> dict:
    """Preset layout plus preset options overlaid with the visual's own."""
    kind = visual["type"]
    style = visual.get("style") or {}
    chosen = preset(kind, style.get("preset"))
    options = dict(chosen["options"])
    options.update(style.get("options") or {})
    return {"preset": chosen["id"], "layout": dict(chosen["layout"]), "options": options}


def catalog() -> dict:
    """Everything the style panel and the in-app preview need."""
    return {
        "defaults": {"theme": DEFAULT_THEME, "fonts": DEFAULT_FONTS},
        "themes": [asdict(t) for t in THEMES.values()],
        "font_pairs": [{"id": key, **value} for key, value in FONT_PAIRS.items()],
        "visual_presets": VISUAL_PRESETS,
        "visual_options": VISUAL_OPTIONS,
        "chart_families": CHART_FAMILIES,
        "chart_presets": CHART_PRESETS,
        "chart_options": CHART_OPTIONS,
    }


def contrast_ratio(fg: str, bg: str) -> float:
    """WCAG 2.x contrast ratio between two RRGGBB colours."""
    def luminance(hex_color: str) -> float:
        channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        linear: list[float] = [c / 12.92 if c <= 0.03928 else float(((c + 0.055) / 1.055) ** 2.4) for c in channels]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    a, b = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (a + 0.05) / (b + 0.05)
