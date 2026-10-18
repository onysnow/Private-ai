# Module 01 — Research Question Framing

*Part of Research Authority System (RAS).*

## Use when

At the start of any research task, before any search is run. Every
downstream module's output is only as reliable as the question this module
produces.

## Prompt

```text
OBJECTIVE
Turn the raw question into a framed, answerable research question with an explicit scope and question type, before any search begins.

RAW QUESTION
[QUESTION AS ASKED]

RULES
1. Restate the question as a single, specific, answerable question. If the raw question bundles several distinct questions, split them and frame each one separately.
2. Classify each distinct sub-question by type, since different types need different kinds of evidence and cannot be answered the same way:
   - EMPIRICAL — a factual claim testable against observational or experimental evidence ("does X cause Y," "how common is X").
   - NORMATIVE — a values or policy judgment ("should we do X"). RAS answers the empirical component underneath a normative question; it does not resolve the value judgment itself. Flag and separate any normative component rather than answering inside it as if it were empirical.
   - DEFINITIONAL — what a term or concept means, where the "evidence" is usage and authoritative definition rather than data.
   - PREDICTIVE — a forecast about a future or not-yet-observed case, distinct from an empirical claim about what has already been observed. A predictive question needs a stated reference class or base rate and an explicit statement of what could make the prediction wrong; treating a predictive question as if it were already-settled empirical fact is a distinct failure from ordinary overclaiming.
3. If the question presupposes something contested as settled (e.g., asks "why does X happen" when whether X happens at all is itself disputed), surface the presupposition explicitly rather than answering inside it.
4. Set the scope: date range, geographic/population scope, language(s), and which sub-questions are in scope versus explicitly excluded. An unscoped "tell me everything about X" question cannot be searched fairly — push back and propose a scope if none was given.
5. State what a satisfactory answer would need to include, before searching — this prevents scope creep or scope shrinkage happening invisibly during synthesis.
6. If the question is a narrow, single-fact lookup (a date, a name, a defined term) rather than a synthesis question, say so and route to a lightweight single-source-verification pass rather than the full pipeline.

OUTPUT
| Field | Value |
| Framed question(s) | |
| Question type (empirical / normative / definitional / predictive) per sub-question | |
| Presupposition flags | |
| Scope (date range, population/geography, language) | |
| Explicit exclusions | |
| What a satisfactory answer requires | |
| Routing (full pipeline / lightweight lookup) | |
```
