'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Screener',     href: '/' },
  { label: 'Analysis',     href: '/analyse' },
  { label: 'Options',      href: '/options' },
  { label: 'Triangle',     href: '/triangle' },
  { label: 'Market',       href: '/market' },
  { label: 'OI Screen',    href: '/oi-screener' },
  { label: 'Option Chain', href: '/optionchain' },
  { label: 'OI Analysis',  href: '/oi-analysis' },
  { label: 'Strategy',     href: '/strategy' },
  { label: 'Positions',    href: '/positions' },
  { label: '⚙ Settings',  href: '/settings' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="border-b-2 border-[#ddd9d1] bg-white px-5 flex flex-wrap gap-0 shadow-none">
      {tabs.map(({ label, href }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-3 text-sm font-semibold tracking-wide transition-colors border-b-2 -mb-0.5 ${
              active
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
