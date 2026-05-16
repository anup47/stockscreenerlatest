'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type TestStatus    = 'idle' | 'testing' | 'ok' | 'fail';
type RefreshStatus = 'idle' | 'refreshing' | 'ok' | 'fail';

function tokenAge(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
}

export default function SettingsPage() {
  const router = useRouter();
  const [clientId,         setClientId]        = useState('');
  const [accessToken,      setAccessToken]      = useState('');
  const [pin,              setPin]              = useState('');
  const [totpSecret,       setTotpSecret]       = useState('');
  const [tokenGeneratedAt, setTokenGeneratedAt] = useState('');

  const [saved,          setSaved]         = useState(false);
  const [testStatus,     setTestStatus]    = useState<TestStatus>('idle');
  const [testError,      setTestError]     = useState('');
  const [refreshStatus,  setRefreshStatus] = useState<RefreshStatus>('idle');
  const [refreshError,   setRefreshError]  = useState('');
  const [setupApplied,   setSetupApplied]  = useState(false);
  const [linkCopied,     setLinkCopied]    = useState(false);

  useEffect(() => {
    // Check for setup link in URL hash: #setup=BASE64_JSON
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#setup=')) {
      try {
        const encoded = window.location.hash.slice('#setup='.length);
        const json    = JSON.parse(atob(encoded)) as Record<string, string>;
        const id  = (json.c  ?? '').trim();
        const tok = (json.t  ?? '').trim();
        const p   = (json.p  ?? '').trim();
        const ts  = (json.ts ?? '').trim();
        if (id) {
          localStorage.setItem('dhan_client_id',    id);
          localStorage.setItem('dhan_access_token', tok);
          localStorage.setItem('dhan_pin',          p);
          localStorage.setItem('dhan_totp_secret',  ts);
          setClientId(id);
          setAccessToken(tok);
          setPin(p);
          setTotpSecret(ts);
          setSetupApplied(true);
          // Remove hash from URL so it doesn't sit in browser history
          history.replaceState(null, '', window.location.pathname);
          // Redirect to option chain after a short delay so user sees the success message
          setTimeout(() => router.push('/optionchain'), 1500);
          return;
        }
      } catch { /* ignore malformed hash */ }
    }

    // Normal load — read from localStorage
    setClientId(localStorage.getItem('dhan_client_id')          ?? '');
    setAccessToken(localStorage.getItem('dhan_access_token')    ?? '');
    setPin(localStorage.getItem('dhan_pin')                     ?? '');
    setTotpSecret(localStorage.getItem('dhan_totp_secret')      ?? '');
    setTokenGeneratedAt(localStorage.getItem('dhan_token_generated_at') ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConfigured          = Boolean(clientId.trim() && accessToken.trim());
  const isAutoRenewConfigured = Boolean(clientId.trim() && pin.trim() && totpSecret.trim());

  function save() {
    localStorage.setItem('dhan_client_id',    clientId.trim());
    localStorage.setItem('dhan_access_token', accessToken.trim());
    localStorage.setItem('dhan_pin',          pin.trim());
    localStorage.setItem('dhan_totp_secret',  totpSecret.trim());
    setSaved(true);
    setTestStatus('idle');
    setRefreshStatus('idle');
    setTimeout(() => setSaved(false), 2000);
  }

  function clear() {
    setClientId(''); setAccessToken(''); setPin(''); setTotpSecret(''); setTokenGeneratedAt('');
    ['dhan_client_id','dhan_access_token','dhan_pin','dhan_totp_secret','dhan_token_generated_at']
      .forEach(k => localStorage.removeItem(k));
    setTestStatus('idle'); setRefreshStatus('idle');
  }

  function copySetupLink() {
    const payload = JSON.stringify({
      c:  clientId.trim(),
      t:  accessToken.trim(),
      p:  pin.trim(),
      ts: totpSecret.trim(),
    });
    const encoded = btoa(payload);
    const url = `${window.location.origin}/settings#setup=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    });
  }

  async function testConnection() {
    if (!clientId.trim() || !accessToken.trim()) {
      setTestError('Enter and save credentials first.'); setTestStatus('fail'); return;
    }
    setTestStatus('testing'); setTestError('');
    try {
      const res  = await fetch('/api/dhan/test', {
        headers: { 'x-dhan-client-id': clientId.trim(), 'x-dhan-access-token': accessToken.trim() },
      });
      const json = await res.json() as { ok: boolean; error?: string };
      json.ok ? setTestStatus('ok') : (setTestError(json.error ?? 'Unknown error'), setTestStatus('fail'));
    } catch (e) { setTestError(String(e)); setTestStatus('fail'); }
  }

  async function refreshNow() {
    if (!clientId.trim() || !pin.trim() || !totpSecret.trim()) {
      setRefreshError('Enter and save Client ID, PIN, and TOTP secret first.');
      setRefreshStatus('fail'); return;
    }
    setRefreshStatus('refreshing'); setRefreshError('');
    try {
      const res  = await fetch('/api/dhan/refresh-token', {
        method: 'POST',
        headers: {
          'x-dhan-client-id':   clientId.trim(),
          'x-dhan-pin':         pin.trim(),
          'x-dhan-totp-secret': totpSecret.trim(),
        },
      });
      const json = await res.json() as { accessToken?: string; generatedAt?: string; error?: string };
      if (!res.ok || !json.accessToken) {
        setRefreshError(json.error ?? `HTTP ${res.status}`); setRefreshStatus('fail'); return;
      }
      localStorage.setItem('dhan_access_token',       json.accessToken);
      localStorage.setItem('dhan_token_generated_at', json.generatedAt ?? new Date().toISOString());
      setAccessToken(json.accessToken);
      setTokenGeneratedAt(json.generatedAt ?? new Date().toISOString());
      setRefreshStatus('ok');
    } catch (e) { setRefreshError(String(e)); setRefreshStatus('fail'); }
  }

  if (setupApplied) {
    return (
      <main className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-5xl">✓</div>
        <p className="text-2xl font-bold text-emerald-400">Setup applied!</p>
        <p className="text-slate-400">Credentials saved. Redirecting to Option Chain…</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure your Dhan broker API credentials to enable real-time option chain data, OI analysis, and live P&amp;L.
        </p>
      </div>

      {/* Connection status banner */}
      <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-3 ${
        testStatus === 'ok'   ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' :
        testStatus === 'fail' ? 'bg-red-900/40 border border-red-700 text-red-300' :
        isConfigured          ? 'bg-slate-800 border border-slate-700 text-slate-300' :
                                'bg-amber-900/30 border border-amber-700/60 text-amber-300'
      }`}>
        <span className="text-base">
          {testStatus === 'ok' ? '✓' : testStatus === 'fail' ? '✗' : isConfigured ? '●' : '○'}
        </span>
        <span>
          {testStatus === 'ok'      ? 'Connected — Dhan API credentials are valid.' :
           testStatus === 'fail'    ? `Connection failed: ${testError}` :
           testStatus === 'testing' ? 'Testing credentials…' :
           isConfigured             ? 'Credentials saved. Click Test Connection to verify.' :
                                      'No credentials configured. Option Chain and OI features require a Dhan account.'}
        </span>
      </div>

      {/* Credentials form */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-4">
        <p className="text-slate-200 font-semibold text-sm">API Credentials</p>

        <div>
          <label className="text-xs text-slate-400 block mb-1">Dhan Client ID</label>
          <input type="text" value={clientId}
            onChange={e => { setClientId(e.target.value); setTestStatus('idle'); }}
            placeholder="e.g. 1100123456"
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono" />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Dhan Access Token
            {tokenGeneratedAt && (
              <span className="ml-2 text-slate-500">— generated {tokenAge(tokenGeneratedAt)}</span>
            )}
          </label>
          <textarea value={accessToken}
            onChange={e => { setAccessToken(e.target.value); setTestStatus('idle'); }}
            placeholder="Paste your access token here…"
            rows={3}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono resize-none" />
          <p className="text-xs text-slate-600 mt-1">
            Access tokens expire daily. Use Auto-Renew below to avoid pasting manually each morning.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button onClick={save}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-sm transition-colors">
            {saved ? 'Saved ✓' : 'Save Credentials'}
          </button>
          <button onClick={testConnection} disabled={testStatus === 'testing'}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-semibold rounded text-sm transition-colors">
            {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <button onClick={clear}
            className="px-5 py-2 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-700 rounded text-sm transition-colors ml-auto">
            Clear All
          </button>
        </div>
      </div>

      {/* Setup Link */}
      {isConfigured && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-3">
          <p className="text-slate-200 font-semibold text-sm">Setup Link — Open on Any Device</p>
          <p className="text-xs text-slate-400">
            Generates a one-click URL that configures this app on any computer or phone instantly — no manual entry needed.
            Open the link on a new device and credentials are applied automatically.
          </p>
          {!isAutoRenewConfigured && (
            <p className="text-xs text-amber-400/80">
              Note: this link includes your access token which expires daily. Set up Auto-Renew (PIN + TOTP) below for a permanent link.
            </p>
          )}
          {isAutoRenewConfigured && (
            <p className="text-xs text-emerald-400/80">
              Includes PIN + TOTP secret — permanent link, token auto-refreshes on each device.
            </p>
          )}
          <button onClick={copySetupLink}
            className="px-5 py-2 bg-sky-700 hover:bg-sky-600 text-white font-semibold rounded text-sm transition-colors">
            {linkCopied ? 'Link Copied ✓' : 'Copy Setup Link'}
          </button>
          {linkCopied && (
            <p className="text-xs text-slate-500">
              Paste this link in any browser to configure the app automatically. Keep it private — it contains your API credentials.
            </p>
          )}
        </div>
      )}

      {/* Auto-renew section */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-slate-200 font-semibold text-sm">Auto-Renew Token</p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium border ${
            isAutoRenewConfigured
              ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800'
              : 'bg-slate-800 text-slate-500 border-slate-700'
          }`}>
            {isAutoRenewConfigured ? 'Configured ✓' : 'Not configured'}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Store your login PIN and TOTP secret so the app can generate a fresh access token automatically when the
          current one is &gt;23 h old — no manual copy-paste needed.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Dhan Login PIN</label>
            <input type="password" value={pin}
              onChange={e => { setPin(e.target.value); setRefreshStatus('idle'); }}
              placeholder="6-digit PIN"
              maxLength={6}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">TOTP Secret (base32)</label>
            <input type="password" value={totpSecret}
              onChange={e => { setTotpSecret(e.target.value); setRefreshStatus('idle'); }}
              placeholder="e.g. JBSWY3DPEHPK3PXP"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono" />
          </div>
        </div>

        {/* Refresh status */}
        {refreshStatus !== 'idle' && (
          <div className={`rounded px-3 py-2 text-sm ${
            refreshStatus === 'ok'         ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' :
            refreshStatus === 'fail'       ? 'bg-red-900/40 border border-red-700 text-red-300' :
                                             'bg-slate-800 border border-slate-700 text-slate-400'
          }`}>
            {refreshStatus === 'ok'         ? `Token refreshed ✓ — generated ${tokenAge(tokenGeneratedAt)}` :
             refreshStatus === 'fail'       ? `Refresh failed: ${refreshError}` :
                                              'Generating new token…'}
          </div>
        )}

        <button onClick={refreshNow} disabled={refreshStatus === 'refreshing'}
          className="px-5 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-semibold rounded text-sm transition-colors">
          {refreshStatus === 'refreshing' ? 'Refreshing…' : 'Refresh Token Now'}
        </button>

        {/* How-to guide */}
        <div className="border-t border-slate-800 pt-4 space-y-2 text-xs text-slate-500">
          <p className="text-slate-300 font-semibold text-sm">How to get your TOTP secret</p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Log in to <span className="text-emerald-400">dhanhq.co</span></li>
            <li>Go to <span className="text-slate-300">My Account → DhanHQ Trading APIs → Setup TOTP</span></li>
            <li>Scan the QR code with your authenticator app — but also click <span className="text-slate-300">&quot;Copy secret key&quot;</span> or reveal the base32 text below the QR</li>
            <li>Paste that base32 string into the TOTP Secret field above</li>
            <li>Your login PIN is the same 6-digit PIN you use to log in to Dhan</li>
          </ol>
          <p className="text-slate-600 mt-2">
            PIN and TOTP secret are stored only in your browser&rsquo;s localStorage and sent only to the Next.js server
            route, which generates the token on your behalf and never logs credentials.
          </p>
        </div>
      </div>

      {/* Feature availability */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <p className="text-slate-300 font-semibold text-sm mb-3">Feature availability</p>
        <div className="space-y-2 text-sm">
          {[
            { feature: 'Swing Screener',                    needsDhan: false },
            { feature: 'Single Stock Analysis',             needsDhan: false },
            { feature: 'Directional Options Screener',      needsDhan: false },
            { feature: 'Ascending Triangle Screener',       needsDhan: false },
            { feature: 'Market Dashboard (Index Cards)',     needsDhan: false },
            { feature: 'Strategy Builder',                  needsDhan: false },
            { feature: 'Option Chain Viewer',               needsDhan: true  },
            { feature: 'OI Analysis (10 tabs)',             needsDhan: true  },
            { feature: 'Position Tracker (live LTPs)',      needsDhan: true  },
          ].map(({ feature, needsDhan }) => (
            <div key={feature} className="flex items-center justify-between">
              <span className="text-slate-400">{feature}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium border ${
                !needsDhan
                  ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800'
                  : isConfigured
                    ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800'
                    : 'bg-slate-800 text-slate-500 border-slate-700'
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
