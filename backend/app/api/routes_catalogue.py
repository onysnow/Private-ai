"""The indicator catalogue and its glossary, read-only (catalogue/;
docs/discovery/indicators.md "The glossary page"). The same for every
investigation: nothing here reads or writes an investigation's records."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.patterns.engine import catalogue_areas, catalogue_glossary, catalogue_term_hints, indicator
from app.schemas.responses import CatalogueAreaOut, CatalogueIndicatorOut, GlossaryHintOut, GlossaryPageOut

router = APIRouter(prefix="/api/catalogue")


@router.get("/areas", response_model=list[CatalogueAreaOut])
def list_areas() -> Any:
    """Every area of the catalogue, with how many indicators and terms it holds."""
    return catalogue_areas()


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


@router.get("/terms", response_model=list[GlossaryHintOut])
def list_term_hints() -> Any:
    """Every term, its definition and the names it is found by in text: what a hover card needs."""
    return catalogue_term_hints()


@router.get("/indicators/{indicator_id}", response_model=CatalogueIndicatorOut)
def get_indicator(indicator_id: str) -> Any:
    """One indicator in full: definition, levels, sources, cases, data needed, cross-hints, innocent explanations."""
    found = indicator(indicator_id)
    if found is None:
        raise HTTPException(404, "Indicator not found")
    ind, area_name = found
    return {**ind.model_dump(mode="json"), "area_name": area_name}
