import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import NavBar from './components/NavBar';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'BSE Group A Swing Screener',
  description: 'Daily swing setup scanner for BSE Group A stocks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#f2f0ea] text-gray-900 min-h-screen antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
