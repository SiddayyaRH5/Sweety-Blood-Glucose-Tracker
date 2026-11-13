import axios from 'axios';

const AUTH_TOKEN_KEY = 'sweety_jwt_token';

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const apiBaseUrl = configuredBaseUrl
  ? configuredBaseUrl.endsWith('/api')
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`
  : '/api';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractApiErrorMessage(err, fallback = 'Request failed.') {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data?.error) return data.error;
    if (data?.errors) {
      const firstErr = Object.values(data.errors).find(Boolean);
      if (firstErr) return firstErr;
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
