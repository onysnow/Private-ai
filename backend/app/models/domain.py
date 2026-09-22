"""Every ORM model, re-exported from the domain modules (STRUCT-0024).

Keep importing from here: `from app.models.domain import Entity, Claim` works
exactly as it did when all models lived in this file, and importing this
module registers every table on Base.metadata (alembic/env.py, ensure_database_schema
and tests all rely on that side effect). New models go in the matching domain
module -- or a new one -- and get added to the import and __all__ below.
"""

from app.models.base import uid
from app.models.investigations import (
    Investigation,
    TimelineEvent,
)
from app.models.entities import (
    Entity,
    Statement,
    CanonicalResolutionDecision,
    CanonicalEntityMergeAudit,
    PostMergeReconciliationDecision,
    PropertyConflictDecision,
)
from app.models.sources import (
    Source,
    Evidence,
)
from app.models.claims import (
    Claim,
    ClaimEvidenceLink,
    ClaimReviewEvent,
)
from app.models.leads import (
    Lead,
    LeadProfile,
    LeadLink,
    LeadWorkflowEvent,
    ReportingTask,
    ReportingTaskWorkflowEvent,
)
from app.models.connectors import (
    ConnectorRun,
    ConnectorFinding,
    ResolutionDecision,
    StatementAssessment,
    StatementPromotion,
    EnrichmentSession,
    EnrichmentSessionRun,
    EnrichmentSessionFinding,
    CrossProviderDecision,
    ExternalRelationshipReview,
    ExternalRelationshipPromotion,
)
from app.models.relationships import (
    RelationshipEdge,
    RelationshipEvidenceAttachment,
    RelationshipEvidenceReviewEvent,
)
from app.models.documents import (
    Document,
    InvestigationCorpusBinding,
    DocumentCorpusSync,
    OpenAlephOperationFailure,
    DocumentChunk,
    ExtractionCandidate,
)
from app.models.ai import (
    AIAnalysisCandidate,
)
from app.models.identity import (
    AppUser,
    InvestigationMembership,
)

__all__ = [
    "uid",
    "Investigation",
    "TimelineEvent",
    "Entity",
    "Statement",
    "CanonicalResolutionDecision",
    "CanonicalEntityMergeAudit",
    "PostMergeReconciliationDecision",
    "PropertyConflictDecision",
    "Source",
    "Evidence",
    "Claim",
    "ClaimEvidenceLink",
    "ClaimReviewEvent",
    "Lead",
    "LeadProfile",
    "LeadLink",
    "LeadWorkflowEvent",
    "ReportingTask",
    "ReportingTaskWorkflowEvent",
    "ConnectorRun",
    "ConnectorFinding",
    "ResolutionDecision",
    "StatementAssessment",
    "StatementPromotion",
    "EnrichmentSession",
    "EnrichmentSessionRun",
    "EnrichmentSessionFinding",
    "CrossProviderDecision",
    "ExternalRelationshipReview",
    "ExternalRelationshipPromotion",
    "RelationshipEdge",
    "RelationshipEvidenceAttachment",
    "RelationshipEvidenceReviewEvent",
    "Document",
    "InvestigationCorpusBinding",
    "DocumentCorpusSync",
    "OpenAlephOperationFailure",
    "DocumentChunk",
    "ExtractionCandidate",
    "AIAnalysisCandidate",
    "AppUser",
    "InvestigationMembership",
]
