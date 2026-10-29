import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DATASTRAW | Smart Roster Management System',
  description: 'A configurable, browser-local roster planning demo for brand operations and reusable daily-capacity scheduling.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-body">
        {children}
      </body>
    </html>
  );
}
