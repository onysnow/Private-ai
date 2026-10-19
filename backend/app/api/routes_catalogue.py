"""The indicator catalogue and its glossary, read-only (catalogue/;
docs/discovery/indicators.md "The glossary page"). The same for every
investigation: nothing here reads or writes an investigation's records."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.patterns.engine import (
    catalogue_areas, catalogue_glossary, catalogue_indicator_rows, catalogue_map, catalogue_term_hints, indicator,
)
from app.schemas.responses import (
    CatalogueAreaOut, CatalogueIndicatorListOut, CatalogueIndicatorOut, CatalogueMapOut, GlossaryHintOut, GlossaryPageOut,
    GlossaryTermOut,
)

router = APIRouter(prefix="/api/catalogue")


@router.get("/areas", response_model=list[CatalogueAreaOut])
def list_areas() -> Any:
    """Every area of the catalogue, with how many indicators and terms it holds."""
    return catalogue_areas()


@router.get("/map", response_model=CatalogueMapOut)
def get_catalogue_map() -> Any:
    """Per area, how its indicators can be checked; and how often one area's indicators may also point to another."""
    return catalogue_map()


@router.get("/glossary", response_model=GlossaryPageOut)
def search_glossary(q: str = Query("", max_length=200), area: str | None = Query(None, pattern=r"^[A-Z]{2,3}$"),
                    limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> Any:
    """Terms whose name or definition holds the words, names first; one area or all."""
    terms = catalogue_glossary()
    words = [w for w in q.lower().split() if w]
    if area:
        terms = [t for t in terms if area in t["areas"]]
    if words:
        scored = []
        for t in terms:
            name, text = t["term"].lower(), (t["term"] + " " + t["definition"]).lower()
            if all(w in text for w in words):
                scored.append((0 if all(w in name for w in words) else 1, t["term"].lower(), t))
        terms = [t for _, _, t in sorted(scored, key=lambda x: (x[0], x[1]))]
    return {"total": len(terms), "terms": terms[offset:offset + limit]}


@router.get("/glossary/entry", response_model=GlossaryTermOut)
def get_glossary_entry(term: str = Query(..., min_length=1, max_length=200)) -> Any:
    """One term in full, found by its name (any case), with every area's own definition."""
    wanted = term.strip().lower()
    found = next((t for t in catalogue_glossary() if t["term"].lower() == wanted), None)
    if found is None:
        raise HTTPException(404, "Term not found")
    return found


@router.get("/terms", response_model=list[GlossaryHintOut])
def list_term_hints() -> Any:
    """Every term, its definition and the names it is found by in text: what a hover card needs."""
    return catalogue_term_hints()


@router.get("/indicators", response_model=CatalogueIndicatorListOut)
def list_indicators(q: str = Query("", max_length=200), area: str | None = Query(None, pattern=r"^[A-Z]{2}$"),
                    limit: int = Query(500, ge=1, le=3000), offset: int = Query(0, ge=0)) -> Any:
    """Indicators in catalogue order, one area or all; with words, only those whose id or name holds every one."""
    rows = catalogue_indicator_rows()
    if area:
        rows = [r for r in rows if r["area"] == area]
    words = [w for w in q.lower().split() if w]
    if words:
        rows = [r for r in rows if all(w in f"{r['id']} {r['name']}".lower() for w in words)]
    return {"total": len(rows), "indicators": rows[offset:offset + limit]}


@router.get("/indicators/{indicator_id}", response_model=CatalogueIndicatorOut)
def get_indicator(indicator_id: str) -> Any:
    """One indicator in full: definition, levels, sources, cases, data needed, cross-hints, innocent explanations."""
    found = indicator(indicator_id)
    if found is None:
        raise HTTPException(404, "Indicator not found")
    ind, area_name = found
    return {**ind.model_dump(mode="json"), "area_name": area_name}
