import type {ReactNode} from 'react';
import './globals.css';
import '../styles/themes.css';
import '../styles/case.css';
import '../styles/settings.css';
// The OnySnow Studios effect system's stylesheet, then where the workbench places its effects (ADR-0009).
import '../vendor/onysnow-effects/effects.css';
import '../styles/effects.css';
import '../styles/wire.css';
import '../styles/money.css';
import '../styles/custody.css';
import '../styles/act.css';
import '../styles/story.css';
import '../styles/before-run.css';
import '../styles/drop.css';
import '../styles/dossier.css';
import '../styles/library.css';
import '../styles/following.css';
import '../styles/style-guide.css';
import '../styles/safety.css';
import '../styles/lanes.css';
import '../styles/media.css';
import '../styles/decks.css';
import '../styles/reading-room.css';
import '../styles/is-it-real.css';
import '../styles/learn.css';
import '../styles/lock.css';
import '../styles/pack-check.css';
import '../styles/by-hand.css';
import '../styles/sources.css';
import '../styles/watchlist.css';
import '../styles/safety.css';
// Deck font pairings (SIL OFL, served by the app itself -- see
// backend/app/services/presentation_style.py FONT_PAIRS). Only @font-face
// rules load here; a font file downloads the first time a slide uses it.
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/inter';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-serif';
import '@fontsource/libre-caslon-text';
import '@fontsource-variable/libre-franklin';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/public-sans';
import '@fontsource-variable/literata';
import '@fontsource-variable/work-sans';
import '@fontsource-variable/noto-serif';
import '@fontsource-variable/noto-sans';
import '@fontsource/spectral';
// The themes' own fonts (mockups THEMES-1 and THEMES-2).
import '@fontsource-variable/manrope';
import '@fontsource-variable/jost';
import '@fontsource-variable/domine';
import '@fontsource-variable/lexend';
import '@fontsource/inclusive-sans/400.css';
import '@fontsource/inclusive-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/tilt-neon';
import {AppShell} from '../components/layout/app-shell';
import {APPEARANCE_BOOT_SCRIPT} from '../lib/theme';

export const metadata={title:'Journalism Workbench',description:'FollowTheMoney-native investigative workspace'};

export default function RootLayout({children}:{children:ReactNode}): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the kept theme before the first paint (lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{__html: APPEARANCE_BOOT_SCRIPT}}/>
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
