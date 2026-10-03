// A bulk import as the triage screen and the review queue read it
// (GET /api/ingestion-batches/{id}; backend/app/services/ingestion_batches.py).
import type {IngestionBatchOut} from '../../lib/generated/types.gen';

/** Whether any document of the batch is still being read. */
export function stillReading(batch: IngestionBatchOut | undefined): boolean {
  return Boolean(batch?.documents.some(d => d.job && !d.job.finished));
}

/** The batch's review order, starting at the document the reporter chose
 * and keeping every other in its place. */
export function reviewOrderFrom(order: string[], start: string | null): string[] {
  return start && order.includes(start) ? [start, ...order.filter(id => id !== start)] : order;
}
