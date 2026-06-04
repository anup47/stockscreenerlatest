import type { Metadata } from 'next';
import { Inter, Geist } from 'next/font/google';
import './globals.css';
import NavBar from './components/NavBar';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'BSE Group A Swing Screener',
  description: 'Daily swing setup scanner for BSE Group A stocks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(inter.className, "font-sans", geist.variable)}>
      <body className="bg-[#f2f0ea] text-gray-900 min-h-screen antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
