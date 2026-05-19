import type { Metadata } from 'next';
import './globals.css';
import NavBar from './components/NavBar';

export const metadata: Metadata = {
  title: 'BSE Group A Swing Screener',
  description: 'Daily swing setup scanner for BSE Group A stocks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
