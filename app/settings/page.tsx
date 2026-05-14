'use client';
import { useState, useEffect } from 'react';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

export default function SettingsPage() {
  const [clientId,    setClientId]    = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saved,       setSaved]       = useState(false);
  const [testStatus,  setTestStatus]  = useState<TestStatus>('idle');
  const [testError,   setTestError]   = useState('');

  useEffect(() => {
    setClientId(localStorage.getItem('dhan_client_id')    ?? '');
    setAccessToken(localStorage.getItem('dhan_access_token') ?? '');
  }, []);

  function save() {
    localStorage.setItem('dhan_client_id',    clientId.trim());
    localStorage.setItem('dhan_access_token', accessToken.trim());
    setSaved(true);
    setTestStatus('idle');
    setTimeout(() => setSaved(false), 2000);
  }

  function clear() {
    setClientId('');
    setAccessToken('');
    localStorage.removeItem('dhan_client_id');
    localStorage.removeItem('dhan_access_token');
    setTestStatus('idle');
  }

  async function testConnection() {
    if (!clientId.trim() || !accessToken.trim()) {
      setTestError('Enter and save credentials first.');
      setTestStatus('fail');
      return;
    }
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('/api/dhan/test', {
        headers: {
          'x-dhan-client-id':    clientId.trim(),
          'x-dhan-access-token': accessToken.trim(),
        },
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (json.ok) {
        setTestStatus('ok');
      } else {
        setTestError(json.error ?? 'Unknown error');
        setTestStatus('fail');
      }
    } catch (e) {
      setTestError(String(e));
      setTestStatus('fail');
    }
  }

  const isConfigured = Boolean(clientId.trim() && accessToken.trim());

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure your Dhan broker API credentials to enable real-time option chain data, OI analysis, and live P&amp;L.
        </p>
      </div>

      {/* Status banner */}
      <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${
        testStatus === 'ok'   ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' :
        testStatus === 'fail' ? 'bg-red-900/40 border border-red-700 text-red-300' :
        isConfigured          ? 'bg-slate-800 border border-slate-700 text-slate-300' :
                                'bg-amber-900/30 border border-amber-700/60 text-amber-300'
      }`}>
        <span className="text-base">
          {testStatus === 'ok'   ? '✓' :
           testStatus === 'fail' ? '✗' :
           isConfigured          ? '●' : '○'}
        </span>
        <span>
          {testStatus === 'ok'      ? 'Connected — Dhan API credentials are valid.' :
           testStatus === 'fail'    ? `Connection failed: ${testError}` :
           testStatus === 'testing' ? 'Testing credentials…' :
           isConfigured             ? 'Credentials saved. Click Test Connection to verify.' :
                                      'No credentials configured. Option Chain and OI features require a Dhan account.'}
        </span>
      </div>

      {/* Dhan setup guide */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-2 text-sm text-slate-400">
        <p className="text-slate-200 font-semibold">How to get Dhan API credentials (free)</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Create a free account at <span className="text-emerald-400">dhanhq.co</span></li>
          <li>Go to <span className="text-slate-200">My Account → API Access</span></li>
          <li>Generate an Access Token — it expires daily, regenerate each morning</li>
          <li>Copy your Client ID and the generated Access Token below</li>
        </ol>
        <p className="text-xs text-slate-500 mt-2">
          Credentials are stored only in your browser&rsquo;s localStorage — never sent to any server except Dhan&rsquo;s API.
        </p>
      </div>

      {/* Credentials form */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Dhan Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={e => { setClientId(e.target.value); setTestStatus('idle'); }}
            placeholder="e.g. 1100123456"
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Dhan Access Token</label>
          <textarea
            value={accessToken}
            onChange={e => { setAccessToken(e.target.value); setTestStatus('idle'); }}
            placeholder="Paste your access token here…"
            rows={3}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono resize-none"
          />
          <p className="text-xs text-slate-600 mt-1">Access tokens expire daily — regenerate from Dhan portal each morning.</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={save}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-sm transition-colors"
          >
            {saved ? 'Saved ✓' : 'Save Credentials'}
          </button>
          <button
            onClick={testConnection}
            disabled={testStatus === 'testing'}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-semibold rounded text-sm transition-colors"
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            onClick={clear}
            className="px-5 py-2 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-700 rounded text-sm transition-colors ml-auto"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Feature availability */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <p className="text-slate-300 font-semibold text-sm mb-3">Feature availability</p>
        <div className="space-y-2 text-sm">
          {[
            { feature: 'Swing Screener',        needsDhan: false },
            { feature: 'Single Stock Analysis', needsDhan: false },
            { feature: 'Directional Options Screener', needsDhan: false },
            { feature: 'Ascending Triangle Screener',  needsDhan: false },
            { feature: 'Market Dashboard (Index Cards)', needsDhan: false },
            { feature: 'Option Chain Viewer',   needsDhan: true },
            { feature: 'OI Analysis (10 tabs)', needsDhan: true },
            { feature: 'Strategy Builder',      needsDhan: false },
            { feature: 'Position Tracker',      needsDhan: true },
          ].map(({ feature, needsDhan }) => (
            <div key={feature} className="flex items-center justify-between">
              <span className="text-slate-400">{feature}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                !needsDhan
                  ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                  : isConfigured
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}>
                {!needsDhan ? 'Always available' : isConfigured ? 'Dhan ✓' : 'Requires Dhan'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
