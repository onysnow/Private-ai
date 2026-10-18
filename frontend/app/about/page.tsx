import type {ReactElement} from 'react';

type StackItem = {
  name: string;
  role: string;
  why: string;
};

const STACK: StackItem[] = [
  {
    name: 'FollowTheMoney entity model',
    role: 'How every person, company, asset, and document is represented',
    why: 'A shared, open schema (used by OCCRP and other investigative newsrooms) means entities extracted here can be merged, deduplicated, and cross-referenced against outside datasets instead of living in a bespoke format only this app understands.'
  },
  {
    name: 'FastAPI backend',
    role: 'Serves the API, runs extraction, enforces access rules',
    why: 'A typed, async Python service keeps ingestion, claim verification, and the operator console on one consistent contract, and makes the loopback-only console rule (see Settings) enforceable in one place rather than scattered across routes.'
  },
  {
    name: 'Next.js App Router frontend',
    role: 'This interface',
    why: 'Server-rendered routing keeps the dashboard, workbench, and settings addressable as real pages -- shareable, bookmarkable, and independent of a single monolithic screen.'
  },
  {
    name: 'SQLite (local) / Postgres (Docker stack)',
    role: 'Durable storage for investigations, claims, leads, and evidence',
    why: 'SQLite keeps the no-Docker Windows path genuinely zero-install; Postgres backs the full stack when OpenAleph integration and concurrent access matter.'
  },
  {
    name: 'Claim verification workspace',
    role: 'Tracks a statement from unverified through supported/disputed/confirmed',
    why: 'Journalism lives or dies on what can be sourced. Every claim carries its evidence, stance, and confidence as first-class state instead of a note buried in a document.'
  },
  {
    name: 'Portable investigation backup & restore',
    role: 'Exports an investigation, including its evidence chain, as a self-contained bundle',
    why: 'Investigations outlive laptops, newsroom contracts, and legal holds. A portable backup means the work is never trapped in one running instance.'
  }
];

const CAPABILITIES: {title: string; body: string}[] = [
  {
    title: 'Provenance that survives editing',
    body: 'Every extracted entity, claim, and relationship keeps a lineage back to the document, chunk, and review decision that produced it -- so a fact can always be traced to its source, not just asserted.'
  },
  {
    title: 'A verification workflow, not a wiki',
    body: 'Claims move through explicit states with evidence attached at each step. This is built around how investigative reporting is actually checked, not a generic notes app repurposed for it.'
  },
  {
    title: 'Relationship graphs grounded in FollowTheMoney',
    body: 'Money flows and entity relationships use an interoperable schema, so findings can be cross-checked against, or exported to, the broader investigative-data ecosystem rather than staying locked in this tool.'
  },
  {
    title: 'Leads with triage built in',
    body: 'Leads carry stance counts, disputed-claim counts, and an attention score automatically, so a newsroom can see what needs a second look without re-reading every thread by hand.'
  },
  {
    title: 'Local-first, operator-controlled',
    body: 'The backend console and its administrative surface are loopback-only by design -- no token grants remote access to it. Sensitive operational controls stay on the machine running the app.'
  }
];

function Section({title, children}: {title: string; children: React.ReactNode}): ReactElement {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AboutPage(): ReactElement {
  return (
    <div className="mx-auto max-w-[880px] px-6 py-12">
      <h1 className="text-4xl font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
        About Journalism Workbench
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Journalism Workbench is an evidence-first investigative research platform. It exists for reporters who need
        to track entities, relationships, money flows, and sourced claims through an investigation -- and be able to
        show their work, not just their conclusions.
      </p>

      <Section title="What makes this different">
        <div className="flex flex-col gap-5">
          {CAPABILITIES.map(item => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-semibold text-primary" style={{fontFamily: 'var(--font-heading)'}}>
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The stack, and why each piece is here">
        <div className="flex flex-col gap-4">
          {STACK.map(item => (
            <div key={item.name} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-base font-semibold text-foreground">{item.name}</h3>
                <span className="rounded-full border border-secondary/40 bg-secondary/20 px-2 py-0.5 text-xs text-secondary-foreground">
                  {item.role}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="For investigative journalists specifically">
        <p className="text-sm leading-relaxed text-muted-foreground">
          General-purpose note tools and spreadsheets can hold facts, but they cannot hold a chain of evidence, a
          claim&apos;s verification status, or a relationship graph that stays consistent as an investigation grows.
          Journalism Workbench is built around the specific discipline investigative reporting requires: every
          assertion traces to a source, every relationship can be interrogated, and the tools for backup, review, and
          reporting-task handoff assume a story that will be worked on by more than one person, over more than one
          sitting, and that will eventually need to be defended.
        </p>
      </Section>
    </div>
  );
}
