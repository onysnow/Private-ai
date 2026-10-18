// Which cached queries belong to the open investigation (Foundation Fixes
// fix 3). The generated query keys are `[{_id, baseUrl, path?, query?}]`
// (lib/generated/@tanstack/react-query.gen.ts): a key with the
// investigation's id in its path is one of its lists; a key with an entity
// id in its path is a view of one of its records. The three server-wide
// queries the page makes on load (settings status, investigation list,
// connector names) are never part of a case.
import type {Query, QueryClient} from '@tanstack/react-query';

/** The server-wide queries the page itself makes: the settings status, the
 * investigation list and the connector names. Rechecking API access resets
 * these three; a change inside a case never touches them. */
export const APP_LEVEL_QUERY_IDS: ReadonlySet<string> = new Set(['settingsStatus', 'listInvestigations', 'connectors']);

type KeyHead = {_id?: unknown; path?: unknown};

function head(query: Query): KeyHead {
  const first: unknown = query.queryKey[0];
  return typeof first === 'object' && first !== null ? (first as KeyHead) : {};
}

function pathOf(query: Query): Record<string, unknown> {
  const {path} = head(query);
  return typeof path === 'object' && path !== null ? (path as Record<string, unknown>) : {};
}

export function isAppLevelQuery(query: Query): boolean {
  const {_id} = head(query);
  return typeof _id === 'string' && APP_LEVEL_QUERY_IDS.has(_id);
}

/** True for every query of one generated operation (its `_id`), whatever its path or query string. */
export function isQueryOf(query: Query, operationId: string): boolean {
  return head(query)._id === operationId;
}

/** True for a query about one canonical entity (its dossier, duplicates,
 * reconciliation, statement history, merge preview). */
export function isEntityQuery(query: Query, entityId?: string): boolean {
  const id = pathOf(query).entity_id;
  return typeof id === 'string' && (entityId === undefined || id === entityId);
}

/** Marks every query of the open case stale and reloads the ones on screen.
 * `exceptEntity` leaves one record's queries merely stale (no reload): the
 * record a merge just folded away, which no panel should ask for again. */
export async function invalidateInvestigationData(queryClient: QueryClient, exceptEntity?: string): Promise<void> {
  await queryClient.invalidateQueries({predicate: query => !isAppLevelQuery(query) && !(exceptEntity !== undefined && isEntityQuery(query, exceptEntity))});
  if (exceptEntity !== undefined) {
    await queryClient.invalidateQueries({predicate: query => isEntityQuery(query, exceptEntity), refetchType: 'none'});
  }
}
