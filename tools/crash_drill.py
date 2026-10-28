"""Kill the running API with SIGKILL while it reads a batch, restart it, and check what is left.

    python tools/crash_drill.py --database-url postgresql+psycopg://user@host/journalism_drill_test

The 23 Oct 2026 audit (section 7) asked for crash tests on a real process, not
only simulated stops (backend/tests/test_crash_recovery.py simulates them). This
starts the API with uvicorn on that database with the Procrastinate queue, as
the Docker product runs, uploads a batch of scanned PDFs (so each needs OCR and
takes seconds), kills the process with SIGKILL at random moments during the
uploads and the reading, starts it again each time, retries what failed as a
reporter would from the screen, and waits for the queue to be idle. Then it
checks, from the database and the storage folder:

- every uploaded file is one document, and every document is read (complete),
  or failed with a reason;
- no document has two sets of pages or a name proposed twice;
- nothing is left in .upload-staging, and every stored file has its row.

It also samples GET /api/health throughout, to show how the API answers while
its in-process workers read and OCR.

The database must be PostgreSQL with a name saying it is disposable (it holds
the drill's rows and is not cleaned up), and Tesseract must be installed.
Needs: the backend's requirements, httpx, psycopg, Pillow.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import random
import signal
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DISPOSABLE = ("test", "ci", "tmp", "scratch", "drill")


def scanned_pdf(n: int, pages: int) -> bytes:
    """A PDF of page images (no text layer), so the reader has to OCR it."""
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 36)
    except OSError:
        font = ImageFont.load_default(size=36)
    images = []
    for page in range(1, pages + 1):
        image = Image.new("RGB", (1240, 1754), "white")
        draw = ImageDraw.Draw(image)
        lines = [f"Ledger {n} page {page}", f"Holding Company {n} Limited paid", f"{1000 + n * 7 + page} dollars to",
                 f"Trading Partner {n} Incorporated", "on the first of the month."]
        for row, line in enumerate(lines):
            draw.text((120, 160 + row * 70), line, fill="black", font=font)
        images.append(image)
    out = io.BytesIO()
    images[0].save(out, "PDF", save_all=True, append_images=images[1:], resolution=150)
    return out.getvalue()


class Server:
    def __init__(self, env: dict[str, str], port: int, log: Path) -> None:
        self.env, self.port, self.log = env, port, log
        self.proc: subprocess.Popen | None = None
        self.starts = 0

    def start(self) -> None:
        self.starts += 1
        with self.log.open("a") as out:
            out.write(f"\n===== start {self.starts} at {time.strftime('%H:%M:%S')} =====\n")
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(self.port)],
            cwd=BACKEND, env=self.env, stdout=self.log.open("a"), stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            try:
                if httpx.get(f"http://127.0.0.1:{self.port}/api/health", timeout=2).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            if self.proc.poll() is not None:
                raise SystemExit(f"the API exited on start; see {self.log}")
            time.sleep(0.5)
        raise SystemExit(f"the API did not answer within two minutes; see {self.log}")

    def kill(self) -> None:
        """SIGKILL the whole process group: uvicorn and the reader processes it spawned."""
        if self.proc is not None and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGKILL)
            self.proc.wait()

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(30)
            except subprocess.TimeoutExpired:
                self.kill()


class HealthSampler(threading.Thread):
    def __init__(self, url: str) -> None:
        super().__init__(daemon=True)
        self.url, self.samples, self.failures, self.running = url, [], 0, True

    def run(self) -> None:
        with httpx.Client(timeout=10) as client:
            while self.running:
                started = time.monotonic()
                try:
                    client.get(self.url).raise_for_status()
                    self.samples.append(time.monotonic() - started)
                except httpx.HTTPError:
                    self.failures += 1   # includes the moments the API is down
                time.sleep(0.5)


def sql_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--documents", type=int, default=40)
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--kills", type=int, default=4, help="SIGKILLs during the reading (one more during the uploads)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--seed", type=int, default=24)
    parser.add_argument("--timeout", type=float, default=1800, help="seconds to wait for every document to finish")
    parser.add_argument("--out", type=Path, help="write the result as JSON here")
    parser.add_argument("--db-down", help="shell command that stops the database, run once while reads run (audit test 5)")
    parser.add_argument("--db-up", help="shell command that starts it again")
    parser.add_argument("--db-down-seconds", type=float, default=20)
    args = parser.parse_args()
    name = args.database_url.rsplit("/", 1)[-1].split("?")[0].lower()
    if not args.database_url.startswith("postgresql") or not any(t in name for t in DISPOSABLE):
        raise SystemExit("use a PostgreSQL database whose name says it is disposable (test, ci, tmp, scratch, drill)")
    random.seed(args.seed)

    work = Path(tempfile.mkdtemp(prefix="crash-drill-"))
    storage = work / "documents"
    env = {**os.environ, "TZ": "UTC", "DATABASE_URL": args.database_url, "JOB_RUNNER": "procrastinate",
           "DOCUMENT_STORAGE_DIR": str(storage), "DOCUMENT_READER": "local", "OPENALEPH_ENABLED": "false",
           "FRONTEND_DIST_DIR": str(work / "no-frontend")}
    log = work / "api.log"
    server = Server(env, args.port, log)
    base = f"http://127.0.0.1:{args.port}/api"
    print(f"working in {work}")

    server.start()
    sampler = HealthSampler(f"{base}/health")
    sampler.start()
    client = httpx.Client(timeout=60)
    inv = client.post(f"{base}/investigations", json={"name": f"Crash drill {time.strftime('%H:%M:%S')}"}).json()["id"]
    files = {f"ledger-{n:03}.pdf": scanned_pdf(n, args.pages) for n in range(args.documents)}
    kills: list[str] = []

    # Uploads, with one kill fired by a timer while they are being sent, so it can
    # land inside a request; a file whose upload got no answer is sent again, as a
    # reporter would, and "already in this investigation" counts as saved.
    kill_after = random.randint(args.documents // 4, args.documents // 2)
    pending = list(files)
    for number, filename in enumerate(list(pending)):
        if number == kill_after:
            def stop_mid_upload() -> None:
                server.kill(); kills.append(f"during the uploads, at file {kill_after}")
            threading.Timer(random.uniform(0.01, 0.15), stop_mid_upload).start()
        if number == kill_after + 1:
            time.sleep(0.3)
            server.start()
        try:
            reply = client.post(f"{base}/documents/upload", data={"investigation_id": inv, "title": filename},
                                files={"file": (filename, files[filename], "application/pdf")})
            if reply.status_code in (200, 202, 409, 422):
                pending.remove(filename)
        except httpx.HTTPError:
            pass
    for filename in list(pending):
        reply = client.post(f"{base}/documents/upload", data={"investigation_id": inv, "title": filename},
                            files={"file": (filename, files[filename], "application/pdf")})
        if reply.status_code in (200, 202, 409, 422):
            pending.remove(filename)

    # Kills while the queue reads and OCRs: each waits until a job is running.
    for _ in range(args.kills):
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            running = client.get(f"{base}/jobs", params={"investigation_id": inv, "status": "running"}).json()
            if running:
                break
            time.sleep(0.5)
        else:
            kills.append("skipped: nothing was running")
            continue
        time.sleep(random.uniform(0.2, 2.5))
        server.kill(); kills.append(f"while {len(running)} job(s) ran, at {time.strftime('%H:%M:%S')}")
        time.sleep(random.uniform(0.5, 3))
        server.start()

    # The database stops while reads run, and starts again; the API is not restarted,
    # so this shows whether its queue worker and connections come back on their own.
    outage: dict = {}
    if args.db_down and args.db_up:
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline and not client.get(
                f"{base}/jobs", params={"investigation_id": inv, "status": "running"}).json():
            time.sleep(0.5)
        time.sleep(random.uniform(0.2, 2.0))
        before = len(sampler.samples), sampler.failures
        subprocess.run(args.db_down, shell=True, check=True)
        outage["stopped_at"] = time.strftime("%H:%M:%S")
        time.sleep(args.db_down_seconds)
        subprocess.run(args.db_up, shell=True, check=True)
        outage["started_at"] = time.strftime("%H:%M:%S")
        back = time.monotonic()
        while time.monotonic() - back < 120:
            try:
                if client.get(f"{base}/jobs", params={"investigation_id": inv, "limit": 1}).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        outage["api_answering_again_after_s"] = round(time.monotonic() - back, 1)
        outage["health_failures_during"] = sampler.failures - before[1]
        outage["api_process_survived"] = server.proc is not None and server.proc.poll() is None

    # Retry what failed, as a reporter would, until every document is finished.
    started, retries = time.monotonic(), 0
    while time.monotonic() - started < args.timeout:
        jobs = client.get(f"{base}/jobs", params={"investigation_id": inv, "limit": 200}).json()
        reading = [j for j in jobs if j["kind"] == "extract_document"]
        for job in reading:
            if job["status"] == "failed":
                if client.post(f"{base}/jobs/{job['id']}/retry").status_code == 200:
                    retries += 1
        # Done when every document is read: a document the stop left without a job
        # gets one from the recovery sweep only after RECOVER_DOCUMENTS_AFTER (10 min).
        with psycopg.connect(sql_url(args.database_url)) as db:
            unread = db.execute("SELECT count(*) FROM documents WHERE investigation_id = %s AND extraction_status <> 'complete'",
                                (inv,)).fetchone()[0]
        if reading and not unread and all(j["status"] == "succeeded" for j in reading):
            break
        time.sleep(5)
    sampler.running = False
    sampler.join(5)

    with psycopg.connect(sql_url(args.database_url)) as db:
        q = lambda sql: db.execute(sql, {"inv": inv}).fetchall()  # noqa: E731
        docs = q("SELECT id, filename, extraction_status, extraction_error FROM documents WHERE investigation_id = %(inv)s")
        by_name: dict[str, int] = {}
        for _, filename, _, _ in docs:
            by_name[filename] = by_name.get(filename, 0) + 1
        chunk_counts = dict(q("SELECT document_id, count(*) FROM document_chunks c JOIN documents d ON d.id = c.document_id "
                              "WHERE d.investigation_id = %(inv)s GROUP BY document_id"))
        dup_pages = q("SELECT c.document_id, c.ordinal, count(*) FROM document_chunks c JOIN documents d ON d.id = c.document_id "
                      "WHERE d.investigation_id = %(inv)s GROUP BY c.document_id, c.ordinal HAVING count(*) > 1")
        dup_names = q("SELECT document_id, payload->>'caption', count(*) FROM extraction_candidates WHERE investigation_id = %(inv)s "
                      "AND candidate_type = 'entity' GROUP BY document_id, payload->>'caption' HAVING count(*) > 1")
        jobs_per_doc = dict(q("SELECT subject_id, count(*) FROM background_jobs WHERE investigation_id = %(inv)s "
                              "AND kind = 'extract_document' GROUP BY subject_id"))
        stored_paths = {row[0] for row in q("SELECT storage_path FROM documents WHERE investigation_id = %(inv)s")}
        attempts = {f"{status} after {n} attempt(s)": c for status, n, c in q(
            "SELECT status, attempts, count(*) FROM background_jobs WHERE investigation_id = %(inv)s "
            "AND kind = 'extract_document' GROUP BY 1, 2 ORDER BY 1, 2")}
        queue = {f"{status} after {n} attempt(s)": c for status, n, c in db.execute(
            "SELECT q.status, q.attempts, count(*) FROM procrastinate.procrastinate_jobs q "
            "JOIN background_jobs b ON b.queue_job_id = q.id WHERE b.investigation_id = %(inv)s GROUP BY 1, 2 ORDER BY 1, 2",
            {"inv": inv}).fetchall()}
    on_disk = {str(p.resolve()) for p in storage.glob("*") if p.is_file()}
    staging = sorted(str(p) for p in (storage / ".upload-staging").glob("*")) if (storage / ".upload-staging").exists() else []
    statuses: dict[str, int] = {}
    for _, _, status, _ in docs:
        statuses[status] = statuses.get(status, 0) + 1
    wrong_pages = sorted(f for _id, f, status, _ in docs if status == "complete" and chunk_counts.get(_id) != args.pages)

    result = {
        "documents_uploaded": len(files), "documents_in_db": len(docs), "statuses": statuses,
        "files_never_saved": pending, "files_saved_twice": sorted(f for f, c in by_name.items() if c > 1),
        "files_missing": sorted(set(files) - set(by_name)),
        "complete_with_wrong_page_count": wrong_pages,
        "duplicate_pages": len(dup_pages), "names_proposed_twice": len(dup_names),
        "documents_with_more_than_one_reading_job": sum(1 for c in jobs_per_doc.values() if c > 1),
        "failed": [(f, err) for _id, f, status, err in docs if status != "complete"],
        "staging_left": staging, "files_without_a_row": sorted(on_disk - {str(Path(p).resolve()) for p in stored_paths}),
        "reading_jobs": attempts, "queue_jobs": queue, "database_outage": outage,
        "kills": kills, "server_starts": server.starts, "retries_by_the_reporter": retries,
        "seconds_to_finish_after_last_kill": round(time.monotonic() - started),
        "health_ms": {"samples": len(sampler.samples), "failed_while_down": sampler.failures,
                      "p50": round(statistics.median(sampler.samples) * 1000) if sampler.samples else None,
                      "p95": round(sorted(sampler.samples)[int(len(sampler.samples) * 0.95) - 1] * 1000) if sampler.samples else None,
                      "max": round(max(sampler.samples) * 1000) if sampler.samples else None},
        "api_log": str(log),
    }
    server.stop()
    print(json.dumps(result, indent=2))
    if args.out:
        args.out.write_text(json.dumps(result, indent=2) + "\n")
    ok = (not result["files_never_saved"] and not result["files_saved_twice"] and not result["files_missing"]
          and statuses == {"complete": len(files)} and not wrong_pages and not dup_pages and not dup_names
          and not staging and not result["files_without_a_row"])
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
