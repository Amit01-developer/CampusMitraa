// ── API base URL ──────────────────────────────────────────────────────────────
// In production (Vercel), VITE_API_URL env var points to Render backend.
// In development, Vite proxy handles /api → localhost:5000
export const API = import.meta.env.VITE_API_URL || '/api';

// ── Simple in-memory API cache ────────────────────────────────────────────────
// Stores { data, expiresAt } per URL key. TTL default = 60 seconds.
// Authenticated requests (with token) are never cached.
const _cache = new Map();

/**
 * cachedFetch(url, ttlMs?)
 * - Public (no-auth) GET requests only.
 * - Returns cached response if still fresh, otherwise fetches and caches.
 * - ttlMs: cache lifetime in milliseconds (default 60 000 = 1 min)
 *
 * Usage:
 *   const data = await cachedFetch(`${API}/categories`);
 *   const stats = await cachedFetch(`${API}/stats`, 30_000); // 30 s TTL
 */
export async function cachedFetch(url, ttlMs = 60_000) {
  const now = Date.now();
  const hit = _cache.get(url);
  if (hit && now < hit.expiresAt) {
    return hit.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _cache.set(url, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * invalidateCache(urlOrPrefix?)
 * - Pass a string to remove all cache keys that start with it.
 * - Pass nothing to clear everything (e.g. on logout).
 *
 * Usage:
 *   invalidateCache(`${API}/categories`); // clear one key
 *   invalidateCache(`${API}/items`);       // clear all item keys
 *   invalidateCache();                      // clear all
 */
export function invalidateCache(urlOrPrefix) {
  if (!urlOrPrefix) {
    _cache.clear();
    return;
  }
  for (const key of _cache.keys()) {
    if (key.startsWith(urlOrPrefix)) _cache.delete(key);
  }
}
