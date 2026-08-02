'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROW1 = [
  { label: 'Summary',        href: '/summary' },
  { label: 'Supply-Demand',  href: '/supply-demand' },
  { label: 'Global Leaders', href: '/global-leaders' },
  { label: 'BTST',           href: '/btst' },
  { label: 'STBT',           href: '/stbt' },
  { label: 'Screener',       href: '/' },
  { label: 'Analysis',       href: '/analyse' },
  { label: 'VST',            href: '/options' },
  { label: 'Triangle',       href: '/triangle' },
  { label: 'Market',         href: '/market' },
];

const ROW2 = [
  { label: 'Targets',        href: '/research-targets' },
  { label: 'Scuttlebutt',    href: '/scuttlebutt' },
  { label: 'Phantom Flow',   href: '/phantom-flow' },
  { label: 'OI Screen',      href: '/oi-screener' },
  { label: 'OI Screen New',  href: '/oi-screen-new' },
  { label: 'OI Buildup',     href: '/oi-buildup' },
  { label: 'Option Chain',   href: '/optionchain' },
  { label: 'OI Analysis',    href: '/oi-analysis' },
  { label: 'Strategy',       href: '/strategy' },
  { label: 'Positions',      href: '/positions' },
];

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors relative border-b-2',
        active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const path = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      {/* Row 1 */}
      <div className="flex items-stretch border-b border-border/40">
        {/* Brand */}
        <div className="flex items-center gap-1.5 px-3 shrink-0 border-r border-border">
          <TrendingUp className="size-3.5 text-emerald-600" strokeWidth={2.5} />
          <span className="text-xs font-bold tracking-tight text-foreground whitespace-nowrap">StockScreener</span>
        </div>

        {/* Row 1 tabs */}
        <div className="flex items-stretch flex-1">
          {ROW1.map(({ label, href }) => (
            <TabLink key={href} label={label} href={href} active={path === href} />
          ))}
        </div>

        {/* Settings — pinned right on row 1 */}
        <Link
          href="/settings"
          className={cn(
            'ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 border-l border-border shrink-0',
            path === '/settings'
              ? 'border-b-emerald-600 text-emerald-700'
              : 'border-b-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Settings className="size-3.5" />
          Settings
        </Link>
      </div>

      {/* Row 2 */}
      <div className="flex items-stretch">
        {ROW2.map(({ label, href }) => (
          <TabLink key={href} label={label} href={href} active={path === href} />
        ))}
      </div>
    </nav>
  );
}
