import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';

// How often to poll for new messages when chat is open (ms)
const MSG_POLL_INTERVAL  = 5000;   // 5s — active chat
const CONV_POLL_INTERVAL = 30000;  // 30s — sidebar unread counts

export default function MessagesPage() {
  const { currentUser, authHeaders } = useAuth();
  const showToast = useToast();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [activeConv,    setActiveConv]    = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [loadingConvs,  setLoadingConvs]  = useState(true);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const messagesEndRef  = useRef(null);
  const inputRef        = useRef(null);
  const activeConvRef   = useRef(null);   // stable ref for polling
  const isAtBottomRef   = useRef(true);   // track if user scrolled up

  // URL params — pre-open a conversation
  const toUserId = searchParams.get('to')        || '';
  const rentalId = searchParams.get('rental_id') || '';
  const itemName = searchParams.get('item_name') || '';

  // Keep activeConvRef in sync
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // ── Redirect if not logged in ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { navigate('/'); }
  }, [currentUser]);

  // ── Load conversations on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    loadConversations();
  }, [currentUser]);

  // ── Auto-scroll to bottom only when user is already at bottom ─────────────
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Focus input when conversation opens ───────────────────────────────────
  useEffect(() => {
    if (activeConv) inputRef.current?.focus();
  }, [activeConv]);

  // ── Poll messages every 5s when a conversation is open ────────────────────
  useEffect(() => {
    if (!currentUser || !activeConv) return;
    const id = setInterval(() => {
      if (activeConvRef.current) silentRefreshMessages(activeConvRef.current.id);
    }, MSG_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [currentUser, activeConv?.id]);

  // ── Poll conversation list every 30s (unread counts) ──────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => silentRefreshConversations(), CONV_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [currentUser]);

  // ── Silent message refresh (no loading spinner, no scroll reset) ──────────
  async function silentRefreshMessages(convId) {
    try {
      const res  = await fetch(`${API}/messages/conversations/${convId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setMessages((prev) => {
        // Only update if there are new messages
        if (data.length === prev.length) return prev;
        return data;
      });
    } catch { /* silent */ }
  }

  // ── Silent conversation list refresh ──────────────────────────────────────
  async function silentRefreshConversations() {
    try {
      const res  = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
        // If active conv has new messages from other user, update it
        if (activeConvRef.current) {
          const updated = data.find((c) => c.id === activeConvRef.current.id);
          if (updated) setActiveConv((prev) => prev ? { ...prev, ...updated } : prev);
        }
      }
    } catch { /* silent */ }
  }

  // ── Track scroll position ─────────────────────────────────────────────────
  function handleScroll(e) {
    const el = e.currentTarget;
    const threshold = 60; // px from bottom
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  // ── Load conversations (initial, with loading state) ──────────────────────
  async function loadConversations() {
    setLoadingConvs(true);
    try {
      const res  = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Bad response');
      setConversations(data);

      // Auto-open if toUserId param given
      if (toUserId) {
        const existing = data.find((c) => c.other_user?.id === toUserId);
        if (existing) {
          setActiveConv(existing);
          await fetchMessages(existing.id);
        }
      }
    } catch {
      showToast('Could not load conversations', 'error');
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  }

  // ── Fetch messages (initial open, with loading state) ─────────────────────
  async function fetchMessages(convId) {
    setLoadingMsgs(true);
    setMessages([]);
    isAtBottomRef.current = true;
    try {
      const res  = await fetch(`${API}/messages/conversations/${convId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
      else setMessages([]);
    } catch {
      showToast('Could not load messages', 'error');
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }

  // ── Open a conversation ────────────────────────────────────────────────────
  async function openConversation(conv) {
    setActiveConv(conv);
    await fetchMessages(conv.id);
    setConversations((prev) =>
      prev.map((c) => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    );
  }

  // ── Send a message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    if (!activeConv && !toUserId) return;
    setSending(true);
    setInput('');
    isAtBottomRef.current = true; // scroll to bottom on send

    try {
      const body = activeConv
        ? {
            to_user_id: activeConv.other_user.id,
            text,
            rental_id: activeConv.rental_id || rentalId,
            item_name: activeConv.item_name  || itemName,
          }
        : { to_user_id: toUserId, text, rental_id: rentalId, item_name: itemName };

      const res  = await fetch(`${API}/messages/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        showToast(data.error || 'Could not send message', 'error');
        setInput(text);
        return;
      }

      // Optimistic append
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: data.msg_id || String(Date.now()), sender_id: currentUser.id, text, created_at: now },
      ]);

      if (!activeConv && data.conv_id) {
        const convRes  = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
        const convData = await convRes.json();
        if (Array.isArray(convData)) {
          setConversations(convData);
          const newConv = convData.find((c) => c.id === data.conv_id);
          if (newConv) setActiveConv(newConv);
        }
      } else {
        silentRefreshConversations();
      }
    } catch {
      showToast('Could not send message', 'error');
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  // ── Back button ────────────────────────────────────────────────────────────
  function handleBack() {
    setActiveConv(null);
    setMessages([]);
  }

  if (!currentUser) return null;

  const showChat   = activeConv || toUserId;
  const chatHeader = activeConv
    ? { name: activeConv.other_user?.name || '—', item: activeConv.item_name, otherId: activeConv.other_user?.id }
    : { name: 'New Conversation', item: itemName ? decodeURIComponent(itemName) : '', otherId: toUserId };

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* Page title */}
        <h1 style={{ margin: '0 0 20px', fontSize: '1.4rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fas fa-comments" style={{ color: 'var(--primary)' }}></i>
          Messages
        </h1>

        <div style={{
          display: 'grid',
          gridTemplateColumns: showChat ? '260px 1fr' : '1fr',
          gap: 16,
          height: '72vh',
          minHeight: 420,
        }}>

          {/* ── Conversation Sidebar ── */}
          <div style={{
            background: 'var(--card-bg,#fff)',
            borderRadius: 14,
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            // Hide sidebar on mobile when chat is open
            ...(showChat ? { display: window.innerWidth < 640 ? 'none' : 'flex' } : {}),
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
              Conversations
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingConvs ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray)' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.4rem' }}></i>
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray)', fontSize: '0.83rem' }}>
                  <i className="fas fa-comment-slash" style={{ fontSize: '2rem', display: 'block', marginBottom: 10, opacity: 0.35 }}></i>
                  No conversations yet
                </div>
              ) : conversations.map((conv) => {
                const isActive = activeConv?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border,#f1f5f9)',
                      background: isActive ? 'rgba(79,70,229,0.08)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                      }}>
                        {conv.other_user?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                            {conv.other_user?.name || '—'}
                          </span>
                          {conv.unread_count > 0 && (
                            <span style={{
                              background: '#4f46e5', color: '#fff', borderRadius: '50%',
                              width: 18, height: 18, fontSize: '0.65rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                            }}>
                              {conv.unread_count > 9 ? '9+' : conv.unread_count}
                            </span>
                          )}
                        </div>
                        {conv.item_name && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginBottom: 2 }}>
                            📦 {conv.item_name}
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.last_message || 'No messages yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Chat Window ── */}
          {showChat ? (
            <div style={{
              background: 'var(--card-bg,#fff)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Chat Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--card-bg,#fff)',
              }}>
                {/* Back button */}
                <button
                  onClick={handleBack}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '1rem', padding: '4px 8px', borderRadius: 6 }}
                  title="Back"
                >
                  <i className="fas fa-arrow-left"></i>
                </button>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                }}>
                  {chatHeader.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                    {chatHeader.name}
                  </div>
                  {chatHeader.item && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--primary)' }}>📦 {chatHeader.item}</div>
                  )}
                </div>
                {/* View Profile button */}
                {chatHeader.otherId && (
                  <button
                    onClick={() => navigate(`/profile/${chatHeader.otherId}`)}
                    style={{
                      background: 'var(--surface)', border: 'none', borderRadius: 8,
                      padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem',
                      color: 'var(--text)', fontWeight: 600,
                    }}
                  >
                    <i className="fas fa-user"></i> Profile
                  </button>
                )}
              </div>

              {/* Messages area */}
              <div
                onScroll={handleScroll}
                style={{
                flex: 1, overflowY: 'auto', padding: 16,
                display: 'flex', flexDirection: 'column', gap: 10,
                background: 'var(--bg,#f8faff)',
              }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--gray)' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.4rem' }}></i>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem', marginTop: 40 }}>
                    {activeConv ? 'Say something to start the conversation 👋' : 'Send your first message below 👇'}
                  </div>
                ) : messages.map((m) => {
                  const isMe = m.sender_id === currentUser.id;
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '72%', padding: '10px 14px', borderRadius: 14,
                        fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word',
                        ...(isMe
                          ? { background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', borderBottomRightRadius: 4 }
                          : { background: 'var(--card-bg,#fff)', color: 'var(--text)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }
                        ),
                      }}>
                        {m.text}
                        <div style={{ fontSize: '0.65rem', opacity: 0.65, marginTop: 4, textAlign: isMe ? 'right' : 'left' }}>
                          {m.created_at
                            ? new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                display: 'flex', gap: 10,
                background: 'var(--card-bg,#fff)',
              }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message…"
                  disabled={sending}
                  style={{
                    flex: 1, border: '1.5px solid var(--border)', borderRadius: 10,
                    padding: '9px 14px', fontSize: '0.875rem',
                    background: 'var(--bg,#f8faff)', color: 'var(--text)', outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: sending || !input.trim() ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {sending
                    ? <i className="fas fa-spinner fa-spin"></i>
                    : <i className="fas fa-paper-plane"></i>
                  }
                </button>
              </div>
            </div>
          ) : (
            /* No conversation selected */
            <div style={{
              background: 'var(--card-bg,#fff)', borderRadius: 14,
              border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--gray)',
            }}>
              <i className="fas fa-comments" style={{ fontSize: '3rem', marginBottom: 14, opacity: 0.25 }}></i>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Select a conversation or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
