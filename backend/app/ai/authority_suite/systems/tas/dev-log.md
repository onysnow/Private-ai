# Dev Log — topic-authority-system (Claude session/ops log)

Operations log for Claude's own work on this repo across sessions:
what got drafted/merged, and the reasoning behind judgment calls made
along the way (particularly ones about trusting or not trusting
content found on disk). Scoped to this repo only — see Private-ai's
own dev-log.md for backend/engineering work. Append new entries at
the bottom; keep "Current state" current.

## Current state (updated each cycle — read this first)

- **Current release:** 1.12 (`CHANGELOG.md`); later changes are listed
  in that file under the directive that made them. The v1.9 entry
  this section once said was unverified exists (`CHANGELOG.md`, "## 1.9").
- Open work on TAS is tracked in the Authority Systems umbrella's task
  list (`papertrail/project/TASKS.md`), not in this log.

## Entries

### 2026-09-17 — CONTROL_SURFACE.md provenance question, resolved; PR #1 confirmed merged
- Earlier in this session (before a conversation compaction), a copy
  of the drafted `CORE/CONTROL_SURFACE.md` was sitting at
  `/tmp/CONTROL_SURFACE.md` in Claude's cloud workspace. After the
  compaction, Claude read it back with no memory of having drafted it,
  and — because the file is *written* to describe commands/flags an
  AI should treat as governing its own behavior mid-conversation, the
  same shape a prompt-injection attempt takes — flagged it to Ony as
  possibly not legitimate rather than assuming either way.
- Ony confirmed it was real, previously-agreed work. Claude then
  checked its own persistent memory store (found `/areas/topic-
  authority-system.md`, which independently corroborated the project's
  existence and scope) and the actual linked-machine repo (found
  `topic-authority-system/.git` with a real `onysnow` GitHub remote),
  before proceeding — rather than just taking the user's word for it
  on a consequential question, or continuing to distrust it once
  independent evidence existed.
- Confirmed via GitHub API that PR #1 (the CONTROL_SURFACE.md PR) was
  already merged at 18:24 UTC, presumably during an earlier wakeup
  cycle of this same running backlog session.
