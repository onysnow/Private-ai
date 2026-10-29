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
from app.models.case_records import CaseRecord
from app.models.captures import Capture
from app.models.derived import DerivedFile, DocumentPhoto
from app.models.authenticity import AuthenticityCheck, AuthenticityItem
from app.models.evidence_pack import EvidencePack
from app.models.platform_check import PlatformCheck
from app.models.timeline_period import TimelinePeriod
from app.models.following import Monitor, MonitorItem, PageVersion
from app.models.media import DocumentMedia, TranscriptSegment
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
    IngestionBatch,
    IngestionBatchItem,
    TableMapping,
)
from app.models.watchlists import (
    WatchlistEntry,
    WatchlistHit,
)
from app.models.patterns import (
    CheckItem,
    PatternFlag,
)
from app.models.preferences import (
    FactWatch,
    Preference,
)
from app.models.platform import (
    NotificationDelivery,
    PushSubscription,
    SavedQuestion,
)
from app.models.annotations import (
    Collection,
    CollectionItem,
    Note,
    RecordTag,
    Tag,
)
from app.models.ai import (
    AIAnalysisCandidate,
    AIRunEvent,
)
from app.models.outbound import OutboundRequest
from app.models.writeups import (
    Writeup,
    WriteupVersion,
)
from app.models.safety import BackupEvent
from app.models.stories import (
    Story,
    StoryClaim,
    StorySection,
)
from app.models.decks import (
    Deck,
)
from app.models.identity import (
    AppUser,
    InvestigationMembership,
    LocalProfile,
)
from app.models.jobs import (
    BackgroundJob,
)
from app.models.corpus import (
    OpenAlephEntityLink,
    OpenAlephEntitySetLink,
    CorpusSyncState,
    CrossReferenceProposal,
    CrossReferenceDecision,
)

__all__ = [
    "AuthenticityCheck",
    "EvidencePack",
    "PlatformCheck",
    "TimelinePeriod",
    "AuthenticityItem",
    "CaseRecord",
    "Capture",
    "DerivedFile",
    "Monitor",
    "MonitorItem",
    "PageVersion",
    "DocumentPhoto",
    "DocumentMedia",
    "TranscriptSegment",
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
    "IngestionBatch",
    "IngestionBatchItem",
    "TableMapping",
    "WatchlistEntry",
    "WatchlistHit",
    "Tag",
    "RecordTag",
    "Note",
    "Collection",
    "CollectionItem",
    "PatternFlag",
    "CheckItem",
    "Preference",
    "FactWatch",
    "OutboundRequest",
    "SavedQuestion",
    "NotificationDelivery",
    "PushSubscription",
    "AIAnalysisCandidate",
    "AIRunEvent",
    "BackupEvent",
    "Writeup",
    "WriteupVersion",
    "Story",
    "StoryClaim",
    "StorySection",
    "Deck",
    "AppUser",
    "InvestigationMembership",
    "LocalProfile",
    "BackgroundJob",
    "OpenAlephEntityLink",
    "OpenAlephEntitySetLink",
    "CorpusSyncState",
    "CrossReferenceProposal",
    "CrossReferenceDecision",
]
