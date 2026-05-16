'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';

export interface DhanCredentials {
  clientId:            string;
  accessToken:         string;
  pin:                 string;
  totpSecret:          string;
  isConfigured:        boolean;
  isHydrated:          boolean;   // true after localStorage has been read (1st render is always false)
  isAutoRenewConfigured: boolean;
  tokenGeneratedAt:    string;   // ISO string or ''
  headers:             Record<string, string>;
  refreshToken:        () => Promise<{ ok: boolean; error?: string }>;
}

export function useDhanCredentials(): DhanCredentials {
  const [clientId,         setClientId]         = useState('');
  const [accessToken,      setAccessToken]       = useState('');
  const [pin,              setPin]               = useState('');
  const [totpSecret,       setTotpSecret]        = useState('');
  const [tokenGeneratedAt, setTokenGeneratedAt]  = useState('');
  const [isHydrated,       setIsHydrated]        = useState(false);

  useEffect(() => {
    const id    = localStorage.getItem('dhan_client_id')          ?? '';
    const token = localStorage.getItem('dhan_access_token')       ?? '';
    const p     = localStorage.getItem('dhan_pin')                ?? '';
    const totp  = localStorage.getItem('dhan_totp_secret')        ?? '';
    const gen   = localStorage.getItem('dhan_token_generated_at') ?? '';

    setClientId(id);
    setAccessToken(token);
    setPin(p);
    setTotpSecret(totp);
    setTokenGeneratedAt(gen);
    setIsHydrated(true);

    // Auto-refresh if token is stale (>23 h) and auto-renew is configured
    if (id && p && totp && gen) {
      const ageMs = Date.now() - new Date(gen).getTime();
      if (ageMs > 23 * 3_600_000) {
        doRefresh(id, p, totp).then(result => {
          if (result.ok && result.accessToken) {
            const now = new Date().toISOString();
            localStorage.setItem('dhan_access_token',       result.accessToken);
            localStorage.setItem('dhan_token_generated_at', now);
            setAccessToken(result.accessToken);
            setTokenGeneratedAt(now);
          }
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshToken = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await doRefresh(clientId, pin, totpSecret);
    if (result.ok && result.accessToken) {
      const now = new Date().toISOString();
      localStorage.setItem('dhan_access_token',       result.accessToken);
      localStorage.setItem('dhan_token_generated_at', now);
      setAccessToken(result.accessToken);
      setTokenGeneratedAt(now);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }, [clientId, pin, totpSecret]);

  const isConfigured          = Boolean(clientId && accessToken);
  const isAutoRenewConfigured = Boolean(clientId && pin && totpSecret);

  // Memoize headers so its reference is stable between renders — prevents
  // useCallback / useEffect dependency loops in consumer components.
  const headers = useMemo<Record<string, string>>(
    () => isConfigured
      ? { 'x-dhan-client-id': clientId, 'x-dhan-access-token': accessToken }
      : ({} as Record<string, string>),
    [clientId, accessToken, isConfigured],
  );

  // Memoize the whole return object for the same reason.
  return useMemo(() => ({
    clientId, accessToken, pin, totpSecret,
    isConfigured, isHydrated, isAutoRenewConfigured,
    tokenGeneratedAt, headers, refreshToken,
  }), [clientId, accessToken, pin, totpSecret, isConfigured, isHydrated, isAutoRenewConfigured, tokenGeneratedAt, headers, refreshToken]);
}

// Standalone fetch — called before state is set and inside callback
async function doRefresh(clientId: string, pin: string, totpSecret: string)
  : Promise<{ ok: boolean; accessToken?: string; error?: string }> {
  if (!clientId || !pin || !totpSecret) {
    return { ok: false, error: 'Missing clientId, PIN, or TOTP secret' };
  }
  try {
    const res  = await fetch('/api/dhan/refresh-token', {
      method: 'POST',
      headers: {
        'x-dhan-client-id':   clientId,
        'x-dhan-pin':         pin,
        'x-dhan-totp-secret': totpSecret,
      },
    });
    const json = await res.json() as { accessToken?: string; error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true, accessToken: json.accessToken };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
