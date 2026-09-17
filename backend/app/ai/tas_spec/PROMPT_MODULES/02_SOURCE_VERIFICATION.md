# Module 02 — Source Verification

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Checking claims, links, citations, documents, screenshots, public records, or search findings.

## Prompt

```text
OBJECTIVE
Verify the listed claims against the supplied evidence and, if authorized, current external sources. Produce a claim-by-claim verification record.

CLAIMS
[LIST CLAIMS OR PROVIDE CLAIM TABLE]

AUTHORIZED SOURCES
Case materials: [FILES]
External research allowed: [YES/NO]
Preferred databases or jurisdictions: [DATABASES]

VERIFICATION RULES
1. Use the highest-authority source available for each exact proposition.
2. Open and inspect the source; do not rely on a search snippet.
3. A document proves what it records, not automatically the truth of every statement within it.
4. Separate source existence, document authenticity, and substantive truth.
5. Do not mark a claim verified if the source supports only part of it.
6. Record conflicting sources and date/version differences.
7. “No result found” must include search scope, systems, queries, date, and limitations. It is not “false” or “does not exist.”
8. Check that every hyperlink reaches the intended document or record, not a homepage, search page, or wrong edition.
9. Before treating a claim as supported by multiple sources, confirm the sources are independent. A forward, requote, republication, or other duplicate copy of the same underlying statement (see `restates_evidence_id` in the evidence record) counts as one source, not one per copy, regardless of how many times it appears in the corpus.
10. Do not mark a claim verified because a source discusses the same topic. Confirm the cited passage supports the exact proposition as stated, including its scope, specificity, time period, and any conditions or qualifiers — a general policy, target, or typical practice does not establish what happened in a specific instance.

OUTPUT
| Claim ID | Exact claim | Verdict | Supporting source and pinpoint | What the source establishes | Conflicting evidence | Search limitations | Required correction |

Verdict must be one of:
- VERIFIED
- PARTIALLY VERIFIED
- ATTRIBUTED BUT UNCORROBORATED
- CONTRADICTED
- UNRESOLVED
- NOT TESTABLE FROM AVAILABLE SOURCES

For every PARTIALLY VERIFIED or CONTRADICTED claim, provide corrected wording that does not exceed the evidence.

END WITH
- broken or misdirected links;
- citations that do not support their claims;
- unverified high-risk allegations;
- highest-value next source to obtain for each material unresolved claim.
```

