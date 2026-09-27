# shadcn/ui migration notes

This PR introduces Tailwind + shadcn/ui primitives and demonstrates adoption in `app/page.tsx` without a full-file rewrite.

## Converted so far

- Top status badge now uses `Badge`
- Review queue now uses `Card` + `Table` primitives for row rendering and actions
- Sonner `Toaster` mounted in `page.tsx`
- Local investigation deletion panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` and `Input` (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- API access panel now uses `Card`/`CardHeader`/`CardTitle`/`CardContent` and `Input` (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)

Note: an earlier draft of this list claimed the API access and investigation
search panels were already converted; only API access actually was (as of
this update), and only after this session did it -- investigation search
was still plain `<section className="card">` with native `<input>`.

## Remaining hand-rolled markup (follow-up punch list)

- Investigation search and most other remaining `<section className="card">` panels are still bespoke JSX wrappers
- Most action controls still use native `<button>`, `<input>`, `<textarea>`, and `<select>`
- Dialog-like and menu-like interactions are still custom and can migrate to `Dialog` / `DropdownMenu`
- Claim/evidence and relationship workspaces still render custom list/row layouts that can migrate to `Table`, `Tabs`, and additional `Card` composition

## Follow-up strategy

1. Convert one workflow section per PR to keep risk and review size low.
2. Replace native controls in each section with matching shadcn primitives while preserving existing handlers/state.
3. Keep visual/structural-only scope (no behavior changes) and validate with `npm run typecheck` and `npm run build` each step.
