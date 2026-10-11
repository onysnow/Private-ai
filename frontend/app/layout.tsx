import type {ReactNode} from 'react';
import './globals.css';
import '../styles/themes.css';
import '../styles/case.css';
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
