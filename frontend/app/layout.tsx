import type {ReactNode} from 'react';
import './globals.css';
export const metadata={title:'Journalism Workbench',description:'FollowTheMoney-native investigative workspace'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}
