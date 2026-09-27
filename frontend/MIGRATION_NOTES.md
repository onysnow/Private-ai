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
- Investigation timeline panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` and `Input` for its two text fields (event title, event date); its two `<select>`s (precision, status) are untouched, same reason as above (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- Questions & reporting leads panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Input` for its title/owner fields, and `Textarea` for the detail field; its priority `<select>` is untouched (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`). While converting this panel, found that `components/ui/select.tsx` has existed since the original shadcn adoption commit (#27) -- it is a real Radix-backed `Select`, just unused everywhere in the app; the earlier notes below claiming "no shadcn `Select` ... exists in `components/ui/` yet" were wrong on that point. `components/ui/textarea.tsx` also already existed and was already used by `entity-form.tsx`. No `Checkbox` component exists, so that part of the earlier notes stands.
- Provenance trace panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` (2026-09-27; no form controls in this panel, so no `Input`/`Select` changes -- structural wrapper only; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)
- Document ingestion & extraction panel now uses `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`; its document-title text `<input>` and its file `<input type="file">` both swapped to `Input` (the shadcn `Input` wraps a plain `<input>`, so `type="file"` works through it unchanged), as did the relationship-schema text `<input>` inside the "stage relationship from reviewed claim" sub-panel; the two entity-picker `<select>`s there are untouched (2026-09-27; no behavior change, verified with `tsc`/`eslint`/vitest/`next build`)

Note: an earlier draft of this list claimed the API access and investigation
search panels were already converted; only API access actually was (as of
this update), and only after this session did it -- investigation search
was still plain `<section className="card">` with native `<input>` until
this update too.

## Remaining hand-rolled markup (follow-up punch list)

- Backup/restore, claim workspace, external connectors, and relationship graph panels are still bespoke `<section className="card">` wrappers
- No section has migrated a `<select>` to the existing shadcn `Select`, or a checkbox to a shadcn `Checkbox`, yet. `Select` exists in `components/ui/` (unused elsewhere) but wiring it in is still its own, bigger PR per `<select>` -- it means switching plain `onChange` to Radix's `onValueChange`-style API and rebuilding each `<option>` list as `SelectItem`s, not just a wrapper swap. No `Checkbox` component exists at all yet; adding one is a separate PR.
- Most action controls still use native `<button>`, `<input>`, `<textarea>`, and `<select>`
- Dialog-like and menu-like interactions are still custom and can migrate to `Dialog` / `DropdownMenu`
- Claim/evidence and relationship workspaces still render custom list/row layouts that can migrate to `Table`, `Tabs`, and additional `Card` composition

## Follow-up strategy

1. Convert one workflow section per PR to keep risk and review size low.
2. Replace native controls in each section with matching shadcn primitives while preserving existing handlers/state.
3. Keep visual/structural-only scope (no behavior changes) and validate with `npm run typecheck` and `npm run build` each step.
