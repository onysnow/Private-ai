export type JsonPrimitive=string|number|boolean|null;
export type JsonValue=JsonPrimitive|JsonValue[]|{[key:string]:JsonValue};
export type JsonObject={[key:string]:JsonValue};
export type CanonicalEntity={id:string,caption:string,schema:string,properties:Record<string,string[]>};
export type SearchGroup='canonical'|'evidence'|'reporting'|'workflow'|'review'|'external_lead'|'other';
export type SearchResult={type:string,group:SearchGroup,id:string,investigation_id:string,title:string,snippet:string,score:number,provenance:{locator?:string,source_url?:string,[key:string]:JsonValue|undefined},metadata:JsonObject};
// A document's own extracted chunks, attached only by the single-document
// detail endpoint (GET /api/documents/{id}), not by list endpoints. Each
// ExtractionCandidate.chunk_id points at one of these, and payload.span
// (ExtractionSpan) gives exact character offsets within chunk.text -- the
// pair the split-pane review screen (#66) highlights source spans from.
export type DocumentChunk={id:string,document_id:string,ordinal:number,locator:string,page_number?:number|null,text:string,created_at?:string};
// Slow work that runs after the request returns (ADR-0004): GET /api/jobs/{id}.
export type BackgroundJobStatus='queued'|'running'|'succeeded'|'failed'|'cancelled';
export type BackgroundJob={id:string,kind:string,investigation_id:string|null,subject_type:string|null,subject_id:string|null,status:BackgroundJobStatus,finished:boolean,progress:number|null,message:string|null,error:string|null,attempts:number,runner:string,result?:unknown};
export type DocItem={id:string,investigation_id?:string,filename:string,source_id:string,extraction_status:string,extraction_error?:string|null,extraction_issues?:string[],chunk_count:number,candidate_counts:Record<string,number>,chunks?:DocumentChunk[],job?:BackgroundJob|null};
export type ExtractionSpan={start_char:number,end_char:number};
export type ExtractionPayload={caption?:string,text?:string,quote?:string,locator?:string,suggested_schema?:string,span?:ExtractionSpan,[key:string]:JsonValue|undefined};
// #190: per-part "why was this proposed" breakdown returned by
// GET /api/extraction-candidates/{id}/explanation and, inline, by
// GET /api/documents/{id}/candidates?explain=true.
export type ExtractionExcerpt={before:string,match:string,after:string,start_char:number,end_char:number};
export type ExtractionExplanationSource={kind:'document'|'source'|'chunk'|'provider'|'claim'|'evidence'|'entity'|string,id?:string|null,label?:string|null,locator?:string|null,excerpt?:ExtractionExcerpt|null,url?:string|null,[key:string]:JsonValue|ExtractionExcerpt|undefined};
export type ExtractionExplanationPart={id:string,label:string,value:JsonValue,reasoning:string[],sources:ExtractionExplanationSource[]};
export type ExtractionRationaleBasis='recorded'|'reconstructed'|'provider'|'reporter';
export type ExtractionExplanation={candidate_id:string,candidate_type:string,review_status:string,summary:string,method:{id:string,label:string,description:string,automated:boolean},rationale_basis:ExtractionRationaleBasis,confidence:{value:number|null,basis:string},parts:ExtractionExplanationPart[],sources:ExtractionExplanationSource[],caveats:string[],review_rule:string};
export type ExtractionCandidate={id:string,candidate_type:string,payload:ExtractionPayload,review_status:string,document_id?:string,chunk_id?:string,confidence?:number,accepted_record_type?:string,accepted_record_id?:string,reviewer_note?:string,created_at?:string,reviewed_at?:string,explanation?:ExtractionExplanation};
// TAS reasoning layer (issue #36). `ai` is optional on SettingsStatus so a frontend built from this
// commit still validates an older backend's settings payload; the panel treats absence as "unknown".
export type AiModuleName='case_synthesis'|'hypothesis_test'|'presentation_draft';
export type AiReviewStatus='proposed'|'accepted'|'rejected';
export type AiReasoningStatus={enabled:boolean,provider:string|null,provider_key_configured:boolean,endpoints_callable:boolean,model?:string|null,runs_on_this_computer?:boolean|null,remote_endpoint_allowed?:boolean,tas_spec:{present:boolean,version:string|null,modules:Record<string,{spec_file:string,available:boolean}>}};
// presentation_draft's request stores the goal in `question` (same field the
// other two modules use) and the reporter-picked evidence in `record_refs`.
export type AiAnalysisRequest={question?:string|null,working_theory?:string|null,max_results?:number,include_external_leads?:boolean,record_refs?:AiCitationRef[]|null};
export type AiCitationRef={record_type:string,record_id:string};
// A presentation_draft candidate's payload (app/ai/presentation_modules/PRESENTATION_DRAFT.md):
// the same draft rendered two ways -- `body` for a written brief, `key_points` for a slide.
// A section's optional visual (backend app/ai/reasoning.py VISUAL_TYPES): every data point cites its own records.
export type FigureItem={value:string,label:string,evidence:AiCitationRef[]};
export type TimelineItem={date:string,label:string,evidence:AiCitationRef[]};
export type BarItem={value:number,label:string,evidence:AiCitationRef[]};
// A visual's look (backend app/services/presentation_style.py): a named preset plus option overrides.
// Style is presentation only -- it never changes a value, a date, a label or a citation.
export type VisualOptionValue=boolean|string|string[];
export type VisualStyle={preset?:string,options?:Record<string,VisualOptionValue>};
export type StyledVisual=({type:'figures',items:FigureItem[]}|{type:'timeline',items:TimelineItem[]}|{type:'bar',title?:string,unit?:string,items:BarItem[]})&{style?:VisualStyle|null};
export type ChartDataRow={label:string,value:number,record_refs:AiCitationRef[],record_count:number,[key:string]:JsonValue|undefined};
// A part's share of the whole (100% bar, donut, treemap), a scatter plot's second number, a flow's two parties and an event's verification status (timeline) come only with those kinds.
export type ChartDataTableRow={label:string,value:number,formatted:string,record_count:number,record_refs:AiCitationRef[],share?:number,x?:number,x_formatted?:string,source?:string,target?:string,start?:string,end?:string,status?:string,latitude?:number,longitude?:number,across?:string,down?:string};
/** A chart the AI ordered and the data service cooked (backend/app/visuals): the rows, the checked ECharts drawing and the words that go with it (alt text, description, data table, source line). */
// slide_drawing: what a deck slide shows for a kind PowerPoint cannot hold
// natively (the treemap) -- the drawing at the slide's own scale, or its
// parts as bars with the reason (backend app/services/decks.py _slide_drawing).
export type SlideDrawing={option:JsonObject|null,width:number,height:number,note?:string|null};
export type ChartVisual={type:'chart',spec:JsonObject,data:{rows:ChartDataRow[],unit?:string|null,currency?:string|null}&JsonObject,option:JsonObject,width?:number,height?:number,text:{alt_text:string,description:string,source_line:string,data_table:{columns:string[],rows:ChartDataTableRow[]}},style?:VisualStyle|null,slide_drawing?:SlideDrawing|null};
export type PresentationVisual=StyledVisual|ChartVisual;
export type VisualKind=StyledVisual['type'];
// A quote the backend found word for word in the cited record (app/ai/quote_check.py).
export type QuotedRef=AiCitationRef&{matched_text:string,field?:string,locator?:string|null,start_char?:number,end_char?:number};
export type PresentationSection={heading:string,body:string,key_points:string[],key_point_evidence?:QuotedRef[][],evidence:AiCitationRef[],visual?:PresentationVisual|null};
export type PresentationDraftPayload={title:string,goal_restated:string,executive_takeaway:string,sections:PresentationSection[],open_questions:string[]};
// Readable details for a cited record (backend describe_record_refs) -- what the
// review panel shows instead of a UUID, and what an evidence chip traces.
export type CitationDetail={record_type:string,record_id:string,trace_record_type:string,type_label:string,label:string,quote:string|null,locator:string|null,source_title:string|null,source_url:string|null,detail:string|null,missing:boolean};
// Promotion targets for an accepted presentation_draft candidate (app/services/presentation.py).
export type Writeup={id:string,investigation_id:string,title:string,status:string,cited_record_refs:AiCitationRef[],content_json?:JsonObject,preview?:string,source_ai_candidate_id?:string|null,created_by?:string|null,created_at:string,updated_at:string,word_count:number};
export type DeckSlideKind='title'|'statement'|'content'|'questions';
export type DeckSlide={heading:string,bullets:string[],evidence:AiCitationRef[],kind?:DeckSlideKind,notes?:string,visual?:PresentationVisual|null};
// Deck-wide look: a theme and a font pairing, both ids from GET /api/presentation-styles.
export type DeckStyle={theme:string,fonts:string};
export type DeckTheme={id:string,label:string,description:string,cover_bg:string,cover_line:string,cover_text:string,cover_muted:string,cover_accent:string,accent:string,accent_text:string,alert:string,page:string,panel:string,rule:string,text:string,muted:string,bar_muted:string,heading_font:string,body_font:string};
export type FontPair={id:string,label:string,heading:string,body:string};
export type VisualPreset={id:string,label:string,description:string,layout:Record<string,string|boolean>,options:Record<string,VisualOptionValue>};
export type VisualOptionSpec={type:'bool'|'choice'|'labels',label:string,values?:string[]};
// A checked chart's presets and options, per chart family (backend app/services/presentation_style.py
// CHART_PRESETS, CHART_OPTIONS): an option may be for some kinds or query shapes only, and carry a warning.
export type ChartPresetSpec={id:string,label:string,description:string,kind:string,options:Record<string,VisualOptionValue>};
export type ChartOptionSpec=VisualOptionSpec&{kinds?:string[],series?:string[],warning?:string};
export type PresentationStyleCatalog={defaults:DeckStyle,themes:DeckTheme[],font_pairs:FontPair[],visual_presets:Record<VisualKind,VisualPreset[]>,visual_options:Record<VisualKind,Record<string,VisualOptionSpec>>,
  chart_families?:Record<string,string>,chart_presets?:Record<string,ChartPresetSpec[]>,chart_options?:Record<string,Record<string,ChartOptionSpec>>};
export type Deck={id:string,investigation_id:string,title:string,slides:DeckSlide[],slide_count:number,style?:DeckStyle,source_ai_candidate_id?:string|null,created_by?:string|null,created_at:string,updated_at:string};
export type AiAnalysisCandidateSummary={id:string,investigation_id:string,module:AiModuleName|string,request:AiAnalysisRequest,review_status:AiReviewStatus|string,confidence:number,reviewer_note:string|null,accepted_record_type:string|null,accepted_record_id:string|null,created_at:string,reviewed_at:string|null,checked_citation_count:number};
export type AiAnalysisCandidate=AiAnalysisCandidateSummary&{payload:JsonObject,checked_citation_ids:AiCitationRef[],trace?:JsonObject|null,citation_details?:CitationDetail[],deck_preview?:DeckSlide[]};
export type AiReasoningRunResult={candidate_id:string,review_status:AiReviewStatus|string,payload:JsonObject};
export type AiAnalysisCandidateReview={id:string,module:string,review_status:AiReviewStatus|string,reviewer_note:string|null,reviewed_at:string|null};

// Ledger from GET /api/investigations/{id}/financial-flows (canonical FtM
// Payment relationships; backend/app/services/financial_flows.py).

