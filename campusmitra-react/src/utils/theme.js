// ── Theme manager — same logic as original theme.js ──────────────────────────
const DARK_KEY = 'darkMode';

export function applyTheme(dark) {
  if (dark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

export function toggleTheme() {
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(DARK_KEY, String(!isDark));
  applyTheme(!isDark);
}

export function initTheme() {
  const saved = localStorage.getItem(DARK_KEY) === 'true';
  applyTheme(saved);
}

export function isDark() {
  return document.body.classList.contains('dark-mode');
}
