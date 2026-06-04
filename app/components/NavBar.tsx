'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Summary',      href: '/summary' },
  { label: 'BTST',         href: '/btst' },
  { label: 'Screener',     href: '/' },
  { label: 'Analysis',     href: '/analyse' },
  { label: 'Very Short Term', href: '/options' },
  { label: 'Triangle',     href: '/triangle' },
  { label: 'Market',       href: '/market' },
  { label: 'OI Screen',    href: '/oi-screener' },
  { label: 'OI Buildup',   href: '/oi-buildup' },
  { label: 'Option Chain', href: '/optionchain' },
  { label: 'OI Analysis',  href: '/oi-analysis' },
  { label: 'Strategy',     href: '/strategy' },
  { label: 'Positions',    href: '/positions' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-stretch overflow-x-auto scrollbar-none">
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 shrink-0 border-r border-border">
          <TrendingUp className="size-4 text-emerald-600" strokeWidth={2.5} />
          <span className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap">
            StockScreener
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-stretch">
          {tabs.map(({ label, href }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center px-3.5 py-3 text-sm font-medium whitespace-nowrap transition-colors relative border-b-2',
                  active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Settings — pinned right */}
        <Link
          href="/settings"
          className={cn(
            'ml-auto flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 border-l border-border shrink-0',
            path === '/settings'
              ? 'border-b-emerald-600 text-emerald-700'
              : 'border-b-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings className="size-4" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
