import json, os, sys
sys.path.insert(0, '.')
from app.core.config import settings
settings.enable_ai_features = True; settings.ai_provider = 'ollama'; settings.ollama_model = 'qwen2.5:32b-instruct'
import app.ai.reasoning as r
from app.db.session import SessionLocal
from app.models.domain import BackgroundJob
from app.services.assistant_context import build_question_context
from app.core.time import utcnow_naive
from app.ai.llm_client import LLMResponse

INV = os.environ['INV']
Q = sys.argv[1]
with SessionLocal() as db:
    packet = build_question_context(db, investigation_id=INV, question=Q, max_results=30)
    cites = [c for c in packet['citations']][:8]
    print(len(packet['citations']), [ (c['record_type'], (c.get('title') or '')[:40]) for c in cites])
    ref = lambda c: {"record_type": c['record_type'], "record_id": c['record_id']}
    claims = []
    classes = ["CORROBORATED_FACT", "SOURCE_STATEMENT", "ALLEGATION", "INFERENCE", "CORROBORATED_FACT", "HYPOTHESIS"]
    for i, cls in enumerate(classes):
        sup = [ref(cites[i % len(cites)])] + ([ref(cites[(i + 1) % len(cites)])] if cls == "CORROBORATED_FACT" and i else [])
        claims.append({"claim_id": f"CLM-{i+1:04d}", "claim": (cites[i % len(cites)].get('title') or 'A record')[:120],
                       "classification": cls, "supporting_evidence": sup, "contradicting_evidence": [], "warrant": "The record states it.",
                       "assumptions": [], "confidence": "MEDIUM", "confidence_term": "LIKELY", "confidence_basis": "One reviewed record.", "limitations": ["Rests on the records in the packet."]})
    claims.append({**claims[1], "claim_id": "CLM-0007", "claim": "A payment record the model cited that is not in the packet",
                   "supporting_evidence": [{"record_type": "evidence", "record_id": "not-in-packet"}]})
    answer = {"executive_summary": "Summary.", "scope_and_limitations": "Packet only.", "most_likely_failure": "Missing bank records.",
              "claims": claims[:6], "right_of_reply_needed": [{"subject": "A named director", "claim_ids": ["CLM-0003"], "what_will_be_said": "x", "draft_questions": ["y"]}],
              "investigative_gaps": [{"gap_id": "GAP-0001", "unresolved_question": "Who owned the nominee shares in 2017?", "bears_on": ["CLM-0002"], "why_material": "x",
                                      "needed_record_or_testimony": "Share register", "record_existence": "BELIEVED", "could_confirm_or_refute": "x"}]}
    class Fake:
        model = 'qwen2.5:32b-instruct'
        def generate(self, s, u, **k):
            import time; time.sleep(2)
            return LLMResponse(text=json.dumps(answer), model=self.model, stop_reason='stop', truncated=False)
    r.get_llm_client = lambda *a, **k: Fake()
    job = BackgroundJob(kind='ai_reasoning', investigation_id=INV, subject_type='ai_run', status='running', runner='inline',
                        payload={'module': 'case_synthesis', 'question': Q}, started_at=utcnow_naive(), message='The model is working on it')
    db.add(job); db.commit()
    cand = r.run_reasoning_module(db, investigation_id=INV, run_id=job.id, module='case_synthesis', question=Q,
                                  run_options={'devils_advocate': 'ON'}, premises=['Harbour Nominees is a nominee service, not an owner.'],
                                  changes=[{'at': '14:01:52', 'kind': 'SETTING', 'text': 'devils_advocate off → on'}])
    job.status = 'succeeded'; job.finished_at = utcnow_naive(); job.progress = 100; job.message = 'Proposed for review'
    job.payload = {**job.payload, 'result': {'candidate_id': cand.id, 'review_status': cand.review_status}}
    db.commit()
    print('run', job.id, cand.id, cand.review_status)
