import hashlib
import re
from itertools import combinations
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import ConnectorFinding, CrossProviderDecision, EnrichmentSession, EnrichmentSessionFinding, EnrichmentSessionRun

STRONG_IDS = {"registrationNumber", "taxNumber", "leiCode", "isin", "idNumber", "imoNumber", "vatCode"}
NAME_PROPS = {"name", "alias", "weakAlias", "previousName"}
CONTEXT_PROPS = {"jurisdiction", "country", "address", "birthDate", "incorporationDate", "dissolutionDate"}

def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

def _values(finding: ConnectorFinding, props: set[str]) -> set[str]:
    out=set()
    for prop in props:
        for value in (finding.properties or {}).get(prop, []) or []:
            n=_norm(str(value))
            if n: out.add(n)
    return out

def _token_similarity(a: str, b: str) -> float:
    aa=set(_norm(a).split()); bb=set(_norm(b).split())
    return len(aa & bb) / max(1, len(aa | bb))

def pair_score(a: ConnectorFinding, b: ConnectorFinding) -> tuple[float, list[dict]]:
    reasons=[]; score=0.0
    if a.provider == b.provider:
        return 0.0, []
    if a.schema and b.schema and a.schema == b.schema:
        score += 0.10; reasons.append({"kind":"schema","detail":a.schema,"weight":0.10})
    elif a.schema and b.schema and a.schema != b.schema:
        score -= 0.20
    strong_a=_values(a, STRONG_IDS); strong_b=_values(b, STRONG_IDS); shared_ids=strong_a & strong_b
    if shared_ids:
        score += 0.72; reasons.append({"kind":"identifier","detail":sorted(shared_ids)[0],"weight":0.72})
    names_a=_values(a, NAME_PROPS) or {_norm(a.caption)}; names_b=_values(b, NAME_PROPS) or {_norm(b.caption)}
    best_name=max((_token_similarity(x,y) for x in names_a for y in names_b), default=0.0)
    if best_name >= 0.95:
        score += 0.38; reasons.append({"kind":"name","detail":"near-exact name","weight":0.38})
    elif best_name >= 0.60:
        score += 0.22; reasons.append({"kind":"name","detail":"similar name","weight":0.22})
    context_a=_values(a, CONTEXT_PROPS); context_b=_values(b, CONTEXT_PROPS); shared_context=context_a & context_b
    if shared_context:
        bonus=min(0.18, 0.06*len(shared_context)); score += bonus
        reasons.append({"kind":"context","detail":", ".join(sorted(shared_context)[:3]),"weight":round(bonus,2)})
    return round(max(0.0, min(1.0, score)), 4), reasons

def cluster_key(finding_ids: list[str]) -> str:
    return hashlib.sha256("|".join(sorted(finding_ids)).encode()).hexdigest()[:32]

def session_findings(db: Session, session_id: str) -> list[ConnectorFinding]:
    finding_ids=[r.finding_id for r in db.scalars(select(EnrichmentSessionFinding).where(EnrichmentSessionFinding.session_id==session_id)).all()]
    if not finding_ids: return []
    return list(db.scalars(select(ConnectorFinding).where(ConnectorFinding.id.in_(finding_ids))).all())

def consolidate_findings(findings: list[ConnectorFinding], threshold: float=0.60) -> list[dict]:
    by_id={f.id:f for f in findings}; parent={f.id:f.id for f in findings}
    def find(x):
        while parent[x]!=x:
            parent[x]=parent[parent[x]]; x=parent[x]
        return x
    def union(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: parent[rb]=ra
    pair_meta={}
    for a,b in combinations(findings,2):
        score,reasons=pair_score(a,b); pair_meta[tuple(sorted((a.id,b.id)))]=(score,reasons)
        if score>=threshold: union(a.id,b.id)
    groups: dict[str, list[str]] = {}
    for fid in by_id: groups.setdefault(find(fid),[]).append(fid)
    out=[]
    for ids in groups.values():
        providers={by_id[i].provider for i in ids}
        if len(ids)<2 or len(providers)<2: continue
        # Renamed from the outer loop's `a, b` (ConnectorFinding objects, above) to
        # fid_a/fid_b (their ids, str) -- reusing `a, b` here made mypy keep treating
        # them as ConnectorFinding from the first loop's binding, flagging this loop's
        # genuinely different str usage as a type error (the same reused-variable-
        # different-type pattern fixed in other app/services files in earlier
        # STRUCT-0013 cycles). `pairs` is explicitly typed since its dict literal's
        # values are heterogeneous (list[str]/float/list[dict]), which mypy otherwise
        # infers as dict[str, object] -- not sortable by score below.
        pairs: list[dict[str, Any]] = []
        scores=[]
        for fid_a, fid_b in combinations(ids,2):
            score,reasons=pair_meta.get(tuple(sorted((fid_a,fid_b))),(0.0,[]))
            if score>0: pairs.append({"finding_ids":[fid_a,fid_b],"score":score,"reasons":reasons}); scores.append(score)
        findings_payload=[{"id":by_id[i].id,"provider":by_id[i].provider,"provider_record_id":by_id[i].provider_record_id,"caption":by_id[i].caption,"schema":by_id[i].schema,"properties":by_id[i].properties,"source_url":by_id[i].source_url} for i in ids]
        out.append({"cluster_key":cluster_key(ids),"score":round(max(scores) if scores else 0.0,4),"providers":sorted(providers),"finding_ids":sorted(ids),"findings":findings_payload,"pairs":sorted(pairs,key=lambda x:x["score"],reverse=True)})
    return sorted(out,key=lambda x:x["score"],reverse=True)


def get_enrichment_session_detail(db: Session, session_id: str) -> dict:
    """Return an enrichment session with its per-provider runs. Raises
    LookupError if the session doesn't exist (the caller maps that to 404)."""
    session = db.get(EnrichmentSession, session_id)
    if session is None:
        raise LookupError("Enrichment session not found")
    runs = db.scalars(
        select(EnrichmentSessionRun).where(EnrichmentSessionRun.session_id == session_id).order_by(EnrichmentSessionRun.provider)
    ).all()
    return {
        "id": session.id, "entity_id": session.entity_id, "investigation_id": session.investigation_id,
        "status": session.status, "providers": session.providers, "total_results": session.total_results,
        "started_at": session.started_at, "finished_at": session.finished_at, "runs": runs,
    }


def get_enrichment_session_clusters(db: Session, session_id: str) -> list[dict]:
    """Return this session's consolidated cross-provider clusters, each
    annotated with its latest recorded decision (if any). Raises
    LookupError if the session doesn't exist."""
    session = db.get(EnrichmentSession, session_id)
    if session is None:
        raise LookupError("Enrichment session not found")
    clusters = consolidate_findings(session_findings(db, session_id))
    decisions = db.scalars(
        select(CrossProviderDecision).where(CrossProviderDecision.session_id == session_id).order_by(CrossProviderDecision.created_at.desc())
    ).all()
    latest: dict[str, CrossProviderDecision] = {}
    for decision in decisions:
        latest.setdefault(decision.cluster_key, decision)
    for cluster in clusters:
        # Renamed from `decision` (reused below as CrossProviderDecision | None from
        # latest.get(), colliding with the loop variable above's non-Optional
        # CrossProviderDecision type) -- the same reused-variable-different-type
        # pattern fixed elsewhere in this file and in earlier STRUCT-0013 cycles.
        resolved_decision = latest.get(cluster["cluster_key"])
        cluster["decision"] = None if resolved_decision is None else {
            "id": resolved_decision.id, "decision": resolved_decision.decision, "confidence": resolved_decision.confidence,
            "rationale": resolved_decision.rationale, "created_at": resolved_decision.created_at,
        }
    return clusters


def create_cross_provider_decision(db: Session, session_id: str, body) -> CrossProviderDecision:
    """Validate and persist a cross-provider consolidation decision.

    Raises ValueError for any validation failure (bad decision enum, fewer
    than 2 findings, a finding outside this session, or findings that don't
    actually span 2+ providers) and LookupError if the session doesn't
    exist. The caller maps LookupError to 404 and ValueError to 400.
    """
    if body.decision not in {"positive", "negative", "unsure"}:
        raise ValueError("Decision must be positive, negative, or unsure")
    session = db.get(EnrichmentSession, session_id)
    if session is None:
        raise LookupError("Enrichment session not found")
    available = {f.id for f in session_findings(db, session_id)}
    finding_ids = sorted(set(body.finding_ids))
    if len(finding_ids) < 2:
        raise ValueError("A cross-provider decision requires at least two findings")
    if any(fid not in available for fid in finding_ids):
        raise ValueError("All findings must belong to this enrichment session")
    rows = [db.get(ConnectorFinding, fid) for fid in finding_ids]
    if len({row.provider for row in rows if row}) < 2:
        raise ValueError("Cross-provider decisions require findings from at least two providers")
    row = CrossProviderDecision(
        investigation_id=session.investigation_id, entity_id=session.entity_id, session_id=session.id,
        cluster_key=cluster_key(finding_ids), finding_ids=finding_ids, decision=body.decision,
        confidence=body.confidence, rationale=body.rationale,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
