'use client';
import type {ReactElement} from 'react';
import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Menu, X, ChevronDown} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const APP_VERSION = 'DEV 1.18';

// The workbench (/) has no in-page routing of its own -- these are same-page
// anchors into sections that already exist on that page. They give the nested
// "Workbench" menu something real to jump to rather than being decorative.
const WORKBENCH_SECTIONS: {label: string; href: string}[] = [
  {label: 'Investigation search', href: '/#investigation-search'},
  {label: 'Claims & evidence', href: '/#claim-verification'},
  {label: 'Relationship graph', href: '/#relationship-graph'},
  {label: 'Leads & reporting tasks', href: '/#leads'},
  {label: 'Document ingestion', href: '/#document-ingestion'},
  {label: 'Backups & security', href: '/#backup-restore'}
];

const PRIMARY_LINKS: {label: string; href: string}[] = [
  {label: 'Dashboard', href: '/dashboard'},
  {label: 'Workbench', href: '/'},
  {label: 'Glossary', href: '/glossary'},
  {label: 'Settings', href: '/settings'},
  {label: 'About', href: '/about'}
];

function NavLink({href, label}: {href: string; label: string}): ReactElement {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      className={
        'px-3 py-2 text-sm rounded-md transition-colors ' +
        (active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')
      }
    >
      {label}
    </Link>
  );
}

export function Navbar(): ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            data-testid="nav-hamburger"
            onClick={() => setMobileOpen(v => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <span style={{fontFamily: 'var(--font-heading)'}} className="text-lg font-semibold tracking-wide">
              Journalism Workbench
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink href="/dashboard" label="Dashboard" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="nav-workbench-trigger"
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                Workbench
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem asChild>
                <Link href="/">Open workbench</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Jump to section</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Investigation sections</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {WORKBENCH_SECTIONS.map(section => (
                    <DropdownMenuItem key={section.href} asChild>
                      <Link href={section.href}>{section.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <NavLink href="/glossary" label="Glossary" />
          <NavLink href="/settings" label="Settings" />
          <NavLink href="/about" label="About" />
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {/* A plain link, not next/link: on the API's own origin the operator console owns /console/*, so a client-side route change would fetch its own data from the console and fail. A full page load of /console/ always reaches the workbench page that embeds it (ADR-0004). */}
          <a href="/console/">
            <Badge variant="outline" className="cursor-pointer">
              backend console
            </Badge>
          </a>
          <Badge>{APP_VERSION}</Badge>
        </div>
      </div>

      {mobileOpen ? (
        <nav data-testid="nav-mobile-menu" className="border-t border-border px-6 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {PRIMARY_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <span className="px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
              Workbench sections
            </span>
            {WORKBENCH_SECTIONS.map(section => (
              <Link
                key={section.href}
                href={section.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 pl-6 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {section.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <a
              href="/console/"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Backend console
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export {PRIMARY_LINKS, WORKBENCH_SECTIONS};
