'use client';
// Operator console (ADR-0003, DESIGN.md §8, §12): this page is a thin wrapper.
// All console logic -- data browsing, SQL, checks, tests, logs, users, backups
// -- lives in the opsconsole UI bundle, which the backend serves itself at
// CONSOLE_UI_PATH (default /console; see backend/opsconsole/config.py and
// app/main.py's mount_console call). This page only embeds that bundle in an
// iframe, so there is no console logic here to keep in sync with the backend.
// The API's loopback-only rule for console calls still applies inside the
// iframe -- it is the same-origin backend page, not this Next.js page, that
// enforces it.
import type {ReactElement} from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const CONSOLE_UI_PATH = '/console';

export default function ConsolePage(): ReactElement {
  return (
    <main
      className="shell"
      style={{maxWidth: 'none', padding: 0, display: 'flex', flexDirection: 'column', height: '100vh'}}
    >
      <div className="top" style={{flex: '0 0 auto', padding: '14px 24px'}}>
        <strong>JOURNALISM WORKBENCH · BACKEND CONSOLE</strong>
        <Link className="badge" href="/">
          ← workbench
        </Link>
      </div>
      <iframe
        title="Backend console"
        data-testid="console-frame"
        src={`${API}${CONSOLE_UI_PATH}`}
        style={{flex: '1 1 auto', width: '100%', border: 'none'}}
      />
    </main>
  );
}
