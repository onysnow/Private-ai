# Source Authority and Retrieval Policy

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## 1. Purpose

This policy governs how the project selects, retrieves, labels, cites, and reconciles information. It is designed to prevent two recurring failures: treating every source as equally authoritative and allowing retrieval results to become untraceable narrative claims.

## 2. Authority is claim-specific

A source can be authoritative for one proposition and weak for another. A corporate filing may be authoritative for the name filed on a particular date but not for the accuracy of every factual assertion in the filing. A witness is authoritative about what they personally observed, not necessarily about motive or events they learned secondhand.

Evaluate authority for the exact claim using:

- proximity to the event;
- first-hand versus hearsay knowledge;
- legal or institutional responsibility for the record;
- contemporaneity;
- independence;
- authentication and chain of custody;
- completeness;
- incentives and conflicts;
- consistency with other evidence; and
- whether the source is reporting a fact, repeating an allegation, or offering analysis.

## 3. Default source tiers

| Tier | Source type | Normal use |
|---|---|---|
| A | Authenticated evidence; certified or official primary records; controlling law | Establish document contents, legal status, dates, amounts, ownership records, official acts |
| B | Other primary material; direct testimony; first-party records; current official datasets | Establish attributed statements and event details, subject to corroboration and authenticity |
| C | Recognized institutional methodology; peer-reviewed research; official guidance | Define methods, terminology, and analytical procedures |
| D | High-quality investigative reporting with identifiable sources and corrections practices | Corroboration, context, leads, and synthesis |
| E | Other secondary reporting, trade publications, databases with opaque methods | Leads and provisional context |
| F | Social posts, anonymous tips, community repositories, prompt libraries | Leads or engineering examples only unless independently verified |

## 4. Retrieval log

For a material external search, record:

| Field | Requirement |
|---|---|
| Search objective | The fact, record, entity, or relationship sought |
| Systems searched | Databases, repositories, court systems, archives, or websites |
| Query terms | Exact names, aliases, date ranges, identifiers, addresses, and filters |
| Search date/time | Include timezone when material |
| Results reviewed | Sufficient detail to reproduce the search |
| Responsive records | Stable URL, docket/filing ID, document title, or database record ID |
| Negative result | State only that no responsive result was found within the recorded scope |
| Access limits | Paywall, blocked index, sealed record, unavailable archive, OCR failure, or incomplete coverage |

## 5. Claim-level citation rule

Every material claim in a final product must be traceable to:

- an exact evidence identifier; or
- a filename plus page/line/paragraph/timestamp; or
- a stable public record identifier; or
- a direct canonical URL with retrieval date.

Do not cite a folder, search-results page, or entire corpus when a more precise location exists.

## 6. Source isolation

When the task says “use only these files,” do not import facts from memory, earlier chats, other case files, or web results. External knowledge may be used only to explain general concepts if clearly labeled and permitted.

When web research is allowed, keep two layers:

- **case evidence layer** — supplied or obtained records used to support case claims;
- **context layer** — laws, methodology, background, and explanatory sources.

Never let context sources silently fill evidentiary gaps.

## 7. Conflicts

When sources conflict:

1. preserve both accounts;
2. determine whether they address the same event, time, entity, and definition;
3. compare authority, independence, and contemporaneity;
4. look for a third source capable of resolving the conflict;
5. state the conflict if it remains unresolved;
6. do not average incompatible claims or choose the more convenient account.

## 8. Web-only and inaccessible originals

If an authoritative source cannot be downloaded:

- retain the canonical URL, title, publisher, date/version, retrieval date, and access limitation;
- use a verified mirror only if its identity and document match can be checked;
- label the mirror as a mirror;
- do not present a summary or OCR extract as the original document;
- hash any archived copy and record its origin.

## 9. Model-specific prompt sources

For prompting behavior, apply this priority:

1. current first-party guidance for the active model and product surface;
2. current first-party general guidance from the model provider;
3. tested internal evaluation results;
4. cross-provider best practices;
5. academic taxonomies and older prompt literature;
6. community prompt collections.

Techniques such as forced chain-of-thought, elaborate personas, or excessive step instructions must not be treated as universal defaults. Test them against the active model and task.

