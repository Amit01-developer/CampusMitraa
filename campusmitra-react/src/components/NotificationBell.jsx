import { useState, useEffect, useRef } from 'react';
import { API } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function NotificationBell() {
  const { authHeaders, currentUser } = useAuth();
  const [notifs, setNotifs]   = useState([]);
  const [unread, setUnread]   = useState(0);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);

  // Poll every 30 s when logged in
  useEffect(() => {
    if (!currentUser) return;
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000);
    return () => clearInterval(id);
  }, [currentUser]);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchNotifs() {
    try {
      const res  = await fetch(`${API}/notifications`, { headers: authHeaders() });
      const data = await res.json();
      if (data.notifications) {
        setNotifs(data.notifications);
        setUnread(data.unread || 0);
      }
    } catch { /* silent */ }
  }

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      setLoading(true);
      try {
        await fetch(`${API}/notifications/read`, { method: 'PUT', headers: authHeaders() });
        setUnread(0);
        setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      } catch { /* silent */ }
      setLoading(false);
    }
  }

  const iconMap = {
    message:          'fa-comment',
    review:           'fa-star',
    referral:         'fa-gift',
    rental_approved:  'fa-check-circle',
    rental_cancelled: 'fa-times-circle',
    rental_returned:  'fa-undo',
    rental_request:   'fa-bell',
  };
  const colorMap = {
    message:          '#4f46e5',
    review:           '#f59e0b',
    referral:         '#10b981',
    rental_approved:  '#16a34a',
    rental_cancelled: '#dc2626',
    rental_returned:  '#0d9488',
    rental_request:   '#f59e0b',
  };

  if (!currentUser) return null;

  return (
    <div ref={dropRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          position: 'relative', padding: '6px 8px', borderRadius: 8,
          color: 'var(--text, #1f2937)', fontSize: '1.15rem',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      >
        <i className="fas fa-bell"></i>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: '#fff',
            borderRadius: '50%', width: 17, height: 17,
            fontSize: '0.65rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--card-bg, #fff)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
          zIndex: 9999,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
              Notifications
            </span>
            {loading && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--gray)' }}></i>}
          </div>

          {/* List */}
          {notifs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray)' }}>
              <i className="fas fa-bell-slash" style={{ fontSize: '2rem', marginBottom: 8, display: 'block' }}></i>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>No notifications yet</p>
            </div>
          ) : notifs.map((n) => (
            <div key={n.id} style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border, #f1f5f9)',
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: n.is_read ? 'transparent' : 'rgba(79,70,229,0.04)',
              transition: 'background 0.2s',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: `${colorMap[n.type] || '#4f46e5'}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className={`fas ${iconMap[n.type] || 'fa-bell'}`}
                   style={{ color: colorMap[n.type] || '#4f46e5', fontSize: '0.85rem' }}></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: '0.82rem', color: 'var(--text, #1f2937)',
                  lineHeight: 1.45, wordBreak: 'break-word',
                }}>
                  {n.message}
                </p>
                <span style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 3, display: 'block' }}>
                  {n.created_at ? new Date(n.created_at).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  }) : ''}
                </span>
              </div>
              {!n.is_read && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#4f46e5', flexShrink: 0, marginTop: 4,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
