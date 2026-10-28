# What the OpenAleph side of the stack costs to run

The 23 Oct 2026 audit (P2, "Infrastructure footprint") asked for cold start, steady-state memory,
CPU and disk. Measured on 24 Oct 2026 in a 4-CPU, 16 GB cloud container (not the 32 GB workstation
or a reporter's laptop the audit names), with the services `.github/workflows/openaleph-live-ci.yml`
starts: OpenAleph's API, worker, ingest-file and ftm-analyze, with PostgreSQL 17, Elasticsearch and
Redis. The Workbench's own containers (its API, PostgreSQL 16, the front end, the render service)
were not running; the Workbench API ran outside Docker.

| | Measured |
|---|---|
| Cold start, images already pulled, fresh volumes | 5 min 24 s from the first container starting to OpenAleph's API answering (most of it `aleph upgrade` on the empty database) |
| Images on disk | 12.7 GB: ingest-file 5.9, ftm-analyze 2.6, Elasticsearch 2.6, OpenAleph 1.3, PostgreSQL 0.4, Redis 0.2 |
| Memory, idle after reading about 30 documents | 6.4 GiB in all: OpenAleph API 2.5, Elasticsearch 1.5 (heap set to 1 GB, `OPENALEPH_ES_JAVA_OPTS`), ftm-analyze 1.1, worker 0.9, ingest-file 0.26, PostgreSQL 0.12, Redis 0.03 |
| CPU, idle | under 1% per service |
| Volumes after those documents | 70 MB |

With the Workbench's own services and a local model (Ollama) on top, a 16 GB laptop is tight;
this has not been measured. The Workbench API's latency while its in-process workers OCR is in
`CRASH_RECOVERY.md` (the crash drill).
