from __future__ import annotations
import hashlib, re, uuid
from pathlib import Path
from typing import Iterable
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.time import utcnow_naive
from app.models.domain import Document, DocumentChunk, ExtractionCandidate, Source, Evidence, Claim, ClaimEvidenceLink, Entity, Statement, Investigation
from app.services.ftm import make_ftm_entity
from app.services.security import contained_path, resolve_storage_root
from app.services.resolution import candidate_entities
from app.services.pdf_ocr import extract_pdf_chunks
from app.core.config import settings
from app.db.locking import lock_investigation_transaction

SUPPORTED_EXTENSIONS = {'.txt', '.md', '.csv', '.html', '.htm', '.pdf', '.docx'}
NAME_RE = re.compile(r"\b([A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|of|the|and|&)){1,5})\b")
ORG_SUFFIX = re.compile(r"\b(Inc\.?|LLC|Ltd\.?|Corporation|Corp\.?|Company|Co\.?|Department|Commission|Authority|University|Foundation|Association|Committee|Council|Bank)\b", re.I)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", (text or '').replace('\x00','')).strip()


def extract_chunks(path: Path) -> list[dict]:
    ext = path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported document type: {ext or 'unknown'}")
    rows: list[dict] = []
    if ext == '.pdf':
        result = extract_pdf_chunks(
            path,
            enable_ocr=settings.enable_pdf_ocr,
            language=settings.pdf_ocr_language,
            dpi=settings.pdf_ocr_dpi,
            min_native_chars=settings.pdf_ocr_min_native_chars,
        )
        rows.extend(result.chunks)
        if not rows and result.ocr_error:
            raise RuntimeError(f'PDF contained no extractable text and OCR failed: {result.ocr_error}')
    elif ext == '.docx':
        from docx import Document as DocxDocument
        doc = DocxDocument(str(path))
        for i, para in enumerate(doc.paragraphs, 1):
            text = _clean(para.text)
            if text:
                rows.append({'locator': f'paragraph {i}', 'page_number': None, 'text': text})
    else:
        text = path.read_text(encoding='utf-8', errors='replace')
        # Paragraphs retain useful deterministic line ranges when possible.
        lines = text.splitlines()
        start = None; buf=[]
        for idx, line in enumerate(lines + [''], 1):
            clean = _clean(line)
            if clean:
                if start is None: start = idx
                buf.append(clean)
            elif buf:
                end = idx - 1
                loc = f'line {start}' if start == end else f'lines {start}-{end}'
                rows.append({'locator': loc, 'page_number': None, 'text': ' '.join(buf)})
                start=None; buf=[]
    return rows


def _candidate_payloads(chunk: DocumentChunk, *, include_entities: bool = True) -> Iterable[tuple[str, dict, float]]:
    text = chunk.text.strip()
    if not text: return
    yield ('evidence', {'quote': text, 'locator': chunk.locator, 'span': {'start_char': 0, 'end_char': len(text)}}, 1.0)
    # Claims are suggestions only: sentence-like assertions long enough to be useful.
    for sentence in re.split(r'(?<=[.!?])\s+', text):
        sentence = sentence.strip()
        if 35 <= len(sentence) <= 1200 and re.search(r'\b(is|are|was|were|has|have|had|will|did|does|announced|reported|paid|owns|served|worked|received|filed|approved|voted)\b', sentence, re.I):
            start = text.find(sentence)
            yield ('claim', {'text': sentence, 'span': {'start_char': start, 'end_char': start + len(sentence)}}, 0.55)
    if not include_entities:
        return
    seen=set()
    for match in NAME_RE.finditer(text):
        caption = match.group(1).strip(' .,:;')
        if len(caption) < 5 or caption in seen: continue
        seen.add(caption)
        schema = 'Organization' if ORG_SUFFIX.search(caption) else 'Person'
        yield ('entity', {'caption': caption, 'suggested_schema': schema, 'span': {'start_char': match.start(1), 'end_char': match.end(1)}}, 0.40)


def ingest_document(db: Session, *, investigation_id: str, title: str, filename: str, mime_type: str | None, data: bytes, storage_dir: Path) -> Document:
    """Persist one uploaded document without racing investigation deletion.

    PostgreSQL writers take the same transaction advisory lock used by destructive
    restore/delete operations, then re-check that the investigation still exists.
    File bytes are first written under ``.upload-staging`` and are only promoted to
    the canonical document path after all database rows/chunks/candidates have been
    prepared. If the database commit fails, a newly promoted file is removed so a
    failed upload does not leave reporter data orphaned on disk.

    Extraction failures remain a valid committed document state: the reporter keeps
    the source file and can see ``extraction_status=failed`` exactly as before.
    """
    storage_dir = resolve_storage_root(storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # Coordinate with delete/restore before checking mutable investigation state.
    lock_investigation_transaction(db, investigation_id)
    if db.get(Investigation, investigation_id) is None:
        raise ValueError('Investigation not found')

    digest = sha256_bytes(data)
    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', Path(filename).name) or 'document'
    stored = contained_path(storage_dir, f'{digest[:16]}_{safe_name}')
    staging_root = contained_path(storage_dir, '.upload-staging')
    staging_root.mkdir(parents=True, exist_ok=True)
    staged = contained_path(staging_root, f'{uuid.uuid4().hex}_{safe_name}')
    staged.write_bytes(data)
    extraction_path = stored if stored.exists() else staged
    created_final = False

    try:
        source = Source(investigation_id=investigation_id, title=title or filename, source_type='document', metadata_json={'filename': filename, 'mime_type': mime_type, 'sha256': digest})
        db.add(source); db.flush()
        doc = Document(investigation_id=investigation_id, source_id=source.id, filename=filename, mime_type=mime_type, sha256=digest, storage_path=str(stored), extraction_status='extracting')
        db.add(doc); db.flush()
        try:
            chunks = extract_chunks(extraction_path)
            for ordinal, item in enumerate(chunks, 1):
                chunk = DocumentChunk(document_id=doc.id, ordinal=ordinal, **item)
                db.add(chunk); db.flush()
                for typ, payload, conf in _candidate_payloads(chunk, include_entities=settings.enable_local_entity_suggestions):
                    db.add(ExtractionCandidate(investigation_id=investigation_id, document_id=doc.id, chunk_id=chunk.id, candidate_type=typ, payload=payload, confidence=conf))
            doc.extraction_status = 'complete'
        except Exception as exc:
            doc.extraction_status = 'failed'; doc.extraction_error = str(exc)

        # Promote the staged bytes only after relational state has been prepared.
        if not stored.exists():
            staged.replace(stored)
            created_final = True
        else:
            staged.unlink(missing_ok=True)

        db.commit(); db.refresh(doc)
        return doc
    except Exception:
        db.rollback()
        staged.unlink(missing_ok=True)
        if created_final:
            stored.unlink(missing_ok=True)
        raise
    finally:
        try:
            staging_root.rmdir()
        except OSError:
            pass


def serialize_document(db: Session, doc: Document) -> dict:
    chunks = db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)).all()
    candidates = db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id).order_by(ExtractionCandidate.created_at)).all()
    counts = {}
    for c in candidates: counts[c.candidate_type] = counts.get(c.candidate_type,0)+1
    return {'id':doc.id,'investigation_id':doc.investigation_id,'source_id':doc.source_id,'filename':doc.filename,'mime_type':doc.mime_type,'sha256':doc.sha256,'extraction_status':doc.extraction_status,'extraction_error':doc.extraction_error,'created_at':doc.created_at,'chunk_count':len(chunks),'candidate_counts':counts}


def serialize_extraction_lineage(db: Session, candidate: ExtractionCandidate) -> dict:
    """Return the complete read-only document -> chunk -> proposal -> review -> accepted-record trail."""
    doc = db.get(Document, candidate.document_id)
    chunk = db.get(DocumentChunk, candidate.chunk_id) if candidate.chunk_id else None
    source = db.get(Source, doc.source_id) if doc else None
    locator = chunk.locator if chunk else None
    provenance = (candidate.payload or {}).get('provenance') if isinstance(candidate.payload, dict) else None
    extraction_method = ((provenance or {}).get('extraction_method') if isinstance(provenance, dict) else None) or ('ocr' if locator and '(OCR)' in locator else ('native_pdf' if doc and (doc.mime_type == 'application/pdf' or doc.filename.lower().endswith('.pdf')) else 'native_text'))
    return {
        'candidate': {
            'id': candidate.id, 'investigation_id': candidate.investigation_id,
            'document_id': candidate.document_id, 'chunk_id': candidate.chunk_id,
            'candidate_type': candidate.candidate_type, 'payload': candidate.payload or {},
            'confidence': candidate.confidence, 'review_status': candidate.review_status,
            'accepted_record_type': candidate.accepted_record_type,
            'accepted_record_id': candidate.accepted_record_id,
            'reviewer_note': candidate.reviewer_note, 'created_at': candidate.created_at,
            'reviewed_at': candidate.reviewed_at,
        },
        'document': ({
            'id': doc.id, 'investigation_id': doc.investigation_id, 'source_id': doc.source_id,
            'filename': doc.filename, 'mime_type': doc.mime_type, 'sha256': doc.sha256,
            'extraction_status': doc.extraction_status, 'created_at': doc.created_at,
        } if doc else None),
        'source': ({
            'id': source.id, 'investigation_id': source.investigation_id, 'title': source.title,
            'url': source.url, 'source_type': source.source_type, 'metadata_json': source.metadata_json or {},
        } if source else None),
        'chunk': ({
            'id': chunk.id, 'document_id': chunk.document_id, 'ordinal': chunk.ordinal,
            'locator': chunk.locator, 'page_number': chunk.page_number, 'text': chunk.text,
            'extraction_method': extraction_method,
            'candidate_span': ((candidate.payload or {}).get('span') if isinstance(candidate.payload, dict) else None),
        } if chunk else None),
    }


def propose_relationship_from_extracted_claim(db: Session, *, claim_id: str, schema: str, source_entity_id: str, target_entity_id: str, properties: dict | None = None, evidence_id: str | None = None, note: str | None = None) -> ExtractionCandidate:
    """Stage a reporter-selected relationship without promoting it to canonical FtM data.

    The claim must itself have come from an accepted extraction candidate. Endpoints and
    relationship semantics are explicitly chosen by the reporter; no NLP/entity matcher is
    allowed to create a canonical edge. Promotion happens only in review_candidate().
    """
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise ValueError('Claim not found')
    lineage = db.scalar(select(ExtractionCandidate).where(
        ExtractionCandidate.accepted_record_type == 'claim',
        ExtractionCandidate.accepted_record_id == claim_id,
        ExtractionCandidate.review_status == 'accepted',
    ).order_by(ExtractionCandidate.reviewed_at.desc()))
    if lineage is None:
        raise ValueError('Relationship proposals require a claim accepted from document extraction')
    source_entity = db.get(Entity, source_entity_id); target_entity = db.get(Entity, target_entity_id)
    if source_entity is None or target_entity is None:
        raise ValueError('Relationship endpoints must reference existing entities')
    if source_entity.investigation_id != claim.investigation_id or target_entity.investigation_id != claim.investigation_id:
        raise ValueError('Relationship endpoints must belong to the claim investigation')
    if source_entity_id == target_entity_id:
        raise ValueError('Relationship endpoints must be different entities')
    if evidence_id is None:
        support = db.scalar(select(ClaimEvidenceLink).where(
            ClaimEvidenceLink.claim_id == claim_id, ClaimEvidenceLink.stance == 'supports'
        ).order_by(ClaimEvidenceLink.created_at))
        evidence_id = support.evidence_id if support else None
    payload = {
        'schema': schema, 'source_entity_id': source_entity_id, 'target_entity_id': target_entity_id,
        'properties': properties or {}, 'claim_id': claim_id, 'evidence_id': evidence_id,
        'note': note, 'span': (lineage.payload or {}).get('span'),
    }
    row = ExtractionCandidate(
        investigation_id=claim.investigation_id, document_id=lineage.document_id, chunk_id=lineage.chunk_id,
        candidate_type='relationship', payload=payload, confidence=0.0,
    )
    db.add(row); db.commit(); db.refresh(row); return row



def preview_entity_candidate_matches(db: Session, candidate: ExtractionCandidate) -> dict:
    """Return canonical entity matches before a proposed extraction entity can be accepted.

    Provider/OpenAleph resolved IDs are surfaced only as lead metadata. They never select a
    Workbench entity or create an identity decision automatically.
    """
    if candidate.candidate_type != 'entity':
        raise ValueError('Candidate is not an entity proposal')
    doc = db.get(Document, candidate.document_id)
    if doc is None:
        raise ValueError('Candidate document is missing')
    payload = candidate.payload or {}
    caption = str(payload.get('caption') or '').strip()
    schema = str(payload.get('suggested_schema') or 'Thing')
    matches = candidate_entities(db, doc.investigation_id, caption, schema)
    provenance = payload.get('provenance') if isinstance(payload.get('provenance'), dict) else {}
    return {
        'candidate_id': candidate.id, 'caption': caption, 'schema': schema,
        'matches': matches,
        'strong_match': next((row for row in matches if row['score'] >= 0.9), None),
        'provider_lead': {
            'provider': provenance.get('provider'),
            'provider_entity_id': provenance.get('provider_entity_id'),
            'provider_resolved_entity_id': payload.get('provider_resolved_entity_id'),
        },
        'identity_rule': 'Provider resolution is a lead only. Reporter must choose same, different, or create_new.',
    }

def review_candidate(db: Session, candidate: ExtractionCandidate, *, decision: str, note: str|None=None, entity_schema: str|None=None, caption: str|None=None, claim_status: str='lead', confidence: float|None=None, matched_entity_id: str|None=None, entity_identity_decision: str|None=None) -> dict:
    if candidate.review_status != 'proposed':
        raise ValueError('Candidate has already been reviewed')
    if decision not in {'accept','reject'}: raise ValueError('Decision must be accept or reject')
    candidate.reviewer_note = note
    from datetime import datetime
    candidate.reviewed_at = utcnow_naive()
    if decision == 'reject':
        candidate.review_status='rejected'; db.commit(); db.refresh(candidate); return {'candidate': {'id': candidate.id, 'review_status': candidate.review_status, 'reviewer_note': candidate.reviewer_note, 'reviewed_at': candidate.reviewed_at}, 'record': None}
    doc=db.get(Document,candidate.document_id); source=db.get(Source,doc.source_id) if doc else None; chunk=db.get(DocumentChunk,candidate.chunk_id) if candidate.chunk_id else None
    if not doc or not source: raise ValueError('Document/source missing')
    span = candidate.payload.get('span') if isinstance(candidate.payload, dict) else None
    span_suffix = ''
    if isinstance(span, dict) and isinstance(span.get('start_char'), int) and isinstance(span.get('end_char'), int):
        span_suffix = f"@chars:{span['start_char']}-{span['end_char']}"
    origin=f'document:{doc.id}#{chunk.locator if chunk else "document"}{span_suffix}'
    record=None
    if candidate.candidate_type=='evidence':
        evidence_quote = candidate.payload.get('quote')
        evidence_locator = candidate.payload.get('locator') or (chunk.locator if chunk else None)
        # A reviewed extraction span is part of the evidence locator itself, not only
        # side-channel candidate metadata. This keeps Evidence independently traceable
        # after it flows into claims, relationships, dossiers, exports, or search.
        if span_suffix:
            evidence_locator = f'{evidence_locator or "document"}{span_suffix}'
        if chunk is not None and isinstance(span, dict) and evidence_quote is not None:
            start, end = span.get('start_char'), span.get('end_char')
            if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end < start or end > len(chunk.text):
                raise ValueError('Extraction candidate character span is outside the source chunk')
            if chunk.text[start:end] != evidence_quote:
                raise ValueError('Extraction candidate evidence quote does not match its exact source span')
        record=Evidence(source_id=source.id, quote=evidence_quote, locator=evidence_locator, notes=note)
        db.add(record); db.flush(); rtype='evidence'
    elif candidate.candidate_type=='claim':
        claim_text = candidate.payload.get('text','')
        record=Claim(investigation_id=doc.investigation_id, text=claim_text, status=claim_status, confidence=confidence if confidence is not None else 0.0)
        db.add(record); db.flush()
        # Accepting an extracted claim must not sever it from the exact document text
        # the reporter reviewed. Materialize that precise span as Evidence and record
        # an explicit SUPPORTS link. This is provenance, not automatic verification:
        # the claim keeps the reporter-selected status/confidence unchanged.
        evidence_locator = chunk.locator if chunk else None
        if span_suffix:
            evidence_locator = f'{evidence_locator or "document"}{span_suffix}'
        extracted_evidence = Evidence(
            source_id=source.id,
            quote=claim_text,
            locator=evidence_locator,
            notes=f'Created from accepted extraction candidate {candidate.id}',
        )
        db.add(extracted_evidence); db.flush()
        db.add(ClaimEvidenceLink(
            claim_id=record.id,
            evidence_id=extracted_evidence.id,
            stance='supports',
            note=f'Exact reviewed document span from extraction candidate {candidate.id}',
        ))
        rtype='claim'
    elif candidate.candidate_type=='entity':
        cap=(caption or candidate.payload.get('caption') or '').strip(); schema=entity_schema or candidate.payload.get('suggested_schema') or 'Thing'
        preview = preview_entity_candidate_matches(db, candidate)
        strong = preview.get('strong_match')
        if strong and entity_identity_decision is None:
            raise ValueError('A likely canonical entity match exists; review identity before accepting this proposal')
        if entity_identity_decision not in {None, 'same', 'different', 'create_new'}:
            raise ValueError('entity_identity_decision must be same, different, or create_new')
        if entity_identity_decision in {'same', 'different'} and not matched_entity_id:
            raise ValueError('matched_entity_id is required for same/different identity review')
        matched = db.get(Entity, matched_entity_id) if matched_entity_id else None
        if matched_entity_id and (matched is None or matched.investigation_id != doc.investigation_id):
            raise ValueError('Matched entity is missing or outside this investigation')
        candidate_properties = candidate.payload.get('properties') if isinstance(candidate.payload, dict) else None
        candidate_properties = candidate_properties if isinstance(candidate_properties, dict) else {}
        normalized_properties = {
            str(prop): [str(value) for value in values if str(value).strip()]
            for prop, values in candidate_properties.items()
            if isinstance(values, list)
        }
        if entity_identity_decision == 'same':
            record = matched
        else:
            ftm=make_ftm_entity(schema, cap, normalized_properties)
            record=Entity(investigation_id=doc.investigation_id, ftm_id=ftm['id'], schema=ftm['schema'], caption=cap, properties=ftm['properties'])
            db.add(record); db.flush()
        provenance = candidate.payload.get('provenance') if isinstance(candidate.payload, dict) else None
        if isinstance(provenance, dict) and provenance.get('provider'):
            provider = str(provenance.get('provider'))
            collection_id = str(provenance.get('collection_id') or '').strip()
            provider_entity_id = str(provenance.get('provider_entity_id') or '').strip()
            dataset = f'{provider}:{collection_id}' if collection_id else provider
            statement_origin = f'{provider}:entity:{provider_entity_id}' if provider_entity_id else origin
        else:
            dataset = f'document:{doc.id}'
            statement_origin = origin
        # Preserve extraction/provider provenance even when the entity has no
        # extra properties. Reporter acceptance is the point at which this
        # proposal becomes a Workbench entity; provider resolution metadata is
        # not treated as a canonical identity decision.
        db.add(Statement(entity_id=record.id, prop='name', value=cap, dataset=dataset, origin=statement_origin, original_value=cap))
        if entity_identity_decision == 'different' and matched is not None:
            from app.services.resolution import record_canonical_resolution
            # Record the reporter's explicit negative identity decision without auto-merging.
            record_canonical_resolution(db, record, matched, decision='different', confidence=confidence if confidence is not None else 1.0, rationale=note, commit=False)
        rtype='entity'
    elif candidate.candidate_type=='relationship':
        from app.services.relationships import create_relationship
        payload = candidate.payload or {}
        claim_id = payload.get('claim_id'); evidence_id = payload.get('evidence_id')
        claim = db.get(Claim, claim_id) if claim_id else None
        if claim is None or claim.investigation_id != doc.investigation_id:
            raise ValueError('Relationship proposal claim is missing or outside this investigation')
        # create_relationship performs endpoint/evidence scope validation. The relationship
        # statement origin points back to this exact reviewed extraction candidate.
        edge = create_relationship(
            db, investigation_id=doc.investigation_id, schema=payload.get('schema'),
            source_entity_id=payload.get('source_entity_id'), target_entity_id=payload.get('target_entity_id'),
            properties=payload.get('properties') or {}, dataset=f'document:{doc.id}',
            origin=f'extraction-candidate:{candidate.id}', evidence_id=evidence_id, commit=False,
        )
        record=edge; rtype='relationship'
    else: raise ValueError('Unsupported candidate type')
    candidate.review_status='accepted'; candidate.accepted_record_type=rtype; candidate.accepted_record_id=record.id
    db.commit(); db.refresh(candidate)
    if rtype == 'entity':
        record_out = {'id': record.id, 'investigation_id': record.investigation_id, 'ftm_id': record.ftm_id, 'schema': record.schema, 'caption': record.caption, 'properties': record.properties}
    elif rtype == 'claim':
        record_out = {'id': record.id, 'investigation_id': record.investigation_id, 'text': record.text, 'status': record.status, 'confidence': record.confidence}
    elif rtype == 'relationship':
        from app.services.relationships import serialize_relationship
        record_out = serialize_relationship(db, record)
    else:
        record_out = {'id': record.id, 'source_id': record.source_id, 'quote': record.quote, 'locator': record.locator, 'notes': record.notes}
    return {'candidate':candidate,'record':record_out}
