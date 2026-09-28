import type {ReactElement} from 'react';
import Link from 'next/link';

export function Footer(): ReactElement {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span style={{fontFamily: 'var(--font-heading)'}} className="text-foreground">
            Journalism Workbench
          </span>
          <span className="mx-2">·</span>
          <span>An evidence-first investigative research platform.</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/settings" className="hover:text-foreground">
            Settings
          </Link>
          <Link href="/console" className="hover:text-foreground">
            Backend console
          </Link>
          <a
            href="https://github.com/onysnow/Private-ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <span>© {year}</span>
        </nav>
      </div>
    </footer>
  );
}
