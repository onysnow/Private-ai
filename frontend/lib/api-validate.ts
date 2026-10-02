import type {CanonicalEntity, DocItem, ExtractionCandidate, ExtractionExplanation, Claim, Investigation, LeadItem, SearchResult, TimelineEvent, SettingsStatus, AiReasoningStatus, AiAnalysisCandidateSummary, AiAnalysisCandidate, AiReasoningRunResult, AiAnalysisCandidateReview, SecurityAlerts, InvestigationDeletionPreview, InvestigationDeletionResult, Writeup, Deck, PresentationStyleCatalog, BackgroundJob} from './api-types';

type Obj=Record<string,unknown>;
export class ApiPayloadError extends Error {
  constructor(public endpoint:string, public issue:string){super(`Invalid API payload from ${endpoint}: ${issue}`);this.name='ApiPayloadError';}
}
const isObj=(v:unknown):v is Obj=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(o:Obj,k:string)=>typeof o[k]==='string';
const num=(o:Obj,k:string)=>typeof o[k]==='number'&&Number.isFinite(o[k] as number);
const arr=(o:Obj,k:string)=>Array.isArray(o[k]);
const optStr=(o:Obj,k:string)=>o[k]===undefined||o[k]===null||typeof o[k]==='string';
const record=(o:Obj,k:string)=>isObj(o[k]);
const fail=(endpoint:string,issue:string):never=>{throw new ApiPayloadError(endpoint,issue)};
const arrayOf=<T>(value:unknown,endpoint:string,name:string,guard:(v:unknown)=>v is T):T[]=>{
  if(!Array.isArray(value))return fail(endpoint,`${name} must be an array`);
  const rows:unknown[]=value;
  rows.forEach((item:unknown,i:number)=>{if(!guard(item))fail(endpoint,`${name}[${i}] has an unexpected shape`)});
  return rows as T[];
};

export const isClaim=(v:unknown):v is Claim=>isObj(v)&&str(v,'id')&&str(v,'investigation_id')&&str(v,'text')&&str(v,'status')&&num(v,'confidence');

const isConnectorStatus=(v:unknown)=>isObj(v)&&typeof v.configured==='boolean'&&(v.source===undefined||['local_store','environment','none'].includes(String(v.source)))&&(v.local_store_present===undefined||typeof v.local_store_present==='boolean')&&(v.permissions_restricted===undefined||typeof v.permissions_restricted==='boolean');
export const isAiReasoningStatus=(v:unknown):v is AiReasoningStatus=>isObj(v)&&typeof v.enabled==='boolean'&&(v.provider===null||typeof v.provider==='string')&&typeof v.provider_key_configured==='boolean'&&typeof v.endpoints_callable==='boolean'&&isObj(v.tas_spec)&&typeof v.tas_spec.present==='boolean'&&(v.tas_spec.version===null||typeof v.tas_spec.version==='string')&&isObj(v.tas_spec.modules)&&Object.values(v.tas_spec.modules).every(m=>isObj(m)&&str(m,'spec_file')&&typeof m.available==='boolean');
export const isAiAnalysisCandidateSummary=(v:unknown):v is AiAnalysisCandidateSummary=>isObj(v)&&str(v,'id')&&str(v,'investigation_id')&&str(v,'module')&&record(v,'request')&&str(v,'review_status')&&num(v,'confidence')&&optStr(v,'reviewer_note')&&optStr(v,'accepted_record_type')&&optStr(v,'accepted_record_id')&&str(v,'created_at')&&optStr(v,'reviewed_at')&&num(v,'checked_citation_count');
export const isAiAnalysisCandidate=(v:unknown):v is AiAnalysisCandidate=>isAiAnalysisCandidateSummary(v)&&record(v as Obj,'payload')&&arr(v as Obj,'checked_citation_ids')&&((v as Obj).checked_citation_ids as unknown[]).every(c=>isObj(c)&&str(c,'record_type')&&str(c,'record_id'))&&((v as Obj).citation_details===undefined||(Array.isArray((v as Obj).citation_details)&&((v as Obj).citation_details as unknown[]).every(d=>isObj(d)&&str(d,'record_type')&&str(d,'record_id')&&str(d,'label')&&str(d,'type_label'))))&&((v as Obj).deck_preview===undefined||(Array.isArray((v as Obj).deck_preview)&&((v as Obj).deck_preview as unknown[]).every(s=>isObj(s)&&str(s,'heading')&&arr(s,'bullets'))));
export const isAiReasoningRunResult=(v:unknown):v is AiReasoningRunResult=>isObj(v)&&str(v,'candidate_id')&&str(v,'review_status')&&record(v,'payload');
export const isAiAnalysisCandidateReview=(v:unknown):v is AiAnalysisCandidateReview=>isObj(v)&&str(v,'id')&&str(v,'module')&&str(v,'review_status')&&optStr(v,'reviewer_note')&&optStr(v,'reviewed_at');
export const parseAiAnalysisCandidateList=(value:unknown,endpoint:string):AiAnalysisCandidateSummary[]=>isObj(value)?arrayOf(value.candidates,endpoint,'candidates',isAiAnalysisCandidateSummary):fail(endpoint,'expected an object with a candidates array');
const isCitationRef=(v:unknown):boolean=>isObj(v)&&str(v,'record_type')&&str(v,'record_id');
export const isWriteup=(v:unknown):v is Writeup=>isObj(v)&&str(v,'id')&&str(v,'investigation_id')&&str(v,'title')&&str(v,'status')&&arr(v,'cited_record_refs')&&(v.cited_record_refs as unknown[]).every(isCitationRef)&&str(v,'created_at')&&str(v,'updated_at')&&num(v,'word_count');
const isTheme=(v:unknown):boolean=>isObj(v)&&['id','label','cover_bg','cover_text','cover_muted','cover_accent','accent','accent_text','alert','page','panel','rule','text','muted','bar_muted','heading_font','body_font'].every(k=>str(v,k));
export const isPresentationStyleCatalog=(v:unknown):v is PresentationStyleCatalog=>isObj(v)&&isObj(v.defaults)&&str(v.defaults,'theme')&&str(v.defaults,'fonts')&&arr(v,'themes')&&(v.themes as unknown[]).length>0&&(v.themes as unknown[]).every(isTheme)&&arr(v,'font_pairs')&&(v.font_pairs as unknown[]).every(f=>isObj(f)&&str(f,'id')&&str(f,'label')&&typeof f.heading==='string'&&typeof f.body==='string')&&isObj(v.visual_presets)&&isObj(v.visual_options)&&(['bar','timeline','figures'] as const).every(k=>Array.isArray((v.visual_presets as Record<string,unknown>)[k])&&isObj((v.visual_options as Record<string,unknown>)[k]));
export const isDeck=(v:unknown):v is Deck=>isObj(v)&&str(v,'id')&&str(v,'investigation_id')&&str(v,'title')&&arr(v,'slides')&&(v.slides as unknown[]).every(s=>isObj(s)&&str(s,'heading')&&arr(s,'bullets')&&arr(s,'evidence')&&(s.evidence as unknown[]).every(isCitationRef))&&num(v,'slide_count')&&str(v,'created_at')&&str(v,'updated_at');
export const isSecurityAlerts=(v:unknown):v is SecurityAlerts=>isObj(v)&&num(v,'window_hours')&&str(v,'since')&&num(v,'total_denials')&&record(v,'by_event')&&arr(v,'remote_hosts')&&arr(v,'recent')&&num(v,'attention_threshold')&&typeof v.needs_attention==='boolean';
export const isSettingsStatus=(v:unknown):v is SettingsStatus=>isObj(v)&&str(v,'environment')&&str(v,'database')&&str(v,'document_storage_dir')&&record(v,'limits')&&typeof v.restore_api_enabled==='boolean'&&isObj(v.document_extraction)&&typeof v.document_extraction.pdf_ocr_enabled==='boolean'&&str(v.document_extraction,'pdf_ocr_language')&&num(v.document_extraction,'pdf_ocr_dpi')&&num(v.document_extraction,'pdf_ocr_min_native_chars')&&typeof v.document_extraction.local_entity_suggestions_enabled==='boolean'&&['workbench_local','openaleph_ftm_analyze'].includes(String(v.document_extraction.entity_extraction_owner))&&isObj(v.document_extraction.ocr_runtime)&&typeof v.document_extraction.ocr_runtime.available==='boolean'&&arr(v.document_extraction.ocr_runtime,'requested_languages')&&arr(v.document_extraction.ocr_runtime,'missing_languages')&&optStr(v.document_extraction.ocr_runtime,'detail')&&isObj(v.access)&&typeof v.access.remote_api_enabled==='boolean'&&['local_only','shared_bearer','persisted_users'].includes(String(v.access.mode))&&typeof v.access.token_configured==='boolean'&&arr(v,'cors_allowed_origins')&&isObj(v.connectors)&&Object.values(v.connectors).every(isConnectorStatus)&&(v.ai===undefined||isAiReasoningStatus(v.ai))&&(v.security===undefined||isSecurityAlerts(v.security));
export const isInvestigationDeletionPreview=(v:unknown):v is InvestigationDeletionPreview=>isObj(v)&&str(v,'investigation_id')&&str(v,'investigation_name')&&record(v,'record_counts')&&num(v,'record_total')&&arr(v,'document_files')&&record(v,'document_file_summary')&&arr(v,'unsafe_paths')&&typeof v.can_delete==='boolean'&&str(v,'requires_confirmation');
export const isInvestigationDeletionResult=(v:unknown):v is InvestigationDeletionResult=>isObj(v)&&str(v,'investigation_id')&&typeof v.deleted==='boolean'&&record(v,'deleted_record_counts')&&num(v,'deleted_record_total')&&num(v,'document_files_deleted')&&num(v,'shared_document_files_preserved')&&num(v,'missing_document_files');
export const isInvestigation=(v:unknown):v is Investigation=>isObj(v)&&str(v,'id')&&str(v,'name');
export const isCanonicalEntity=(v:unknown):v is CanonicalEntity=>isObj(v)&&str(v,'id')&&str(v,'caption')&&str(v,'schema')&&record(v,'properties');
export const isTimelineEvent=(v:unknown):v is TimelineEvent=>isObj(v)&&str(v,'id')&&str(v,'kind')&&str(v,'title')&&str(v,'date_start')&&str(v,'precision')&&str(v,'verification_status')&&record(v,'provenance')&&record(v,'refs');
export const isSearchResult=(v:unknown):v is SearchResult=>isObj(v)&&str(v,'type')&&['canonical','evidence','reporting','workflow','review','external_lead','other'].includes(String(v.group))&&str(v,'id')&&str(v,'investigation_id')&&str(v,'title')&&str(v,'snippet')&&num(v,'score')&&record(v,'provenance')&&record(v,'metadata');
const isDocumentChunk=(v:unknown)=>isObj(v)&&str(v,'id')&&str(v,'document_id')&&num(v,'ordinal')&&str(v,'locator')&&str(v,'text')&&(v.page_number===undefined||v.page_number===null||typeof v.page_number==='number');
const JOB_STATUSES=['queued','running','succeeded','failed','cancelled'];
export const isBackgroundJob=(v:unknown):v is BackgroundJob=>isObj(v)&&str(v,'id')&&str(v,'kind')&&optStr(v,'investigation_id')&&optStr(v,'subject_type')&&optStr(v,'subject_id')&&JOB_STATUSES.includes(String(v.status))&&typeof v.finished==='boolean'&&optNum(v,'progress')&&optStr(v,'message')&&optStr(v,'error')&&num(v,'attempts')&&str(v,'runner');
export const isDocItem=(v:unknown):v is DocItem=>isObj(v)&&str(v,'id')&&str(v,'filename')&&str(v,'source_id')&&str(v,'extraction_status')&&optStr(v,'extraction_error')&&(v.extraction_issues===undefined||(arr(v,'extraction_issues')&&(v.extraction_issues as unknown[]).every(x=>typeof x==='string')))&&num(v,'chunk_count')&&record(v,'candidate_counts')&&(v.chunks===undefined||(arr(v,'chunks')&&(v.chunks as unknown[]).every(isDocumentChunk)))&&(v.job===undefined||v.job===null||isBackgroundJob(v.job));
const isExcerpt=(v:unknown)=>isObj(v)&&str(v,'before')&&str(v,'match')&&str(v,'after')&&num(v,'start_char')&&num(v,'end_char');
const isExplanationSource=(v:unknown)=>isObj(v)&&str(v,'kind')&&optStr(v,'id')&&optStr(v,'label')&&optStr(v,'locator')&&(v.excerpt===undefined||v.excerpt===null||isExcerpt(v.excerpt));
const isExplanationPart=(v:unknown)=>isObj(v)&&str(v,'id')&&str(v,'label')&&'value' in v&&arr(v,'reasoning')&&(v.reasoning as unknown[]).every(r=>typeof r==='string')&&arr(v,'sources')&&(v.sources as unknown[]).every(isExplanationSource);
export const isExtractionExplanation=(v:unknown):v is ExtractionExplanation=>isObj(v)&&str(v,'candidate_id')&&str(v,'candidate_type')&&str(v,'review_status')&&str(v,'summary')&&record(v,'method')&&str(v.method as Obj,'id')&&str(v.method as Obj,'label')&&str(v.method as Obj,'description')&&typeof (v.method as Obj).automated==='boolean'&&['recorded','reconstructed','provider','reporter'].includes(String(v.rationale_basis))&&record(v,'confidence')&&str(v.confidence as Obj,'basis')&&((v.confidence as Obj).value===null||num(v.confidence as Obj,'value'))&&arr(v,'parts')&&(v.parts as unknown[]).every(isExplanationPart)&&arr(v,'sources')&&(v.sources as unknown[]).every(isExplanationSource)&&arr(v,'caveats')&&(v.caveats as unknown[]).every(c=>typeof c==='string')&&str(v,'review_rule');
export const isExtractionCandidate=(v:unknown):v is ExtractionCandidate=>isObj(v)&&str(v,'id')&&str(v,'candidate_type')&&record(v,'payload')&&str(v,'review_status')&&(v.explanation===undefined||isExtractionExplanation(v.explanation));
export const isLeadItem=(v:unknown):v is LeadItem=>isObj(v)&&str(v,'id')&&str(v,'title')&&str(v,'status')&&str(v,'priority')&&arr(v,'links')&&arr(v,'tasks')&&isObj(v.triage)&&typeof v.triage.needs_attention==='boolean'&&num(v.triage,'attention_score')&&isObj(v.triage.stance_counts)&&num(v.triage.stance_counts,'supports')&&num(v.triage.stance_counts,'contradicts')&&num(v.triage.stance_counts,'context')&&num(v.triage,'linked_claim_count')&&num(v.triage,'disputed_claim_count')&&arr(v.triage,'reasons');

export async function jsonUnknown(response:Response,endpoint:string):Promise<unknown>{
  try{return await response.json()}catch{fail(endpoint,'response was not valid JSON')}
}
export async function jsonArray<T>(response:Response,endpoint:string,name:string,guard:(v:unknown)=>v is T):Promise<T[]>{
  return arrayOf(await jsonUnknown(response,endpoint),endpoint,name,guard);
}
export async function jsonObject<T>(response:Response,endpoint:string,name:string,guard:(v:unknown)=>v is T):Promise<T>{
  const value=await jsonUnknown(response,endpoint);if(!guard(value))return fail(endpoint,`${name} has an unexpected shape`);return value;
}
export function parseInvestigationList(v:unknown,e:string):Investigation[]{return arrayOf(v,e,'investigations',isInvestigation)}
export function parseEntityList(v:unknown,e:string):CanonicalEntity[]{return arrayOf(v,e,'entities',isCanonicalEntity)}
export function parseTimelineBody(v:unknown,e:string):{events:TimelineEvent[],verification_counts:Record<string,number>}{if(!isObj(v))return fail(e,'timeline body has an unexpected shape');const events=v.events,counts=v.verification_counts;if(!Array.isArray(events)||!isObj(counts))return fail(e,'timeline body has an unexpected shape');return {events:arrayOf(events,e,'events',isTimelineEvent),verification_counts:counts as Record<string,number>}}
export function parseSearchBody(v:unknown,e:string):{results:SearchResult[],counts:Record<string,number>,group_counts:Record<string,number>}{if(!isObj(v))return fail(e,'search body has an unexpected shape');const results=v.results,counts=v.counts,groupCounts=v.group_counts;if(!Array.isArray(results)||!isObj(counts)||!isObj(groupCounts))return fail(e,'search body has an unexpected shape');return {results:arrayOf(results,e,'results',isSearchResult),counts:counts as Record<string,number>,group_counts:groupCounts as Record<string,number>}}
export function parseLeadQueue(v:unknown,e:string):LeadItem[]{if(!isObj(v))return fail(e,'lead queue has an unexpected shape');const items=v.items;if(!Array.isArray(items))return fail(e,'lead queue has an unexpected shape');return arrayOf(items,e,'items',isLeadItem)}



const optNum=(o:Obj,k:string)=>o[k]===null||num(o,k);

