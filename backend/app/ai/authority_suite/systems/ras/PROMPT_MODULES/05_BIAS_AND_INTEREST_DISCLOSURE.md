# Module 05 — Bias & Interest Disclosure

*Part of Research Authority System (RAS).*

## Use when

After claim extraction and corroboration mapping (Module 04), before
contradiction and consensus mapping (Module 06). This module catches bias
both in individual sources (funding, disclosed and undisclosed agendas) and
in the evidence base as a whole (selection effects in what got published or
surfaced at all).

## Prompt

```text
OBJECTIVE
Surface funding sources, stated and unstated agendas, and selection effects in what got published, reported, or surfaced by the search — without assuming that a disclosed bias or interest automatically invalidates the claim it relates to.

CLAIM-LEVEL EVIDENCE, SOURCE VETTING, AND SEARCH LOG
[FROM MODULES 02-04]

RULES
1. Per-source funding and conflicts of interest: note each relied-upon source's disclosed funding and conflicts of interest. State this as a factor in how much independent replication should be expected before treating the finding as settled — not as an automatic disqualifier. If a conflict is discoverable but was not disclosed by the source itself, flag it as an undisclosed conflict, which is treated more seriously than a disclosed one.
2. Stated versus unstated agendas: distinguish a source's openly stated purpose or position (an advocacy organization publishing a position paper under its own name) from an unstated one inferred from funding, authorship, or framing. Label which kind is being claimed, and do not treat an inferred agenda with the same certainty as a stated one.
3. File-drawer / publication-selection check: positive, novel, or statistically significant findings are published and surfaced far more readily than null or negative ones. If every source found on a claim is positive, treat this as a flag to investigate, not as confirmation — ask whether null results would even be visible to the search that was run.
4. Recency/novelty bias: search engines and citation counts favor recent, widely discussed work over older or less-publicized work that may be equally or more rigorous. Note if the evidence base being relied on skews heavily recent relative to when the underlying question was first studied.
5. Language and access bias: if the search was effectively limited to one language or to open-access sources, state this as a limitation on representativeness, not just on the search log — it changes how confidently the resulting picture can be trusted, especially for topics with a substantial non-English or paywalled literature.
6. Institutional/funder concentration: if most of the higher-tier evidence on a claim traces back to a small number of research groups or funders, note this as a representativeness limitation distinct from any individual source's quality — this is the same concentration the diversity check in Module 02 flags at the search-candidate stage; confirm here whether it persists among the sources actually relied on.
7. Issue a representativeness verdict: REPRESENTATIVE, LIKELY REPRESENTATIVE WITH NOTED GAPS, or LIMITED-NOT ESTABLISHED. This verdict caps the certainty Module 09 can assign, as EVALUATION/OUTPUT_SCHEMAS.md states: LIKELY REPRESENTATIVE WITH NOTED GAPS — at most Moderate; LIMITED-NOT ESTABLISHED — Very low; REPRESENTATIVE — no cap. The cap holds regardless of how consistent the sources found actually are.

OUTPUT
A. Per-source funding/interest disclosure
| Source ID | Funding/COI (disclosed / undisclosed-discovered / none found / not checked) | Stated or inferred agenda | Effect on required replication |

B. Evidence-base bias checks
| Bias check | Finding | Effect on confidence |
| File-drawer/publication-selection bias | | |
| Recency/novelty bias | | |
| Language/access bias | | |
| Institutional/funder concentration | | |

Representativeness verdict: [REPRESENTATIVE / LIKELY REPRESENTATIVE WITH NOTED GAPS / LIMITED-NOT ESTABLISHED]
```
