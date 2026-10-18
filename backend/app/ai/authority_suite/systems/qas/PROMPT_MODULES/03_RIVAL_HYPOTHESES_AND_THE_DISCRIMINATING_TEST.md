# Module 03 — Rival Hypotheses and the Discriminating Test

*Part of Quantitative Analysis System (QAS).*

## Use when

The question is COMPARATIVE or a THEORY TEST, after framing and before the
confirmatory analysis. A labelled exploratory pass may come first.

## Prompt

```text
OBJECTIVE
List the rival explanations that can be identified for the expected pattern,
write what each predicts, and design a check whose outcome would count
against one or more of them. Repeat with the survivors.

INPUTS
- The QFRM record; QDAT and QCLN records
- Any exploratory output already produced

RULES
1. An exploratory pass is allowed before rivals are fixed, for example when
   describing a new dataset. Mark it EXPLORATORY in the QRIV record. A pattern
   found in it is recorded as a candidate to test, not as a tested result,
   and is reported as exploratory. (QS-16, QS-02, QS-12)
2. Before the confirmatory analysis, list the rival explanations that can be
   identified, covering at least: chance; a data or measurement artefact;
   the effect running the other way (logic); different make-up of the groups
   compared; a common cause; several partial causes acting together (QS-11,
   QS-09, QS-06). Record each rival's category. (logic)
3. Label the list "rivals identified so far", not "all rivals". A rival found
   later is added with its date. (QS-15)
4. For each rival write the prediction it makes about data that exist or can
   be obtained. Mark which predictions differ between rivals; only those can
   tell rivals apart. (QS-07, QS-16)
5. Design the discriminating check: an analysis whose possible outcomes would
   each count against one or more rivals. Before running it, write which
   outcome counts against which rival. (QS-07)
6. List the assumptions the check relies on (data complete, measures
   accurate, model suitable). A result counts against a rival only given
   those assumptions; record them beside the result. (QS-15)
7. After the check, record which rivals remain. One check rarely settles the
   rivals by itself; state which remain open and design the next check. Record
   each round. (QS-15, QS-07, QS-16)
8. Write down the weak points of the check's design. A badly designed check
   can mislead. (QS-16)
9. When citing the method, cite Chamberlin for keeping several hypotheses
   open and Platt for the steps. Do not state that the method is shown to
   speed discovery; that claim was asserted, not demonstrated. (QS-06, QS-07,
   QS-15)
10. If no discriminating check is possible with the data held, record that
    and list the data that would make one possible. (logic)

OUTPUT
QRIV record:
| rival_set_id | QRIV-NNNN | framing_id |
| phase | EXPLORATORY / CONFIRMATORY |
| rivals_identified_so_far | rival, category, prediction, differs_from, added_on |
| check | design, outcome -> rivals it counts against, assumptions, weak points |
| round | number, written_at (date and time) |
| remaining_rivals | |
| data_needed | |
```
