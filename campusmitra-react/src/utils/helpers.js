// ── Shared helper functions ───────────────────────────────────────────────────

export function catGradient(slug) {
  const map = {
    electronics: 'linear-gradient(135deg,#4f46e5,#6366f1)',
    textbooks: 'linear-gradient(135deg,#0d9488,#14b8a6)',
    tools: 'linear-gradient(135deg,#f59e0b,#d97706)',
    clothing: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
  };
  return map[slug] || 'linear-gradient(135deg,#6b7280,#9ca3af)';
}

export function catIcon(slug) {
  const map = {
    electronics: 'fa-laptop',
    textbooks: 'fa-book',
    tools: 'fa-tools',
    clothing: 'fa-tshirt',
  };
  return map[slug] || 'fa-box';
}

export function statusBadge(s) {
  const map = {
    pending: ['#fffbeb', '#92400e', 'Pending'],
    active: ['#ecfdf5', '#065f46', 'Active'],
    returned: ['#eff6ff', '#1e40af', 'Returned'],
    cancelled: ['#fee2e2', '#dc2626', 'Cancelled'],
  };
  const [bg, color, label] = map[s] || ['#f3f4f6', '#374151', s];
  return { bg, color, label };
}

export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function track(event, data) {
  try {
    const log = JSON.parse(localStorage.getItem('cm_analytics') || '[]');
    log.push({ event, data, ts: Date.now() });
    if (log.length > 200) log.splice(0, log.length - 200);
    localStorage.setItem('cm_analytics', JSON.stringify(log));
  } catch (e) {}
}
