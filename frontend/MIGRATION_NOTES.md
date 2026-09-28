# shadcn/ui migration notes

This PR introduces Tailwind + shadcn/ui primitives and demonstrates adoption in `app/page.tsx` without a full-file rewrite.

## Converted so far

- Top status badge now uses `Badge`
- Review queue now uses `Card` + `Table` primitives for row rendering and actions
- Sonner `Toaster` mounted in `page.tsx`
- Local investigation deletion panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` and `Input` (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- API access panel now uses `Card`/`CardHeader`/`CardTitle`/`CardContent` and `Input` (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- Source & exact evidence capture panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` and `Input` for its three text fields; its `<select>` (source type) is untouched -- no shadcn `Select` is wired up yet, and adding one is a bigger, separate step than this pass's scope (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- Investigation search panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` and `Input` for its query field; the "include reviewed duplicates" checkbox is untouched, same reason as the `<select>`s above -- no shadcn `Checkbox` component exists in `components/ui/` yet (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)

Note: an earlier draft of this list claimed the API access and investigation
search panels were already converted; only API access actually was (as of
this update), and only after this session did it -- investigation search
was still plain `<section className="card">` with native `<input>` until
this update too.

## Remaining hand-rolled markup (follow-up punch list)

- Provenance trace, backup/restore, timeline, document ingestion, leads, claim workspace, external connectors, and relationship graph panels are still bespoke `<section className="card">` wrappers
- No section has migrated a `<select>` to a shadcn `Select`, or a checkbox to a shadcn `Checkbox`, yet -- neither component exists in `components/ui/` yet; adding either is its own PR (a `Select` also means wiring Radix's `onValueChange`-style API in place of plain `onChange`)
- Most action controls still use native `<button>`, `<input>`, `<textarea>`, and `<select>`
- Dialog-like and menu-like interactions are still custom and can migrate to `Dialog` / `DropdownMenu`
- Claim/evidence and relationship workspaces still render custom list/row layouts that can migrate to `Table`, `Tabs`, and additional `Card` composition

## Follow-up strategy

1. Convert one workflow section per PR to keep risk and review size low.
2. Replace native controls in each section with matching shadcn primitives while preserving existing handlers/state.
3. Keep visual/structural-only scope (no behavior changes) and validate with `npm run typecheck` and `npm run build` each step.
