"""Background jobs (ADR-0004; Foundation Fixes fix 1).

Slow work -- reading a document, OCR, and later AI drafting -- runs after
the request that asked for it has returned, so the screen and every other
request stay responsive. ``records`` keeps the job rows the screen polls,
``handlers`` holds the work itself, and ``runner`` decides how it runs:
Procrastinate (a PostgreSQL-backed queue) in the product, or in-process for
SQLite developer mode and the fast test run.
"""
