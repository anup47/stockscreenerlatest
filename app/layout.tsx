import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSE Group A Swing Screener',
  description: 'Daily swing setup scanner for BSE Group A stocks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
