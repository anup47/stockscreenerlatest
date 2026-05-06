'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Screener', href: '/' },
  { label: 'Analysis', href: '/analyse' },
  { label: 'Options',  href: '/options' },
  { label: 'Triangle', href: '/triangle' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="border-b border-slate-800 bg-slate-900 px-4 py-2 flex gap-1">
      {tabs.map(({ label, href }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              active
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
