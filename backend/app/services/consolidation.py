import hashlib
import re
from itertools import combinations
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import ConnectorFinding, EnrichmentSessionFinding

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
    return db.scalars(select(ConnectorFinding).where(ConnectorFinding.id.in_(finding_ids))).all()

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
    groups={}
    for fid in by_id: groups.setdefault(find(fid),[]).append(fid)
    out=[]
    for ids in groups.values():
        providers={by_id[i].provider for i in ids}
        if len(ids)<2 or len(providers)<2: continue
        pairs=[]; scores=[]
        for a,b in combinations(ids,2):
            score,reasons=pair_meta.get(tuple(sorted((a,b))),(0.0,[]))
            if score>0: pairs.append({"finding_ids":[a,b],"score":score,"reasons":reasons}); scores.append(score)
        findings_payload=[{"id":by_id[i].id,"provider":by_id[i].provider,"provider_record_id":by_id[i].provider_record_id,"caption":by_id[i].caption,"schema":by_id[i].schema,"properties":by_id[i].properties,"source_url":by_id[i].source_url} for i in ids]
        out.append({"cluster_key":cluster_key(ids),"score":round(max(scores) if scores else 0.0,4),"providers":sorted(providers),"finding_ids":sorted(ids),"findings":findings_payload,"pairs":sorted(pairs,key=lambda x:x["score"],reverse=True)})
    return sorted(out,key=lambda x:x["score"],reverse=True)
