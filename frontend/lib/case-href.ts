/** An address inside the case, keeping ?inv= so a reload or a shared link opens the same case. */
export function caseHref(href: string, investigationId: string): string {
  if (!investigationId) return href;
  const [pathAndQuery, hash] = href.split('#');
  const [path, query] = pathAndQuery.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('inv', investigationId);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ''}`;
}
