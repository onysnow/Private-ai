// Who proposed a proposal, in a reporter's words (research §1: "Name-finder (rules)", "OpenAleph", "You"),
// from the rule its payload records (payload.rationale.rule). The reading room names each proposal by it;
// the Drop's read receipt counts what each proposer's proposals came to.

const PROPOSER: Record<string, string> = {capitalized_name_sequence: 'Name-finder (rules)', sentence_assertion: 'Claim-finder (rules)', whole_chunk: 'Passage (whole)',
  openaleph_ingest_file: 'OpenAleph', openaleph_ftm_analyze: 'OpenAleph', column_mapping: 'Column mapping', reporter_staged: 'You'};

/** The proposer a rule names; a proposal that records no rule was made by "The reader". */
export function proposerName(rule: string): string {
  return PROPOSER[rule] ?? (rule.startsWith('openaleph') ? 'OpenAleph' : 'The reader');
}
