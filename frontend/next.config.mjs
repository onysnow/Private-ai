// The workbench is built as plain static files (ADR-0004): every page is a
// client page, and the Workbench API serves the export at port 8000, so the
// app has one screen and one origin. `next dev` (port 3000) is unaffected.
import {PHASE_PRODUCTION_BUILD} from 'next/constants.js';

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  // A production build talks to the API on its own origin ("" = relative
  // URLs) unless NEXT_PUBLIC_API_URL is set explicitly. Development keeps the
  // source fallback in lib/api-instance.ts (http://localhost:8000).
  const sameOrigin = phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_API_URL === undefined;
  return {
    output: 'export',
    // /review/ -> review/index.html, which any static file server resolves.
    trailingSlash: true,
    env: sameOrigin ? {NEXT_PUBLIC_API_URL: ''} : {},
    // `next dev` only: Next 15.5's segment explorer wraps the page's segments in its own nodes, and on a page's first
    // load the server's and the browser's trees differed by one of them, so every useId below (each Reveal's) differed
    // and React reported a hydration mismatch (sweep 30 Oct, Keep › Access and Bring in › Search). Off, the trees match.
    // The built app (output: 'export') never had it.
    experimental: {devtoolSegmentExplorer: false},
  };
}
