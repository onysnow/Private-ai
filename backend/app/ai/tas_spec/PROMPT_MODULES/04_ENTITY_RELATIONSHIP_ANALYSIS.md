# Module 04 — Entity and Relationship Analysis

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Resolving people, companies, properties, accounts, donors, officials, addresses, vehicles, domains, and their documented relationships.

## Prompt

```text
OBJECTIVE
Resolve entities and map evidence-supported relationships. Do not imply wrongdoing from association.

INPUTS
[EVIDENCE RECORDS / DOCUMENTS]

ENTITY RULES
1. Assign a stable ID to every material entity.
2. Preserve aliases, name variants, titles, and source spellings.
3. Do not merge entities based only on a similar name, shared address, family name, or proximity.
4. Treat roles and titles as time-bounded.

RELATIONSHIP RULES
1. Use precise directed predicates: PAID, DONATED_TO, EMPLOYED_BY, REGISTERED_AGENT_FOR, OWNED, MANAGED, COMMUNICATED_WITH, SHARED_ADDRESS_WITH, APPOINTED_BY, or ALLEGED_TO_CONTROL.
2. Avoid vague “connected to” edges.
3. Distinguish direct documentary relationships from inference and allegation.
4. Do not infer beneficial ownership, control, conspiracy, intent, or coordination from one relationship.

OUTPUT
A. Entity register
| Entity ID | Canonical name | Source aliases | Type | Time-bounded role/status | Evidence | Identity confidence |

B. Relationship register
| Relationship ID | From | Predicate | To | Start/end | Direct/inferred/alleged | Evidence and pinpoint | Limitations |

C. Merge review
List possible duplicates that were not merged and the evidence needed to resolve them.

D. Material clusters
Describe clusters neutrally. For each cluster, state whether it reflects documented transactions, employment, ownership, shared contact information, social proximity, or an allegation.

E. Unsupported-attribution audit
Identify every proposed relationship that lacks adequate evidence or overstates what the cited record establishes.
```

