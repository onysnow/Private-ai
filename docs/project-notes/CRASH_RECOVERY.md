# Crash recovery and duplicate-free ingestion

What happens when the app stops mid-way (a crash, a power cut, a killed container) and starts
again. This answers §7 of the 23 Oct 2026 audit ("Journalism Workbench — Architecture and Structural
Audit Findings", in Ony's Drive). The tests are `backend/tests/test_crash_recovery.py` (run on
SQLite and on PostgreSQL) and the last test in `backend/tests/test_background_jobs_procrastinate.py`.
The code is `backend/app/jobs/recovery.py`, called from `JobRunner` (`app/jobs/runner.py`).

## What a restart guarantees

Every document ends in one of three states: read (`complete`), `failed` with the reason and a
job to retry it from, or `queued` with a job that will run. A retry never adds a second set of
chunks, proposals or OpenAleph documents.

| Where it stopped | What is left | What the restart does | Test |
|---|---|---|---|
| Upload: bytes written to `.upload-staging`, rows not committed | a staged file, no rows | removes the staged file (no row points at it); the file can be uploaded again | `..._the_restart_clears_the_staging` |
| Upload: file moved to its own path, rows not committed | a file no row references | nothing; Settings › Storage › orphan files lists it, and it is never deleted on its own | `..._is_listed_as_an_orphan` |
| Upload: document saved, its reading job not made | a document `queued` for ever | **new:** marks it failed ("The app stopped before this was read") with a failed job to retry | `..._gets_a_job_to_retry` |
| Reading the text (OCR, proposals) | nothing; the read is one transaction | marks the job interrupted (existing); the retry reads it once | `..._the_retry_reads_it_once` |
| OpenAleph took the file, the Workbench never recorded it | sync row `syncing` with no OpenAleph id | the next send uses the same `foreign_id`, so OpenAleph updates the same document; no second copy | `..._makes_no_second_copy` |
| Procrastinate: job row saved, never handed to the queue | a job `queued` for ever | **new:** the stalled-job check fails it after an hour unmoved | `..._fails_what_a_stopped_process_left_outside_the_queue` |
| Procrastinate: a file inside an archive being read by the archive's worker | a job `running` the queue does not know about | **new:** failed once the archive's own job has finished (its id is in the child job's payload), however long the read takes | `..._once_they_stop_moving` |
| Procrastinate: a retry saved, not yet handed to the queue | a job `queued` still carrying the last attempt's queue id | **new:** a retry clears the old queue id, so the check above finds it | `test_a_retry_stopped_before_it_reached_the_queue_...` |
| Reading: text saved, OpenAleph's names not staged yet | a read document without its names | **new:** the retry keeps the saved text and stages the names (skipping any already proposed) | `..._stages_openalephs_names_once` |
| Reading: read locally, not yet sent to OpenAleph | a read document OpenAleph does not hold | **new:** the retry keeps the saved text and sends it | `..._the_retry_sends_it` |
| A batch, stopped twice | a mix of the above | each document read exactly once after the retries | `test_a_batch_stopped_twice_...` |

The OpenAleph row relies on OpenAleph 5.3.1's `Document.save` (`aleph/model/document.py`), which
looks a document up by collection and `foreign_id` before making one. Checked in its source on
24 Oct 2026; the test models that, it does not run OpenAleph.

On PostgreSQL one sweep runs at a time (a transaction advisory lock; a second process skips its
turn), and every write repeats the test that selected the row, so a job made or retried meanwhile is
left as it is. The waits on Procrastinate are there because another API process may be between saving a row and
queueing it: documents count as left behind after 10 minutes, jobs and staged files after an hour
(longer than the 15-minute OpenAleph read timeout). The in-process runner (SQLite) has no other
process, so it recovers everything at start-up.

## Exact guarantees

- Jobs run **at least once** when retried: a retry can run a handler again. What makes the effects
  happen once is in the handlers: a document with chunks is never read again (a retry finishes the
  steps after the read; a new reading job for it fails with "Document has already been read"), OpenAleph's names are not proposed twice (`import_analysis_proposals` skips values
  already proposed), and OpenAleph matches on `foreign_id`.
- Recovery never deletes reporter data: it only adds failed jobs, marks documents failed, and
  removes staged copies that no row references.

## Not done yet

- **No 50,000-document run** and no measurement on the target hardware. The drill below used 40
  documents on a 4-CPU cloud container; the batch test uses 12.
- **No `docker kill` of the product's own containers.** The drill kills the API process group
  (uvicorn and its reader processes), which is what a container kill does to it, but outside Docker.
- **Worker termination, database disconnection and a queue backlog** on Procrastinate (audit test 5)
  are covered only for the rows above, not as a load test.

## The crash drill (a real SIGKILL)

`tools/crash_drill.py` runs the API with uvicorn on PostgreSQL 16 with the Procrastinate queue, as
the Docker product does, uploads scanned PDFs (three pages each, so every read needs OCR), and
kills the whole process group with SIGKILL: once while an upload request is in flight, and five
times while reads are running. It restarts the API after each kill, retries what failed as a
reporter would, and then checks the database and the storage folder.

Run on 24 Oct 2026, 40 documents (`--documents 40 --kills 5`): **pass**.

- All 40 files are one document each and all 40 are read, each with its three pages. No page
  twice, no name proposed twice, one reading job per document, nothing left in
  `.upload-staging`, no stored file without its row.
- 38 reads succeeded at the first attempt; the 2 the kills stopped were handed back by
  Procrastinate's stalled-job check and succeeded at the third attempt.
- The upload kill landed between saving the document and making its job. That document waited
  `queued` until the recovery sweep's 10 minutes passed, then had a failed job with "The app
  stopped before this was read", and one retry read it. (The first run of the drill stopped
  before the 10 minutes and reported it as unread; the drill now waits for every document.)
- `GET /api/health`, sampled every half second while the API was up: median 5 ms, 95th percentile
  88 ms, slowest 3.6 s. The slow answers come while the API's own two workers OCR. That is the
  audit's P2 question about running the workers inside the API process; this is one measurement
  on a cloud container, not on the target workstation.

### A database outage (audit test 5)

`--db-down`/`--db-up` stop PostgreSQL while reads run and start it again, without restarting the
API. Run on 24 Oct 2026, 20 documents, PostgreSQL stopped with `pg_ctl stop -m immediate` (as a
crash stops it) for 20 seconds: **pass**. The API process stayed up and answered as soon as the
database was back; the read the outage cut off was handed back by Procrastinate and succeeded at
its second attempt; all 20 documents read once, nothing duplicated. (One upload was also killed in
that run and its document recovered through the 10-minute sweep, as above.)

