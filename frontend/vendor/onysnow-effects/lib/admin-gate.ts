/**
 * Workbench version of OnySnow Studios' admin gate. The site keeps its experimental
 * switches (?try=, ?quality=, ?crackphoto=, ?perf, ?laser=) for its signed-in admin;
 * the workbench has no sign-in to the site, so here they are open only on the dev
 * server at localhost, and off everywhere else. The rest of the file is the site's own.
 */

export const EXPERIMENT_PARAMS = ["try", "quality", "crackphoto", "perf", "laser"] as const;

/** The dev server on this machine: open, for development and tests. */
export function isLocalDev(
  dev: boolean = Boolean((process.env.NODE_ENV !== "production")),
  host: string = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  return dev && (host === "localhost" || host === "127.0.0.1" || host === "[::1]");
}

/** Whether this page may show previews and test switches. */
export function experimentsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return isLocalDev();
}

/** Whether an address asks for anything experimental. */
export function asksForExperiments(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    return EXPERIMENT_PARAMS.some((p) => q.has(p));
  } catch {
    return false;
  }
}
