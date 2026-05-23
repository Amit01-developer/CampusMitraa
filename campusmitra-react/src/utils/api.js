// ── API base URL ──────────────────────────────────────────────────────────────
// In production (Vercel), VITE_API_URL env var points to Render backend.
// In development, Vite proxy handles /api → localhost:5000
export const API = import.meta.env.VITE_API_URL || '/api';

export function authHeaders() {
  const token = localStorage.getItem('cs_token');
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  };
}
