from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.visuals.spec import VisualSpec

class InvestigationCreate(BaseModel):
    name: str
    description: str | None = None
    question: str | None = Field(default=None, max_length=500)


class InvestigationUpdate(BaseModel):
    """Only the fields sent change; an empty question clears it."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    question: str | None = Field(default=None, max_length=500)

class EntityCreate(BaseModel):
    investigation_id: str
    # Intentionally shadows pydantic.BaseModel's deprecated v1 .schema()
    # classmethod, matching FollowTheMoney's own "schema" property naming used
    # throughout this codebase -- harmless at runtime (confirmed: only a
    # UserWarning), narrow ignore for mypy (STRUCT-0013).
    schema: str  # type: ignore[assignment]
    caption: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    dataset: str = "reporter"
    origin: str | None = None

class EntityUpdate(BaseModel):
    """Partial update: caption and/or new property values.

    Property values are additive statements (same provenance ledger used
    everywhere else), never overwrites or deletes -- a value already present
    for a prop is left as-is; a new one is appended and recorded as a
    Statement. Disagreements between old and new values are resolved the
    same way any other statement disagreement is: a property-conflict
    decision, not this endpoint.
    """
    caption: str | None = None
    properties: dict[str, list[str]] = Field(default_factory=dict)
    dataset: str = "reporter"
    origin: str | None = None

class SourceCreate(BaseModel):
    investigation_id: str
    title: str
    url: str | None = None
    source_type: str = "web"
    metadata_json: dict = Field(default_factory=dict)

class EvidenceCreate(BaseModel):
    source_id: str
    quote: str | None = None
    locator: str | None = None
    notes: str | None = None
    # A picture as evidence: an uploaded picture document of the same
    # investigation, and when it was taken as its source states it.
    document_id: str | None = None
    captured_on: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2}(-\d{2})?)?$")
    # A quote from a recording (locator t=start,end): the reporter says they heard the part themselves. Without it the
    # quote is refused: machines can invent words (ADR-0020).
    heard: bool = False

class ClaimEvidenceLinkCreate(BaseModel):
    evidence_id: str
    stance: str
    note: str | None = None

class TimelineEventGradeUpdate(BaseModel):
    """A reporter's grade for an event they recorded; null clears it."""
    grade: Literal["confirmed", "likely", "weak", "unsubstantiated", "unknown"] | None


class ClaimCreate(BaseModel):
    investigation_id: str
    text: str
    status: str = "lead"
    confidence: float = 0.0

class ClaimUpdate(BaseModel):
    text: str | None = None
    status: str | None = None
    confidence: float | None = None

class LeadCreate(BaseModel):
    investigation_id: str
    title: str
    detail: str | None = None
    provider: str | None = None
    provider_record_id: str | None = None
    relationship_id: str | None = None
    status: str = "unreviewed"


class LeadUpdate(BaseModel):
    title: str | None = None
    detail: str | None = None
    status: str | None = None
    priority: str | None = None
    owner: str | None = None
    next_action: str | None = None
    note: str | None = None
    # What gathering got (app/ai/suite_vocab.py GATHERING_OUTCOMES); null clears it.
    gathering_outcome: str | None = None
    # When to chase it: now, next or later (Now / Next / Later); null puts it back in the inbox.
    horizon: Literal["now", "next", "later"] | None = None


class LeadLinkCreate(BaseModel):
    entity_id: str | None = None
    source_id: str | None = None
    claim_id: str | None = None
    evidence_id: str | None = None
    relationship_id: str | None = None
    note: str | None = None


class LeadConvertRequest(BaseModel):
    kind: str
    title: str | None = None
    text: str | None = None
    detail: str | None = None
    priority: str | None = None
    owner: str | None = None
    due_date: str | None = None


class ReportingTaskCreate(BaseModel):
    investigation_id: str
    title: str
    detail: str | None = None
    status: str = "todo"
    priority: str = "normal"
    owner: str | None = None
    due_date: str | None = None
    lead_id: str | None = None


class ReportingTaskUpdate(BaseModel):
    title: str | None = None
    detail: str | None = None
    status: str | None = None
    priority: str | None = None
    owner: str | None = None
    due_date: str | None = None
    workflow_note: str | None = None


class TimelineEventCreate(BaseModel):
    investigation_id: str
    title: str
    description: str | None = None
    date_start: str
    date_end: str | None = None
    precision: str = "day"
    verification_status: str = "asserted"
    # Bellingcat's grading scale (app/services/timeline.py EVENT_GRADES).
    grade: Literal["confirmed", "likely", "weak", "unsubstantiated", "unknown"] | None = None
    entity_id: str | None = None
    relationship_entity_id: str | None = None
    source_id: str | None = None
    evidence_id: str | None = None
    claim_id: str | None = None
    lead_id: str | None = None
    dataset: str = "reporter"
    origin: str | None = None

class ConnectorSearchRequest(BaseModel):
    investigation_id: str
    query: str

class InvestigationQuestionContextRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    include_reconciled_duplicates: bool = False

class FindingReviewRequest(BaseModel):
    status: str

class ResolutionRequest(BaseModel):
    entity_id: str | None = None
    decision: str
    confidence: float = 0.0
    rationale: str | None = None

class CrossReferenceDecisionRequest(BaseModel):
    """A reporter's decision on an OpenAleph cross-reference (ADR-0006, Wave B):
    "same" entity, "different", or "unsure" (the screen's "Not sure")."""
    decision: Literal["same", "different", "unsure"]
    note: str | None = Field(default=None, max_length=4000)

class CanonicalResolutionRequest(BaseModel):
    other_entity_id: str
    decision: str
    confidence: float = 0.0
    rationale: str | None = None

class CanonicalMergeExecuteRequest(BaseModel):
    target_entity_id: str
    preview_digest: str
    rationale: str | None = None

class PostMergeReconciliationRequest(BaseModel):
    record_type: str
    record_a_id: str
    record_b_id: str
    decision: str
    rationale: str | None = None
    preferred_record_id: str | None = None

class PropertyTemporalInterval(BaseModel):
    value: str
    date_start: str | None = None
    date_end: str | None = None
    precision: str = "day"
    evidence_id: str | None = None

class PropertyConflictDecisionRequest(BaseModel):
    decision: str
    values: list[str]
    preferred_value: str | None = None
    rationale: str | None = None
    temporal_intervals: list[PropertyTemporalInterval] = Field(default_factory=list)

class StatementAssessmentRequest(BaseModel):
    entity_id: str | None = None
    prop: str
    value: str
    status: str
    note: str | None = None


class StatementPromotionRequest(BaseModel):
    note: str | None = None


class MultiEnrichmentRequest(BaseModel):
    providers: list[str] = Field(default_factory=list)


class CrossProviderDecisionRequest(BaseModel):
    finding_ids: list[str] = Field(default_factory=list)
    decision: str
    confidence: float = 0.0
    rationale: str | None = None


class RelationshipCreate(BaseModel):
    investigation_id: str
    schema: str  # type: ignore[assignment]  # see EntityCreate.schema above
    source_entity_id: str
    target_entity_id: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    dataset: str = "reporter"
    origin: str | None = None
    evidence_id: str | None = None


class RelationshipEvidenceAttachRequest(BaseModel):
    evidence_id: str
    note: str | None = None


class RelationshipEvidenceReviewRequest(BaseModel):
    stance: str
    rationale: str
    # Who reviewed (app/ai/suite_vocab.py REVIEWER_TYPES); a person unless said otherwise.
    reviewer_type: str = "HUMAN"


class ExtractedRelationshipProposalCreate(BaseModel):
    schema: str  # type: ignore[assignment]  # see EntityCreate.schema above
    source_entity_id: str
    target_entity_id: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    evidence_id: str | None = None
    note: str | None = None


class ExternalRelationshipReviewRequest(BaseModel):
    source_entity_id: str | None = None
    target_entity_id: str | None = None
    decision: str
    note: str | None = None


class ExtractionCandidateReviewRequest(BaseModel):
    decision: str
    note: str | None = None
    entity_schema: str | None = None
    caption: str | None = None
    claim_status: str = "lead"
    confidence: float | None = None
    matched_entity_id: str | None = None
    entity_identity_decision: str | None = None
    # Accepting an email or phone proposal: the entity it belongs to (ADR-0006).
    target_entity_id: str | None = None


# TAS CONTROL_SURFACE §4 flags. Literal types put the value tables in the OpenAPI
# schema and reject anything else at 422 before a route runs; app/ai/reasoning.py
# normalize_control_flags() is still the service-layer gate for non-HTTP callers.
SeverityFloor = Literal["ALL", "MATERIAL", "BLOCKING"]
# The suite never lets the floor go below D (E and F stay leads only).
SourceTierFloor = Literal["A", "B", "C", "D"]


class RunOptionsIn(BaseModel):
    """The run options beyond the two TAS §4 flags (app/ai/reasoning.py RUN_OPTIONS). None = the suite's default."""
    model_config = ConfigDict(extra="forbid")
    devils_advocate: Literal["OFF", "ON"] | None = None
    research_depth: Literal["NORMAL", "EXHAUSTIVE"] | None = None
    show_reasoning_chain: Literal["ON", "OFF"] | None = None
    live_events: Literal["FULL", "SUMMARY", "OFF"] | None = None
    outside_lookups: Literal["AUTOMATIC", "ASK", "OFF"] | None = None


class RunChangeIn(BaseModel):
    """One settings change echoed before the run (mockup AI_2), kept with it."""
    at: str = Field(max_length=40)
    kind: Literal["SETTING", "FLAG"] = "SETTING"
    text: str = Field(max_length=300)


class PacketFromIn(BaseModel):
    """Run again from a step of an earlier run (mockup AI_1, research AI §5): the same packet, new instructions."""
    run_id: str = Field(min_length=1, max_length=64)
    step: int = Field(ge=1)


class CaseSynthesisRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    severity_floor: SeverityFloor | None = None
    source_tier_floor: SourceTierFloor | None = None
    options: RunOptionsIn | None = None
    premises: list[str] | None = Field(default=None, max_length=10)
    changes: list[RunChangeIn] | None = Field(default=None, max_length=50)
    packet_from: PacketFromIn | None = None


class HypothesisTestRequest(BaseModel):
    working_theory: str = Field(min_length=1, max_length=2000)
    question: str = Field(min_length=1, max_length=4000)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    # TAS CONTROL_SURFACE §4 session flags; validated against the table in
    # app/ai/reasoning.py (ALL|MATERIAL|BLOCKING; A-D). None = the suite's default.
    severity_floor: SeverityFloor | None = None
    source_tier_floor: SourceTierFloor | None = None
    options: RunOptionsIn | None = None
    premises: list[str] | None = Field(default=None, max_length=10)
    changes: list[RunChangeIn] | None = Field(default=None, max_length=50)
    packet_from: PacketFromIn | None = None


SuiteModuleName = Literal["research_vetting", "quant_framing", "las_argument_check", "das_framing", "das_options",
                          "evidence_plan", "ehs_harm_minimisation", "ehs_public_interest"]


class SuiteRunRequest(BaseModel):
    """One run of another system of the Authority System Suite (app/ai/systems.py). `handoff_from` is the id of an
    answer you accepted, which the run starts from under the suite's INTEROP rules; some modules need one.
    `context` is what the module asks the requester for besides the question (an evidence plan's jurisdiction and
    access limits, a decision's owner and deadline, how each person was approached). `premises` are taken as given
    by the logic check only."""
    module: SuiteModuleName
    question: str = Field(min_length=1, max_length=4000)
    handoff_from: str | None = Field(default=None, max_length=64)
    context: str | None = Field(default=None, max_length=4000)
    premises: list[str] | None = Field(default=None, max_length=10)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True


class RunPlanRequest(BaseModel):
    """What a run would do, before it runs (mockup AI_2)."""
    module: Literal["case_synthesis", "hypothesis_test"] | SuiteModuleName = "case_synthesis"
    question: str = Field(min_length=1, max_length=4000)
    working_theory: str | None = Field(default=None, max_length=2000)
    handoff_from: str | None = Field(default=None, max_length=64)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    severity_floor: SeverityFloor | None = None
    source_tier_floor: SourceTierFloor | None = None
    options: RunOptionsIn | None = None
    premises: list[str] | None = Field(default=None, max_length=10)


class RunProfileIn(BaseModel):
    """This case's default run settings, with the reason for them."""
    severity_floor: SeverityFloor | None = None
    source_tier_floor: SourceTierFloor | None = None
    options: RunOptionsIn | None = None
    premises: list[str] | None = Field(default=None, max_length=10)
    reason: str = Field(min_length=1, max_length=300)


class AIAnalysisCandidateReviewRequest(BaseModel):
    decision: str
    note: str | None = None

class AiClaimReviewRequest(BaseModel):
    """Your decision on one claim (or hypothesis) of a proposed AI answer (research AI §2 "Per-claim decisions").
    `text` is your corrected wording (correct only); `reason` is required to reject. "clear" takes a decision back."""
    claim_id: str = Field(min_length=1, max_length=64)
    decision: Literal["keep", "correct", "reject", "clear"]
    text: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=300)

class AiThoughtMarkRequest(BaseModel):
    """Your mark on one thought of an AI run (mockup AI_1, the trace drawer's "To check"): kept in the run record."""
    mark: Literal["to_check", "keep", "reject"]
    reason: str | None = Field(default=None, max_length=500)

class AppUserCreate(BaseModel):
    display_name: str
    global_role: str = "member"
    # How long the key works: 30 or 90 days (ADR-0016).
    key_days: int = 30


class AppUserUpdate(BaseModel):
    display_name: str | None = None
    global_role: str | None = None
    disabled: bool | None = None


class InvestigationMembershipPut(BaseModel):
    role: str = "viewer"


class SecurityAuditRetentionRequest(BaseModel):
    """Prune the security audit log (POST /settings/security/audit/retention).

    Strict, so `true` or "90" is refused rather than converted: the route
    refused anything but a whole number and text before this body was typed.
    The ranges and the confirmation text are checked by the audit log itself
    (app/core/audit_log.py), which answers 400 with the reason."""
    keep_days: int = Field(default=90, strict=True)
    max_records: int = Field(default=5000, strict=True)
    confirmation: str = Field(default="", strict=True)


class ConnectorCredentialPut(BaseModel):
    """A connector's secret (PUT /settings/connectors/{provider}/credential).
    Optional here so a missing secret gets the same 400 a blank one does
    (app/services/settings.py save_connector_credential)."""
    credential: str | None = None

class ClaimReviewRequest(BaseModel):
    status: str
    confidence: float
    rationale: str
    reviewer_type: str = "HUMAN"
    # The confidence grade on the IPCC AR5 grid (app/services/claims.py):
    # both or neither; left out, the claim keeps the grade it has.
    evidence_grade: Literal["limited", "medium", "robust"] | None = None
    agreement_grade: Literal["low", "medium", "high"] | None = None
    # Marking Supported or Confirmed with a Done rule not met (app/services/claim_done.py)
    # needs a written reason; it is kept on the review event.
    override_reason: str | None = Field(default=None, max_length=2000)


class WriteupCreate(BaseModel):
    investigation_id: str
    title: str = "Untitled write-up"
    content_json: dict | None = None
    status: str = "draft"


class WriteupUpdate(BaseModel):
    title: str | None = None
    content_json: dict | None = None
    status: str | None = None


class RecordRef(BaseModel):
    record_type: str
    record_id: str


class PresentationDraftRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=4000)
    record_refs: list[RecordRef] = Field(min_length=1, max_length=200)


class AssistantRunRequest(BaseModel):
    """Any AI run, routed by the suite service (app/ai/suite.py) by its module: TAS's case synthesis and theory
    test, the other six systems' modules, or the app-local presentation draft. Each module takes only the fields it
    uses and refuses the rest before anything is queued: `working_theory` (theory test), the TAS settings
    (`severity_floor`, `source_tier_floor`, `options`, `changes`, `packet_from`), `premises` (TAS and the logic
    check), `handoff_from` and `context` (the suite's other systems), `record_refs` (presentation draft; `question`
    then holds the goal)."""
    module: Literal["case_synthesis", "hypothesis_test", "presentation_draft"] | SuiteModuleName
    question: str = Field(min_length=1, max_length=4000)
    working_theory: str | None = Field(default=None, max_length=2000)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    severity_floor: SeverityFloor | None = None
    source_tier_floor: SourceTierFloor | None = None
    options: RunOptionsIn | None = None
    premises: list[str] | None = Field(default=None, max_length=10)
    changes: list[RunChangeIn] | None = Field(default=None, max_length=50)
    packet_from: PacketFromIn | None = None
    handoff_from: str | None = Field(default=None, max_length=64)
    context: str | None = Field(default=None, max_length=4000)
    record_refs: list[RecordRef] | None = Field(default=None, max_length=200)


class PromoteToWriteupRequest(BaseModel):
    title: str | None = None


class DeckStyle(BaseModel):
    theme: str | None = None
    fonts: str | None = None


class VisualStyle(BaseModel):
    preset: str | None = None
    options: dict = Field(default_factory=dict)


class ChartToSave(BaseModel):
    """A chart built by hand, to keep in a deck or a write-up: only the order
    slip (app/visuals/spec.py), never numbers -- the server cooks, draws and
    checks it from the investigation's records (app/services/saved_charts.py)."""
    spec: VisualSpec
    heading: str | None = Field(default=None, max_length=300, description="The slide's heading in a deck; the chart's title when left out.")
    style: VisualStyle | None = None


class ChartRestyleRequest(BaseModel):
    """A stored chart (its `spec` and cooked `data`, as a draft or a deck
    holds it), the style to try on it, and the deck's theme and fonts
    (app/visuals/style.py). Nothing is stored."""
    chart: dict[str, Any]
    style: VisualStyle | None = None
    deck_style: DeckStyle | None = None


class PromoteToDeckRequest(BaseModel):
    title: str | None = None
    # Deck theme/fonts, plus per-section visual styles keyed by the section's
    # index in the draft ("0", "1", ...). Validated against the catalogue in
    # app/services/presentation_style.py; unknown values fall back to defaults.
    style: DeckStyle | None = None
    visual_styles: dict[str, VisualStyle] = Field(default_factory=dict)
    # Duarte's two kinds of deck: sparse slides to present (the prose goes to
    # the speaker notes), or a slidedoc to read alone (the prose on the slide).
    deck_kind: Literal["presenting", "slidedoc"] = "presenting"


class WatchlistEntryCreate(BaseModel):
    query: str = Field(min_length=1, max_length=512, description="A name, searched as a phrase, or a search in OpenAleph's syntax.")
    note: str | None = Field(default=None, max_length=2000)


class IngestionBatchCreate(BaseModel):
    label: str | None = Field(default=None, max_length=512, description="What the import holds; 'Bulk import' when left out.")


class DeckSlideIn(BaseModel):
    """One slide as the editor sends it back. The types are checked here so a
    malformed slide is answered with a 422 naming the field; the values are
    then cleaned by app/services/decks.py _normalize_slides (an unknown kind
    becomes "content", text is cut to length, the visual is re-checked)."""
    kind: str | None = None
    heading: str | None = None
    bullets: list[str] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None
    visual: dict[str, Any] | None = None
    prose: str | None = None   # a slidedoc's prose (app/services/presentation.py deck_kind)


class DeckUpdate(BaseModel):
    title: str | None = None
    slides_json: list[DeckSlideIn] | None = None
    style_json: dict | None = None


class MappedPropertyIn(BaseModel):
    """Where one property's values come from: a FollowTheMoney property
    mapping (https://followthemoney.tech/docs/mappings/), limited to what the
    Workbench's mapping screen sets."""
    model_config = ConfigDict(extra="forbid")
    column: str | None = Field(default=None, max_length=255, description="The column whose cell is the value.")
    columns: list[str] | None = Field(default=None, max_length=20, description="Several columns, joined by `join`.")
    join: str | None = Field(default=None, max_length=10)
    split: str | None = Field(default=None, max_length=10, description="Split one cell into several values on this text.")
    literal: str | None = Field(default=None, max_length=500, description="The same value for every row.")
    entity: str | None = Field(default=None, max_length=64, description="A link's end: the name of another entity of this mapping.")
    format: str | None = Field(default=None, max_length=64, description="How a date is written in the cells, as strptime reads it (e.g. %d/%m/%Y).")
    required: bool | None = None


class MappedEntityIn(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_: str = Field(alias="schema", max_length=64, description="Person, Company, Organization, PublicBody, LegalEntity, or a link kind.")
    keys: list[str] = Field(min_length=1, max_length=10, description="The columns whose values identify the entity: rows with the same values make one entity.")
    key_literal: str | None = Field(default=None, max_length=64)
    properties: dict[str, MappedPropertyIn] = Field(default_factory=dict)


class TableMappingIn(BaseModel):
    """A spreadsheet mapping: the ``entities`` of a FollowTheMoney mapping,
    keyed by a name the mapping uses to point one entity at another."""
    sheet: str | None = Field(default=None, max_length=255, description="The workbook's sheet; the first when left out.")
    entities: dict[str, MappedEntityIn] = Field(min_length=1, max_length=20)

    def query(self) -> dict:
        return {name: {**entity.model_dump(by_alias=True, exclude_none=True),
                       "properties": {prop: spec.model_dump(exclude_none=True) for prop, spec in entity.properties.items()}}
                for name, entity in self.entities.items()}


class EntitySetSend(BaseModel):
    """A diagram, timeline or list to make (or update) in OpenAleph from the
    investigation's records in its collection (app/services/openaleph_entitysets.py)."""
    kind: Literal["diagram", "timeline", "list"]
    label: str | None = Field(default=None, max_length=512, description="The set's name; a list is updated when one with this name exists.")
    entity_ids: list[str] | None = Field(default=None, max_length=500, description="A list's entities (Workbench ids).")


# --- tags, notes and collections (app/services/annotations.py) ----------------

RecordType = Literal["entity", "relationship", "evidence", "source", "claim", "event", "document", "lead", "task", "finding", "story"]


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    colour: str = Field(description="One of the eight tag swatches (app/services/annotations.py TAG_COLOURS).")


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    colour: str | None = None


class RecordTagCreate(BaseModel):
    tag_id: str
    record_type: RecordType
    record_id: str


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    record_type: RecordType | None = None
    record_id: str | None = None
    chart_ref: dict[str, Any] | None = Field(default=None, description="The chart kind and mark the note is on, when it is on a chart mark.")


class NoteUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class CollectionItemCreate(BaseModel):
    record_type: RecordType
    record_id: str
    position: int | None = Field(default=None, ge=0, description="Where in the list; the end when left out. A record already in the collection moves.")


class InvestigationTypeSet(BaseModel):
    areas: list[str] | None = Field(description="Catalogue area keys; null hands the choice back to the app.", max_length=40)


class CheckDecide(BaseModel):
    # A missing value (kind "missing") is answered chasing, unknowable or not_needed; other items shows, does_not or unclear.
    status: Literal["open", "shows", "does_not", "unclear", "chasing", "unknowable", "not_needed"]
    note: str | None = Field(default=None, max_length=4000, description="What the person saw; it stays with the item.")


class MoneyCheckKeep(BaseModel):
    """A money check from See › Money to keep in To check; the server runs the check again and keeps it only if it finds it."""
    currency: str = Field(min_length=1, max_length=16)
    kind: Literal["grey_hole", "miracle", "black_hole", "round_trip"]
    party_id: str = Field(min_length=1, max_length=64)
    returning_payment_id: str | None = Field(default=None, max_length=64, description="A round trip: the payment that returns.")
    as_of: int | None = Field(default=None, ge=1000, le=9999, description="The year the check was run up to, as on screen.")


class FlagInnocent(BaseModel):
    text: str = Field(min_length=1, max_length=2000, description="The innocent explanation, as the catalogue words it.")
    state: Literal["not_looked_at", "ruled_out", "could_apply"]
    note: str | None = Field(default=None, max_length=2000, description="What ruled it out, or why it could apply.")


class FlagDismiss(BaseModel):
    reason: str = Field(min_length=1, max_length=2000, description="Why the flag is not relevant; it stays with the flag.")


# --- The Authority System Suite's fields and records (app/services/suite_fields.py, case_records.py)

class ClaimSuiteFields(BaseModel):
    """Set any of a claim's suite fields; each change is a review event with its reason."""
    model_config = ConfigDict(extra="forbid")
    classification: str | None = None
    confidence_term: str | None = None
    confidence_level: str | None = None
    confidence_basis: str | None = None
    warrant: str | None = None
    assumptions: list[str] | None = None
    limitations: list[str] | None = None
    verification_verdict: str | None = None
    corrected_wording: str | None = None
    rationale: str
    reviewer_type: str = "HUMAN"


class SourceSuiteFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_tier: str | None = None
    issuer_or_author: str | None = None


class EvidenceSuiteFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issuer_or_author: str | None = None
    authenticity_status: str | None = None
    restates_evidence_id: str | None = None
    created_on: str | None = None
    event_on: str | None = None
    published_on: str | None = None
    retrieved_on: str | None = None
    limitations: list[str] | None = None


class RelationshipSuiteFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_status: str | None = None


class CaseRecordCreate(BaseModel):
    kind: Literal["GAP", "ROR", "HYP", "CFLT", "RLOG", "ESRC", "EPIT", "CAPT"]
    body: dict[str, Any]


class CaptureCreate(BaseModel):
    """A link to capture (ADR-0018): http or https, a public address."""
    url: str = Field(min_length=1, max_length=4096)


class CaseRecordAmend(BaseModel):
    body: dict[str, Any]


# --- What the story needs (app/services/stories.py, mockup ACT_2) ------------------------------------------------

class StoryThesisSet(BaseModel):
    thesis: str = Field(max_length=2000, description="The one sentence the story says.")


class StorySectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class StorySectionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    position: int | None = Field(default=None, ge=0, le=10_000)


class StoryClaimPlace(BaseModel):
    claim_id: str = Field(min_length=1, max_length=64)


class StoryGateSet(BaseModel):
    gate: Literal["right_of_reply", "legal_read"]
    who: str | None = Field(default=None, max_length=255, description="Whom the reply went to, or who read it for the lawyer.")
    on: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="The day, YYYY-MM-DD.")


class StoryReady(BaseModel):
    by: str = Field(min_length=1, max_length=255, description="Who decided it is ready to run.")


class WriteupVersionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, description='A name for the write-up as it stands ("Before legal read").')


# --- Settings kept on the server (app/services/preferences.py) ---------------------------------------------------

NotificationRoute = Literal["interrupt", "needs", "else", "off"]
LookupMode = Literal["automatic", "ask", "off"]


class NotificationPrefsPut(BaseModel):
    routes: dict[str, NotificationRoute] = Field(default_factory=dict, description="Where each kind goes; kinds left out keep their route.")
    quiet_while_reading: bool = True
    desktop: bool = False
    backup_days: Literal[7, 14, 30, 0] | None = Field(default=None, description="Mention a changed case not backed up for this many days (0: never).")


class LookupDefaultsPut(BaseModel):
    defaults: dict[str, LookupMode] = Field(description="Each source's mode for cases that have not chosen their own.")


class CaseLookupsPut(BaseModel):
    modes: dict[str, LookupMode] = Field(description="This case's own mode for each source it differs on.")
    reason: str = Field(min_length=1, max_length=300, description="One line on why this case looks up differently.")


class ResearchSettingsPut(BaseModel):
    mode: Literal["off", "ask", "automatic"] | None = Field(default=None, description="What the AI may start on its own, for cases that have not chosen.")
    flags: dict[str, Any] | None = Field(default=None, description="Run defaults for new cases: the suite's flags.")
    options: dict[str, Any] | None = Field(default=None, description="Run defaults for new cases: the run options.")
    reason: str | None = Field(default=None, max_length=300, description="Needed when the run defaults change.")


class FactWatchCreate(BaseModel):
    record_type: Literal["claim", "red_flag"]
    record_id: str = Field(min_length=1, max_length=64)


class SavedQuestionCreate(BaseModel):
    module: Literal["case_synthesis", "hypothesis_test"]
    question: str = Field(min_length=1, max_length=4000)
    working_theory: str | None = Field(default=None, max_length=2000)


class CaseResearchPut(BaseModel):
    mode: Literal["off", "ask", "automatic"] | None = Field(description="This case's own research mode, or null to follow the default.")
    reason: str | None = Field(default=None, max_length=300, description="One line on why, needed with a mode.")


class NotificationChannelPut(BaseModel):
    mode: Literal["off", "interrupts", "daily"]
    address: str | None = Field(default=None, max_length=320, description="Email: your own address.")
    url: str | None = Field(default=None, max_length=1000, description="Phone: your ntfy address (ntfys://host/topic).")


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2000)
    keys: PushSubscriptionKeys
    label: str | None = Field(default=None, max_length=255)


class PushSubscriptionRemove(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2000)


# --- your name and the app lock (ADR-0016) -------------------------------------------------------------------------

class SecretIn(BaseModel):
    passphrase: str


class PinIn(BaseModel):
    pin: str


class RecoverIn(BaseModel):
    words: str
    new_passphrase: str


class NameIn(BaseModel):
    name: str


class ChangePassphraseIn(BaseModel):
    old: str
    new: str


class PinSetIn(BaseModel):
    pin: str | None = None


class LockingIn(BaseModel):
    idle_minutes: int | None = None
    lock_on_hide: bool | None = None
    lock_on_sleep: bool | None = None
    quick_pin: bool | None = None


class DiskAnswerIn(BaseModel):
    answer: str | None = None   # encrypted | not_encrypted | None (let the app check)


class CaseLockIn(BaseModel):
    passphrase: str
    old: str | None = None


class LockReasonIn(BaseModel):
    reason: str | None = None   # idle | hide | sleep | button
