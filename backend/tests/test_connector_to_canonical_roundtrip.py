from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import Base, engine
from app.models.domain import (
    ConnectorFinding, ConnectorRun, Entity, ExternalRelationshipPromotion,
    ExternalRelationshipReview, Investigation, ResolutionDecision, Statement,
    StatementAssessment, StatementPromotion,
)
from app.services.external_relationships import create_review, promote_review, relationship_endpoint_candidates
from app.services.exports import build_investigation_export, restore_investigation_export
from app.services.promotion import promote_assessment
from app.services.relationships import investigation_graph

def setup_function():
    Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine)

def add_finding(db, inv, run, rid, caption, schema, props, url):
    row=ConnectorFinding(investigation_id=inv,run_id=run,provider='aleph',provider_record_id=rid,caption=caption,schema=schema,properties=props,source_url=url,raw={'dataset':'aleph-fixture'})
    db.add(row); db.flush(); return row

def test_connector_review_to_canonical_relationship_keeps_provenance_and_requires_explicit_promotion(tmp_path):
    with Session(engine) as db:
        inv=Investigation(name='Connector round trip'); db.add(inv); db.flush()
        person=Entity(investigation_id=inv.id,ftm_id='person:alice',schema='Person',caption='Alice Director',properties={'name':['Alice Director']})
        company=Entity(investigation_id=inv.id,ftm_id='company:acme',schema='Company',caption='Acme Corp',properties={'name':['Acme Corp']})
        db.add_all([person,company]); db.flush()
        run=ConnectorRun(investigation_id=inv.id,provider='aleph',query='Alice Director Acme',status='completed',result_count=3); db.add(run); db.flush()
        pf=add_finding(db,inv.id,run.id,'p1','Alice Director','Person',{'name':['Alice Director'],'nationality':['us']},'https://aleph.test/p1')
        add_finding(db,inv.id,run.id,'c1','Acme Corp','Company',{'name':['Acme Corp']},'https://aleph.test/c1')
        rf=add_finding(db,inv.id,run.id,'r1','Alice Director at Acme Corp','Directorship',{'director':['p1'],'organization':['c1'],'role':['Board member'],'startDate':['2022-01-01']},'https://aleph.test/r1'); db.commit()
        assert db.scalar(select(Statement).where(Statement.entity_id==person.id,Statement.prop=='nationality')) is None
        assert investigation_graph(db,inv.id)['edges']==[]
        resolution=ResolutionDecision(investigation_id=inv.id,finding_id=pf.id,entity_id=person.id,decision='positive',confidence=.98,rationale='exact name')
        assessment=StatementAssessment(investigation_id=inv.id,finding_id=pf.id,entity_id=person.id,prop='nationality',value='us',status='accepted',note='reviewed')
        db.add_all([resolution,assessment]); db.commit(); db.refresh(assessment)
        assert db.scalar(select(Statement).where(Statement.entity_id==person.id,Statement.prop=='nationality')) is None
        promotion=promote_assessment(db,assessment,'explicit reporter promotion'); assert isinstance(promotion,StatementPromotion)
        stmt=db.get(Statement,promotion.statement_id); assert (stmt.value,stmt.dataset,stmt.origin)==('us','aleph-fixture','https://aleph.test/p1')
        candidates=relationship_endpoint_candidates(db,rf); assert candidates['source_candidates'][0]['entity_id']==person.id; assert candidates['target_candidates'][0]['entity_id']==company.id
        assert investigation_graph(db,inv.id)['edges']==[]
        review=create_review(db,rf,person.id,company.id,'supported','endpoints independently verified'); assert investigation_graph(db,inv.id)['edges']==[]
        rp=promote_review(db,review); edge=investigation_graph(db,inv.id)['edges'][0]
        assert edge['schema']=='Directorship' and edge['source']['id']==person.id and edge['target']['id']==company.id and edge['properties']['role']==['Board member']
        role=db.scalar(select(Statement).where(Statement.entity_id==rp.relationship_entity_id,Statement.prop=='role')); assert (role.dataset,role.origin)==('aleph-fixture','https://aleph.test/r1')

        # Portable export must carry both the human review lineage and the canonical facts
        # that were created only after explicit promotion.
        export_bytes, manifest = build_investigation_export(db, inv.id, include_documents=False)
        assert manifest['record_counts']['resolution_decisions'] == 1
        assert manifest['record_counts']['statement_assessments'] == 1
        assert manifest['record_counts']['statement_promotions'] == 1
        assert manifest['record_counts']['external_relationship_reviews'] == 1
        assert manifest['record_counts']['external_relationship_promotions'] == 1

        original_ids = {
            'investigation': inv.id,
            'person': person.id,
            'company': company.id,
            'finding': pf.id,
            'assessment': assessment.id,
            'promotion': promotion.id,
            'review': review.id,
            'relationship_promotion': rp.id,
            'relationship_entity': rp.relationship_entity_id,
        }

    # Restore into a genuinely clean database, then reopen the same lineage.
    Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        restored = restore_investigation_export(db, export_bytes, tmp_path / 'documents')
        assert restored['investigation_id'] == original_ids['investigation']

        restored_resolution = db.scalar(select(ResolutionDecision).where(
            ResolutionDecision.finding_id == original_ids['finding'],
            ResolutionDecision.entity_id == original_ids['person'],
        ))
        assert restored_resolution is not None and restored_resolution.decision == 'positive'

        restored_assessment = db.get(StatementAssessment, original_ids['assessment'])
        restored_promotion = db.get(StatementPromotion, original_ids['promotion'])
        assert restored_assessment is not None and restored_assessment.status == 'accepted'
        assert restored_promotion is not None and restored_promotion.statement_id

        promoted_statement = db.get(Statement, restored_promotion.statement_id)
        assert (promoted_statement.value, promoted_statement.dataset, promoted_statement.origin, promoted_statement.original_value) == (
            'us', 'aleph-fixture', 'https://aleph.test/p1', 'us'
        )

        restored_review = db.get(ExternalRelationshipReview, original_ids['review'])
        restored_relationship_promotion = db.get(ExternalRelationshipPromotion, original_ids['relationship_promotion'])
        assert restored_review is not None and restored_review.decision == 'supported'
        assert restored_relationship_promotion is not None
        assert restored_relationship_promotion.relationship_entity_id == original_ids['relationship_entity']

        restored_graph = investigation_graph(db, original_ids['investigation'])
        assert len(restored_graph['edges']) == 1
        restored_edge = restored_graph['edges'][0]
        assert restored_edge['schema'] == 'Directorship'
        assert restored_edge['source']['id'] == original_ids['person']
        assert restored_edge['target']['id'] == original_ids['company']
        assert restored_edge['properties']['role'] == ['Board member']

        restored_role = db.scalar(select(Statement).where(
            Statement.entity_id == original_ids['relationship_entity'],
            Statement.prop == 'role',
        ))
        assert (restored_role.dataset, restored_role.origin, restored_role.original_value) == (
            'aleph-fixture', 'https://aleph.test/r1', 'Board member'
        )
