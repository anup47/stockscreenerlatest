'use client';
import { useState, useEffect } from 'react';

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
  isConfigured: boolean;
  headers: Record<string, string>;
}

export function useDhanCredentials(): DhanCredentials {
  const [clientId,    setClientId]    = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    setClientId(localStorage.getItem('dhan_client_id')    ?? '');
    setAccessToken(localStorage.getItem('dhan_access_token') ?? '');
  }, []);

  const isConfigured = Boolean(clientId && accessToken);
  const headers: Record<string, string> = isConfigured
    ? { 'x-dhan-client-id': clientId, 'x-dhan-access-token': accessToken }
    : {};

  return { clientId, accessToken, isConfigured, headers };
}
