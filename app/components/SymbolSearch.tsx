'use client';
import { useState, useEffect, useRef } from 'react';
import { ALL_FNO_SYMBOLS } from '@/lib/dhan-api';

export function SymbolSearch({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const all      = [...ALL_FNO_SYMBOLS.indices, ...ALL_FNO_SYMBOLS.stocks];
  const filtered = query.trim()
    ? all.filter(s => s.toLowerCase().includes(query.toLowerCase()))
    : all;
  const indices = filtered.filter(s => (ALL_FNO_SYMBOLS.indices as string[]).includes(s));
  const stocks  = filtered.filter(s => !(ALL_FNO_SYMBOLS.indices as string[]).includes(s));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(s: string) { onChange(s); setQuery(''); setOpen(false); }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 cursor-pointer min-w-[160px] focus-within:border-emerald-500"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-emerald-400 flex-1">{value}</span>
        <input
          className="bg-transparent outline-none text-slate-300 placeholder-slate-500 w-24"
          placeholder="Search…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onClick={e => { e.stopPropagation(); setOpen(true); }}
        />
        <span className="text-slate-500 text-xs">▾</span>
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {indices.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 bg-slate-900">Indices</div>
              {indices.map(s => (
                <div key={s} onClick={() => select(s)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-800 transition-colors ${s === value ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                  {s}
                </div>
              ))}
            </>
          )}
          {stocks.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 bg-slate-900 border-t border-slate-800">F&O Stocks</div>
              {stocks.map(s => (
                <div key={s} onClick={() => select(s)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-800 transition-colors ${s === value ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                  {s}
                </div>
              ))}
            </>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-slate-500 text-center">No match for &ldquo;{query}&rdquo;</div>
          )}
        </div>
      )}
    </div>
  );
}
