'use client';
// Keep › Safety & data, bottom: four cards of equal size, one action each (mockup KEEP-safety-and-data; research §8–§12):
// Backup, Who can reach it, Housekeeping, Delete this case. Each sends the reporter to the part of Keep that does the
// work (Backup & restore, Access, Delete) or, for "Back up now", makes the file here and notes it in the case's record.
import {useMutation} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import type {SafetyCardsOut} from '../../lib/generated/types.gen';
import {ago, bytes, count, plural} from './format';

function go(anchor: string): void {
  window.location.hash = `#${anchor}`;
}

export function KeepCards({investigationId, cards, now, onBackedUp}: {
  investigationId: string; cards: SafetyCardsOut; now: Date; onBackedUp: () => void;
}): ReactElement {
  const [status, setStatus] = useState('');
  const backup = useMutation({mutationFn: () => api.blob(`/api/investigations/${investigationId}/export?include_documents=true`)});

  const backUpNow = async () => {
    setStatus('Preparing the backup…');
    try {
      const blob = await backup.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `investigation-${investigationId}.jwbackup.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Backup file made and downloaded. Keep it somewhere safe: it is not encrypted.');
      onBackedUp();
    } catch (error) {
      setStatus(errorMessage(error, 'The backup could not be made'));
    }
  };

  const b = cards.backup;
  return <div className="sd-cards">
    <section className="sd-card" aria-labelledby="sd-c-backup">
      <p id="sd-c-backup" className="sd-eyebrow">Backup</p>
      <p className="sd-card-big">{b.last ? `Last backup ${ago(b.last, now)}` : 'No backup made yet'}</p>
      {b.last && <p className="sd-mono sd-card-sub">{b.size_bytes !== null ? bytes(b.size_bytes) : ''} · ✓ checksum</p>}
      <p className="sd-muted">One file. Restore makes a separate case; it never merges.</p>
      <div className="sd-actions">
        <button type="button" className="sd-btn is-primary" onClick={() => void backUpNow()} disabled={backup.isPending}>Back up now</button>
        <button type="button" className="sd-btn" onClick={() => go('backup-restore')}>Restore…</button>
      </div>
      <p className="sd-muted" aria-live="polite">{status}</p>
    </section>
    <section className="sd-card" aria-labelledby="sd-c-access">
      <p id="sd-c-access" className="sd-eyebrow">Who can reach it</p>
      <p className="sd-card-big">{count(cards.access.refused_24h)} refused · 24 h</p>
      <p className="sd-muted">The log keeps who asked what, never the content.</p>
      <div className="sd-actions"><button type="button" className="sd-btn" onClick={() => go('access')}>Access settings</button></div>
    </section>
    <section className="sd-card" aria-labelledby="sd-c-house">
      <p id="sd-c-house" className="sd-eyebrow">Housekeeping</p>
      <p className="sd-card-big">{plural(cards.housekeeping.stray_files, 'stray file')}</p>
      <p className="sd-mono sd-card-sub">{bytes(cards.housekeeping.stray_bytes)}</p>
      <p className="sd-muted">Files no record points to. Kept until you decide.</p>
      <div className="sd-actions"><button type="button" className="sd-btn" onClick={() => go('access')}>Look at them</button></div>
    </section>
    <section className="sd-card is-danger" aria-labelledby="sd-c-delete">
      <p id="sd-c-delete" className="sd-eyebrow sd-red">Delete this case</p>
      <p className="sd-card-big">Remove from this computer</p>
      <p className="sd-muted">See what goes first: {plural(cards.delete.records, 'record')}, {plural(cards.delete.files, 'file')}.
        {cards.delete.shared_files > 0 ? ` ${plural(cards.delete.shared_files, 'shared file')} stay.` : ''} Cannot be undone.</p>
      <div className="sd-actions"><button type="button" className="sd-btn is-danger" onClick={() => go('deletion')}>Preview deletion</button></div>
    </section>
  </div>;
}
