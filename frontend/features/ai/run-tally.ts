// The four tallies of a run's thoughts (✓ verified, ◆ in between, ✕ stopped, ○ a finding), shared by Watch the run and
// the case home's AI strip. A thought counts as stopped when the app's citation check of it failed (ADR-0012).
import type {AiRunEventOut} from '../../lib/generated/types.gen';

export type Tally = {good: number; partial: number; bad: number; neutral: number};

export function thoughtTallies(events: AiRunEventOut[]): Tally {
  const counts: Tally = {good: 0, partial: 0, bad: 0, neutral: 0};
  for (const e of events) if (e.self_reported) {
    const confirm = events.find(x => x.parent === e.n && x.node === 'gate:citation');
    const status = (confirm?.status === 'bad' ? 'bad' : e.status) as keyof Tally;
    if (status in counts) counts[status] += 1;
  }
  return counts;
}
