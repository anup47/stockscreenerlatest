'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Screener',     href: '/' },
  { label: 'Analysis',     href: '/analyse' },
  { label: 'Options',      href: '/options' },
  { label: 'Triangle',     href: '/triangle' },
  { label: 'Market',       href: '/market' },
  { label: 'Option Chain', href: '/optionchain' },
  { label: 'OI Analysis',  href: '/oi-analysis' },
  { label: 'Strategy',     href: '/strategy' },
  { label: 'Positions',    href: '/positions' },
  { label: '⚙ Settings',  href: '/settings' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white px-4 py-2 flex gap-1 shadow-sm">
      {tabs.map(({ label, href }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              active
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
