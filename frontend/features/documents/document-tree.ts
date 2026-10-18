// Files found inside an archive or attached to an email are documents of
// their own with `parent_document_id` (ADR-0006, Wave A). Lists show each one
// under the document it came from.

/** The fields nesting needs; DocumentOut has them. */
type Nestable = {id: string; parent_document_id?: string | null};

export type NestedRow<T> = {document: T; depth: number; parent: T | null};

/** Every document once, each followed by the files found in it (at any
 * depth), in the order the list gave them. A file whose container is not
 * in the list stands at the top level. */
export function nestDocuments<T extends Nestable>(documents: readonly T[]): NestedRow<T>[] {
  const byId = new Map(documents.map(document => [document.id, document]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const document of documents) {
    const parentId = document.parent_document_id;
    if (parentId && byId.has(parentId) && parentId !== document.id) {
      children.set(parentId, [...(children.get(parentId) ?? []), document]);
    } else {
      roots.push(document);
    }
  }
  const rows: NestedRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (document: T, depth: number, parent: T | null) => {
    if (seen.has(document.id)) return;   // a loop in the data must not hang the list
    seen.add(document.id);
    rows.push({document, depth, parent});
    for (const child of children.get(document.id) ?? []) visit(child, depth + 1, document);
  };
  for (const root of roots) visit(root, 0, null);
  // Rows only reachable through a loop are still shown.
  for (const document of documents) if (!seen.has(document.id)) visit(document, 0, null);
  return rows;
}

/** The OpenAleph schemas whose files become documents under them. */
export const CONTAINER_SCHEMATA = ['Package', 'Email'];
