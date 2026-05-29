'use client';

export default function BtstError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div className="max-w-xl w-full mx-4 p-6 bg-red-900/30 border border-red-700 rounded-xl">
        <h2 className="text-red-400 font-bold text-lg mb-2">BTST Page Error</h2>
        <p className="text-red-300 text-sm font-mono break-all mb-4">
          {error.message || String(error)}
        </p>
        {error.stack && (
          <pre className="text-xs text-slate-400 overflow-auto max-h-48 mb-4 whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
        <button
          onClick={() => {
            // Clear all BTST localStorage keys before retrying
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i);
              if (k?.startsWith('btst-scan-') || k === 'btst-scan-index') localStorage.removeItem(k);
            }
            reset();
          }}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg"
        >
          Clear stored data &amp; retry
        </button>
      </div>
    </div>
  );
}
