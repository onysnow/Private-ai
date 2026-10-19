# Tools for checking screens against their mockups

They need the API on :8000 and the web app on :3000 (see `../03_RUN_AND_TEST.md`). Playwright is loaded from
`/opt/node22/lib/node_modules/playwright`; point `PLAYWRIGHT=` at another copy if needed. Screenshots are written
where you say; keep them out of the repo, in the session's scratchpad.

## Seed the mockups' own data (local database only, never committed)

**`seed_kestrel.py`** creates a "Kestrel harbour (mockup data)" case with SEE_2's payments:
- 3 × €9,800 and €42,000 "deposit", Fernhill → Kestrel;
- €1,250,000 land price, Kestrel → Harbour Council, shown in the council minutes p.4;
- €180,000 bank lines, Kestrel → Loop Two;
- €60,000, Harbour Nominees → Loop Two;
- two sterling payments.

It prints the new case's id. Uses the HTTP API.
```
python3 seed_kestrel.py
```

**`seed_cc.py`** adds CHECK_2's other two evidence rows to a claim: a Land Registry title supporting it, and a
Companies House CS01 against it, answered "filed 14 Dec 2017, before the transfer". It also adds an AI draft that
cites the claim. Run it from `backend/`, because it imports the app.
```
cd backend && INV=<case> CLAIM=<claim> RUN_ID=<optional ai run id> TZ=UTC DATABASE_URL=sqlite:////tmp/claude-0/run/app.db python ../docs/handoff/tools/seed_cc.py
```
The first row (the file `Fernhill_share_transfer_2018.pdf`, read by OCR, with the passage on page 3) needs a
document with chunks. Upload a small PDF through The Drop, or insert one directly as
`backend/tests/test_custody_chain.py` does.

**`seed_run.py`** makes one AI run with a stand-in model that answers from the real packet. That gives AI_1 a run
record to draw: settings, route, packet, model call, checks, thoughts, and one claim citing a record outside the
packet. Run it from `backend/`.
```
cd backend && INV=<case> TZ=UTC DATABASE_URL=sqlite:////tmp/claude-0/run/app.db python ../docs/handoff/tools/seed_run.py "Who controlled the money?"
```

## Look and click

**`shot.mjs`** takes a screenshot at 1440×900:
```
THEME=forest-ledger node shot.mjs 'http://localhost:3000/see?inv=<case>#money-flows' out.png
```

**`money-func.mjs`** drives every Money control: scroll replay, tracing a band, Esc, J/K, How these work, Make a
lead, the ledger view (L), Flow, and the currency tabs. **`cc-func.mjs`** drives every Chain of Custody control:
picking cards, What if this breaks?, Re-check hash, copying the seal, Fit, L, Export, hovering the log, Open page,
Watch the run →, and Esc. Each prints what happened plus any failed requests and page errors.
```
INV=<case> node money-func.mjs
INV=<case> OUT=/path/to/scratch node cc-func.mjs
```
