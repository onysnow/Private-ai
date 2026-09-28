import type {ReactNode} from 'react';
import './globals.css';
import {AppShell} from '../components/layout/app-shell';

export const metadata={title:'Journalism Workbench',description:'FollowTheMoney-native investigative workspace'};

export default function RootLayout({children}:{children:ReactNode}): ReactNode {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
